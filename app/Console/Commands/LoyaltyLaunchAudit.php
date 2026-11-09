<?php

namespace App\Console\Commands;

use App\Jobs\RecordLaunchQueueProbe;
use App\Support\SharedCache;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Default is read-only. The explicit probe flag adds one harmless job, with no messages or provider calls. */
class LoyaltyLaunchAudit extends Command
{
    protected $signature = 'loyalty:launch-audit {--queue-probe : Enqueue one harmless infrastructure probe (maximum one per 15 minutes)}';

    protected $description = 'Show safe configuration and recorded infrastructure observations for launch review';

    public function handle(): int
    {
        $transport = (string) config('mail.default');
        $queue = (string) config('queue.default');
        $driver = (string) config("queue.connections.{$queue}.driver");
        $shared = (string) config('cache.shared', 'database');
        $from = (string) config('mail.from.address');
        $probeRequest = 'not_requested';
        if ($this->option('queue-probe')) {
            $probeRequest = 'async_queue_required';
            if (in_array($driver, ['database', 'redis', 'sqs', 'beanstalkd'], true)) {
                try {
                    $probe = ['id' => (string) Str::uuid(), 'status' => 'queued', 'queued_at' => now()->toIso8601String(), 'handled_at' => null];
                    if (SharedCache::store()->add(RecordLaunchQueueProbe::KEY, $probe, 900)) {
                        RecordLaunchQueueProbe::dispatch($probe['id']);
                        $probeRequest = 'queued';
                    } else {
                        $probeRequest = 'existing_probe_retained';
                    }
                } catch (\Throwable) {
                    $probeRequest = 'dispatch_unavailable';
                }
            }
        }
        $report = [
            'checked_at' => now()->toIso8601String(),
            'environment' => app()->environment(),
            'scope' => $this->option('queue-probe') ? 'observations_with_explicit_queue_probe' : 'configuration_and_recorded_observations_only',
            'mail' => [
                'transport' => $transport,
                'from_domain' => str_contains($from, '@') ? substr((string) strrchr($from, '@'), 1) : null,
                'smtp_configuration_present' => $transport === 'smtp'
                    ? (bool) (config('mail.mailers.smtp.host') && config('mail.mailers.smtp.username') && config('mail.mailers.smtp.password')) : null,
                'live_delivery' => 'requires_recipient_confirmation',
            ],
            'shared_cache' => ['store' => $shared, 'driver' => config("cache.stores.{$shared}.driver")],
            'scheduler' => $this->observe(function () {
                $runs = DB::table('scheduled_command_runs');
                $heartbeat = (clone $runs)->where('command', 'heartbeat')->where('status', 'success')->max('finished_at');

                return [
                    'heartbeat_at' => $heartbeat ? Carbon::parse($heartbeat)->toIso8601String() : null,
                    'heartbeat_age_seconds' => $heartbeat ? (int) Carbon::parse($heartbeat)->diffInSeconds(now(), false) : null,
                    'recent_task_outcomes' => (clone $runs)->where('command', '!=', 'heartbeat')
                        ->whereIn('status', ['success', 'failed'])->where('finished_at', '>=', now()->subDays(2))->count(),
                ];
            }),
            'queue' => [
                'connection' => $queue, 'driver' => $driver, 'worker_liveness' => 'unverified',
                'probe_request' => $probeRequest,
                'probe' => $this->observe(fn () => SharedCache::store()->get(RecordLaunchQueueProbe::KEY)),
                'backlog' => $driver === 'database' ? $this->observe(function () use ($queue) {
                    $rows = DB::connection(config("queue.connections.{$queue}.connection"))
                        ->table(config("queue.connections.{$queue}.table", 'jobs'))->whereNull('reserved_at')->where('available_at', '<=', now()->timestamp);
                    $oldest = (clone $rows)->min('available_at');

                    return ['ready_jobs' => (clone $rows)->count(), 'oldest_ready_at' => $oldest ? Carbon::createFromTimestamp((int) $oldest)->toIso8601String() : null];
                }) : ['observed' => false, 'value' => null],
                'failures' => in_array(config('queue.failed.driver'), ['database', 'database-uuids'], true)
                    ? $this->observe(fn () => DB::connection(config('queue.failed.database'))->table(config('queue.failed.table', 'failed_jobs'))->count())
                    : ['observed' => false, 'value' => null],
            ],
            'media_recovery' => $this->observe(function () {
                $cache = SharedCache::store();
                $observation = $cache->get('ops:media-versioning', []);

                return ['status' => $observation['status'] ?? 'unobserved', 'last_seen_at' => $observation['last_seen_at'] ?? null,
                    'rehearsal_in_progress' => $cache->has('ops:media-recovery-copy')];
            }),
            'note' => 'Configured credentials and an empty queue do not prove delivery or worker liveness. A processed probe proves one job ran, not continuous monitoring. No provider acceptance is performed by this command.',
        ];
        $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }

    /** @return array{observed: bool, value: mixed} */
    private function observe(callable $read): array
    {
        try {
            return ['observed' => true, 'value' => $read()];
        } catch (\Throwable) {
            return ['observed' => false, 'value' => null];
        }
    }
}
