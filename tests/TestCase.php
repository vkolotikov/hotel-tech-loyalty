<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    /** Whether this process has checked the PostgreSQL sequences yet (see keepFixedTestIdsFree()). */
    private static bool $sequencesChecked = false;
    private array $refundJournalBefore = [];
    private bool $refundJournalInitialized = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->keepFixedTestIdsFree();
        $this->setUpRefundJournal();
        $this->refundJournalBefore = \App\Services\Booking\RefundOperations::connection()->table('refund_operations')->pluck('id')->all();
        $this->refundJournalInitialized = true;
    }

    protected function tearDown(): void
    {
        // The journal intentionally survives application rollbacks, so test isolation must clean it explicitly.
        if ($this->refundJournalInitialized) {
            \App\Services\Booking\RefundOperations::connection()->table('refund_operations')->whereNotIn('id', $this->refundJournalBefore)->delete();
        }
        parent::tearDown();
    }

    /** A second in-memory connection models the independently committed production refund journal. */
    private function setUpRefundJournal(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlite' || DB::connection()->getDatabaseName() !== ':memory:') return;
        $journal = \App\Services\Booking\RefundOperations::connection();
        if (!$journal->getSchemaBuilder()->hasTable('refund_operations')) {
            (require database_path('migrations/2026_10_29_140000_create_refund_operations.php'))->up(\App\Services\Booking\RefundOperations::CONNECTION);
        }
    }

    /**
     * Many tests write rows with fixed ids (organisation 1, user 7, member 41 ...)
     * beside rows the database numbers itself. On sqlite every test starts from an
     * empty in-memory database, so the two never meet; on PostgreSQL built from
     * every migration (CLAUDE.md, "Testing against PostgreSQL") a fresh database
     * starts every sequence at 1, and the first row it numbers would take an id a
     * test writes by hand. Once per process, any sequence of the current schema
     * still below 100000 is moved to 100000. setval() is not undone by the test's
     * rollback, so this happens once per database and is a no-op afterwards.
     */
    private function keepFixedTestIdsFree(): void
    {
        if (self::$sequencesChecked) {
            return;
        }
        self::$sequencesChecked = true;

        if (config('database.connections.' . config('database.default') . '.driver') !== 'pgsql') {
            return;
        }

        foreach (DB::select("select sequencename from pg_sequences where schemaname = current_schema() and coalesce(last_value, 0) < 100000") as $row) {
            DB::select('select setval(?, 100000)', [$row->sequencename]);
        }
    }
}
