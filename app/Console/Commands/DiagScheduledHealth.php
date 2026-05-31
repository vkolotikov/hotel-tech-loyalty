<?php

namespace App\Console\Commands;

use App\Models\ScheduledCommandRun;
use Cron\CronExpression;
use Illuminate\Console\Command;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Report last-run status for every currently-scheduled command, so an
 * operator can spot crons that have silently stopped firing without
 * grepping audit_logs by hand.
 *
 * Health bucket per command, derived from the latest run row vs the
 * expected interval computed from the cron expression:
 *
 *   ok    — last run finished within 2× the expected interval
 *   warn  — last run between 2× and 3× the expected interval
 *   stale — last run more than 3× the expected interval (likely dead)
 *   fail  — last run threw (most recent row has status='failed')
 *   never — no row at all (command has never been observed running)
 *
 * Exit code is 0 when everything is ok/warn, 1 when anything is
 * stale/fail/never — so this can be wired into health monitoring.
 *
 *   php artisan diag:scheduled-health         # human table
 *   php artisan diag:scheduled-health --json  # machine-readable
 *   php artisan diag:scheduled-health --prune=30  # also delete rows older than 30d
 */
class DiagScheduledHealth extends Command
{
    protected $signature = 'diag:scheduled-health
                            {--json : Output machine-readable JSON instead of a table}
                            {--prune= : Also delete scheduled_command_runs rows older than N days}';

    protected $description = 'Report last-run status for every scheduled command — spot silently-dead crons';

