<?php

namespace Tests\Feature\Crm;

use App\Models\Task;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Task model (CRM v2 Phase 1).
 *
 * Tasks drive the Today bar (Overdue / Due Today / Due Soon)
 * and the standalone Tasks page. A regression in any of the
 * scopes silently breaks the SPA's daily-priority view —
 * agents miss overdue follow-ups, leads go cold.
 *
 * Contract:
 *
 *   isOverdue() = completed_at IS NULL
 *                 AND due_at IS NOT NULL
 *                 AND due_at < now()
 *     - Completed → never overdue (closed work)
 *     - No due_at → never overdue (no deadline set)
 *     - Future due_at → not yet overdue
 *
 *   scopeOpen()      — whereNull(completed_at)
 *   scopeOverdue()   — open + due_at IS NOT NULL + due_at < now
 *   scopeDueToday()  — open + due_at in today [startOfDay, endOfDay]
 *
 *   Casts:
 *     - due_at + completed_at → Carbon
 *     - recurring_rule + custom_data → array
 *
 *   BelongsToOrganization auto-fill + TenantScope isolation.
 */
class TaskModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // Organization::booted hook needs brands.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('tasks')) {
            Schema::create('tasks', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->timestamp('due_at')->nullable();
                $t->unsignedBigInteger('assigned_to')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->text('outcome')->nullable();
                $t->text('recurring_rule')->nullable();
                $t->text('custom_data')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'inquiry_id']);
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

    private function task(array $attrs = []): Task
    {
        return Task::create(array_merge([
            'organization_id' => $this->orgId,
            'title'           => 'Test task',
            'type'            => 'follow_up',
        ], $attrs));
    }

    /* ─── isOverdue() composite predicate ─── */

    public function test_isOverdue_true_when_open_and_due_past(): void
    {
        // CRITICAL: this drives the Today bar's red Overdue
        // section. An agent triaging their morning queue reads
        // this directly — a regression silently empties Overdue
        // and missed follow-ups go uncaught.
        $task = $this->task([
            'due_at'       => now()->subHour(),
            'completed_at' => null,
        ]);

        $this->assertTrue($task->isOverdue(),
            'CRITICAL: open task with past due_at MUST be overdue.');
    }

    public function test_isOverdue_false_when_completed_even_if_due_past(): void
    {
        // Completed work is never overdue — the closed bucket.
        // Pre-fix, a regression that ignored completed_at would
        // surface every closed task in the Overdue red bar.
        $task = $this->task([
            'due_at'       => now()->subDay(),
            'completed_at' => now()->subHour(),
        ]);

        $this->assertFalse($task->isOverdue(),
            'Completed task MUST NOT show as overdue (closed work).');
    }

    public function test_isOverdue_false_when_no_due_at_set(): void
    {
        // Tasks without deadlines (open-ended TODOs) MUST NOT
        // surface as overdue. Pre-fix a regression that treated
        // null due_at as past-due would flood the Overdue list
        // with every undated task.
        $task = $this->task([
            'due_at'       => null,
            'completed_at' => null,
        ]);

        $this->assertFalse($task->isOverdue(),
            'No deadline MUST yield isOverdue=false.');
    }

    public function test_isOverdue_false_when_due_in_future(): void
    {
        $task = $this->task([
            'due_at'       => now()->addDay(),
            'completed_at' => null,
        ]);

        $this->assertFalse($task->isOverdue());
    }

    /* ─── scopeOpen ─── */

    public function test_scopeOpen_returns_only_uncompleted_tasks(): void
    {
        // The Open bucket. Includes both due_at present and null —
        // ALL open work counts.
        $this->task([
            'title'        => 'Open with due_at',
            'due_at'       => now()->addDay(),
            'completed_at' => null,
        ]);
        $this->task([
            'title'        => 'Open without due_at',
            'due_at'       => null,
            'completed_at' => null,
        ]);
        $this->task([
            'title'        => 'Closed',
            'due_at'       => now()->subDay(),
            'completed_at' => now()->subHour(),
        ]);

        $open = Task::open()->get();
        $titles = $open->pluck('title')->sort()->values()->toArray();

        $this->assertSame(
            ['Open with due_at', 'Open without due_at'],
            $titles,
            'scopeOpen MUST include all uncompleted tasks (regardless of due_at).',
        );
    }

    /* ─── scopeOverdue ─── */

    public function test_scopeOverdue_returns_open_tasks_past_due_at(): void
    {
        // Open AND due_at < now AND not null. Anchors the Today
        // bar's red section.
        $overdueA = $this->task(['title' => 'Overdue A', 'due_at' => now()->subDay()]);
        $overdueB = $this->task(['title' => 'Overdue B', 'due_at' => now()->subMinutes(5)]);

        // Not overdue: future, completed, undated.
        $this->task(['title' => 'Future', 'due_at' => now()->addDay()]);
        $this->task(['title' => 'Completed', 'due_at' => now()->subDay(), 'completed_at' => now()]);
        $this->task(['title' => 'Undated']);

        $overdue = Task::overdue()->get();
        $titles = $overdue->pluck('title')->sort()->values()->toArray();

        $this->assertSame(
            ['Overdue A', 'Overdue B'],
            $titles,
            'scopeOverdue MUST include only open + past-due tasks.',
        );
    }

    public function test_scopeOverdue_excludes_tasks_without_due_at(): void
    {
        // CRITICAL invariant: undated open tasks MUST NOT count
        // as overdue. Pre-fix a missing whereNotNull(due_at)
        // would flood the Overdue list.
        $this->task(['title' => 'Undated open', 'due_at' => null]);

        $overdue = Task::overdue()->get();

        $this->assertCount(0, $overdue,
            'Undated tasks MUST NOT surface in scopeOverdue.');
    }

    /* ─── scopeDueToday ─── */

    public function test_scopeDueToday_returns_open_tasks_with_due_at_in_today_window(): void
    {
        // Today's bar — between startOfDay() and endOfDay().
        $todayMorning = $this->task([
            'title'  => 'Today AM',
            'due_at' => now()->startOfDay()->addHours(9),
        ]);
        $todayEvening = $this->task([
            'title'  => 'Today PM',
            'due_at' => now()->endOfDay()->subHours(1),
        ]);

        // Excluded: yesterday, tomorrow, completed.
        $this->task(['title' => 'Yesterday', 'due_at' => now()->subDay()]);
        $this->task(['title' => 'Tomorrow', 'due_at' => now()->addDay()]);
        $this->task([
            'title'        => 'Today completed',
            'due_at'       => now(),
            'completed_at' => now(),
        ]);

        $due = Task::dueToday()->get();
        $titles = $due->pluck('title')->sort()->values()->toArray();

        $this->assertSame(
            ['Today AM', 'Today PM'],
            $titles,
        );
    }

    public function test_scopeDueToday_excludes_completed_even_if_due_today(): void
    {
        // A task due at noon that was completed at 11:30 MUST NOT
        // surface in Due Today — the agent already did it.
        $this->task([
            'title'        => 'Due today, done',
            'due_at'       => now()->setHour(12),
            'completed_at' => now()->setHour(11),
        ]);

        $this->assertCount(0, Task::dueToday()->get());
    }

    /* ─── Casts ─── */

    public function test_due_at_and_completed_at_cast_to_carbon(): void
    {
        // The isOverdue accessor calls $this->due_at->isPast() —
        // needs Carbon, not a raw string.
        $task = $this->task([
            'due_at'       => now()->addHours(2),
            'completed_at' => now()->subMinute(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $task->due_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $task->completed_at);
    }

    public function test_custom_data_round_trips_through_array_cast(): void
    {
        // CRM v2 Phase 7 admin-defined fields ride on this jsonb
        // column. The SPA's per-field editor depends on the cast.
        $payload = [
            'lead_priority' => 'high',
            'next_action'   => 'Send proposal',
            'tags'          => ['VIP', 'corporate'],
        ];

        $task = $this->task(['custom_data' => $payload]);

        $this->assertSame($payload, $task->fresh()->custom_data);
    }

    public function test_recurring_rule_round_trips_through_array_cast(): void
    {
        $rule = ['frequency' => 'weekly', 'day' => 'Monday'];

        $task = $this->task(['recurring_rule' => $rule]);

        $this->assertSame($rule, $task->fresh()->recurring_rule);
    }

    /* ─── BelongsToOrganization auto-fill ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $task = $this->task([]);

        $this->assertSame($this->orgId, (int) $task->organization_id);
    }

    /* ─── TenantScope cross-org isolation ─── */

    public function test_tenant_scope_isolates_org_a_tasks_from_org_b(): void
    {
        // CRITICAL: an agent's Today bar MUST scope to their own
        // tenant. Cross-leak would surface other tenants' work in
        // the daily queue.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('tasks')->insert([
            'organization_id' => $orgA,
            'title'           => 'Org A task',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('tasks')->insert([
            'organization_id' => $orgB,
            'title'           => 'Org B task',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $rowsForA = Task::all();
        $this->assertCount(1, $rowsForA);
        $this->assertSame('Org A task', $rowsForA->first()->title);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $rowsForB = Task::all();
        $this->assertCount(1, $rowsForB);
        $this->assertSame('Org B task', $rowsForB->first()->title);
    }

    /* ─── Relationships ─── */

    public function test_inquiry_relationship_is_belongs_to(): void
    {
        $task = $this->task();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $task->inquiry(),
        );
    }

    public function test_assignee_relationship_is_belongs_to_user(): void
    {
        $task = $this->task();
        $rel = $task->assignee();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        // Locked: assignee FK is `assigned_to`.
        $this->assertSame('assigned_to', $rel->getForeignKeyName());
    }

    public function test_creator_relationship_uses_created_by_foreign_key(): void
    {
        $task = $this->task();
        $rel = $task->creator();

        $this->assertSame('created_by', $rel->getForeignKeyName(),
            'creator relationship MUST FK on created_by (not user_id).');
    }
}
