<?php

namespace Tests\Feature\TimeWorkspace;

use App\Models\PlannerTask;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/** The time a task really took (Start / Pause / Finish) and how the period went (2026-11-09). */
class ClockAndInsightsTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    public function test_start_pause_and_finish_add_up_the_minutes_and_mark_the_task_done(): void
    {
        $task = $this->task(['assigned_to_user_id' => $this->staffMember->id, 'duration_minutes' => 30]);

        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/start"))->assertOk()->assertJsonPath('running', true)->assertJsonPath('status', 'in_progress');
        $this->travel(20)->minutes();
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/pause"))->assertOk()->assertJsonPath('running', false)->assertJsonPath('actual_minutes', 20);
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/start"))->assertOk();
        $this->travel(15)->minutes();
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/finish"))->assertOk()
            ->assertJsonPath('done', true)->assertJsonPath('actual_minutes', 35)->assertJsonPath('running', false);

        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/start"))->assertStatus(409)->assertJsonPath('error', 'task_done');
        $this->assertNotNull(DB::table('planner_tasks')->where('id', $task)->value('completed_at'));
    }

    public function test_a_clock_stops_when_the_task_is_done_on_any_screen_and_a_copy_starts_untimed(): void
    {
        $task = $this->task(['assigned_to_user_id' => $this->staffMember->id]);
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/start"))->assertOk();
        $this->travel(50)->minutes();

        // The full admin's own tick.
        $this->asStaffMember()->patchJson(rtrim((string) config('app.url'), '/') . "/api/v1/admin/planner/tasks/{$task}/complete")->assertOk();
        $row = DB::table('planner_tasks')->find($task);
        $this->assertSame([50, null], [(int) $row->actual_minutes, $row->started_at]);

        $copy = $this->asStaffMember()->postJson(rtrim((string) config('app.url'), '/') . "/api/v1/admin/planner/tasks/{$task}/copy", ['task_date' => '2026-11-05'])->assertCreated()->json('id');
        $this->assertNull(DB::table('planner_tasks')->where('id', $copy)->value('actual_minutes'));
    }

    public function test_a_forgotten_clock_counts_at_most_twelve_hours_and_another_organisations_task_is_not_found(): void
    {
        $task = $this->task();
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/start"))->assertOk();
        $this->travel(3)->days();
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$task}/finish"))->assertOk()->assertJsonPath('actual_minutes', 720);

        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        $foreign = DB::table('planner_tasks')->insertGetId(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-11-04', 'status' => 'todo', 'priority' => 'Normal', 'completed' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$foreign}/start"))->assertStatus(404);
        $this->assertNull(DB::table('planner_tasks')->where('id', $foreign)->value('started_at'));
    }

    public function test_insights_count_completion_on_time_in_the_venues_zone_accuracy_and_load(): void
    {
        $anna = $this->anna->id;
        // Finished on its own day at 23:30 Riga (21:30 UTC): on time.
        $this->task(['assigned_to_user_id' => $anna, 'task_date' => '2026-11-02', 'task_group' => 'Housekeeping', 'duration_minutes' => 60, 'actual_minutes' => 90, 'completed' => true, 'status' => 'done', 'completed_at' => '2026-11-02 21:30:00']);
        // Finished the next day: late.
        $this->task(['assigned_to_user_id' => $anna, 'task_date' => '2026-11-02', 'task_group' => 'Housekeeping', 'duration_minutes' => 60, 'actual_minutes' => 90, 'completed' => true, 'status' => 'done', 'completed_at' => '2026-11-03 08:00:00']);
        $this->task(['assigned_to_user_id' => $anna, 'task_date' => '2026-11-03', 'task_group' => 'Housekeeping', 'duration_minutes' => 60, 'actual_minutes' => 90, 'completed' => true, 'status' => 'done', 'completed_at' => '2026-11-03 09:00:00']);
        // Open and before today: overdue.
        $this->task(['assigned_to_user_id' => $anna, 'task_date' => '2026-11-03', 'duration_minutes' => 30]);
        // Last week's, for the trend.
        $this->task(['assigned_to_user_id' => $anna, 'task_date' => '2026-10-30', 'duration_minutes' => 30, 'completed' => true, 'status' => 'done']);
        $this->task(['task_date' => null, 'title' => 'Old pool task', 'created_at' => now()->subDays(10)]);

        $insights = $this->asManager()->getJson($this->timeApi('insights?from=2026-11-02&to=2026-11-04'))->assertOk()->json();

        $this->assertEquals(['tasks' => 4, 'done' => 3, 'on_time' => 2, 'late' => 1, 'overdue' => 1, 'completion_pct' => 75, 'on_time_pct' => 67, 'accuracy_pct' => 150, 'planned_minutes' => 210, 'tracked_minutes' => 270],
            collect($insights['totals'])->only(['tasks', 'done', 'on_time', 'late', 'overdue', 'completion_pct', 'on_time_pct', 'accuracy_pct', 'planned_minutes', 'tracked_minutes'])->all());
        $this->assertSame(1, $insights['previous']['tasks']);
        $annaRow = collect($insights['people'])->firstWhere('key', 'u' . $anna);
        $this->assertSame(3 * 480, $annaRow['capacity_minutes']);
        $this->assertSame(15, $annaRow['load_pct']);
        $this->assertContains(['code' => 'takes_longer', 'group' => 'Housekeeping', 'value' => 150], $insights['signals']);
        $this->assertContains(['code' => 'pool_waiting', 'value' => 1], $insights['signals']);
        $this->assertSame(3, $insights['days']);
        $this->assertSame(2, $insights['by_day'][0]['done']);

        $this->asManager()->getJson($this->timeApi('insights?from=2026-11-02&to=2026-11-04&person=u' . $this->boris->id))->assertOk()->assertJsonPath('totals.tasks', 0);
    }

    public function test_the_estimate_is_the_median_of_finished_tasks_like_it(): void
    {
        foreach ([20, 30, 60] as $minutes) {
            $this->task(['task_date' => '2026-11-02', 'title' => 'Mini-bar restock', 'duration_minutes' => $minutes, 'completed' => true, 'status' => 'done']);
        }

        $this->asStaffMember()->getJson($this->timeApi('estimate?title=Mini-bar%20restock'))->assertOk()->assertJsonPath('estimate', ['minutes' => 30, 'samples' => 3, 'basis' => 'title']);
        $this->asStaffMember()->getJson($this->timeApi('estimate?title=Something%20new'))->assertOk()->assertJsonPath('estimate', null);
        $this->assertInstanceOf(PlannerTask::class, PlannerTask::first());
    }
}
