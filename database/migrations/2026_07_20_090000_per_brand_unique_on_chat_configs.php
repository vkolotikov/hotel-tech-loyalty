<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make the chat/chatbot config tables per-BRAND instead of per-ORG.
 *
 * These tables gained a brand_id column when brands shipped, but kept the
 * legacy UNIQUE(organization_id) index from the single-brand era. That made
 * a second brand's config row impossible: creating a brand tried to clone
 * the widget config, hit the unique violation, and (because the clone runs
 * inside a transaction) poisoned it — Postgres turned the COMMIT into a
 * ROLLBACK, so the brand silently vanished while the API reported success.
 *
 * Swap each to UNIQUE(organization_id, brand_id) so every brand can own its
 * own chat widget / behaviour / model config. Existing rows with a NULL
 * brand_id are first attached to the org's default brand.
 */
return new class extends Migration {
    /** table => legacy unique index name */
    private const TARGETS = [
        'chat_widget_configs'      => 'chat_widget_configs_organization_id_unique',
        'chatbot_behavior_configs' => 'chatbot_behavior_configs_organization_id_unique',
        'chatbot_model_configs'    => 'chatbot_model_configs_organization_id_unique',
    ];

    public function up(): void
    {
        foreach (self::TARGETS as $table => $legacyIndex) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'brand_id')) {
                continue;
            }

            // Attach orphaned rows to their org's default brand so the new
            // composite unique is meaningful (Postgres treats NULLs as
            // distinct, which would silently allow duplicates per org).
            DB::statement("
                UPDATE {$table} t
                   SET brand_id = b.id
                  FROM brands b
                 WHERE t.brand_id IS NULL
                   AND b.organization_id = t.organization_id
                   AND b.is_default = true
                   AND b.deleted_at IS NULL
            ");

            // Laravel's ->unique() creates a CONSTRAINT on Postgres, which
            // owns its index — DROP INDEX alone fails with 2BP01. Drop the
            // constraint first, then fall back to a plain index drop for
            // environments where it was created as a bare index.
            $this->dropUnique($table, $legacyIndex);

            $newIndex = "{$table}_org_brand_unique";
            $this->dropUnique($table, $newIndex);
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$newIndex} UNIQUE (organization_id, brand_id)");
        }
    }

    /**
     * Remove a unique rule by name whether it exists as a constraint
     * (Laravel's ->unique() on Postgres) or as a bare unique index.
     */
    private function dropUnique(string $table, string $name): void
    {
        DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$name}");
        DB::statement("DROP INDEX IF EXISTS {$name}");
    }

    public function down(): void
    {
        foreach (self::TARGETS as $table => $legacyIndex) {
            if (!Schema::hasTable($table)) {
                continue;
            }

            $this->dropUnique($table, "{$table}_org_brand_unique");

            // Restoring UNIQUE(organization_id) only succeeds when the org
            // genuinely has one config row; keep the rollback non-fatal so a
            // multi-brand org can still roll back the rest of the batch.
            try {
                DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$legacyIndex} UNIQUE (organization_id)");
            } catch (\Throwable) {
                // Multi-brand data present — leave the composite constraint dropped.
            }
        }
    }
};
