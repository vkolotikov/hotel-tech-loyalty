<?php

namespace Tests\Unit\Support;

use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * AdvisoryLock::within() takes a second, transaction-scoped lock inside a
 * transaction someone else already opened (the portal confirm's slot lock).
 * On PostgreSQL that is `pg_advisory_xact_lock`; the suite runs on sqlite,
 * where it must issue nothing at all and never throw — sqlite serialises
 * writers itself, and a stray statement would be a syntax error there.
 */
class AdvisoryLockTest extends TestCase
{
    public function test_within_issues_no_statement_on_sqlite_inside_a_transaction(): void
    {
        $this->assertSame('sqlite', DB::getDriverName());
        DB::enableQueryLog();
        DB::flushQueryLog();

        DB::transaction(fn () => AdvisoryLock::within('pi:pi_123'));

        $this->assertSame([], DB::getQueryLog());
    }

    public function test_within_does_not_throw_outside_postgresql_even_without_a_transaction(): void
    {
        DB::enableQueryLog();
        DB::flushQueryLog();

        AdvisoryLock::within('pi:pi_456');

        $this->assertSame([], DB::getQueryLog());
    }
}
