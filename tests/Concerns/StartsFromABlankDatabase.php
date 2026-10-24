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
 * keeps this to the one test). On PostgreSQL a failed statement aborts the
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
}
