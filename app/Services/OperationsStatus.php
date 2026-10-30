<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Read-only observations. Never return exception messages, job payloads or another tenant's records. */
final class OperationsStatus
{
    public function forUser(User $user): array
    {
        $orgId = (int) $user->organization_id;
        $checks = [
            $this->observe('wallet_updates', function () use ($orgId) {
                $rows = DB::table('wallet_passes')->where('organization_id', $orgId);
                $failed = (clone $rows)->whereNotNull('failure_code')->count();
                $late = (clone $rows)->whereNull('failure_code')->where(fn ($q) => $q->where('next_attempt_at', '<', now()->subMinutes(15))
                    ->orWhere(fn ($q) => $q->whereNull('next_attempt_at')->where('updated_at', '<', now()->subMinutes(15))))->count();
                if ($failed + $late > 0) return $this->count($failed + $late);
                return ['status' => (clone $rows)->whereNotNull('last_success_at')->exists() ? 'ok' : 'unobserved', 'count' => 0];
            }),
            $this->observe('email_failures', function () use ($orgId) {
                $count = DB::table('email_campaigns')->where('organization_id', $orgId)
                    ->where('updated_at', '>=', now()->subDays(30))
                    ->where(fn ($q) => $q->where('status', 'failed')->orWhere('failed_count', '>', 0))->count();
                return $this->count($count);
            }),
            $this->observe('email_delays', function () use ($orgId) {
                $count = DB::table('email_campaigns')->where('organization_id', $orgId)->where('status', 'sending')
                    ->whereRaw('COALESCE(last_progress_at, updated_at) < ?', [now()->subMinutes(15)])->count();
                return $this->count($count);
            }),
            $this->observe('loyalty_delays', function () use ($orgId) {
                $count = DB::table('loyalty_visit_effects')->where('organization_id', $orgId)->where('pending', true)
                    ->where('created_at', '<', now()->subMinutes(15))->count();
                return $this->count($count);
            }),
        ];

        // An organisation owner is NOT a platform operator. Global infrastructure is private.
        if ($user->isPlatformAdmin()) {
            $checks[] = $this->observe('media_versioning', function () {
                $cache = \App\Support\SharedCache::store();
                if ($cache->has('ops:media-recovery-copy')) return ['status' => 'attention'];
                return $cache->get('ops:media-versioning') ?? ['status' => 'unobserved'];
            });
            $checks[] = $this->observe('scheduler', function () {
                $last = DB::table('scheduled_command_runs')->where('command', 'heartbeat')
                    ->where('status', 'success')->max('finished_at');
                $age = $last ? Carbon::parse($last)->diffInSeconds(now(), false) : null;
                return ['status' => $age === null ? 'unobserved' : ($age < 0 || $age > 300 ? 'attention' : 'ok'), 'last_seen_at' => $last ? Carbon::parse($last)->toIso8601String() : null];
            });
            $checks[] = $this->observe('scheduled_failures', function () {
                // A skipped overlap does not resolve a failed command; a subsequent success does.
                $latest = DB::table('scheduled_command_runs')->selectRaw('MAX(id)')->whereIn('status', ['success', 'failed'])->groupBy('command');
                $failures = DB::table('scheduled_command_runs')->whereIn('id', $latest)->where('status', 'failed')->count();
                if ($failures > 0) return $this->count($failures);
                // A working heartbeat proves the loop, not that task reporting is attached. Old sentinels must not
                // turn a silent reporter green; recent real command outcomes are required for a clean observation.
                $observed = DB::table('scheduled_command_runs')->where('command', '!=', 'heartbeat')
                    ->whereIn('status', ['success', 'failed'])->where('finished_at', '>=', now()->subDays(2))->exists();
                return ['status' => $observed ? 'ok' : 'unobserved', 'count' => 0];
            });
            $checks[] = $this->observe('queue_failures', function () {
                if (!in_array(config('queue.failed.driver'), ['database', 'database-uuids'], true)) return ['status' => 'unobserved'];
                $db = DB::connection(config('queue.failed.database'));
                return $this->count($db->table(config('queue.failed.table', 'failed_jobs'))->count());
            });
            $checks[] = $this->observe('queue_delays', function () {
                $connection = config('queue.default');
                if (config("queue.connections.{$connection}.driver") !== 'database') return ['status' => 'unobserved'];
                $db = DB::connection(config("queue.connections.{$connection}.connection"));
                $count = $db->table(config("queue.connections.{$connection}.table", 'jobs'))
                    ->whereNull('reserved_at')->where('available_at', '<', now()->subMinutes(5)->timestamp)->count();
                // An empty queue proves neither worker liveness nor successful delivery.
                return ['status' => $count > 0 ? 'attention' : 'unobserved', 'count' => $count];
            });
        }

        return ['checked_at' => now()->toIso8601String(), 'checks' => $checks];
    }

    private function count(int $count): array
    {
        return ['status' => $count > 0 ? 'attention' : 'ok', 'count' => $count];
    }

    private function observe(string $key, callable $read): array
    {
        try {
            return ['key' => $key] + $read();
        } catch (\Throwable $e) {
            report($e);
            return ['key' => $key, 'status' => 'unavailable'];
        }
    }
}
