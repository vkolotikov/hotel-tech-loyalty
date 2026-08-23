<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pages a tenant publishes at sites.hexa-tech.uk/{slug}.
 *
 * Only bespoke copy lives here. Services, staff, reviews, hours and contact
 * details are queried live from the tables that already hold them, so a price
 * change is correct on the website immediately and nothing has to be kept in
 * step by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('landing_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();

            // Globally unique, not per-tenant: /{slug} is one shared namespace
            // across every tenant, so two salons cannot both own "glamour".
            $table->string('slug', 63)->unique();

            $table->string('template_key', 40);

            // Snapshot at creation rather than a live read of the org, so
            // switching industry later cannot silently re-word a live page.
            $table->string('industry', 32);

            $table->string('status', 16)->default('draft')->index();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('first_published_at')->nullable();

            $table->json('theme')->nullable();
            $table->json('content')->nullable();
            $table->json('seo')->nullable();

            $table->timestamps();

            // One page per brand. A multi-brand tenant gets one each, which is
            // the natural unit; a second page per brand has no meaning yet.
            $table->unique(['organization_id', 'brand_id'], 'landing_pages_org_brand_unique');

            // Standalone index: the compound unique above is keyed on
            // (organization_id, brand_id), so by the leftmost-prefix rule it
            // cannot serve a lookup on brand_id alone. Postgres needs exactly
            // that lookup for nullOnDelete() above -- deleting a Brand finds
            // every landing_pages row referencing it to null the column, and
            // without this index that is a sequential scan.
            $table->index('brand_id');
        });

        Schema::create('landing_page_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('landing_page_id')->constrained('landing_pages')->cascadeOnDelete();
            $table->string('key', 32);
            $table->boolean('enabled')->default(true);

            // Stored rather than read from the template manifest, so revising a
            // template cannot reorder someone's already-published page.
            $table->integer('sort')->default(0);

            $table->json('content')->nullable();
            $table->timestamps();

            $table->unique(['landing_page_id', 'key']);
        });

        Schema::create('landing_page_redirects', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 63)->unique();
            $table->foreignId('landing_page_id')->constrained('landing_pages')->cascadeOnDelete();
            $table->timestamp('expires_at')->index();
            $table->timestamps();

            $table->index('landing_page_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landing_page_redirects');
        Schema::dropIfExists('landing_page_sections');
        Schema::dropIfExists('landing_pages');
    }
};
