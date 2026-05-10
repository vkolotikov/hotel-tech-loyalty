<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * CRM Phase 7 — admin-defined custom fields per entity.
 *
 * One `custom_fields` table holds the schema (per org, per entity).
 * Values live on the entity itself in a `custom_data` jsonb column on
 * each of the four supported entities (inquiries, guests, corporate_
 * accounts, tasks). Single jsonb beats a custom_field_values join
 * table for our read patterns — every detail-page render becomes one
 * row fetch, and Postgres' jsonb operators give us cheap key reads.
 *
 * The system is designed for multi-industry use (hotels, beauty/spa,
 * medicine, legal, etc.) — admins seed an industry preset and then
 * tweak from there.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('custom_fields')) {
            Schema::create('custom_fields', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();

                /**
                 * Which entity this field attaches to. The four supported
                 * values map 1:1 to the entity tables that grow a
                 * custom_data column below.
                 *   inquiry | guest | corporate_account | task
                 */
                $t->string('entity', 32)->index();

                /**
                 * Stable JSON key. Generated from the label on create
                 * (slug + dedupe), kept stable across renames so saved
                 * values don't orphan when the admin tweaks the label.
                 */
                $t->string('key', 64);

                $t->string('label', 120);

                /**
                 * Field type — drives the input renderer and the
                 * server-side validation cast.
                 *   text | textarea | number | date | select |
                 *   multiselect | checkbox | url | email | phone
                 */
                $t->string('type', 24);

                /**
                 * Type-specific config bag:
                 *   - select / multiselect: { options: [string, ...] }
                 *   - number: { min?, max?, step? }
                 *   - text: { max_length? }
                 * Keep open-ended so future types add config without a
                 * migration.
                 */
                $t->json('config')->nullable();

                $t->string('help_text', 240)->nullable();
                $t->boolean('required')->default(false);
                $t->boolean('is_active')->default(true);

                /**
                 * Future polish: surface this field as a column in the
                 * leads list. Off by default — the existing built-in
                 * columns are already configurable from the layout
                 * editor and adding noisy custom columns would crowd
                 * the table.
                 */
                $t->boolean('show_in_list')->default(false);

                $t->unsignedSmallInteger('sort_order')->default(0);

                $t->timestamps();

                // Org + entity is the dominant query pattern (form/list
                // renderer pulls all fields for one entity at a time).
                $t->index(['organization_id', 'entity', 'is_active', 'sort_order'], 'custom_fields_render_idx');

                // Key must be unique per (org, entity) so JSON keys on
                // entity rows are unambiguous.
                $t->unique(['organization_id', 'entity', 'key'], 'custom_fields_org_entity_key_unique');
            });
        }

        // Add custom_data jsonb to each supported entity. Nullable so
        // existing rows are unaffected. Postgres jsonb is the right
        // choice — it gives us GIN indexability later if we need to
        // filter on custom values.
        foreach (['inquiries', 'guests', 'corporate_accounts', 'tasks'] as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'custom_data')) {
                Schema::table($table, function (Blueprint $t) {
                    // Use raw because Laravel's jsonb support is patchy on
                    // older Schema builders — `json()` does the same on
                    // pgsql but we want jsonb for indexability.
                    $t->jsonb('custom_data')->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['inquiries', 'guests', 'corporate_accounts', 'tasks'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'custom_data')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropColumn('custom_data');
                });
            }
        }
        Schema::dropIfExists('custom_fields');
    }
};
