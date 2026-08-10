<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Close a cross-tenant leak in three loyalty child tables.
 *
 * `point_expiry_buckets`, `tier_assessments` and `member_offers` never
 * received an `organization_id` in the multi-tenancy migration, and their
 * models extend bare Model — no `BelongsToOrganization`, so no TenantScope.
 * Any query that starts from one of these tables rather than from
 * `loyalty_members` therefore reads every tenant's rows at once.
 *
 * That is not theoretical. `AnalyticsService::getExpiryForecast()` and
 * `LoyaltyService`'s points-liability figure both aggregate
 * `point_expiry_buckets` directly with no tenant predicate, behind an
 * org-scoped cache key that makes the result look tenant-specific.
 * Measured before this migration: with 11 111 points of live buckets in
 * org 1 and 22 222 in org 2, BOTH orgs were shown 33 333 — each one
 * reading the other's liability.
 *
 * The member row is the authority: every one of these tables hangs off
 * `member_id`, and `loyalty_members.organization_id` has been correct all
 * along.
 */
return new class extends Migration
{
    /** table => the members-table foreign key it hangs off. */
    private const TABLES = [
        'point_expiry_buckets' => 'member_id',
        'tier_assessments'     => 'member_id',
        'member_offers'        => 'member_id',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table => $fk) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, $fk)) {
                continue;
            }

            if (!Schema::hasColumn($table, 'organization_id')) {
                Schema::table($table, function (Blueprint $t) {
                    // Nullable: rows whose member has since been deleted have
                    // no org to inherit, and a NOT NULL would fail the
                    // migration rather than surface them.
                    $t->unsignedBigInteger('organization_id')->nullable()->after('id');
                });
            }

            DB::statement("
                UPDATE {$table} t
                   SET organization_id = m.organization_id
                  FROM loyalty_members m
                 WHERE m.id = t.{$fk}
                   AND t.organization_id IS NULL
                   AND m.organization_id IS NOT NULL
            ");

            $orphans = DB::table($table)->whereNull('organization_id')->count();

            Schema::table($table, function (Blueprint $t) use ($table) {
                // Composite, member-first: these tables are almost always
                // read per member, and the org column is the tenant guard
                // rather than a selective predicate on its own.
                $t->index(['organization_id'], "{$table}_org_idx");
            });

            Log::info("tenant_scope_loyalty_child_tables: {$table}", [
                'rows'                    => DB::table($table)->count(),
                'still_without_org'       => $orphans,
            ]);
        }
    }

    public function down(): void
    {
        foreach (array_keys(self::TABLES) as $table) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'organization_id')) {
                continue;
            }
            Schema::table($table, function (Blueprint $t) use ($table) {
                $t->dropIndex("{$table}_org_idx");
                $t->dropColumn('organization_id');
            });
        }
    }
};
