<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Planner backlog pool skill filter: a staff member only sees +
    // can claim pool tasks whose `task_group` is in their allowed list.
    // NULL = "can claim anything" (default — preserves existing behaviour
    // for orgs that don't care to scope by skill). Empty array = "can't
    // claim anything from the pool" (useful for read-only staff like
    // visiting auditors).
    //
    // Stored on `staff` rather than `users` because the same person can
    // be staff at different orgs with different skill sets, and the
    // staff row already carries the per-tenant ops permissions
    // (can_award_points, allowed_nav_groups, etc).
    public function up(): void
    {
        Schema::table('staff', function (Blueprint $t) {
            $t->jsonb('planner_skills')->nullable()->after('allowed_nav_groups');
        });
    }

    public function down(): void
    {
        Schema::table('staff', function (Blueprint $t) {
            $t->dropColumn('planner_skills');
        });
    }
};
