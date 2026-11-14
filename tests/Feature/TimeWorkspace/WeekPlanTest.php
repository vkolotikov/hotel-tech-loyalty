<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * A week's plan (2026-11-14): the pool, the backlogs and the overdue work each to a day and a person, then each day's
 * times — the AI's lines checked one by one, the rules for the rest — applied line by line with each line's own day.
 * The clock is Wednesday 4 November 2026 at the venue: the week plans Wednesday to Sunday.
 */
class WeekPlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    private function line(array $plan, int $id): ?array
    {
        foreach ($plan['days'] as $day) {
            foreach ($day['proposals'] as $p) {
                if ($p['task_id'] === $id) {
                    return $p;
                }
            }
        }

        return null;
    }

    public function test_the_rules_give_each_piece_of_work_a_day_and_a_person_who_may_do_it(): void
    {
        $due = $this->task(['task_date' => null, 'title' => 'Rooms for the wedding', 'task_group' => 'Housekeeping', 'pool_horizon' => 'day', 'pool_due_date' => '2026-11-05', 'duration_minutes' => 60]);
        $front = $this->task(['task_date' => null, 'title' => 'Lobby flowers', 'task_group' => 'Front Office', 'duration_minutes' => 30]);
        $mine = $this->task(['task_date' => null, 'title' => 'Order linen', 'assigned_to_user_id' => $this->staffMember->id, 'employee_name' => 'Sam Staff', 'duration_minutes' => 30]);
        $late = $this->task(['task_date' => '2026-11-02', 'title' => 'Fix the gate', 'assigned_to_user_id' => $this->boris->id, 'employee_name' => 'Boris Ozols', 'duration_minutes' => 45]);
        $dayOwn = $this->task(['task_date' => '2026-11-06', 'title' => 'Friday stock count', 'assigned_to_user_id' => $this->anna->id, 'employee_name' => 'Anna Berzina', 'duration_minutes' => 30]);

        $plan = $this->asManager()->postJson($this->timeApi('plan-week'), ['start' => '2026-11-02', 'scope' => 'team', 'use_ai' => false])->assertOk()->json();

        $this->assertSame(['2026-11-04', '2026-11-08', 'rules'], [$plan['from'], $plan['to'], $plan['source']]);
        $this->assertSame(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'], array_column($plan['days'], 'date'));
        $this->assertLessThanOrEqual('2026-11-05', $this->line($plan, $due)['date'], 'never after its due day');
        $this->assertContains('from_pool', $this->line($plan, $due)['reasons']);
        $this->assertNotSame('u' . $this->anna->id, $this->line($plan, $front)['person'], 'Anna may take Housekeeping only');
        $this->assertSame('u' . $this->staffMember->id, $this->line($plan, $mine)['person'], 'a backlog stays with its owner');
        $this->assertSame(['u' . $this->boris->id, '2026-11-04'], [$this->line($plan, $late)['person'], $this->line($plan, $late)['date']], 'overdue work first');
        $this->assertSame('2026-11-06', $this->line($plan, $dayOwn)['date'], 'a day\'s own task keeps its day');
        $this->assertNotNull($this->line($plan, $dayOwn)['start_time']);

        // Applying writes each line on its own day, with its person and time.
        $lines = [];
        foreach ([$due, $front, $mine, $late] as $id) {
            $l = $this->line($plan, $id);
            $lines[] = ['task_id' => $id, 'person' => $l['person'], 'start_time' => $l['start_time'], 'duration_minutes' => $l['duration_minutes'], 'seen' => $l['seen'], 'date' => $l['date']];
        }
        $this->asManager()->postJson($this->timeApi('plan/apply'), ['date' => '2026-11-04', 'lines' => $lines])->assertOk()->assertJsonPath('applied', 4);
        $row = DB::table('planner_tasks')->find($due);
        $this->assertSame($this->line($plan, $due)['date'], substr((string) $row->task_date, 0, 10));
        $this->assertNotNull($row->assigned_to_user_id);
        $this->assertSame('2026-11-04', substr((string) DB::table('planner_tasks')->where('id', $late)->value('task_date'), 0, 10));
    }

    public function test_the_ais_lines_are_checked_and_the_rules_take_what_fails(): void
    {
        $due = $this->task(['task_date' => null, 'title' => 'Rooms for the wedding', 'task_group' => 'Housekeeping', 'pool_horizon' => 'day', 'pool_due_date' => '2026-11-05', 'duration_minutes' => 60]);
        $front = $this->task(['task_date' => null, 'title' => 'Lobby flowers', 'task_group' => 'Front Office', 'duration_minutes' => 30]);
        $ok = $this->task(['task_date' => null, 'title' => 'Paint the fence', 'task_group' => 'Maintenance', 'duration_minutes' => 120]);
        $this->claudeAnswers('propose_week_plan', ['summary' => 'A calm week.', 'lines' => [
            ['task_id' => $due, 'date' => '2026-11-07', 'person' => 'u' . $this->anna->id, 'note' => 'After its due day'],
            ['task_id' => $front, 'date' => '2026-11-05', 'person' => 'u' . $this->anna->id, 'note' => 'Not her type'],
            ['task_id' => $ok, 'date' => '2026-11-06', 'person' => 'u' . $this->boris->id, 'start_time' => '10:00', 'note' => 'Boris knows tools'],
            ['task_id' => 999999, 'date' => '2026-11-06', 'person' => 'u' . $this->boris->id],
        ]]);

        $plan = $this->asManager()->postJson($this->timeApi('plan-week'), ['start' => '2026-11-04', 'scope' => 'team'])->assertOk()->json();

        $this->assertSame(['ai', 'A calm week.'], [$plan['source'], $plan['summary']]);
        $this->assertSame(['2026-11-06', 'u' . $this->boris->id, '10:00', 'ai'], [$this->line($plan, $ok)['date'], $this->line($plan, $ok)['person'], $this->line($plan, $ok)['start_time'], $this->line($plan, $ok)['source']]);
        $this->assertSame('Boris knows tools', $this->line($plan, $ok)['note']);
        $this->assertLessThanOrEqual('2026-11-05', $this->line($plan, $due)['date']);
        $this->assertSame('rules', $this->line($plan, $due)['source']);
        $this->assertNotSame('u' . $this->anna->id, $this->line($plan, $front)['person']);
        $this->assertSame(1, DB::table('ai_usage_logs')->where('feature', 'time_week_plan')->count());
    }

    public function test_planning_the_teams_week_follows_the_planning_mode_and_a_past_week_cannot_be_planned(): void
    {
        $this->task(['task_date' => null, 'title' => 'Pool work']);
        $this->setting('planner_planning_mode', 'own');
        $this->asStaffMember()->postJson($this->timeApi('plan-week'), ['start' => '2026-11-04', 'scope' => 'team', 'use_ai' => false])->assertStatus(403)->assertJsonPath('error', 'own_day_only');
        $mine = $this->asStaffMember()->postJson($this->timeApi('plan-week'), ['start' => '2026-11-04', 'scope' => 'me', 'use_ai' => false])->assertOk()->json();
        $this->assertSame([['key' => 'u' . $this->staffMember->id, 'name' => 'Sam Staff']], $mine['people']);
        $this->asManager()->postJson($this->timeApi('plan-week'), ['start' => '2026-10-26', 'scope' => 'team', 'use_ai' => false])->assertStatus(422)->assertJsonPath('error', 'past_day');
        $this->asManager()->postJson($this->timeApi('plan/apply'), ['date' => '2026-11-04', 'lines' => [['task_id' => 1, 'person' => 'u' . $this->anna->id, 'start_time' => '10:00', 'duration_minutes' => 30, 'date' => '2026-11-01']]])
            ->assertStatus(422)->assertJsonPath('error', 'past_day');
    }
}
