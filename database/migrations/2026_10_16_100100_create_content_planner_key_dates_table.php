<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A brand's own key dates (spec 2026-10-16 §3.1): events (up to 31 days) and notes (one day). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_key_dates')) {
            return;
        }
        Schema::create('content_planner_key_dates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('kind', 10);
            $table->string('title', 120);
            $table->text('details')->nullable();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['planner_profile_id', 'start_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_key_dates');
    }
};