    public function handle(Schedule $schedule): int
    {
        if ($prune = $this->option('prune')) {
            $cutoff = now()->subDays((int) $prune);
            $deleted = ScheduledCommandRun::where('finished_at', '<', $cutoff)->delete();
            $this->line("Pruned {$deleted} run rows older than {$prune} days.");
        }

        $rows = [];
        foreach ($schedule->events() as $event) {
            $command = $this->extractCommandName($event->command ?? '');
            if ($command === '') {
                continue;
            }
            $expression = $event->expression;
            $expectedSec = $this->expectedIntervalSec($expression);

            $latest = ScheduledCommandRun::where('command', $command)
                ->orderByDesc('id')
                ->first();

            $latestSuccess = ScheduledCommandRun::where('command', $command)
                ->where('status', 'success')
                ->orderByDesc('id')
                ->first();

            $lastFinishedAt = $latest?->finished_at;
            $sinceLastSec = $lastFinishedAt ? (int) abs($lastFinishedAt->diffInSeconds(now())) : null;

            $health = $this->computeHealth($sinceLastSec, $expectedSec, $latest?->status);

            $rows[] = [
                'command'          => $command,
                'expression'       => $expression,
                'expected_every'   => $this->humanizeSec($expectedSec),
                'last_status'      => $latest?->status ?? 'never',
                'last_finished_at' => $lastFinishedAt?->toDateTimeString() ?? '—',
                'last_success_at'  => $latestSuccess?->finished_at?->toDateTimeString() ?? '—',
                'duration_ms'      => $latest?->duration_ms,
                'since_last'       => $sinceLastSec !== null ? $this->humanizeSec($sinceLastSec) : '—',
                'health'           => $health,
                'error'            => ($latest && $latest->status === 'failed') ? mb_substr((string) $latest->output_excerpt, 0, 200) : null,
            ];
        }

        usort($rows, function ($a, $b) {
            $order = ['fail' => 0, 'never' => 1, 'stale' => 2, 'warn' => 3, 'ok' => 4];
            return ($order[$a['health']] ?? 9) <=> ($order[$b['health']] ?? 9);
        });

        // Also surface stuck framework-schedule cache_locks rows. With
        // `CACHE_STORE=database` the overlap-prevention lock for every
        // ->withoutOverlapping() schedule lives in `cache_locks`. If a
        // worker dies mid-run, the row is left behind and every
        // subsequent scheduler tick is SKIPPED silently until the
        // expiration lapses. Worse: the DB cache driver doesn't GC
        // expired rows, so a row with a corrupt/future `expiration`
        // value can stall a cron indefinitely. Any row whose
        // `expiration <= now()` is a leak — those should never persist.
        $stuckLocks = $this->detectStuckScheduleLocks();

        if ($this->option('json')) {
            $this->line(json_encode([
                'commands'    => $rows,
                'stuck_locks' => $stuckLocks,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->renderTable($rows);
            if (!empty($stuckLocks)) {
                $this->newLine();
                $this->warn(sprintf(
                    'Detected %d stuck framework-schedule cache_locks row(s). '
                        . 'Release with: php artisan schedule:release-lock --expired',
                    count($stuckLocks),
                ));
                foreach ($stuckLocks as $lock) {
                    $this->line('  <fg=red>' . $lock['key'] . '</> exp=' . $lock['expiration']
                        . ' (' . $lock['expired_seconds_ago'] . 's ago)');
                }
            }
        }

        $counts = array_count_values(array_column($rows, 'health'));
        $bad = ($counts['fail'] ?? 0) + ($counts['stale'] ?? 0) + ($counts['never'] ?? 0);
        // Treat stuck locks as a failure signal too — they're the most
        // common reason a healthy-looking codebase has stalled crons.
        if (!empty($stuckLocks)) {
            $bad++;
        }
        return $bad > 0 ? 1 : 0;
    }

    /**
     * Detect framework-schedule cache_locks rows whose expiration has
     * already lapsed but the row is still present. Under the database
     * cache driver these rows DO NOT get auto-purged, so a single
     * worker crash mid-run leaves a zombie that blocks the next tick.
     *
     * @return array<int, array{key:string, expiration:int, expired_seconds_ago:int}>
     */
    private function detectStuckScheduleLocks(): array
    {
        try {
            if (!Schema::hasTable('cache_locks')) {
                return [];
            }

            $now = time();
            $rows = DB::table('cache_locks')
                ->where('key', 'like', 'framework-schedule%')
                ->where('expiration', '<=', $now)
                ->orderBy('expiration')
                ->get(['key', 'expiration']);

            return $rows->map(fn ($r) => [
                'key'                 => $r->key,
                'expiration'          => (int) $r->expiration,
                'expired_seconds_ago' => $now - (int) $r->expiration,
            ])->all();
        } catch (\Throwable) {
            // Diagnostic must never throw.
            return [];
        }
    }

    private function renderTable(array $rows): void
    {
        $tableRows = array_map(function ($r) {
            return [
                $r['command'],
                $r['expression'] . "\n(" . $r['expected_every'] . ')',
                $this->colorHealth($r['health']),
                $r['last_finished_at'],
                $r['since_last'],
                $r['duration_ms'] !== null ? $r['duration_ms'] . ' ms' : '—',
            ];
        }, $rows);

        $this->table(
            ['Command', 'Schedule', 'Health', 'Last finished', 'Ago', 'Duration'],
            $tableRows
        );

        $failures = array_filter($rows, fn($r) => $r['health'] === 'fail' && $r['error']);
        if (!empty($failures)) {
            $this->newLine();
            $this->warn('Most recent failure messages:');
            foreach ($failures as $r) {
                $this->line("  <fg=red>{$r['command']}</>: {$r['error']}");
            }
        }

        $counts = array_count_values(array_column($rows, 'health'));
        $this->newLine();
        $this->line(sprintf(
            '<info>Health:</info> <fg=green>%d ok</> · <fg=yellow>%d warn</> · <fg=red>%d stale</> · <fg=red>%d failed</> · <fg=gray>%d never</>',
            $counts['ok'] ?? 0,
            $counts['warn'] ?? 0,
            $counts['stale'] ?? 0,
            $counts['fail'] ?? 0,
            $counts['never'] ?? 0,
        ));
    }

    private function extractCommandName(string $shellCommand): string
    {
        if (preg_match("/artisan['\"]?\s+([\w:\-]+)/", $shellCommand, $m)) {
            return $m[1];
        }
        return mb_substr(trim($shellCommand), 0, 64);
    }

    /**
     * Best-effort expected-interval from the cron expression. Computed
     * from "next run from now" - "next run after that". Returns null
     * for expressions cron-expression can't parse (closures, etc.).
     */
    private function expectedIntervalSec(?string $expression): ?int
    {
        if (!$expression) return null;
        try {
            $cron = new CronExpression($expression);
            $next = $cron->getNextRunDate();
            $afterNext = $cron->getNextRunDate($next);
            return max(60, (int) ($afterNext->getTimestamp() - $next->getTimestamp()));
        } catch (\Throwable) {
            return null;
        }
    }

    private function computeHealth(?int $sinceLastSec, ?int $expectedSec, ?string $lastStatus): string
    {
        if ($sinceLastSec === null) return 'never';
        if ($lastStatus === 'failed') return 'fail';
        if ($expectedSec === null) return 'ok';

        if ($sinceLastSec > $expectedSec * 3) return 'stale';
        if ($sinceLastSec > $expectedSec * 2) return 'warn';
        return 'ok';
    }

    private function colorHealth(string $h): string
    {
        return match ($h) {
            'ok'    => '<fg=green>ok</>',
            'warn'  => '<fg=yellow>warn</>',
            'stale' => '<fg=red>STALE</>',
            'fail'  => '<fg=red>FAILED</>',
            'never' => '<fg=gray>never</>',
            default => $h,
        };
    }

    private function humanizeSec(?int $sec): string
    {
        if ($sec === null) return '—';
        if ($sec < 60) return $sec . 's';
        if ($sec < 3600) return round($sec / 60) . 'm';
        if ($sec < 86400) return round($sec / 3600, 1) . 'h';
        return round($sec / 86400, 1) . 'd';
    }
}
