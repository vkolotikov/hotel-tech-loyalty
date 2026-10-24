<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;

/**
 * For a test of a migration: the empty database the migration is written
 * against, on either engine.
 *
 * On sqlite (`:memory:`) every test already starts from an empty database.
 * On PostgreSQL built from every migration (see CLAUDE.md, "Testing against
 * PostgreSQL") the tables the test builds already exist in `public`, so the
 * test gets an empty schema of its own instead: created inside the test's
 * transaction and put first on the search path for that transaction only
 * (`SET LOCAL`), so every statement, `Schema::hasTable()` and
 * `Schema::getIndexes()` included, sees only what the test builds. The
 * transaction's rollback removes the schema and restores the search path;
 * nothing of the test is left in the database.
 *
 * The test class must use `DatabaseTransactions` (the transaction is what
 * keeps this to the one test), except for startFromABlankDatabaseOutsideATransaction(). On PostgreSQL a failed statement aborts the
 * transaction it runs in; a test that expects one to fail runs it inside
 * `DB::transaction()` (a savepoint), as the migrations themselves do.
 */
trait StartsFromABlankDatabase
{
    protected function startFromABlankDatabase(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        if (DB::transactionLevel() < 1) {
            throw new \LogicException(static::class . ' must use DatabaseTransactions before it starts from a blank database.');
        }

        $schema = 'blank_' . bin2hex(random_bytes(6));
        DB::statement("CREATE SCHEMA {$schema}");
        DB::statement("SET LOCAL search_path TO {$schema}");
    }

    /**
     * The same empty schema for a test that cannot run inside a transaction: one
     * of a migration that says `$withinTransaction = false` (CREATE INDEX
     * CONCURRENTLY refuses a transaction block). The test class does not use
     * DatabaseTransactions; the schema is put first on this connection's search
     * path for the session, and dropped with everything in it, and the search
     * path reset, when the test's application is torn down, failed or not.
     */
    protected function startFromABlankDatabaseOutsideATransaction(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        if (DB::transactionLevel() > 0) {
            throw new \LogicException(static::class . ' runs outside a transaction; it must not use DatabaseTransactions.');
        }

        $schema = 'blank_' . bin2hex(random_bytes(6));
        DB::statement("CREATE SCHEMA {$schema}");
        DB::statement("SET search_path TO {$schema}");

        $this->beforeApplicationDestroyed(function () use ($schema) {
            DB::statement('RESET search_path');
            DB::statement("DROP SCHEMA IF EXISTS {$schema} CASCADE");
        });
    }
}
