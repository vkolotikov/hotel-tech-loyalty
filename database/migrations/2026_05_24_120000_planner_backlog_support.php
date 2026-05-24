<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Planner backlog support: a task with no `task_date` is in the
    // "backlog" — either assigned to a specific employee but not yet
    // scheduled onto a day ("my bucket"), or unassigned and unscheduled
    // ("open pool"). Dragging it onto a day cell from the new sidebar
    // drawer sets task_date; dragging a scheduled task back to the
    // drawer clears it.
    //
    // Partial indexes keep the backlog queries cheap without bloating
    // the full-table index used by Day/Schedule/Month listings.
    public function up(): void
    {
        Schema::table('planner_tasks', function (Blueprint $t) {
            $t->date('task_date')->nullable()->change();
        });

        // Postgres partial index for "open pool" — unassigned + unscheduled.
        \Illuminate\Support\Facades\DB::statement(
            "CREATE INDEX IF NOT EXISTS planner_tasks_pool_idx
             ON planner_tasks (organization_id)
             WHERE task_date IS NULL AND assigned_to_user_id IS NULL"
        );

        // Partial index for "my bucket" lookups (assigned but unscheduled).
        \Illuminate\Support\Facades\DB::statement(
            "CREATE INDEX IF NOT EXISTS planner_tasks_my_bucket_idx
             ON planner_tasks (organization_id, assigned_to_user_id)
             WHERE task_date IS NULL AND assigned_to_user_id IS NOT NULL"
        );
    }

    public function down(): void
    {
        \Illuminate\Support\Facades\DB::statement('DROP INDEX IF EXISTS planner_tasks_pool_idx');
        \Illuminate\Support\Facades\DB::statement('DROP INDEX IF EXISTS planner_tasks_my_bucket_idx');
        // Reverting NOT NULL would require backfilling task_date for every
        // backlog row — not safe automatically. Leave nullable on rollback.
    }
};
