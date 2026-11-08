<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/** One day person by person, Today and the team (2026-11-09): lanes, capacity, signals, and only this organisation's work. */
class DayBoardTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    private function lane(array $board, string $key): array
    {
        return collect($board['people'])->firstWhere('key', $key) ?? $this->fail("no lane {$key}");
    }

    public function test_tasks_are_a_persons_by_account_or_by_name_and_the_rest_is_unassigned(): void
    {
        $byAccount = $this->task(['assigned_to_user_id' => $this->anna->id, 'title' => 'Rooms 101-105', 'start_time' => '09:00:00', 'duration_minutes' => 120]);
        $byName = $this->task(['employee_name' => 'Anna Berzina', 'title' => 'Linen order', 'start_time' => '13:00', 'duration_minutes' => 30]);
        $outside = $this->task(['employee_name' => 'Outside Cleaner', 'title' => 'Windows']);
        $nobody = $this->task(['title' => 'Lobby flowers']);
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('planner_tasks')->insert(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-11-04', 'employee_name' => 'Anna Berzina', 'status' => 'todo', 'priority' => 'High', 'completed' => false, 'created_at' => now(), 'updated_at' => now()]);

        $board = $this->asStaffMember()->getJson($this->timeApi('day?date=2026-11-04'))->assertOk()->json();

        $anna = $this->lane($board, 'u' . $this->anna->id);
        $this->assertEqualsCanonicalizing([$byAccount, $byName], array_column($anna['tasks'], 'id'));
        $this->assertSame(150, $anna['planned_minutes']);
        $this->assertSame('11:00', collect($anna['tasks'])->firstWhere('id', $byAccount)['end_time']);
        $this->assertSame([$outside], array_column($this->lane($board, 'n:Outside Cleaner')['tasks'], 'id'));
        $this->assertFalse($this->lane($board, 'n:Outside Cleaner')['listed']);
        $this->assertSame([$nobody], array_column($board['unassigned'], 'id'));
        $this->assertNotContains('Not ours', collect($board['people'])->flatMap(fn ($p) => array_column($p['tasks'], 'title'))->all());
        $this->assertSame('12:00', $board['now'], 'the venue is in Riga: 10:00 UTC is 12:00 there');
    }

    public function test_capacity_follows_the_standard_day_and_a_persons_own_hours_days_and_break(): void
    {
        $this->setting('planner_work_hours_per_day', 6);
        DB::table('staff')->where('user_id', $this->boris->id)->update(['planner_profile' => json_encode(['work_start' => '07:00', 'work_end' => '15:00', 'break_minutes' => 30])]);
        DB::table('staff')->where('user_id', $this->anna->id)->update(['planner_profile' => json_encode(['work_days' => [1, 2]])]);
        $this->task(['assigned_to_user_id' => $this->anna->id, 'title' => 'On her day off']);

        $board = $this->asManager()->getJson($this->timeApi('day?date=2026-11-04'))->assertOk()->json();

        $this->assertSame(360, $this->lane($board, 'u' . $this->staffMember->id)['capacity_minutes'], 'the standard working day caps the 09:00-18:00 window');
        $boris = $this->lane($board, 'u' . $this->boris->id);
        $this->assertSame(['start' => '07:00', 'end' => '15:00'], $boris['window']);
        $this->assertSame(450, $boris['capacity_minutes'], 'own hours less the break');
        $anna = $this->lane($board, 'u' . $this->anna->id);
        $this->assertFalse($anna['works']);
        $this->assertSame(0, $anna['capacity_minutes']);
        $this->assertContains(['code' => 'not_working', 'person' => 'u' . $this->anna->id, 'value' => 1], $board['signals']);
    }

    public function test_signals_name_what_looks_wrong(): void
    {
        $sam = 'u' . $this->staffMember->id;
        $a = $this->task(['assigned_to_user_id' => $this->staffMember->id, 'start_time' => '14:00', 'duration_minutes' => 300]);
        $b = $this->task(['assigned_to_user_id' => $this->staffMember->id, 'start_time' => '15:00', 'duration_minutes' => 240]);
        $slipped = $this->task(['assigned_to_user_id' => $this->boris->id, 'start_time' => '09:00', 'duration_minutes' => 30]);
        $housekeeping = $this->task(['assigned_to_user_id' => $this->anna->id, 'task_group' => 'Front Office', 'start_time' => '16:00']);
        $high = $this->task(['priority' => 'High', 'title' => 'VIP arrival']);
        $this->task(['assigned_to_user_id' => $this->boris->id, 'task_date' => '2026-11-02', 'title' => 'Late one']);

        $signals = $this->asManager()->getJson($this->timeApi('day?date=2026-11-04'))->assertOk()->json('signals');

        $this->assertContains(['code' => 'over_capacity', 'person' => $sam, 'value' => 540, 'limit' => 480], $signals);
        $this->assertContains(['code' => 'overlap', 'person' => $sam, 'task' => $a, 'other' => $b], $signals);
        $this->assertContains(['code' => 'outside_hours', 'person' => $sam, 'task' => $b], $signals);
        $this->assertContains(['code' => 'no_break', 'person' => $sam, 'value' => 300], $signals);
        $this->assertContains(['code' => 'slipped', 'person' => 'u' . $this->boris->id, 'task' => $slipped], $signals);
        $this->assertContains(['code' => 'skill_mismatch', 'person' => 'u' . $this->anna->id, 'task' => $housekeeping], $signals);
        $this->assertContains(['code' => 'unscheduled_high', 'task' => $high, 'person' => null], $signals);
        $this->assertContains(['code' => 'unassigned', 'value' => 1], $signals);
        $this->assertContains(['code' => 'overdue', 'person' => 'u' . $this->boris->id, 'value' => 1], $signals);
        $this->assertContains(['code' => 'light_day', 'person' => 'u' . $this->manager->id, 'value' => 0, 'limit' => 480], $signals);
    }

    public function test_today_is_my_day_with_whats_next_my_overdue_work_backlog_pool_and_week(): void
    {
        $me = $this->staffMember;
        $this->task(['assigned_to_user_id' => $me->id, 'title' => 'Morning round', 'start_time' => '09:00', 'duration_minutes' => 60, 'completed' => true, 'status' => 'done']);
        $next = $this->task(['assigned_to_user_id' => $me->id, 'title' => 'Supplier call', 'start_time' => '13:00', 'duration_minutes' => 30]);
        $this->task(['assigned_to_user_id' => $me->id, 'title' => 'Untimed']);
        $this->task(['assigned_to_user_id' => $me->id, 'title' => 'Thursday thing', 'task_date' => '2026-11-05', 'duration_minutes' => 90]);
        $this->task(['assigned_to_user_id' => $me->id, 'title' => 'In my bucket', 'task_date' => null]);
        $this->task(['title' => 'Pool for today', 'task_date' => null, 'pool_horizon' => 'day', 'pool_due_date' => '2026-11-04']);
        $this->task(['title' => 'Housekeeping pool', 'task_date' => null, 'task_group' => 'Housekeeping']);
        $this->task(['assigned_to_user_id' => $this->boris->id, 'title' => 'Not mine']);
        DB::table('planner_day_notes')->insert(['organization_id' => $this->org->id, 'note_date' => '2026-11-04', 'note_text' => 'Inspection at 15:00', 'created_at' => now(), 'updated_at' => now()]);

        $today = $this->actingAs($me, 'sanctum')->getJson($this->timeApi('today'))->assertOk()->json();

        $this->assertSame('2026-11-04', $today['date']);
        $this->assertSame($next, $today['next']['id']);
        $this->assertCount(3, $today['me']['tasks']);
        $this->assertSame(['mine' => 1, 'pool' => 2, 'pool_for_today' => 1], $today['backlog']);
        $this->assertSame(90, $today['week'][3]['minutes'], 'Thursday of this week');
        $this->assertSame('2026-11-02', $today['week'][0]['date']);
        $this->assertSame('Inspection at 15:00', $today['note']);
        $this->assertNotContains('Not mine', array_column($today['me']['tasks'], 'title'));
    }

    public function test_the_week_has_a_cell_per_person_per_day(): void
    {
        $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => '2026-11-03', 'duration_minutes' => 60]);
        $this->task(['task_date' => '2026-11-06', 'title' => 'Friday, nobody']);

        $week = $this->asManager()->getJson($this->timeApi('week?start=2026-11-02'))->assertOk()->json();

        $this->assertCount(7, $week['days']);
        $anna = collect($week['people'])->firstWhere('key', 'u' . $this->anna->id);
        $this->assertCount(7, $anna['days']);
        $this->assertSame(60, $anna['days'][1]['planned_minutes']);
        $this->assertSame(60, $anna['planned_minutes']);
        $this->assertSame('Friday, nobody', $week['unassigned'][4]['tasks'][0]['title']);
    }

    public function test_people_carry_profile_skills_preferences_and_shown_experience_and_only_a_manager_edits_a_profile(): void
    {
        $this->setting('planner_employee_prefs', ['Anna Berzina' => ['groups' => ['Housekeeping'], 'tasks' => ['Deep clean']]]);
        foreach (['2026-11-02', '2026-11-03'] as $day) {
            $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => $day, 'task_group' => 'Housekeeping', 'duration_minutes' => 40,
                'completed' => true, 'status' => 'done', 'completed_at' => $day . ' 12:00:00']);
        }

        $this->actingAs($this->anna, 'sanctum')->putJson($this->timeApi('people/' . $this->anna->id), ['knowledge' => 'I know everything'])
            ->assertStatus(403); // the access map's own refusal (admin/time/people/{user}: changes a manager's)
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['work_start' => '17:00', 'work_end' => '09:00'])
            ->assertStatus(422)->assertJsonPath('error', 'invalid_hours');
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['knowledge' => 'Latvian, Russian, English. Certified for chemical deep cleans.', 'work_days' => [1, 2, 3, 4, 5], 'break_minutes' => 30])
            ->assertOk()->assertJsonPath('person.profile.knowledge', 'Latvian, Russian, English. Certified for chemical deep cleans.');

        $anna = collect($this->asStaffMember()->getJson($this->timeApi('people'))->assertOk()->json('people'))->firstWhere('key', 'u' . $this->anna->id);
        $this->assertSame(['Housekeeping'], $anna['profile']['skills']);
        $this->assertSame([1, 2, 3, 4, 5], $anna['profile']['work_days']);
        $this->assertSame(30, $anna['profile']['break_minutes']);
        $this->assertSame(['groups' => ['Housekeeping'], 'tasks' => ['Deep clean']], $anna['prefers']);
        $this->assertSame(['done' => 2, 'on_time' => 2, 'avg_minutes' => 40], $anna['experience']['groups']['Housekeeping']);
        $this->assertSame((string) json_encode(['Housekeeping']), DB::table('staff')->where('user_id', $this->anna->id)->value('planner_skills'), 'skills stay the full admin\'s team endpoint\'s');
    }
}
