<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's saved hashtag groups and text snippets (spec 2026-10-15 §6). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_snippets')) {
            return;
        }
        Schema::create('content_planner_snippets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('kind', 20);
            $table->string('name', 60);
            $table->text('body');
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->index(['planner_profile_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_snippets');
    }
};
