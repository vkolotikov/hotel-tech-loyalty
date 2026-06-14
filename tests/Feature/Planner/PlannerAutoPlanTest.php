<?php

namespace Tests\Feature\Planner;

use App\Http\Controllers\Api\V1\Admin\PlannerController;
use App\Models\PlannerTask;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the deterministic priority-fit algorithm in
 * PlannerController::autoPlanDay (May 21 2026 ship).
 *
 * Customer-facing contract: an admin clicks "Auto-plan" on the
 * Day view; we propose start times for every unscheduled task
 * that fits today's working window. Preview only — the
 * /auto-plan/apply endpoint commits.
 *
 * Algorithm invariants:
 *
 *   - SORTED by (priority desc → High/Normal/Low), then
 *     created_at asc for stability
 *
 *   - Cursor advances through the work window [start, end),
 *     skipping busy ranges from already-scheduled tasks
 *
 *   - Each scheduled proposal is added to busy so subsequent
 *     fits respect it (cascading scheduling within one call)
 *
 *   - Tasks that don't fit before work_end land in `skipped`
 *     with a documented `reason` field
 *
 *   - Minimum slot duration: 15 min (hard floor on the fitter
 *     so it can't propose absurd zero-length slots even if the
 *     task carries duration_minutes < 15)
 *
 *   - Default duration when null: 30 min (for fitting; doesn't
 *     touch the persisted value)
 *
 *   - PURE READ — nothing mutates. The response is a proposal
 *     the SPA renders in a preview modal; apply happens later.
 *
 *   - Same input → same output (the SHIPped guarantee that lets
 *     an LLM-based variant drop in without changing the API
 *     shape).
 *
 * The /apply commit path is tested separately (downstream — the
 * algorithm output is the contract this file locks).
 */
class PlannerAutoPlanTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private PlannerController $controller;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // planner_tasks table — model is bigger than our test surface;
        // create only the columns autoPlanDay reads/writes.
        if (!Schema::hasTable('planner_tasks')) {
            Schema::create('planner_tasks', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('title');
                // task_date as string (not date) to sidestep SQLite's
                // tendency to append '00:00:00' through Eloquent's
                // 'date' cast — production is Postgres where the
                // date type is native and the controller's literal
                // string comparison ('2026-07-01' = '2026-07-01')
                // matches without coercion. The cast on the model
                // still wraps reads as Carbon.
                $t->string('task_date', 10)->nullable();
                $t->string('employee_name')->nullable();
                $t->string('start_time', 8)->nullable();
                $t->string('end_time', 8)->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->string('priority', 16)->default('Normal');
                $t->string('task_group')->nullable();
                $t->string('task_category')->nullable();
                $t->string('status', 16)->default('todo');
                $t->boolean('completed')->default(false);
                $t->timestamps();
                $t->index(['organization_id', 'task_date']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->controller = new PlannerController();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Build a PlannerTask row via raw DB::table insert so the
     *  model's 'date' cast doesn't append 00:00:00 (SQLite has no
     *  native date type — production is Postgres where the cast is
     *  a no-op). Returns the inserted PlannerTask. */
    private function task(array $attrs): PlannerTask
    {
        $defaults = [
            'organization_id'   => $this->orgId,
            'title'             => 'Task ' . uniqid(),
            'task_date'         => '2026-07-01',
            'priority'          => 'Normal',
            'duration_minutes'  => 60,
            'completed'         => false,
            'created_at'        => now(),
            'updated_at'        => now(),
        ];
        $row = array_merge($defaults, $attrs);
        $id = \DB::table('planner_tasks')->insertGetId($row);
        return PlannerTask::withoutGlobalScopes()->find($id);
    }

    /** Invoke autoPlanDay with the given payload and decode the JSON. */
    private function plan(array $payload = []): array
    {
        $payload = array_merge(['date' => '2026-07-01'], $payload);
        $request = Request::create('/planner/auto-plan', 'POST', $payload);
        $resp = $this->controller->autoPlanDay($request);
        return json_decode($resp->getContent(), true);
    }

    /* ─── Basic fit ─── */

    public function test_empty_day_returns_empty_proposals(): void
    {
        // No tasks → no proposals + no skipped. Defensive — must
        // not crash + must return the documented shape.
        $result = $this->plan();

        $this->assertSame([], $result['proposals']);
        $this->assertSame([], $result['skipped']);
        $this->assertArrayHasKey('work', $result);
    }

    public function test_single_unscheduled_task_fits_at_work_start(): void
    {
        // Default work window 09:00 → 18:00. A single 60-min task
        // lands at 09:00.
        $this->task(['title' => 'Solo task', 'duration_minutes' => 60]);

        $result = $this->plan();

        $this->assertCount(1, $result['proposals']);
        $this->assertSame('09:00', $result['proposals'][0]['start_time']);
        $this->assertSame(60, $result['proposals'][0]['duration_minutes']);
        $this->assertCount(0, $result['skipped']);
    }

    public function test_multiple_tasks_chain_back_to_back(): void
    {
        // Two 60-min tasks fill 09:00-10:00 and 10:00-11:00.
        // Cascading scheduling: the first proposal added to busy
        // shifts the second to 10:00.
        $this->task(['title' => 'First',  'duration_minutes' => 60, 'priority' => 'Normal']);
        $this->task(['title' => 'Second', 'duration_minutes' => 60, 'priority' => 'Normal']);

        $result = $this->plan();

        $this->assertCount(2, $result['proposals']);
        $this->assertSame('09:00', $result['proposals'][0]['start_time']);
        $this->assertSame('10:00', $result['proposals'][1]['start_time']);
    }

    /* ─── Priority ordering ─── */

    public function test_high_priority_tasks_scheduled_before_normal(): void
    {
        // CRITICAL: priority IS the algorithm's main signal. A
        // High task created AFTER a Normal task still wins the
        // earlier slot. Pre-fix the sort was created_at-only.
        $normal = $this->task(['title' => 'NormalFirst', 'priority' => 'Normal']);
        $high   = $this->task(['title' => 'HighLater',   'priority' => 'High']);

        $result = $this->plan();

        $this->assertSame($high->id, $result['proposals'][0]['task_id'],
            'High priority MUST fit first regardless of created_at.');
        $this->assertSame($normal->id, $result['proposals'][1]['task_id']);
    }

    public function test_priority_full_order_high_normal_low(): void
    {
        // 3-priority sweep — High first, then Normal, then Low.
        $low    = $this->task(['title' => 'L', 'priority' => 'Low']);
        $normal = $this->task(['title' => 'N', 'priority' => 'Normal']);
        $high   = $this->task(['title' => 'H', 'priority' => 'High']);

        $result = $this->plan();

        $ids = array_column($result['proposals'], 'task_id');
        $this->assertSame([$high->id, $normal->id, $low->id], $ids,
            'Priority order MUST be High → Normal → Low.');
    }

    public function test_ties_break_by_created_at_ascending(): void
    {
        // Two tasks at the SAME priority: older one fits first
        // (stable sort by created_at).
        $earlier = $this->task(['title' => 'Earlier']);
        // Force a created_at gap to produce a deterministic order.
        $earlier->created_at = now()->subMinute();
        $earlier->save();
        $later = $this->task(['title' => 'Later']);

        $result = $this->plan();

        $this->assertSame($earlier->id, $result['proposals'][0]['task_id']);
        $this->assertSame($later->id,   $result['proposals'][1]['task_id']);
    }

    /* ─── Busy-range skipping ─── */

    public function test_already_scheduled_task_blocks_overlapping_slot(): void
    {
        // A scheduled task at 09:00-10:00 forces an unscheduled
        // task to land at 10:00 (or later if it doesn't fit).
        $this->task([
            'title'      => 'Already scheduled',
            'start_time' => '09:00:00',
            'duration_minutes' => 60,
        ]);
        $this->task(['title' => 'Needs scheduling', 'duration_minutes' => 60]);

        $result = $this->plan();

        $this->assertCount(1, $result['proposals'],
            'Only the unscheduled task gets a proposal.');
        $this->assertSame('10:00', $result['proposals'][0]['start_time']);
    }

    public function test_multiple_busy_ranges_walked_in_one_pass(): void
    {
        // Busy 09:00-10:00 AND 10:30-11:30 → 60-min unscheduled
        // can fit either at 10:00-11:00 (NO, 10:30 blocks at 10:00+30)
        // OR 11:30-12:30. Algorithm advances past both → 11:30.
        $this->task(['title' => 'B1', 'start_time' => '09:00:00', 'duration_minutes' => 60]);
        $this->task(['title' => 'B2', 'start_time' => '10:30:00', 'duration_minutes' => 60]);
        $this->task(['title' => 'NeedsFit', 'duration_minutes' => 60]);

        $result = $this->plan();

        $this->assertCount(1, $result['proposals']);
        $this->assertSame('11:30', $result['proposals'][0]['start_time'],
            'Cursor MUST advance through multiple busy ranges to find the next free slot.');
    }

    /* ─── Skipped — no room left in work window ─── */

    public function test_task_too_long_for_window_lands_in_skipped(): void
    {
        // Work window default 09:00-18:00 = 9h. A 10h task
        // can't fit → skipped with a documented reason.
        $task = $this->task([
            'title' => 'Massive task',
            'duration_minutes' => 600,
        ]);

        $result = $this->plan();

        $this->assertCount(0, $result['proposals']);
        $this->assertCount(1, $result['skipped']);
        $this->assertSame($task->id, $result['skipped'][0]['task_id']);
        $this->assertStringContainsString('working hours',
            $result['skipped'][0]['reason']);
    }

    public function test_chain_overflow_skips_only_overflowing_tasks(): void
    {
        // Three 4h tasks. First two fit (09:00-13:00, 13:00-17:00).
        // Third (17:00-21:00) overflows 18:00 → skipped.
        $a = $this->task(['title' => 'A', 'duration_minutes' => 240, 'priority' => 'High']);
        $b = $this->task(['title' => 'B', 'duration_minutes' => 240, 'priority' => 'High']);
        $c = $this->task(['title' => 'C', 'duration_minutes' => 240, 'priority' => 'High']);
        // Force created_at order so the High-priority tie-break
        // is deterministic.
        $a->created_at = now()->subMinutes(3); $a->save();
        $b->created_at = now()->subMinutes(2); $b->save();
        $c->created_at = now()->subMinutes(1); $c->save();

        $result = $this->plan();

        $this->assertCount(2, $result['proposals'],
            'Two 4h tasks fit in 9h window (09:00-13:00 + 13:00-17:00).');
        $this->assertCount(1, $result['skipped']);
        $this->assertSame($c->id, $result['skipped'][0]['task_id'],
            'Third task overflows 18:00 — only it lands in skipped.');
    }

    /* ─── Defaults / edge cases ─── */

    public function test_null_duration_defaults_to_30_min_for_fitting(): void
    {
        // duration_minutes IS NULL → algorithm defaults to 30 min
        // when slotting. Verified by checking the proposal's
        // returned duration_minutes value.
        $this->task(['title' => 'No duration', 'duration_minutes' => null]);

        $result = $this->plan();

        $this->assertSame(30, $result['proposals'][0]['duration_minutes']);
    }

    public function test_sub_15_min_duration_floored_to_15(): void
    {
        // Tasks with duration < 15min are floored to 15. Guards
        // against absurd zero-length slots while the persisted
        // task value stays as-is.
        $this->task(['title' => 'Tiny', 'duration_minutes' => 5]);

        $result = $this->plan();

        $this->assertSame(15, $result['proposals'][0]['duration_minutes'],
            'Algorithm MUST floor duration at 15 min for slotting (cosmetic minimum).');
    }

    public function test_custom_work_window_payload_overrides_default(): void
    {
        // Explicit work_start/work_end in the request payload wins
        // over the org's profile + the 09:00/18:00 hardcoded
        // fallback.
        $this->task(['title' => 'A', 'duration_minutes' => 60]);
        $this->task(['title' => 'B', 'duration_minutes' => 60]);

        $result = $this->plan([
            'work_start' => '07:00',
            'work_end'   => '12:00',
        ]);

        $this->assertSame('07:00', $result['work']['start']);
        $this->assertSame('12:00', $result['work']['end']);
        $this->assertSame('07:00', $result['proposals'][0]['start_time']);
        $this->assertSame('08:00', $result['proposals'][1]['start_time']);
    }

    public function test_employee_filter_only_plans_that_employees_tasks(): void
    {
        // employee_name filter scopes auto-plan to one person. Two
        // staff members' tasks must NOT cross-schedule.
        $alice = $this->task(['title' => 'Alice-1', 'employee_name' => 'Alice']);
        $bob   = $this->task(['title' => 'Bob-1',   'employee_name' => 'Bob']);

        $result = $this->plan(['employee_name' => 'Alice']);

        $this->assertCount(1, $result['proposals']);
        $this->assertSame($alice->id, $result['proposals'][0]['task_id'],
            'employee_name filter MUST scope to one staff member.');
    }

    public function test_completed_tasks_are_excluded(): void
    {
        // Already-done tasks don't get re-scheduled. The algorithm
        // only fits open work.
        $this->task(['title' => 'Done', 'completed' => true]);

        $result = $this->plan();

        $this->assertCount(0, $result['proposals'],
            'Completed tasks MUST be excluded from auto-plan.');
    }

    /* ─── Determinism (the ship's load-bearing guarantee) ─── */

    public function test_same_input_produces_same_output(): void
    {
        // The May 21 ship's docblock states: "Deterministic by
        // design so the same input always produces the same plan".
        // This is what lets an LLM variant drop in later without
        // changing the API. Lock the invariant by running twice.
        $this->task(['title' => 'X', 'priority' => 'High',   'duration_minutes' => 30]);
        $this->task(['title' => 'Y', 'priority' => 'Normal', 'duration_minutes' => 45]);
        $this->task(['title' => 'Z', 'priority' => 'Low',    'duration_minutes' => 60]);

        $r1 = $this->plan();
        $r2 = $this->plan();

        $this->assertSame(
            array_column($r1['proposals'], 'start_time'),
            array_column($r2['proposals'], 'start_time'),
            'Determinism: same input MUST always produce the same plan.',
        );
    }

    /* ─── Pure-read invariant ─── */

    public function test_auto_plan_does_not_mutate_any_task(): void
    {
        // CRITICAL: autoPlanDay returns a PROPOSAL. Mutations
        // happen via /auto-plan/apply. If autoPlanDay started
        // silently scheduling, "Preview" would commit work — UX
        // disaster.
        $task = $this->task(['title' => 'Preview only']);
        $originalStartTime = $task->start_time;

        $this->plan();

        $task->refresh();
        $this->assertSame($originalStartTime, $task->start_time,
            'CRITICAL: autoPlanDay MUST be pure-read — no mutations.');
        $this->assertNull($task->start_time,
            'Task still has no start_time after preview.');
    }
}
