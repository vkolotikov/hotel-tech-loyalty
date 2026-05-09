<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 of multi-brand: stamp `brand_id` onto every chatbot, knowledge-base,
 * widget, popup-rule, conversation and visitor row. See
 * apps/loyalty/MULTI_BRAND_PLAN.md for the architectural rationale.
 *
 * Column is nullable for now and backfilled in the same migration to each
 * org's default brand. A follow-up migration in a later phase will tighten
 * to NOT NULL once we've verified the backfill in production.
 *
 * No table is dropped, no `organization_id` column is removed — both scopes
 * compose (TenantScope first ensures org isolation, BrandScope further
 * narrows when a specific brand is selected).
 */
return new class extends Migration
{
    /**
     * Tables that get a brand_id column. Order matters only insofar as the
     * backfill UPDATEs run sequentially.
     */
    private const TABLES = [
        'chatbot_behavior_configs',
        'chatbot_model_configs',
        'knowledge_categories',
        'knowledge_items',
        'knowledge_documents',
        'chat_widget_configs',
        'popup_rules',
        'chat_conversations',
        'visitors',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (!Schema::hasTable($table)) {
                // Skip silently — older deployments may not have every table
                // (e.g. canned_replies was talked about but never migrated in).
                continue;
            }

            if (!Schema::hasColumn($table, 'brand_id')) {
                Schema::table($table, function (Blueprint $blueprint) use ($table) {
                    // Nullable + indexed. We don't add a foreign key here
                    // because some of these tables predate `brands` and a
                    // single failed backfill row could brick the migration.
                    // The Brand model + tenant scope provide referential
                    // safety at the application layer.
                    $blueprint->unsignedBigInteger('brand_id')
                        ->nullable()
                        ->after('organization_id');
                    $blueprint->index(['organization_id', 'brand_id'], $table . '_org_brand_idx');
                });
            }

            // Backfill: each row inherits its organization's default brand.
            // Idempotent — only sets brand_id where it's currently null.
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
                    // dropIndex requires the index name; we created it with
                    // an explicit name so we can drop it cleanly.
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
