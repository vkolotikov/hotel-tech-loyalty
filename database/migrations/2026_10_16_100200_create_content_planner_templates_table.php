<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's post templates with [blanks] (spec 2026-10-16 §5): the pillar is kept by name, strategies come and go. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_templates')) {
            return;
        }
        Schema::create('content_planner_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('platform', 20)->nullable();
            $table->string('pillar_name', 255)->nullable();
            $table->string('topic', 255)->nullable();
            $table->string('hook', 500)->nullable();
            $table->text('main_copy')->nullable();
            $table->string('cta', 255)->nullable();
            $table->json('hashtags')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('planner_profile_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_templates');
    }
};
