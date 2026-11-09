<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * Who may put work on whose day (owner 2026-11-09: "for some companies all team can add to others, in some companies only
 * each user can plan their day"): the organisation's planning mode, decided on the server for the full admin's own
 * planner endpoints and the Time Planner's alike (App\Services\Time\PlanningMode). `team` is the planner as it always
 * was; in `own` a staff member changes only their own and unassigned tasks and gives work only to themselves, and a
 * manager still plans for anyone.
 */
class PlanningModeTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    private function plannerApi(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/planner/' . ltrim($path, '/');
    }

    private function own(): void
    {
        $this->setting('planner_planning_mode', 'own');
    }

    private function annasTask(array $attributes = []): int
    {
        return $this->task($attributes + ['assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina']);
    }

    private function samsTask(array $attributes = []): int
    {
        return $this->task($attributes + ['assigned_to_user_id' => $this->staffMember->id, 'employee_name' => 'Sam Staff']);
    }

    public function test_in_team_mode_anyone_adds_assigns_moves_and_finishes_a_colleagues_work(): void
    {
        $anna = $this->annasTask();

        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'For Anna', 'task_date' => '2026-11-05', 'assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina'])->assertCreated();
        $this->asStaffMember()->patchJson($this->plannerApi("tasks/{$anna}/move"), ['task_date' => '2026-11-06', 'assigned_to_user_id' => $this->boris->id, 'employee_name' => 'Boris Ozols'])->assertOk();
        $this->asStaffMember()->patchJson($this->plannerApi("tasks/{$anna}/complete"))->assertOk();

        $this->assertSame([(int) $this->boris->id, '2026-11-06', 1], [(int) DB::table('planner_tasks')->where('id', $anna)->value('assigned_to_user_id'), substr((string) DB::table('planner_tasks')->where('id', $anna)->value('task_date'), 0, 10), (int) DB::table('planner_tasks')->where('id', $anna)->value('completed')]);
    }

    public function test_in_own_mode_a_staff_member_adds_work_only_for_themselves_or_nobody(): void
    {
        $this->own();

        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'For Anna', 'task_date' => '2026-11-05', 'assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina'])
            ->assertStatus(403)->assertJsonPath('error', 'own_day_only');
        // The full admin names a person only by name: refused the same.
        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'For Anna', 'task_date' => '2026-11-05', 'employee_name' => 'Anna Berzina'])->assertStatus(403);
        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'Mine', 'task_date' => '2026-11-05', 'assigned_to_user_id' => $this->staffMember->id, 'employee_name' => 'Sam Staff'])->assertCreated();
        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'Mine by name', 'task_date' => '2026-11-05', 'employee_name' => 'Sam Staff'])->assertCreated();
        $this->asStaffMember()->postJson($this->plannerApi('tasks'), ['title' => 'For the pool', 'task_date' => null])->assertCreated();

        $this->assertFalse(DB::table('planner_tasks')->where('title', 'For Anna')->exists());
        $this->assertSame(3, DB::table('planner_tasks')->whereIn('title', ['Mine', 'Mine by name', 'For the pool'])->count());
        // A manager still plans for anyone.
        $this->asManager()->postJson($this->plannerApi('tasks'), ['title' => 'For Anna', 'task_date' => '2026-11-05', 'assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina'])->assertCreated();
    }

    public function test_in_own_mode_a_colleagues_task_is_not_changed_moved_finished_or_deleted(): void
    {
        $this->own();
        $anna = $this->annasTask(['title' => 'Anna\'s']);
        $sub = DB::table('planner_subtasks')->insertGetId(['organization_id' => $this->org->id, 'task_id' => $anna, 'title' => 'Step', 'is_done' => false, 'created_at' => now()]);

        foreach ([
            ['putJson', "tasks/{$anna}", ['title' => 'Renamed']],
            ['patchJson', "tasks/{$anna}/move", ['task_date' => '2026-11-06']],
            ['patchJson', "tasks/{$anna}/complete", []],
            ['patchJson', "tasks/{$anna}/status", ['status' => 'done']],
            ['postJson', "tasks/{$anna}/subtasks", ['title' => 'Another step']],
            ['patchJson', "subtasks/{$sub}/toggle", []],
            ['deleteJson', "subtasks/{$sub}", []],
            ['deleteJson', "tasks/{$anna}", []],
            ['postJson', "tasks/{$anna}/copy", ['task_date' => '2026-11-06']],
        ] as [$call, $path, $body]) {
            $this->asStaffMember()->{$call}($this->plannerApi($path), $body)->assertStatus(403)->assertJsonPath('error', 'own_day_only');
        }

        $row = DB::table('planner_tasks')->find($anna);
        $this->assertSame(['Anna\'s', '2026-11-04', 0], [$row->title, substr((string) $row->task_date, 0, 10), (int) $row->completed]);
        $this->assertSame(1, DB::table('planner_subtasks')->where('task_id', $anna)->count());
        $this->assertFalse((bool) DB::table('planner_subtasks')->where('id', $sub)->value('is_done'));
        // A copy for oneself is new work on one's own day: allowed.
        $this->asStaffMember()->postJson($this->plannerApi("tasks/{$anna}/copy"), ['task_date' => '2026-11-06', 'assigned_to_user_id' => $this->staffMember->id, 'employee_name' => 'Sam Staff'])->assertCreated();
    }

    public function test_in_own_mode_one_changes_ones_own_and_unassigned_tasks_but_gives_them_to_nobody_else(): void
    {
        $this->own();
        $mine = $this->samsTask();
        $legacy = $this->task(['employee_name' => 'Sam Staff']);
        $pool = $this->task(['task_date' => null, 'title' => 'Pool work']);

        $this->asStaffMember()->putJson($this->plannerApi("tasks/{$mine}"), ['title' => 'Renamed'])->assertOk();
        $this->asStaffMember()->patchJson($this->plannerApi("tasks/{$mine}/move"), ['task_date' => '2026-11-05', 'start_time' => '09:00'])->assertOk();
        $this->asStaffMember()->patchJson($this->plannerApi("tasks/{$legacy}/complete"))->assertOk();
        $this->asStaffMember()->patchJson($this->plannerApi("tasks/{$mine}/move"), ['assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina'])->assertStatus(403);
        $this->asStaffMember()->putJson($this->plannerApi("tasks/{$pool}"), ['employee_name' => 'Boris Ozols'])->assertStatus(403);
        $this->asStaffMember()->postJson($this->plannerApi("tasks/{$pool}/claim"))->assertOk();

        $this->assertSame([(int) $this->staffMember->id, 'Renamed'], [(int) DB::table('planner_tasks')->where('id', $mine)->value('assigned_to_user_id'), DB::table('planner_tasks')->where('id', $mine)->value('title')]);
        $this->assertSame((int) $this->staffMember->id, (int) DB::table('planner_tasks')->where('id', $pool)->value('assigned_to_user_id'));
    }

    public function test_in_own_mode_a_bulk_action_touching_a_colleagues_task_changes_nothing(): void
    {
        $this->own();
        $mine = $this->samsTask();
        $anna = $this->annasTask();

        $this->asStaffMember()->postJson($this->plannerApi('tasks/bulk'), ['ids' => [$mine, $anna], 'action' => 'mark_done'])->assertStatus(403);
        $this->assertSame(0, DB::table('planner_tasks')->whereIn('id', [$mine, $anna])->where('completed', true)->count(), 'one transaction: nothing changed');

        $this->asStaffMember()->postJson($this->plannerApi('tasks/bulk'), ['ids' => [$mine], 'action' => 'reassign_employee', 'value' => 'Anna Berzina'])->assertStatus(403);
        $this->asStaffMember()->postJson($this->plannerApi('tasks/bulk'), ['ids' => [$mine], 'action' => 'mark_done'])->assertOk()->assertJsonPath('updated', 1);
        $this->asManager()->postJson($this->plannerApi('tasks/bulk'), ['ids' => [$anna], 'action' => 'reassign_employee', 'value' => 'Boris Ozols'])->assertOk();
    }

    public function test_in_own_mode_deleting_a_series_leaves_a_colleagues_occurrences(): void
    {
        $this->own();
        $parent = $this->samsTask(['recurring' => 'daily', 'task_date' => '2026-11-04']);
        $mineLater = $this->samsTask(['recurring_parent_id' => $parent, 'task_date' => '2026-11-05']);
        $handedOver = $this->annasTask(['recurring_parent_id' => $parent, 'task_date' => '2026-11-06']);

        $this->asStaffMember()->deleteJson($this->plannerApi("tasks/{$parent}?scope=whole_series"))->assertOk();

        $this->assertSame([$handedOver], DB::table('planner_tasks')->whereIn('id', [$parent, $mineLater, $handedOver])->pluck('id')->map(fn ($id) => (int) $id)->all());
    }

    public function test_in_own_mode_the_full_admins_auto_plan_skips_a_colleagues_task(): void
    {
        $this->own();
        $mine = $this->samsTask();
        $anna = $this->annasTask();

        $this->asStaffMember()->postJson($this->plannerApi('auto-plan/apply'), ['proposals' => [
            ['task_id' => $mine, 'start_time' => '09:00', 'duration_minutes' => 30],
            ['task_id' => $anna, 'start_time' => '10:00', 'duration_minutes' => 30],
        ]])->assertOk()->assertJsonPath('applied', 1)->assertJsonPath('skipped', 1);
        $this->assertNull(DB::table('planner_tasks')->where('id', $anna)->value('start_time'));
    }

    public function test_in_own_mode_a_colleagues_clock_is_theirs(): void
    {
        $this->own();
        $anna = $this->annasTask();
        $mine = $this->samsTask();

        $this->asStaffMember()->postJson($this->timeApi("tasks/{$anna}/start"))->assertStatus(403)->assertJsonPath('error', 'own_day_only');
        $this->asStaffMember()->postJson($this->timeApi("tasks/{$mine}/start"))->assertOk();
        $this->asStaffMember()->postJson($this->timeApi('tasks/999999/start'))->assertStatus(404);
        $this->asManager()->postJson($this->timeApi("tasks/{$anna}/start"))->assertOk();
    }

    public function test_in_own_mode_the_reviews_actions_name_only_ones_own_day(): void
    {
        $this->own();
        $mine = $this->samsTask(['title' => 'My report']);
        $anna = $this->annasTask(['title' => 'Rooms']);
        $this->claudeAnswers('review_time', [
            'summary' => 'A busy day.', 'highlights' => [],
            'suggestions' => [
                ['title' => 'Give Anna your report', 'action' => ['type' => 'assign', 'task_id' => $mine, 'person' => 'u' . $this->anna->id]],
                ['title' => 'Move Anna\'s rooms', 'action' => ['type' => 'move_day', 'task_id' => $anna, 'date' => '2026-11-05']],
                ['title' => 'Start your report at nine', 'action' => ['type' => 'set_time', 'task_id' => $mine, 'start_time' => '09:00']],
            ],
        ]);

        $review = $this->asStaffMember()->postJson($this->timeApi('review'), ['kind' => 'day', 'date' => '2026-11-04'])->assertOk()->json();
        $this->assertSame([null, null, ['type' => 'set_time', 'task_id' => $mine, 'start_time' => '09:00']], array_column($review['suggestions'], 'action'));
    }

    public function test_in_own_mode_capture_gives_a_colleague_only_their_name(): void
    {
        $this->own();
        $this->claudeAnswers('save_tasks', ['tasks' => [
            ['title' => 'Call the supplier', 'person_name' => 'Anna'],
            ['title' => 'File the invoices', 'person_name' => 'Sam Staff'],
        ]]);
        $drafts = $this->asStaffMember()->postJson($this->timeApi('capture'), ['text' => 'Anna calls the supplier, I file the invoices'])->assertOk()->json('tasks');
        $this->assertSame([null, 'Anna Berzina'], [$drafts[0]['person'], $drafts[0]['person_named']]);
        $this->assertSame('u' . $this->staffMember->id, $drafts[1]['person']);
    }
}
