<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 4 of multi-brand: stamp `brand_id` onto org-scoped CRM and loyalty
 * tables for **attribution** purposes. Unlike Phase 2/3 (where brand_id is
 * a primary scoping axis), these rows live at the org level — the column
 * answers "which brand drove this inquiry / where was this stay / which
 * brand earned these points / which brand-targeted offer or campaign?".
 *
 * The BelongsToBrand global scope still kicks in when a specific brand is
 * bound (so admin SPA filters work with no extra plumbing), but in the
 * "All brands" mode the scope no-ops and admins see every row.
 *
 * Offers and campaigns can also live at brand_id = NULL meaning
 * "org-wide" / "applies to all brands". Per-brand offer logic can opt out
 * of the scope explicitly via `withoutGlobalScope(BrandScope::class)` to
 * include both null + matching rows.
 *
 * `member_offers` is intentionally skipped — it has no organization_id of
 * its own and the brand can be derived via the parent `special_offers`
 * row's brand_id. Stamping a redundant column would just create a sync
 * bug surface.
 */
return new class extends Migration
{
    private const TABLES = [
        'inquiries',
        'reservations',
        'points_transactions',
        'special_offers',
        'notification_campaigns',
        'email_templates',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            if (!Schema::hasColumn($table, 'brand_id')) {
                Schema::table($table, function (Blueprint $blueprint) use ($table) {
                    $blueprint->unsignedBigInteger('brand_id')
                        ->nullable()
                        ->after('organization_id');
                    $blueprint->index(['organization_id', 'brand_id'], $table . '_org_brand_idx');
                });
            }

            // Backfill existing rows to the org's default brand. Idempotent —
            // only sets brand_id where currently null. After this, the only
            // rows with brand_id IS NULL are intentional "applies to all
            // brands" markers (org-wide offers/campaigns) — distinguishable
            // by their type column.
            DB::statement("
                UPDATE \"{$table}\" t
                SET brand_id = b.id
                FROM brands b
                WHERE b.organization_id = t.organization_id
                  AND b.is_default = true
                  AND b.deleted_at IS NULL
                  AND t.brand_id IS NULL
            ");
        }
    }

    public function down(): void
    {
        foreach (array_reverse(self::TABLES) as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            if (Schema::hasColumn($table, 'brand_id')) {
                Schema::table($table, function (Blueprint $blueprint) use ($table) {
                    try {
                        $blueprint->dropIndex($table . '_org_brand_idx');
                    } catch (\Throwable $e) {
                        // Index may have been dropped manually; continue.
                    }
                    $blueprint->dropColumn('brand_id');
                });
            }
        }
    }
};
