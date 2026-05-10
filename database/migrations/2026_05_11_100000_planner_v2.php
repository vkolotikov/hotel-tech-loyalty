<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Planner v2 — server-side templates + native recurring tasks.
 *
 * Three pieces:
 *   1. New planner_templates table — replaces the per-browser localStorage
 *      template library so templates sync across the whole org.
 *   2. recurring + recurring_until + recurring_parent_id columns on
 *      planner_tasks — turns on real recurring support (the form had
 *      a "Repeat" dropdown but no DB backing).
 *   3. assigned_to_user_id FK on planner_tasks — opens the door to a
 *      proper user picker instead of free-text employee_name. Existing
 *      tasks keep their employee_name string; new ones can use either.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('planner_templates')) {
            Schema::create('planner_templates', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();

                /**
                 * Display name in the picker. Distinct from `title` so
                 * "Morning briefing" template can produce a task titled
                 * "Front-desk morning briefing".
                 */
                $t->string('name', 120);

                /** Pre-filled task fields when the template is applied. */
                $t->string('title', 200);
                $t->string('task_group', 80)->nullable();
                $t->string('task_category', 120)->nullable();
                $t->string('priority', 10)->default('Medium');
                $t->unsignedSmallInteger('duration_minutes')->nullable();
                $t->text('description')->nullable();

                /**
                 * Visual category in the templates list (e.g. "Front
                 * Office", "Housekeeping"). Pure UX grouping — does not
                 * filter or scope anything.
                 */
                $t->string('category', 80)->default('General');

                $t->unsignedSmallInteger('sort_order')->default(0);
                $t->timestamps();

                $t->index(['organization_id', 'category', 'sort_order'], 'planner_templates_listing_idx');
            });
        }

        if (Schema::hasTable('planner_tasks')) {
            Schema::table('planner_tasks', function (Blueprint $t) {
                if (!Schema::hasColumn('planner_tasks', 'recurring')) {
                    /** none | daily | weekly | monthly */
                    $t->string('recurring', 16)->nullable()->after('description');
                }
                if (!Schema::hasColumn('planner_tasks', 'recurring_until')) {
                    /** When the series stops generating. NULL = open-ended (we still cap generation at 90 days). */
                    $t->date('recurring_until')->nullable()->after('recurring');
                }
                if (!Schema::hasColumn('planner_tasks', 'recurring_parent_id')) {
                    /**
                     * For child tasks generated from a recurring parent:
                     * points back at the parent so "Edit all future"
                     * can find siblings. NULL on standalone tasks.
                     */
                    $t->foreignId('recurring_parent_id')->nullable()->index();
                }
                if (!Schema::hasColumn('planner_tasks', 'assigned_to_user_id')) {
                    /**
                     * Optional FK to a real staff user. Coexists with
                     * `employee_name` (free text) — we keep the string
                     * for legacy rows and for non-staff names like
                     * "External cleaner".
                     */
                    $t->foreignId('assigned_to_user_id')->nullable()->index();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('planner_tasks')) {
            Schema::table('planner_tasks', function (Blueprint $t) {
                if (Schema::hasColumn('planner_tasks', 'assigned_to_user_id')) $t->dropColumn('assigned_to_user_id');
                if (Schema::hasColumn('planner_tasks', 'recurring_parent_id')) $t->dropColumn('recurring_parent_id');
                if (Schema::hasColumn('planner_tasks', 'recurring_until'))     $t->dropColumn('recurring_until');
                if (Schema::hasColumn('planner_tasks', 'recurring'))           $t->dropColumn('recurring');
            });
        }
        Schema::dropIfExists('planner_templates');
    }
};
