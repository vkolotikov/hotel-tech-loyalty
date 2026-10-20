<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §3, §6.1): the brand's website as Content reads it — its address, its scan (a
 * token per scan, so a late job cannot write over a newer one) and the company summary every AI call reads.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_sites')) {
            return;
        }
        Schema::create('content_sites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('url', 2000)->nullable();
            $table->string('status', 12)->default('new');
            $table->string('error', 40)->nullable();
            $table->string('scan_token', 36)->nullable();
            $table->timestamp('scan_queued_at')->nullable();
            $table->timestamp('scan_started_at')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->unsignedInteger('articles_count')->default(0);
            $table->unsignedInteger('pages_count')->default(0);
            $table->text('summary')->nullable();
            $table->timestamp('summary_updated_at')->nullable();
            $table->boolean('summary_edited')->default(false);
            $table->string('summary_note', 40)->nullable();
            $table->timestamps();
            $table->unique('planner_profile_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_sites');
    }
};
