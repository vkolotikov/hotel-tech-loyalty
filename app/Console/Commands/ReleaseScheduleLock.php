<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Release stuck `framework-schedule-*` rows from the `cache_locks` table.
 *
 * Why this command exists
 * ────────────────────────
 * `routes/console.php` schedules several commands with
 * `->withoutOverlapping(N)`. Under `CACHE_STORE=database` (Laravel Cloud's
 * default) the overlap lock lives in the `cache_locks` table. If a worker
 * dies mid-run — deploy bounce, SIGTERM, OOM kill, PHP fatal — the row
 * can be left behind. Until its `expiration` lapses, every subsequent
 * scheduled tick is silently SKIPPED. Worse: the database cache driver
 * does NOT garbage-collect expired rows in the background, so a row
 * with a corrupt or impossibly-large `expiration` value can stall a
 * cron indefinitely.
 *
 * Symptom on the booking sync: dashboard "Last Sync" badge frozen on
 * a date several days back, `diag:scheduled-health` shows the command
 * as `stale`, `scheduled_command_runs` has a wall of `skipped` rows
 * with no `success` in between.
 *
 * Usage
 * ─────
 *   php artisan schedule:release-lock                    # interactive — lists locks first
 *   php artisan schedule:release-lock --all              # purge ALL framework-schedule locks
 *   php artisan schedule:release-lock --expired          # purge only locks whose expiration has lapsed
 *   php artisan schedule:release-lock bookings:sync-pms  # name hint (positional `cron` arg) — purges
 *                                                        # locks whose key contains the hash of this
 *                                                        # mutex (best-effort)
 *
 * Exits 0 when at least one lock was released or none were stuck.
 * Exits 1 if `cache_locks` doesn't exist (run the
 * `2026_05_19_120000_create_cache_table` migration first).
 */
class ReleaseScheduleLock extends Command
{
    protected $signature = 'schedule:release-lock
                            {cron? : Optional scheduled-command name hint (best-effort matching). Renamed from {command?} because Symfony Console reserves "command" for the artisan command name itself.}
                            {--all : Purge every framework-schedule cache lock unconditionally}
                            {--expired : Purge only locks whose expiration has already lapsed}';

    protected $description = 'Release stuck framework-schedule-* rows from cache_locks (operational escape hatch)';

    public function handle(): int
    {
        if (!Schema::hasTable('cache_locks')) {
            $this->error('cache_locks table does not exist on this connection. '
                . 'Run the 2026_05_19_120000_create_cache_table migration first.');
            return self::FAILURE;
        }

        $query = DB::table('cache_locks')->where('key', 'like', 'framework-schedule%');

        // Snapshot before mutating so we can report what was there.
        $existing = (clone $query)->get(['key', 'owner', 'expiration']);
        if ($existing->isEmpty()) {
            $this->info('No framework-schedule locks present — nothing to release.');
            return self::SUCCESS;
        }

        $now = time();
        $this->line('Current framework-schedule locks:');
        foreach ($existing as $row) {
            $expired = $row->expiration <= $now ? '<fg=red>EXPIRED</>' : '<fg=green>active</>';
            $this->line(sprintf(
                '  %s  exp=%s (%s)  owner=%s',
                $row->key,
                $row->expiration,
                $expired,
                substr((string) $row->owner, 0, 16),
            ));
        }

        if ($this->option('expired')) {
            $query->where('expiration', '<=', $now);
        } elseif ($hint = $this->argument('cron')) {
            // The cache key incorporates a SHA-1 of the mutex; we can't
            // reconstruct it deterministically here. Best-effort: filter
            // by a `LIKE %hint%` against the key, which will catch nothing
            // for hashed keys — so fall back to a confirmation prompt.
            $matches = $query->where('key', 'like', "%{$hint}%")->count();
            if ($matches === 0) {
                $this->warn("No locks matched the command hint '{$hint}'. "
                    . 'Re-run with --all or --expired to purge unconditionally.');
                return self::SUCCESS;
            }
        } elseif (!$this->option('all')) {
            if (!$this->confirm('Release ALL framework-schedule locks shown above?', false)) {
                $this->info('Aborted — no locks released.');
                return self::SUCCESS;
            }
        }

        $deleted = $query->delete();
        $this->info("Released {$deleted} schedule lock(s). The next scheduler tick can proceed.");
        return self::SUCCESS;
    }
}
