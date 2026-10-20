<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §3.4, §6.1): the articles and pages a scan found. One row per address (its sha-256,
 * because a 2,000-character address cannot be a unique index everywhere); `picture_url` is the page's picture copied
 * into Content's media store (`picture_source` the address it was copied from).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_site_pages')) {
            return;
        }
        Schema::create('content_site_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('site_id')->constrained('content_sites')->cascadeOnDelete();
            $table->string('url', 2000);
            $table->char('url_hash', 64);
            $table->string('kind', 8);
            $table->string('title', 300);
            $table->string('description', 1000)->nullable();
            $table->string('image_url', 2000)->nullable();
            $table->string('picture_url', 2000)->nullable();
            $table->string('picture_source', 2000)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('language', 12)->nullable();
            $table->text('body')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->unique(['site_id', 'url_hash']);
            $table->index(['site_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_site_pages');
    }
};
