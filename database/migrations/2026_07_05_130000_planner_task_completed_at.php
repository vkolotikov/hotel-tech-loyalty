<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `planner_tasks.completed_at` — the moment a task transitioned to done.
 *
 * Powers the Stats tab's on-time-vs-late completion analytics: a task
 * scheduled for a `task_date` is "on time" when it was completed on or
 * before that day, "late" when after. Stamped by the PlannerTask
 * saving() hook on every write path (toggle / quick-status / bulk /
 * update / create), cleared when a task leaves the done state.
 *
 * Additive + back-compat: legacy done rows keep completed_at = NULL and
 * are reported as "untracked" (never mis-attributed as on-time/late).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('planner_tasks', function (Blueprint $t) {
            if (!Schema::hasColumn('planner_tasks', 'completed_at')) {
                $t->timestamp('completed_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('planner_tasks', function (Blueprint $t) {
            if (Schema::hasColumn('planner_tasks', 'completed_at')) {
                $t->dropColumn('completed_at');
            }
        });
    }
};
