<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Heal NULL brand_id rows across every brand-scoped table.
 *
 * Two reasons rows end up with brand_id=NULL after the original Phase 2
 * backfill migrations:
 *   1. Rows created BEFORE the multi-brand migrations ran on a customer's
 *      DB (very old data).
 *   2. Rows created in "All brands" admin mode (currentBrandId=null). The
 *      BelongsToBrand trait only auto-fills brand_id when current_brand_id
 *      is bound AND truthy — null means no fill, so the row was saved
 *      without a brand. When a 2nd brand is later created and the admin
 *      switches to a specific brand, BrandScope filters those NULL rows
 *      out → the user sees their popup rules / KB items / etc. disappear.
 *
 * This idempotent backfill re-runs the same UPDATE pattern as the original
 * Phase 2 migrations, covering every table that has a brand_id column.
 * Re-runs are safe — the WHERE t.brand_id IS NULL guard makes it a no-op
 * once rows are healed.
 */
return new class extends Migration
{
    /**
     * Every table with a brand_id column. Drawn from the Phase 2/3/4 migrations:
     *   - 100002_add_brand_id_to_chatbot_widget_kb_tables
     *   - 100003_add_brand_id_to_booking_property_tables
     *   - 100004_add_brand_id_to_attribution_tables
     */
    private const TABLES = [
        // chatbot / widget / kb
        'chatbot_behavior_configs',
        'chatbot_model_configs',
        'knowledge_categories',
        'knowledge_items',
        'knowledge_documents',
        'chat_widget_configs',
        'popup_rules',
        'chat_conversations',
        'visitors',
        // booking + property
        'booking_rooms',
        'booking_extras',
        'booking_submissions',
        'properties',
        'venues',
        'services',
        'service_categories',
        'service_masters',
        'service_extras',
        'service_bookings',
        // attribution
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
                continue;
            }

            // Identical to the original Phase 2 backfill. Idempotent.
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
        // Intentional no-op — there's no safe inverse. We can't tell which
        // rows had brand_id set by this heal pass vs by the original
        // backfill vs by user action. Rolling back would corrupt data.
    }
};
