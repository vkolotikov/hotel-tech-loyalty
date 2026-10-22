<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 4 (part E): an index for the ledger's reads by organisation and time — Insights' points
 * figures and its cohort retention read an organisation's lines of a period (`organization_id = ? AND created_at >= ?
 * AND created_at < ?`). Only the index; no column, no data.
 *
 * points_transactions is a large table that is written all day (every earn, redeem and expiry), so on PostgreSQL the
 * index is built with CREATE INDEX CONCURRENTLY, which does not block those writes while it builds. CONCURRENTLY
 * cannot run inside a transaction, and Laravel wraps a migration in one on PostgreSQL unless it says otherwise:
 * `$withinTransaction = false` says so. A concurrent build that failed half-way leaves an INVALID index of the name
 * behind; up() drops such a leftover before it builds again, so the migration can simply be run again. On SQLite (the
 * tests) and any other database it is Laravel's plain index, which those build without blocking anyone that matters.
 */
return new class extends Migration
{
    /** CREATE / DROP INDEX CONCURRENTLY cannot run inside a transaction block. */
    public $withinTransaction = false;

    private const TABLE = 'points_transactions';
    private const INDEX = 'points_transactions_org_created_index';

    public function up(): void
    {
        if (!Schema::hasTable(self::TABLE)) {
            return;
        }

        if (DB::getDriverName() === 'pgsql') {
            $valid = DB::selectOne('SELECT i.indisvalid AS valid FROM pg_index i WHERE i.indexrelid = to_regclass(?)', [self::INDEX]);
            if ($valid !== null && $valid->valid) {
                return;
            }
            if ($valid !== null) {
                DB::statement('DROP INDEX CONCURRENTLY IF EXISTS ' . self::INDEX);
            }
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS ' . self::INDEX . ' ON ' . self::TABLE . ' (organization_id, created_at)');

            return;
        }

        if (!$this->exists()) {
            Schema::table(self::TABLE, fn (Blueprint $t) => $t->index(['organization_id', 'created_at'], self::INDEX));
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable(self::TABLE)) {
            return;
        }

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS ' . self::INDEX);

            return;
        }

        if ($this->exists()) {
            Schema::table(self::TABLE, fn (Blueprint $t) => $t->dropIndex(self::INDEX));
        }
    }

    private function exists(): bool
    {
        return collect(Schema::getIndexes(self::TABLE))->contains(fn (array $index) => ($index['name'] ?? null) === self::INDEX);
    }
};
