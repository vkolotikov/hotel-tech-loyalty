<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * A transaction that first takes a Postgres advisory lock on a string key,
 * so two confirms for the same master serialise instead of both passing
 * the availability check. On every other driver (the test suite runs on
 * sqlite) it is a plain transaction: sqlite serialises writers itself.
 *
 * This is the only place `pg_advisory_xact_lock` may appear in new code —
 * every caller that needs a serialised slot claim goes through here so the
 * Postgres-only statement stays behind one driver check.
 */
final class AdvisoryLock
{
    public static function transaction(string $key, callable $fn): mixed
    {
        return DB::transaction(function () use ($key, $fn) {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$key]);
            }
            return $fn();
        });
    }

    /**
     * A second lock inside a transaction the caller already opened (the
     * lock is released when that transaction ends). The portal confirm
     * takes one on its PaymentIntent id: two confirms carrying the same
     * intent can hold different slot keys (`svc:` without a master,
     * `svcm:` with one), and only a lock on the intent itself makes the
     * second wait until the first booking is committed and visible to
     * `assertUnused()`. Does nothing on other drivers (sqlite in tests).
     */
    public static function within(string $key): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$key]);
        }
    }
}
