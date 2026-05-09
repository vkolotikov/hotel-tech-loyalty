<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Phase 1 of multi-brand: introduce a brand layer inside each organization.
 *
 * A brand owns chatbot, widget, knowledge-base, booking-engine, and theme
 * configuration. CRM (guests, inquiries, reservations) and loyalty (members,
 * points, tiers) stay at the organization level.
 *
 * Every existing organization is backfilled with one default brand so all
 * existing data implicitly attaches to it (subsequent phase migrations stamp
 * `brand_id` on dependent tables and set the default brand's id as the value).
 *
 * The `brands.widget_token` column becomes the canonical embed token. The
 * existing `organizations.widget_token` is intentionally NOT dropped here —
 * legacy public widget URLs keep working until Phase 2 wires the new
 * `/widget/{brand_token}` routes with redirect fallbacks.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('brands')) {
            return;
        }

        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('slug', 100);
            $table->text('description')->nullable();

            // Branding
            $table->string('logo_url')->nullable();
            $table->string('primary_color', 7)->nullable();   // #rrggbb

            // Public addressing
            $table->string('widget_token', 64)->unique();
            $table->string('domain')->nullable();             // reserved for Phase 5 custom-domain support

            // Lifecycle
            $table->boolean('is_default')->default(false);
            $table->integer('sort_order')->default(0);

            $table->softDeletes();
            $table->timestamps();

            $table->unique(['organization_id', 'slug'], 'brands_org_slug_unique');
            $table->index(['organization_id', 'is_default'], 'brands_org_default_idx');
        });

        // Exactly-one-default-per-org enforced at DB level (PostgreSQL partial
        // unique index). Soft-deleted rows excluded so a deleted-then-created
        // brand can claim default again.
        DB::statement('CREATE UNIQUE INDEX brands_org_default_unique ON brands (organization_id) WHERE is_default = true AND deleted_at IS NULL');

        // Backfill: every existing organization gets exactly one default brand
        // mirroring its name and widget_token. Subsequent phases stamp
        // brand_id on dependent tables using this default.
        $now = now();
        foreach (DB::table('organizations')->get() as $org) {
            $widgetToken = $org->widget_token ?: Str::random(32);
            $slug = $org->slug ?: 'default-' . $org->id;

            // Avoid double-backfill if a brand row somehow already exists.
            $exists = DB::table('brands')
                ->where('organization_id', $org->id)
                ->where('is_default', true)
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('brands')->insert([
                'organization_id' => $org->id,
                'name'            => $org->name,
                'slug'            => substr($slug, 0, 100),
                'logo_url'        => $org->logo_url ?? null,
                'widget_token'    => $widgetToken,
                'is_default'      => true,
                'sort_order'      => 0,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);

            // Make sure the org's widget_token mirrors the brand's (they will
            // diverge only if a non-default brand is later created with its
            // own token; the org column always tracks the default brand).
            if ($org->widget_token !== $widgetToken) {
                DB::table('organizations')
                    ->where('id', $org->id)
                    ->update(['widget_token' => $widgetToken]);
            }
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS brands_org_default_unique');
        Schema::dropIfExists('brands');
    }
};
