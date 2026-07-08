<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pool horizon: a pool task (task_date IS NULL AND assigned_to_user_id IS NULL)
 * can carry a target horizon so the new "Pool" management tab can organise
 * unassigned work into "General" / "This week" / "A specific day" buckets.
 *
 * ADDITIVE + fully back-compat:
 *   - NULL pool_horizon == 'general' at the app layer → zero backfill for
 *     legacy pool rows.
 *   - The pool predicate (task_date/assigned_to_user_id/employee_name) is
 *     NEVER touched — these columns are pure metadata.
 *   - pool_due_date is NEVER copied to task_date (that would eject the task
 *     from the pool onto the calendar). The PlannerTask saving() hook clears
 *     both columns the moment a task_date is set.
 *
 * `after()` is intentionally omitted — it is a MySQL-only hint; this app runs
 * Postgres, which appends the columns.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('planner_tasks', function (Blueprint $t) {
            if (!Schema::hasColumn('planner_tasks', 'pool_horizon')) {
                $t->string('pool_horizon', 16)->nullable();
            }
            if (!Schema::hasColumn('planner_tasks', 'pool_due_date')) {
                $t->date('pool_due_date')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('planner_tasks', function (Blueprint $t) {
            foreach (['pool_horizon', 'pool_due_date'] as $c) {
                if (Schema::hasColumn('planner_tasks', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }
};
