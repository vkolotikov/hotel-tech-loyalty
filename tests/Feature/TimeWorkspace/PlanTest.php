<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * Planning a day (2026-11-09): the rules, the AI's proposal checked line by line, the fall-backs, and applying what a
 * person accepted. Nothing is written before the apply.
 */
class PlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    private function line(array $plan, int $taskId): array
    {
        return collect($plan['proposals'])->firstWhere('task_id', $taskId) ?? $this->fail("task {$taskId} was not planned");
    }

    public function test_the_rules_fit_my_untimed_work_after_now_around_what_is_timed_and_write_nothing(): void
    {
        $me = $this->staffMember;
        $this->task(['assigned_to_user_id' => $me->id, 'start_time' => '12:00', 'duration_minutes' => 60, 'title' => 'Fixed meeting']);
        $low = $this->task(['assigned_to_user_id' => $me->id, 'priority' => 'Low', 'duration_minutes' => 30, 'title' => 'Tidy files']);
        $high = $this->task(['assigned_to_user_id' => $me->id, 'priority' => 'High', 'duration_minutes' => 45, 'title' => 'Call the bank']);
        $before = DB::table('planner_tasks')->orderBy('id')->get()->toArray();

        $plan = $this->actingAs($me, 'sanctum')->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me', 'use_ai' => false])
            ->assertOk()->assertJsonPath('source', 'rules')->assertJsonPath('ai_status', 'off')->json();

        // 12:00 at the venue is now and the meeting holds 12:00-13:00: high priority first, from 13:00.
        $this->assertSame('13:00', $this->line($plan, $high)['start_time']);
        $this->assertSame('13:45', $this->line($plan, $low)['start_time']);
        $this->assertContains('keeps_owner', $this->line($plan, $high)['reasons']);
        $this->assertEquals($before, DB::table('planner_tasks')->orderBy('id')->get()->toArray(), 'a plan writes nothing');
    }

    public function test_a_team_plan_gives_unowned_work_to_who_suits_it_and_never_past_their_skills(): void
    {
        $this->setting('planner_employee_prefs', ['Boris Ozols' => ['groups' => ['Maintenance'], 'tasks' => []]]);
        $repair = $this->task(['title' => 'Fix the boiler', 'task_group' => 'Maintenance', 'duration_minutes' => 60]);
        $rooms = $this->task(['title' => 'Rooms 3rd floor', 'task_group' => 'Front Office', 'duration_minutes' => 60]);
        // Anna may take Housekeeping only; she has shown it often.
        foreach (['2026-11-02', '2026-11-03', '2026-11-03'] as $day) {
            $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => $day, 'task_group' => 'Housekeeping', 'completed' => true, 'status' => 'done', 'completed_at' => $day . ' 10:00:00']);
        }
        $clean = $this->task(['title' => 'Deep clean 204', 'task_group' => 'Housekeeping', 'duration_minutes' => 90]);

        $plan = $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team', 'use_ai' => false])->assertOk()->json();

        $this->assertSame('u' . $this->boris->id, $this->line($plan, $repair)['person']);
        $this->assertContains('prefers', $this->line($plan, $repair)['reasons']);
        $this->assertSame('u' . $this->anna->id, $this->line($plan, $clean)['person']);
        $this->assertContains('experience', $this->line($plan, $clean)['reasons']);
        $this->assertNotSame('u' . $this->anna->id, $this->line($plan, $rooms)['person'], 'Anna may not take Front Office work');
        $this->assertNotSame('u' . $this->manager->id, $this->line($plan, $rooms)['person'], 'a manager only when nobody else can');
    }

    public function test_a_name_without_an_account_is_never_handed_work_by_a_plan(): void
    {
        $this->setting('employees', ['Outside Cleaner']);
        $theirs = $this->task(['employee_name' => 'Outside Cleaner', 'title' => 'Windows', 'duration_minutes' => 60]);
        $open = $this->task(['title' => 'Lobby flowers', 'duration_minutes' => 30]);
        $this->claudeAnswers('propose_day_plan', ['summary' => 'x', 'proposals' => [['task_id' => $open, 'person' => 'n:Outside Cleaner', 'start_time' => '13:00']]]);

        $plan = $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team'])->assertOk()->json();

        $this->assertSame('n:Outside Cleaner', $this->line($plan, $theirs)['person'], 'what was given to them stays theirs');
        $this->assertNotSame('n:Outside Cleaner', $this->line($plan, $open)['person']);
        $this->assertSame('rules', $this->line($plan, $open)['source']);
    }

    public function test_planning_someone_else_or_the_team_follows_the_planning_mode_and_a_past_day_cannot_be_planned(): void
    {
        $this->task(['title' => 'Something']);
        // `team` (the default): anyone plans a colleague's day or the team's.
        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team', 'use_ai' => false])->assertOk();
        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'person', 'person' => 'u' . $this->anna->id, 'use_ai' => false])->assertOk();
        // `own`: only one's own day, but a manager's is still anyone's.
        $this->setting('planner_planning_mode', 'own');
        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team'])->assertStatus(403)->assertJsonPath('error', 'own_day_only');
        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'person', 'person' => 'u' . $this->anna->id])->assertStatus(403);
        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me', 'use_ai' => false])->assertOk();
        $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team', 'use_ai' => false])->assertOk();
        $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-03', 'scope' => 'me'])->assertStatus(422)->assertJsonPath('error', 'past_day');
        $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'person', 'person' => 'u999999'])->assertStatus(422)->assertJsonPath('error', 'no_person');
    }

    public function test_the_ais_plan_is_checked_line_by_line_and_its_spend_recorded(): void
    {
        $boiler = $this->task(['title' => 'Fix the boiler', 'task_group' => 'Maintenance', 'duration_minutes' => 60]);
        $clean = $this->task(['title' => 'Deep clean 204', 'task_group' => 'Front Office', 'duration_minutes' => 60]);
        $call = $this->task(['title' => 'Call supplier', 'duration_minutes' => 30, 'assigned_to_user_id' => $this->boris->id]);
        $this->task(['assigned_to_user_id' => $this->boris->id, 'start_time' => '14:00', 'duration_minutes' => 60, 'title' => 'Boris busy']);
        $this->claudeAnswers('propose_day_plan', [
            'summary'   => 'Boris takes the repair after lunch.',
            'proposals' => [
                // Overlaps Boris's 14:00-15:00: moved to his next free time.
                ['task_id' => $boiler, 'person' => 'u' . $this->boris->id, 'start_time' => '14:30', 'duration_minutes' => 60, 'note' => 'Maintenance is his'],
                // Anna may not take Front Office work: the rules decide instead.
                ['task_id' => $clean, 'person' => 'u' . $this->anna->id, 'start_time' => '13:00'],
                // Not a task in the plan: dropped.
                ['task_id' => 999999, 'person' => 'u' . $this->boris->id, 'start_time' => '16:00'],
                // Before now (12:00 at the venue): moved to now or later.
                ['task_id' => $call, 'person' => 'u' . $this->boris->id, 'start_time' => '08:00', 'duration_minutes' => 30],
            ],
        ]);

        $plan = $this->asManager()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'team', 'lang' => 'en'])
            ->assertOk()->assertJsonPath('source', 'ai')->assertJsonPath('summary', 'Boris takes the repair after lunch.')->json();

        $this->assertSame(['u' . $this->boris->id, '15:00', 'ai'], [$this->line($plan, $boiler)['person'], $this->line($plan, $boiler)['start_time'], $this->line($plan, $boiler)['source']]);
        $this->assertSame('Maintenance is his', $this->line($plan, $boiler)['note']);
        $this->assertSame('rules', $this->line($plan, $clean)['source']);
        $this->assertNotSame('u' . $this->anna->id, $this->line($plan, $clean)['person']);
        $this->assertSame('12:00', $this->line($plan, $call)['start_time']);
        $this->assertNull(collect($plan['proposals'])->firstWhere('task_id', 999999));
        $this->assertSame('time_plan', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
        Http::assertSent(fn ($request) => str_contains($request->body(), 'Fix the boiler') && str_contains($request->body(), 'propose_day_plan'));
    }

    public function test_with_the_allowance_used_up_or_the_ai_failing_the_rules_plan_and_say_so(): void
    {
        $task = $this->task(['assigned_to_user_id' => $this->staffMember->id, 'duration_minutes' => 30]);
        Http::fake();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'claude-sonnet-test', 'feature' => 'time_plan', 'cost_cents' => 1000, 'created_at' => now()]);

        $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me'])
            ->assertOk()->assertJsonPath('source', 'rules')->assertJsonPath('ai_status', 'over')->assertJsonPath('proposals.0.task_id', $task);
        Http::assertNothingSent();

        DB::table('ai_usage_logs')->delete();
        \Illuminate\Support\Facades\Cache::flush(); // the month's spend is cached for a minute
        Http::fake(['api.anthropic.com/*' => Http::response('{"type":"error","error":{"type":"overloaded_error","message":"secret provider detail"}}', 529)]);
        $response = $this->asStaffMember()->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me'])
            ->assertOk()->assertJsonPath('source', 'rules')->assertJsonPath('ai_status', 'failed');
        $this->assertStringNotContainsString('secret provider detail', $response->getContent());
    }

    public function test_the_pool_and_overdue_work_come_in_when_asked(): void
    {
        $me = $this->staffMember;
        $late = $this->task(['assigned_to_user_id' => $me->id, 'task_date' => '2026-11-02', 'title' => 'Yesterday\'s report']);
        $pool = $this->task(['task_date' => null, 'title' => 'From the pool', 'pool_horizon' => 'week']);
        $notForSam = $this->task(['task_date' => null, 'title' => 'Housekeeping only', 'task_group' => 'Housekeeping']);
        DB::table('staff')->where('user_id', $me->id)->update(['planner_skills' => json_encode(['Front Office'])]);

        $plan = $this->actingAs($me, 'sanctum')->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me', 'use_ai' => false, 'include_pool' => true, 'include_overdue' => true])->assertOk()->json();

        $this->assertContains('from_overdue', $this->line($plan, $late)['reasons']);
        $this->assertContains('from_pool', $this->line($plan, $pool)['reasons']);
        $this->assertNull(collect($plan['proposals'])->firstWhere('task_id', $notForSam));
    }

    public function test_applying_writes_what_was_accepted_and_skips_what_changed_or_is_not_yours(): void
    {
        // A staff member who plans only their own day (`own`).
        $this->setting('planner_planning_mode', 'own');
        $me = $this->staffMember;
        $mine = $this->task(['assigned_to_user_id' => $me->id, 'duration_minutes' => 30]);
        $pool = $this->task(['task_date' => null, 'title' => 'Pool task']);
        $changed = $this->task(['assigned_to_user_id' => $me->id]);
        $boris = $this->task(['assigned_to_user_id' => $this->boris->id]);
        $done = $this->task(['assigned_to_user_id' => $me->id, 'completed' => true, 'status' => 'done']);
        $seen = fn (int $id) => \App\Models\PlannerTask::find($id)->updated_at->toIso8601String();
        $lines = [
            ['task_id' => $mine, 'person' => 'u' . $me->id, 'start_time' => '13:00', 'duration_minutes' => 45, 'seen' => $seen($mine)],
            ['task_id' => $pool, 'person' => 'u' . $me->id, 'start_time' => '14:00', 'duration_minutes' => 30, 'seen' => $seen($pool)],
            ['task_id' => $changed, 'person' => 'u' . $me->id, 'start_time' => '15:00', 'duration_minutes' => 30, 'seen' => '2020-01-01T00:00:00+00:00'],
            ['task_id' => $boris, 'person' => 'u' . $me->id, 'start_time' => '15:30', 'duration_minutes' => 30, 'seen' => $seen($boris)],
            ['task_id' => $done, 'person' => 'u' . $me->id, 'start_time' => '16:00', 'duration_minutes' => 30, 'seen' => $seen($done)],
            ['task_id' => $mine, 'person' => 'u' . $this->anna->id, 'start_time' => '16:30', 'duration_minutes' => 30],
        ];

        $answer = $this->actingAs($me, 'sanctum')->postJson($this->timeApi('plan/apply'), ['date' => '2026-11-04', 'lines' => $lines])->assertOk()->json();

        $this->assertSame(2, $answer['applied']);
        $this->assertEqualsCanonicalizing([
            ['task_id' => $changed, 'reason' => 'changed'], ['task_id' => $boris, 'reason' => 'not_yours'],
            ['task_id' => $done, 'reason' => 'done'], ['task_id' => $mine, 'reason' => 'not_yours'],
        ], $answer['skipped']);
        $row = DB::table('planner_tasks')->find($mine);
        $this->assertSame(['13:00', '13:45', 45], [substr($row->start_time, 0, 5), substr($row->end_time, 0, 5), (int) $row->duration_minutes]);
        $claimed = DB::table('planner_tasks')->find($pool);
        $this->assertSame([(int) $me->id, 'Sam Staff', '2026-11-04'], [(int) $claimed->assigned_to_user_id, $claimed->employee_name, substr((string) $claimed->task_date, 0, 10)]);
    }

    public function test_a_manager_applies_for_others_within_their_skills_and_another_organisations_task_is_not_found(): void
    {
        $front = $this->task(['title' => 'Front desk cover', 'task_group' => 'Front Office']);
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        $foreign = DB::table('planner_tasks')->insertGetId(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-11-04', 'status' => 'todo', 'priority' => 'Normal', 'completed' => false, 'created_at' => now(), 'updated_at' => now()]);

        $answer = $this->asManager()->postJson($this->timeApi('plan/apply'), ['date' => '2026-11-05', 'lines' => [
            ['task_id' => $front, 'person' => 'u' . $this->anna->id, 'start_time' => '10:00', 'duration_minutes' => 30],
            ['task_id' => $foreign, 'person' => 'u' . $this->boris->id, 'start_time' => '10:00', 'duration_minutes' => 30],
            ['task_id' => $front, 'person' => 'u' . $this->boris->id, 'start_time' => '10:00', 'duration_minutes' => 30],
        ]])->assertOk()->json();

        $this->assertSame(1, $answer['applied']);
        $this->assertSame([['task_id' => $front, 'reason' => 'not_allowed'], ['task_id' => $foreign, 'reason' => 'not_found']], $answer['skipped']);
        $this->assertSame((int) $this->boris->id, (int) DB::table('planner_tasks')->where('id', $front)->value('assigned_to_user_id'));
        $this->assertSame('Not ours', DB::table('planner_tasks')->where('id', $foreign)->value('title'));
        $this->assertNull(DB::table('planner_tasks')->where('id', $foreign)->value('assigned_to_user_id'));
    }
}
