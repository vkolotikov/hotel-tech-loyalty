<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\ScheduledCommandRun;
use App\Services\BookingEngineService;
use App\Services\IntegrationStatus;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Pull every Smoobu reservation for every org with the integration
 * configured. Runs on a 5-minute cron via routes/console.php so the
 * calendar self-heals even if Smoobu's webhook fails to deliver.
 *
 * Real-time freshness comes from the webhook (BookingPublicController::
 * webhook); this command is the durability backstop. Without it a
 * dropped webhook would leave the mirror stale until staff manually
 * clicked "Sync" — which is exactly how rooms got double-booked
 * before this fix.
 *
 * ──────────────────────────────────────────────────────────────────
 * Operational escape hatch — releasing a stuck schedule lock
 * ──────────────────────────────────────────────────────────────────
 *
 * `routes/console.php` schedules this command with `->withoutOverlapping(10)`.
 * Under `CACHE_STORE=database` (Laravel Cloud's default) the lock lives in
 * the `cache_locks` table. If the worker dies mid-sync (deploy, SIGTERM,
 * OOM kill) the lock row can be left behind and every subsequent tick
 * gets skipped silently until the 10-minute expiration lapses — and
 * because the database cache driver does NOT garbage-collect expired
 * rows on its own, a row with a corrupt/future `expiration` value can
 * stall the cron for hours.
 *
 * Symptom: dashboard "Last Sync" badge frozen, `diag:scheduled-health`
 * shows `bookings:sync-pms` as `stale`, and `scheduled_command_runs`
 * has a wall of `skipped` status rows with no `success` interleaved.
 *
 * To unstick manually on prod:
 *
 *   php artisan schedule:release-lock bookings:sync-pms
 *   # or, blanket release:
 *   php artisan schedule:release-lock --all
 *   # or direct SQL fallback if artisan isn't available:
 *   DELETE FROM cache_locks WHERE key LIKE 'framework-schedule%';
 *
 * Defensive measures applied in this command (so the lock can't stick
 * in the first place):
 *
 *   1. `register_shutdown_function` releases the framework-schedule
 *      lock on SIGTERM / fatal error / normal exit.
 *   2. Top-level try/catch around the whole handle() body so a failure
 *      in `syncTargets()` (encrypted-setting decrypt, brand-table
 *      missing, etc.) still writes a `booking.sync_cron_failed` audit
 *      row instead of bubbling up as a ScheduledTaskFailed event that
 *      leaves no booking-domain trail.
 *   3. Stale-prior-run self-heal — if the most recent successful sync
 *      finished > 30 min ago, log a loud warning so DiagScheduledHealth
 *      and ops dashboards surface the stall.
 */
class SyncSmoobuBookings extends Command
{
    protected $signature = 'bookings:sync-pms
                            {--from= : Override start date (Y-m-d)}
                            {--to= : Override end date (Y-m-d)}
                            {--org= : Limit to a single organization id}';

    protected $description = 'Sync reservations from Smoobu for every org with the integration configured';

    /**
     * If the most recent successful run finished more than this many
     * minutes ago, log a loud warning so DiagScheduledHealth + Nightwatch
     * + operator dashboards can surface that the cron has been stuck.
     * Tuned for a 5-minute schedule + a worst-case ~10-min sync window.
     */
    private const STALE_PRIOR_RUN_MINUTES = 30;

    public function handle(SmoobuClient $smoobu, BookingEngineService $service): int
    {
        // ── Self-healing escape hatch ────────────────────────────────
        // Ensure the framework-schedule lock for THIS command can never
        // outlive the worker. If the run terminates abnormally (SIGTERM
        // during deploy, fatal error, OOM kill), the shutdown function
        // wipes the lock row so the next 5-min tick can proceed.
        // No-op when withoutOverlapping isn't being used (e.g. manual
        // CLI invocation outside the scheduler).
        $this->registerLockReleaseShutdown();

        // ── Stale-prior-run detection ────────────────────────────────
        // If the most recent successful run finished long ago, the cron
        // has been silently failing — either the schedule worker was
        // dead, the lock was stuck, or every recent run threw before
        // reaching the audit-log write. Log loudly so operators see it
        // in Nightwatch + dashboards without grepping `audit_logs` by
        // hand.
        $this->warnOnStalePriorRun();

        try {
            return $this->runSync($smoobu, $service);
        } catch (\Throwable $e) {
            // Top-level safety net. Any exception bubbling out of the
            // sweep would otherwise turn into a ScheduledTaskFailed
            // event — which DOES write to scheduled_command_runs but
            // leaves no booking-domain audit trail, so the Bookings
            // dashboard's "Last Sync" badge can't tell "cron ran and
            // failed" apart from "cron didn't run". Write a single
            // org-id-less audit row + log + return failure exit so the
            // operator sees something actionable.
            Log::error('bookings:sync-pms aborted before completion', [
                'error' => $e->getMessage(),
                'class' => get_class($e),
                'file'  => $e->getFile() . ':' . $e->getLine(),
            ]);
            try {
                AuditLog::create([
                    'organization_id' => null,
                    'user_id'         => null,
                    'action'          => 'booking.sync_cron_failed',
                    'description'     => 'Pre-loop failure: ' . substr($e->getMessage(), 0, 480),
                ]);
            } catch (\Throwable) {
                // best-effort
            }
            return self::FAILURE;
        }
    }

    /**
     * Inner sweep — the body that used to be `handle()`. Extracted so the
     * top-level try/catch in handle() doesn't compete with the per-target
     * try/catch inside the loop.
     */
    private function runSync(SmoobuClient $smoobu, BookingEngineService $service): int
    {
        if (!IntegrationStatus::isEnabled('smoobu')) {
            $this->info('Smoobu integration is globally disabled — skipping.');
            return self::SUCCESS;
        }

        $targets = $this->syncTargets();
        if (empty($targets)) {
            $this->info('No organizations or brands with Smoobu API key configured.');
            return self::SUCCESS;
        }

        $totalSynced = 0;
        $totalErrors = 0;
        $targetCount = 0;

        foreach ($targets as $target) {
            // Bind BOTH the org and the brand (when present). The
            // SmoobuClient resolves per-brand key first, then falls
            // back to org-level — but only if `current_brand_id` is
            // bound. Without this, brand-scoped Smoobu accounts
            // silently never synced and the calendar drifted.
            app()->instance('current_organization_id', $target['org_id']);
            if (!empty($target['brand_id'])) {
                app()->instance('current_brand_id', $target['brand_id']);
            }

            $label = $target['brand_id']
                ? "Org {$target['org_id']} / Brand {$target['brand_id']}"
                : "Org {$target['org_id']}";

            try {
                if ($smoobu->isMock()) {
                    $this->warn("{$label}: Smoobu in mock mode, skipping.");
                    continue;
                }

                $result = $service->syncReservationsFromPms(
                    $this->option('from'),
                    $this->option('to'),
                );

                $totalSynced += $result['synced'];
                $totalErrors += $result['errors'];
                $targetCount++;

                $arr = $result['passes']['arrival_window'] ?? null;
                $mod = $result['passes']['modified_recent'] ?? null;
                $this->info(sprintf(
                    '%s: %d synced (arr:%d mod:%d), %d errors. Window %s → %s, modified ≥ %s.',
                    $label,
                    $result['synced'],
                    $arr['synced'] ?? 0,
                    $mod['synced'] ?? 0,
                    $result['errors'],
                    $result['from'],
                    $result['to'],
                    $result['modified_from'] ?? 'n/a',
                ));

                // Audit the cron run so the dashboard "Last Sync"
                // badge updates. The badge reads
                // AuditLog::where('action','like','booking.sync%') and
                // before this write it was ONLY populated by the
                // manual-sync button — so a perfectly healthy 5-min
                // cron looked stuck for days. user_id = null
                // distinguishes cron rows from manual ones.
                try {
                    AuditLog::create([
                        'organization_id' => $target['org_id'],
                        'user_id'         => null,
                        'action'          => 'booking.sync_cron',
                        'description'     => sprintf(
                            'Auto sync: %d synced, %d errors',
                            $result['synced'],
                            $result['errors'],
                        ),
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('Could not write cron sync audit row', [
                        'org_id' => $target['org_id'],
                        'error'  => $e->getMessage(),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::error('Scheduled Smoobu sync failed', [
                    'org_id'   => $target['org_id'],
                    'brand_id' => $target['brand_id'] ?? null,
                    'error'    => $e->getMessage(),
                ]);
                $this->error("{$label}: {$e->getMessage()}");
                // Also surface failures in the audit log so an
                // operator looking at the dashboard sees that the
                // cron tried + failed, instead of silence that
                // looks identical to "cron didn't run at all".
                try {
                    AuditLog::create([
                        'organization_id' => $target['org_id'],
                        'user_id'         => null,
                        'action'          => 'booking.sync_cron_failed',
                        'description'     => 'Auto sync failed: ' . substr($e->getMessage(), 0, 480),
                    ]);
                } catch (\Throwable) {}
            } finally {
                app()->forgetInstance('current_organization_id');
                app()->forgetInstance('current_brand_id');
            }
        }

        $this->info("Done. Total: {$totalSynced} synced, {$totalErrors} errors across {$targetCount} target(s).");
        return self::SUCCESS;
    }

    /**
     * Build the list of sync targets. Each target is `[org_id, brand_id]`
     * where brand_id may be null (org-level Smoobu key) or set (brand-
     * level key on the `brands` table).
     *
     * Why this matters: pre-fix, the cron only walked
     * `hotel_settings.booking_smoobu_api_key`, so any brand with its
     * OWN `brands.pms_smoobu_api_key` was invisible to the cron and
     * never synced. Multi-brand customers reported "sync only catches
     * part of bookings even after retries" — the missing part was
     * always the brand-scoped half of their portfolio.
     *
     * @return array<int, array{org_id:int, brand_id:?int}>
     */
    private function syncTargets(): array
    {
        if ($explicit = $this->option('org')) {
            return [['org_id' => (int) $explicit, 'brand_id' => null]];
        }

        $targets = [];

        // 1. Orgs with an org-level Smoobu key.
        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_smoobu_api_key')
            ->whereNotNull('value')
            ->where('value', '!=', '')
            ->pluck('organization_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
        foreach ($orgIds as $orgId) {
            $targets[] = ['org_id' => (int) $orgId, 'brand_id' => null];
        }

        // 2. Brands with a per-brand Smoobu key. Each gets its own
        //    pass so SmoobuClient picks the brand-scoped credentials.
        try {
            $brands = \App\Models\Brand::withoutGlobalScopes()
                ->whereNotNull('pms_smoobu_api_key')
                ->where('pms_smoobu_api_key', '!=', '')
                ->get(['id', 'organization_id', 'pms_smoobu_api_key']);
            foreach ($brands as $brand) {
                $targets[] = [
                    'org_id'   => (int) $brand->organization_id,
                    'brand_id' => (int) $brand->id,
                ];
            }
        } catch (\Throwable $e) {
            // Defensive — brands table might not exist on a legacy
            // org. Don't let it kill the cron entirely.
            Log::warning('Smoobu cron could not enumerate brands: ' . $e->getMessage());
        }

        return $targets;
    }

    /**
     * Register a shutdown handler that releases the framework-schedule
     * cache lock for this command on abnormal exit. Without this, a
     * SIGTERM during deploy or a fatal error mid-sync leaves a 10-minute
     * (or worse — corrupt-expiration) zombie row in `cache_locks` that
     * silently skips every subsequent tick.
     *
     * The lock key Laravel uses is `framework-schedule-` + SHA-1 of the
     * unique scheduled-event mutex. We can't reconstruct it deterministically
     * without re-resolving the Scheduler binding here (the schedule lives
     * in routes/console.php and is keyed on mutex generation that depends
     * on the running container), so we take the cheap-and-correct approach:
     * wipe every `framework-schedule%` row whose expiration has already
     * lapsed. Active locks (other crons currently in flight) are NOT
     * touched because their expiration is still in the future.
     */
    private function registerLockReleaseShutdown(): void
    {
        // Only meaningful under the database cache driver; SIGTERM-safe
        // under all drivers but a no-op for redis/memcached (those expire
        // on their own).
        register_shutdown_function(static function (): void {
            try {
                // Only the database cache driver writes to `cache_locks`.
                // If the table doesn't exist (legacy install) bail silently.
                if (!\Illuminate\Support\Facades\Schema::hasTable('cache_locks')) {
                    return;
                }

                // Wipe ONLY rows whose expiration has lapsed. We can't
                // identify "our" lock specifically without the mutex hash,
                // but expired rows of OTHER crons are zombies too — they
                // benefit equally from being purged.
                $deleted = DB::table('cache_locks')
                    ->where('key', 'like', 'framework-schedule%')
                    ->where('expiration', '<=', time())
                    ->delete();

                if ($deleted > 0) {
                    Log::info('[sync-pms] Released ' . $deleted . ' expired schedule lock(s) on shutdown.');
                }
            } catch (\Throwable $e) {
                // Shutdown handlers must never throw — they're called
                // after PHP's regular error machinery has wound down.
                error_log('[sync-pms] shutdown lock release failed: ' . $e->getMessage());
            }
        });
    }

    /**
     * Self-healing detection: if the latest successful sync finished
     * more than STALE_PRIOR_RUN_MINUTES ago, log loud + write a
     * dedicated `booking.sync_stale_detected` audit row so
     * DiagScheduledHealth surfaces it without grepping logs.
     *
     * Read-only — never throws. Failure to look up the prior run does
     * NOT block the sync itself; this is observability only.
     */
    private function warnOnStalePriorRun(): void
    {
        try {
            if (!\Illuminate\Support\Facades\Schema::hasTable('scheduled_command_runs')) {
                return;
            }

            $lastSuccess = ScheduledCommandRun::where('command', 'bookings:sync-pms')
                ->where('status', 'success')
                ->orderByDesc('id')
                ->first();

            if (!$lastSuccess || !$lastSuccess->finished_at) {
                // First run after deploy, or no observability table yet.
                // Not a stall — leave silent.
                return;
            }

            $minutesSince = (int) abs($lastSuccess->finished_at->diffInMinutes(now()));
            if ($minutesSince < self::STALE_PRIOR_RUN_MINUTES) {
                return;
            }

            $message = sprintf(
                'bookings:sync-pms has not had a successful run in %d minutes '
                    . '(last success: %s). Possible causes: stuck framework-schedule '
                    . 'cache_locks row, dead schedule:work worker, or every recent '
                    . 'run threw before completing. To unstick the lock: '
                    . '`php artisan schedule:release-lock bookings:sync-pms` '
                    . 'or `DELETE FROM cache_locks WHERE key LIKE \'framework-schedule%%\'`.',
                $minutesSince,
                $lastSuccess->finished_at->toDateTimeString(),
            );

            Log::warning($message);
            $this->warn($message);

            try {
                AuditLog::create([
                    'organization_id' => null,
                    'user_id'         => null,
                    'action'          => 'booking.sync_stale_detected',
                    'description'     => $message,
                ]);
            } catch (\Throwable) {
                // best-effort
            }
        } catch (\Throwable $e) {
            // Observability must never block the sync itself.
            Log::warning('[sync-pms] stale-prior-run check failed: ' . $e->getMessage());
        }
    }
}
