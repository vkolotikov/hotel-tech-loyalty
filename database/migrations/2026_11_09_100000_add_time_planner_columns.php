<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Time Planner (2026-11-09), every column nullable so every existing row reads as before:
 *
 * - `staff.planner_profile`: what the planner knows about a person beyond the task types they may take
 *   (`planner_skills`, unchanged): their knowledge in their own words, their working hours and days, a daily break.
 *   One writer, App\Services\Time\PlannerProfiles.
 * - `planner_tasks.started_at` / `actual_minutes`: the time a person really spent on a task, from its Start, Pause and
 *   Finish (App\Services\Time\TaskClock). A task nobody timed keeps both NULL and counts by its planned duration, as
 *   the full admin's Stats always did.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('staff') && !Schema::hasColumn('staff', 'planner_profile')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->json('planner_profile')->nullable();
            });
        }

        if (Schema::hasTable('planner_tasks')) {
            Schema::table('planner_tasks', function (Blueprint $table) {
                if (!Schema::hasColumn('planner_tasks', 'started_at')) {
                    $table->timestamp('started_at')->nullable();
                }
                if (!Schema::hasColumn('planner_tasks', 'actual_minutes')) {
                    $table->unsignedInteger('actual_minutes')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('staff', 'planner_profile')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropColumn('planner_profile');
            });
        }
        foreach (['started_at', 'actual_minutes'] as $column) {
            if (Schema::hasColumn('planner_tasks', $column)) {
                Schema::table('planner_tasks', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }
};
