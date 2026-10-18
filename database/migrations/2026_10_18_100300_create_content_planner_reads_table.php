<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** When a person last opened a brand's "For you" list (spec 2026-10-16 §8): one row per person and brand profile. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_reads')) {
            return;
        }
        Schema::create('content_planner_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->timestamp('seen_at');
            $table->unique(['user_id', 'planner_profile_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_reads');
    }
};
