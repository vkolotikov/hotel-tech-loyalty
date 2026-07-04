<?php

namespace Tests\Feature\Planner;

use App\Models\PlannerTask;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the PlannerTask model contract — the daily Planner row
 * driving /planner (day / schedule / month / team / stats views).
 *
 * Why this matters:
 *
 *   The Planner v2 + v2.1 + v3 + backlog rebuild made PlannerTask
 *   the load-bearing row for an entire workspace surface. The
 *   2026-05-24 backlog ship dropped NOT NULL on task_date so a
 *   row with task_date=NULL means "in backlog" (Mine bucket if
 *   assigned_to_user_id is set; Open pool if not). A regression
 *   in the date cast or the nullable invariant breaks the entire
 *   backlog workflow.
 *
 *   employee_name + assigned_to_user_id coexist by design —
 *   employee_name handles legacy / non-staff names (a contractor
 *   the admin types in); assigned_to_user_id is the real Staff FK.
 *   Old rows have ONLY employee_name; new rows have both. Lock
 *   that both fields persist independently.
 *
 *   recurring_parent_id is the self-FK that lets "edit all
 *   future" / "delete whole series" find siblings (Planner v2
 *   ship). Without the self-relationship, series-aware mutations
 *   touch only one row.
 *
 * Contract:
 *
 *   - task_date date cast → Carbon (nullable for backlog rows,
 *     locked in 2026-05-24 ship)
 *   - completed boolean cast
 *   - recurring_until date cast → Carbon
 *   - subtasks HasMany via FK='task_id' (NOT 'planner_task_id')
 *   - employee_name + assigned_to_user_id coexist independently
 *   - task_date=NULL persists (backlog row)
 *   - recurring_parent_id self-FK persists (series sibling lookup)
 *   - status + priority canonical values persist intact
 *   - BelongsToOrganization + TenantScope isolation
 */
class PlannerTaskModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('planner_tasks')) {
            Schema::create('planner_tasks', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('employee_name')->nullable();
                $t->unsignedBigInteger('assigned_to_user_id')->nullable();
                $t->string('title');
                // CRITICAL: task_date is NULLABLE since the
                // 2026-05-24 backlog ship.
                $t->date('task_date')->nullable();
                $t->time('start_time')->nullable();
                $t->time('end_time')->nullable();
                $t->string('status', 32)->default('todo');
                $t->string('priority', 16)->default('normal');
                $t->string('task_group')->nullable();
                $t->string('task_category')->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->boolean('completed')->default(false);
                $t->text('description')->nullable();
                // Planner v2 recurring support.
                $t->string('recurring', 32)->nullable();
                $t->date('recurring_until')->nullable();
                $t->unsignedBigInteger('recurring_parent_id')->nullable();
                // Pool horizon (2026-07): metadata on an unscheduled pool
                // task. The PlannerTask saving() hook writes these on every
                // create (clears them when task_date is set), so the test
                // schema must carry them or the INSERT fails.
                $t->string('pool_horizon', 16)->nullable();
                $t->date('pool_due_date')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'task_date']);
                // Partial indexes from 2026-05-24:
                //   planner_tasks_pool_idx (assigned_to NULL + task_date NULL)
                //   planner_tasks_my_bucket_idx (assigned_to set + task_date NULL)
                // Not needed in sqlite test env.
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function task(array $attrs = []): PlannerTask
    {
        return PlannerTask::create(array_merge([
            'organization_id' => $this->orgId,
            'title'           => 'Test planner task',
            'task_date'       => '2026-06-15',
            'status'          => 'todo',
            'priority'        => 'normal',
        ], $attrs));
    }

    /* ─── task_date date cast (nullable for backlog) ─── */

    public function test_task_date_casts_to_carbon(): void
    {
        // Carbon needed for the day/schedule/month view sorts
        // + diffForHumans rendering on the Day pill.
        $task = $this->task(['task_date' => '2026-06-15']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $task->task_date);
        $this->assertSame('2026-06-15', $task->task_date->toDateString());
    }

    public function test_task_date_can_be_null_for_backlog_rows(): void
    {
        // CRITICAL: the 2026-05-24 ship dropped NOT NULL on
        // task_date so a row with task_date=NULL means "in
        // backlog". A regression that re-applies NOT NULL
        // would break the entire backlog workflow.
        $backlog = $this->task(['task_date' => null]);

        $this->assertNull($backlog->task_date,
            'task_date MUST be nullable to support backlog rows.');
        $this->assertNotNull($backlog->id,
            'Backlog row MUST persist (NOT NULL constraint must NOT exist on task_date).');
    }

    /* ─── completed boolean cast ─── */

    public function test_completed_casts_to_boolean(): void
    {
        $done = $this->task(['completed' => true]);
        $open = $this->task(['completed' => false]);

        $this->assertTrue($done->completed);
        $this->assertFalse($open->completed);
        $this->assertIsBool($done->completed);
    }

    public function test_completed_default_is_false(): void
    {
        $task = PlannerTask::create([
            'organization_id' => $this->orgId,
            'title'           => 'Default-state task',
            'task_date'       => '2026-06-15',
        ]);

        $this->assertFalse($task->fresh()->completed,
            'New tasks MUST default to completed=false (open).');
    }

    /* ─── recurring_until date cast ─── */

    public function test_recurring_until_casts_to_carbon(): void
    {
        // Recurring series expansion stops at recurring_until.
        // The 90-instance cap from PlannerController uses this
        // for boundary math.
        $task = $this->task([
            'recurring'       => 'weekly',
            'recurring_until' => '2026-12-31',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $task->recurring_until);
        $this->assertSame('2026-12-31', $task->recurring_until->toDateString());
    }

    public function test_null_recurring_until_persists_as_null(): void
    {
        // Non-recurring tasks have null recurring_until. Lock
        // so the cast doesn't surface a default date.
        $task = $this->task(['recurring' => null, 'recurring_until' => null]);

        $this->assertNull($task->fresh()->recurring_until);
    }

    /* ─── subtasks HasMany FK lock ─── */

    public function test_subtasks_relationship_uses_task_id_foreign_key(): void
    {
        // CRITICAL: FK is 'task_id' (NOT the conventional
        // 'planner_task_id'). A refactor that "harmonises" the
        // name breaks every subtask query.
        $task = $this->task();
        $rel = $task->subtasks();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('task_id', $rel->getForeignKeyName(),
            'subtasks FK MUST be task_id (NOT planner_task_id).');
    }

    /* ─── employee_name + assigned_to_user_id coexist ─── */

    public function test_employee_name_alone_persists_for_legacy_rows(): void
    {
        // Old rows + non-staff names (a freelance contractor
        // typed in by admin) have ONLY employee_name. Lock so
        // a refactor that nukes employee_name in favor of the
        // FK breaks legacy data.
        $task = $this->task([
            'employee_name'       => 'Bob the Contractor',
            'assigned_to_user_id' => null,
        ]);

        $fresh = $task->fresh();
        $this->assertSame('Bob the Contractor', $fresh->employee_name);
        $this->assertNull($fresh->assigned_to_user_id);
    }

    public function test_assigned_to_user_id_alone_persists(): void
    {
        // New rows (Planner v2+) can have ONLY the FK set —
        // employee_name resolved at render time via the user
        // lookup.
        $task = $this->task([
            'employee_name'       => null,
            'assigned_to_user_id' => 42,
        ]);

        $fresh = $task->fresh();
        $this->assertNull($fresh->employee_name);
        $this->assertSame(42, (int) $fresh->assigned_to_user_id);
    }

    public function test_both_fields_coexist_independently(): void
    {
        // CRITICAL: Planner v2 ships both fields; the FK is
        // canonical, employee_name is the denormalised display
        // string. Lock that BOTH persist independently — the
        // SPA reads employee_name as a fallback when the user
        // lookup fails (deactivated staff).
        $task = $this->task([
            'employee_name'       => 'Alice Doe',
            'assigned_to_user_id' => 99,
        ]);

        $fresh = $task->fresh();
        $this->assertSame('Alice Doe', $fresh->employee_name);
        $this->assertSame(99, (int) $fresh->assigned_to_user_id);
    }

    /* ─── recurring_parent_id self-FK ─── */

    public function test_recurring_parent_id_persists_as_self_fk(): void
    {
        // CRITICAL: the self-FK that lets "edit all future" /
        // "delete whole series" find siblings. Planner v2 ship.
        // Without this, series-aware mutations touch only one
        // row.
        $parent = $this->task(['recurring' => 'weekly']);
        $sibling = $this->task([
            'task_date'           => '2026-06-22',
            'recurring_parent_id' => $parent->id,
        ]);

        $this->assertSame($parent->id, (int) $sibling->fresh()->recurring_parent_id,
            'recurring_parent_id MUST persist (drives series-aware mutations).');
    }

    /* ─── status + priority canonical values ─── */

    public function test_canonical_status_values_persist_intact(): void
    {
        // Lock the 4 documented states. SPA filter tabs +
        // chip icons branch on these exact strings.
        foreach (['todo', 'in_progress', 'done', 'blocked'] as $status) {
            $task = $this->task(['title' => "T-{$status}", 'status' => $status]);
            $this->assertSame($status, $task->fresh()->status);
        }
    }

    public function test_canonical_priority_values_persist_intact(): void
    {
        // Lock the 3 documented priorities. Day timeline +
        // chip red-flag badge branch on these strings.
        foreach (['low', 'normal', 'high'] as $priority) {
            $task = $this->task(['title' => "P-{$priority}", 'priority' => $priority]);
            $this->assertSame($priority, $task->fresh()->priority);
        }
    }

    /* ─── duration_minutes persists ─── */

    public function test_duration_minutes_persists_for_timeline_height(): void
    {
        // Day timeline computes chip pixel height from
        // duration_minutes. Lock so the column persists as
        // int (the 30 / 60 / 90 / 120 quick chips in
        // TaskDrawer).
        $task = $this->task(['duration_minutes' => 90]);

        $this->assertSame(90, (int) $task->fresh()->duration_minutes);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $task = $this->task();

        $this->assertSame($this->orgId, (int) $task->organization_id);
    }

    public function test_tenant_scope_isolates_planner_tasks_cross_org(): void
    {
        // CRITICAL: planner tasks expose staff schedule + day
        // structure. Cross-leak would expose competitor's
        // operational workflow + employee names.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->task(['title' => 'Org A task']);
        \DB::table('planner_tasks')->insert([
            'organization_id' => $orgB,
            'title'           => 'Org B task',
            'task_date'       => '2026-06-15',
            'status'          => 'todo',
            'priority'        => 'normal',
            'completed'       => false,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = PlannerTask::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A task', $aRows->first()->title);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = PlannerTask::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B task', $bRows->first()->title);
    }
}
