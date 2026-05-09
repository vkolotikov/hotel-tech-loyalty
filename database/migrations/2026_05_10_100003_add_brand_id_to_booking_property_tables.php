<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 of multi-brand: stamp `brand_id` onto booking + property tables.
 *
 * `properties.brand_id` is the conceptual connector — properties belong to
 * brands. Booking rooms / extras / submissions / payments all live under a
 * brand because they describe what's bookable on that brand's website.
 *
 * Outlets and venues sit under properties; their brand is derivable but we
 * still stamp directly so admin lists don't have to JOIN through properties.
 *
 * Same pattern as Phase 2: nullable column + composite (org, brand) index +
 * in-migration backfill from each row's organization's default brand. A
 * later phase will tighten to NOT NULL after prod backfill verification.
 *
 * Also adds two columns directly to `brands` for per-brand Smoobu PMS
 * credentials. Other integration keys (Stripe, etc.) stay org-level for
 * now — Smoobu is the most common case where one corporate group uses
 * different PMS accounts per brand.
 */
return new class extends Migration
{
    /**
     * Tables that get a `brand_id` column. `outlets` is intentionally
     * excluded — outlets sit under properties and derive their brand via
     * the property FK; stamping a redundant column would just create a
     * synchronisation bug surface.
     */
    private const TABLES = [
        'booking_submissions',
        'booking_rooms',
        'booking_extras',
        'service_extras',
        'properties',
        'venues',
        'services',
        'service_categories',
        'service_masters',
        'service_bookings',
    ];

    public function up(): void
    {
        // Per-brand Smoobu PMS credentials. Nullable — when blank we fall
        // back to the org-level hotel_settings entry. SmoobuClient prefers
        // the brand-specific key when current_brand_id is bound.
        if (Schema::hasTable('brands') && !Schema::hasColumn('brands', 'pms_smoobu_api_key')) {
            Schema::table('brands', function (Blueprint $blueprint) {
                $blueprint->string('pms_smoobu_api_key', 200)->nullable()->after('domain');
                $blueprint->string('pms_smoobu_channel_id', 100)->nullable()->after('pms_smoobu_api_key');
            });
        }

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

        if (Schema::hasTable('brands') && Schema::hasColumn('brands', 'pms_smoobu_api_key')) {
            Schema::table('brands', function (Blueprint $blueprint) {
                $blueprint->dropColumn(['pms_smoobu_api_key', 'pms_smoobu_channel_id']);
            });
        }
    }
};
