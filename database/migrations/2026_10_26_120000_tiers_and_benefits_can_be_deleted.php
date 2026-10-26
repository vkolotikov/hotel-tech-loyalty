<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 11 (owner 2026-10-26: "an option for users to delete or rename tiers and benefits"):
 *
 * - `loyalty_tiers.deleted_at`, `benefit_definitions.deleted_at` — a deleted tier or benefit leaves every list (the
 *   models are SoftDeletes) while the history that names it keeps its name: tier assessments, members' benefit
 *   requests. Written only by App\Services\Loyalty\Programme\TierRemoval and BenefitRemoval.
 * - The organisation's unique tier name and unique benefit code hold among the ones not deleted, so a deleted "Silver"
 *   never stops a new one, nor a deleted benefit a preset that makes its code again: partial unique indexes on
 *   PostgreSQL (production) and SQLite; any other driver keeps the plain unique it has.
 *
 * Nullable columns and index swaps on two small tables: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    private const SWAPS = [
        // table => [the plain unique it has, its columns, the partial unique that replaces it]
        'loyalty_tiers'       => ['loyalty_tiers_organization_id_name_unique', 'organization_id, name', 'loyalty_tiers_org_name_live_unique'],
        'benefit_definitions' => ['benefit_definitions_organization_id_code_unique', 'organization_id, code', 'benefit_definitions_org_code_live_unique'],
    ];

    public function up(): void
    {
        foreach (array_keys(self::SWAPS) as $table) {
            if (!Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, fn (Blueprint $t) => $t->softDeletes());
            }
        }

        $driver = DB::getDriverName();
        if (!in_array($driver, ['pgsql', 'sqlite'], true)) {
            return;
        }
        foreach (self::SWAPS as $table => [$plain, $columns, $partial]) {
            if ($driver === 'pgsql') {
                DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$plain}");
            }
            DB::statement("DROP INDEX IF EXISTS {$plain}");
            DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS {$partial} ON {$table} ({$columns}) WHERE deleted_at IS NULL");
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        foreach (self::SWAPS as $table => [$plain, $columns, $partial]) {
            if (in_array($driver, ['pgsql', 'sqlite'], true)) {
                DB::statement("DROP INDEX IF EXISTS {$partial}");
                // The plain unique comes back only where no deleted row shares a name (or code) with a kept one.
                $cols = array_map('trim', explode(',', $columns));
                $clash = DB::table($table)->select($cols)->groupBy($cols)->havingRaw('COUNT(*) > 1')->exists();
                if (!$clash) {
                    Schema::table($table, fn (Blueprint $t) => $t->unique($cols, $plain));
                }
            }
            if (Schema::hasColumn($table, 'deleted_at')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropSoftDeletes());
            }
        }
    }
};
