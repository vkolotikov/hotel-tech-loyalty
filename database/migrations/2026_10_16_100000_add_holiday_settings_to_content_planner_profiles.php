<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A brand's holiday country and its marketing-days switch (spec 2026-10-16 §3.3): `holiday_country` null = never
 * chosen (guessed), one of the nine codes, or `none`; marketing and industry days show while `marketing_days` is on.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_profiles', 'holiday_country')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->string('holiday_country', 4)->nullable();
            });
        }
        if (!Schema::hasColumn('content_planner_profiles', 'marketing_days')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->boolean('marketing_days')->default(true);
            });
        }
    }

    public function down(): void
    {
        foreach (['holiday_country', 'marketing_days'] as $column) {
            if (Schema::hasColumn('content_planner_profiles', $column)) {
                Schema::table('content_planner_profiles', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
