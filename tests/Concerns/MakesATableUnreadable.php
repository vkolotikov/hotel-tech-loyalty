<?php

namespace Tests\Concerns;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * "The database is gone" for one table, on either engine, without breaking the
 * test's own transaction.
 *
 * A test that drops a table so that the code under test meets a failing query
 * works on sqlite, but on PostgreSQL the failing statement aborts the
 * transaction DatabaseTransactions wraps the test in, so every later query of
 * the test fails too ("current transaction is aborted") — something production,
 * which runs that code outside any transaction, never sees. Here every statement
 * naming the table is refused before it reaches the database, with the
 * QueryException a missing table gives, so the code under test meets the same
 * failure and the test's transaction stays usable.
 */
trait MakesATableUnreadable
{
    protected function makeTableUnreadable(string $table): void
    {
        $pattern = '/(^|[^A-Za-z0-9_])' . preg_quote($table, '/') . '($|[^A-Za-z0-9_])/';

        DB::connection()->beforeExecuting(function (string $query, array $bindings, $connection) use ($pattern, $table) {
            if (preg_match($pattern, $query)) {
                throw new QueryException(
                    $connection->getName(),
                    $query,
                    $bindings,
                    new \PDOException("no such table: {$table} (made unreadable by the test)"),
                );
            }
        });
    }
}
