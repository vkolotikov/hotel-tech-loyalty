<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §4.5, §6.1): one row per page of a promotion; the rows of one press share `batch`.
 * `slots` holds the page's planned days and channels; a job writes one row's posts and queues the next row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_promotions')) {
            return;
        }
        Schema::create('content_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->foreignId('site_page_id')->nullable()->constrained('content_site_pages')->nullOnDelete();
            $table->string('batch', 36)->index();
            $table->string('status', 10);
            $table->string('error', 40)->nullable();
            $table->unsignedSmallInteger('posts_wanted');
            $table->unsignedSmallInteger('posts_made')->default(0);
            $table->json('slots');
            $table->text('instructions')->nullable();
            $table->boolean('use_picture')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['planner_profile_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_promotions');
    }
};
