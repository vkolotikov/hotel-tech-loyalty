<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A brand's link-in-bio page (spec 2026-10-19 §6, §7.1): one per Content profile, at `/links/{slug}` on the public
 * host, off until a manager switches it on. The slug is unique among bio pages (its own namespace, not landing pages').
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_bio_pages')) {
            return;
        }
        Schema::create('content_bio_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('slug', 63)->unique();
            $table->boolean('is_on')->default(false);
            $table->string('title', 60)->nullable();
            $table->string('line', 160)->nullable();
            $table->boolean('show_posts')->default(true);
            $table->timestamps();
            $table->unique('planner_profile_id');
            $table->index('brand_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_bio_pages');
    }
};
