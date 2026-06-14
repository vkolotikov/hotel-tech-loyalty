<?php

namespace App\Console\Commands\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Stuck-lock guard for scheduled commands using withoutOverlapping().
 *
 * Under CACHE_STORE=database (Laravel Cloud default) the schedule lock
 * lives in the cache_locks table. If the worker is SIGTERM'd or OOM-killed
 * mid-tick, the lock row is acquired but never released; subsequent ticks
 * skip silently until the expiration TTL lapses. The framework-schedule
 * mutex bug bit prod hard on 2026-05-28 (Smoobu sync stuck for 6 days
 * before anyone noticed).
 *
 * SyncSmoobuBookings shipped a register_shutdown_function fix; this trait
 * extracts the pattern so RetryPmsSync + CapturePendingPaymentIntents
 * (the other two money-moving overlap-guarded crons) inherit it.
 *
 * Call ::releaseScheduleLockOnShutdown() once from handle() entry.
 */
trait ReleasesScheduleLock
{
    private static bool $scheduleLockReleaseRegistered = false;

    protected function releaseScheduleLockOnShutdown(): void
    {
        if (self::$scheduleLockReleaseRegistered) {
            return;
        }
        self::$scheduleLockReleaseRegistered = true;

        register_shutdown_function(function () {
            try {
                if (!DB::getSchemaBuilder()->hasTable('cache_locks')) {
                    return;
                }
                // Only wipe EXPIRED framework-schedule locks. Active locks
                // belonging to other healthy in-flight crons must NOT be
                // touched — their expiration is still in the future.
                $now = time();
                DB::table('cache_locks')
                    ->where('key', 'like', 'framework-schedule%')
                    ->where('expiration', '<=', $now)
                    ->delete();
            } catch (Throwable $e) {
                // Last-gasp cleanup; never let this kill the process.
                // Log::warning itself may throw at shutdown when the
                // facade has already been torn down (PHP tears down
                // facades in non-deterministic order). Wrap so a
                // shutdown-time Log failure can't bubble out and crash
                // the process with a non-zero exit (which would make
                // the scheduler think the cron failed).
                try {
                    Log::warning('ReleasesScheduleLock shutdown cleanup failed', [
                        'error' => $e->getMessage(),
                    ]);
                } catch (Throwable) { /* defensive — process is dying */ }
            }
        });
    }
}
