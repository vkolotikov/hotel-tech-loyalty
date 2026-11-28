<?php

namespace Tests\Feature\TimeWorkspace;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * Recognition (2026-11-28): points for finished work and for a day's goal, clean sweep and filled calendar, the streak,
 * the badges and the week's ranking — read from the planner's tasks every time, in the venue's days, for this
 * organisation only, and shown as far as the organisation's choice allows.
 *
 * Today is Friday 6 November 2026, 12:00 in Riga: the week runs from Monday the 2nd to Sunday the 8th. Everyone works
 * the venue's standard day (8 hours), so a day is "well filled" from 288 planned minutes.
 */
class RecognitionTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        config(['admin_access.mode' => 'enforce']);
        // A UTC instant (12:00 in Riga): a clock fixed with a zoned time makes Carbon read every stored time in that zone.
        $this->travelTo(CarbonImmutable::parse('2026-11-06 10:00:00', 'UTC'));
    }

    /** What `$user` is answered. */
    private function seenBy(User $user): array
    {
        return $this->actingAs($user, 'sanctum')->getJson($this->timeApi('recognition'))->assertOk()->json();
    }

    /** A finished task of `$user` on `$day`: `$minutes` planned, on time, and more as `$extra` says. */
    private function finished(User $user, string $day, int $minutes, array $extra = [], ?int $clocked = null, bool $late = false): int
    {
        return $this->doneTask(['assigned_to_user_id' => $user->id, 'task_date' => $day] + $extra, $minutes, $clocked, $late);
    }

    public function test_a_finished_task_earns_by_its_length_priority_timing_and_clock_and_a_day_by_its_goal_sweep_and_calendar(): void
    {
        // Wednesday: an important hour, timed (5 + 4 + 8 + 3 + 2), a plain half hour (5 + 2 + 3), and one left open.
        $this->finished($this->anna, '2026-11-04', 60, ['priority' => 'High'], 55);
        $this->finished($this->anna, '2026-11-04', 30);
        $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => '2026-11-04', 'duration_minutes' => 30]);
        // Thursday: three tasks of 100 minutes, all finished: 3 × (5 + 7 + 3), the goal, a clean sweep, a filled calendar.
        foreach ([1, 2, 3] as $n) {
            $this->finished($this->anna, '2026-11-05', 100);
        }

        $seen = $this->seenBy($this->anna);

        $this->assertSame('podium', $seen['mode']);
        $this->assertSame(['from' => '2026-11-02', 'to' => '2026-11-08'], $seen['week']);
        $this->assertSame(3, $seen['rules']['daily_goal']);
        $this->assertSame(8, $seen['rules']['points']['important']);
        $me = $seen['me'];
        $wednesday = $me['days'][2];
        $this->assertSame(['2026-11-04', 32, 3, 2, false, false, false], [$wednesday['date'], $wednesday['points'], $wednesday['planned'], $wednesday['done'], $wednesday['goal_met'], $wednesday['sweep'], $wednesday['day_planned']]);
        $thursday = $me['days'][3];
        $this->assertSame([100, true, true, true], [$thursday['points'], $thursday['goal_met'], $thursday['sweep'], $thursday['day_planned']]);
        $this->assertTrue($me['days'][5]['future']);
        $this->assertSame(132, $me['week']['points']);
        $this->assertSame([5, 1, 1, 100, 1, 1, 1], [$me['week']['done'], $me['week']['important'], $me['week']['clocked'], $me['week']['on_time_pct'], $me['week']['days_goal'], $me['week']['days_sweep'], $me['week']['days_planned']]);
        $this->assertSame(0, $me['today']['points'], 'nothing planned or finished today');
        $this->assertSame(1, $me['streak'], 'Thursday met the goal; Wednesday did not; today has no tasks');
    }

    public function test_work_finished_late_is_credited_on_the_day_it_was_finished_without_the_on_time_points(): void
    {
        // Monday's half hour, finished on Wednesday.
        $this->finished($this->anna, '2026-11-02', 30, [], null, true);

        $me = $this->seenBy($this->anna)['me'];

        $this->assertSame(0, $me['days'][0]['points'], 'Monday: its task was not finished that day, and one task is no goal');
        $this->assertSame(1, $me['days'][0]['done'], 'the day\'s own task is done now');
        $this->assertSame(7, $me['days'][2]['points'], '5 for the task and 2 for its half hour, credited on Wednesday');
        $this->assertSame(0, $me['week']['on_time_pct']);
    }

    public function test_only_the_best_fifteen_tasks_of_a_day_earn_points(): void
    {
        // Sixteen quarter hours on Tuesday, all finished: 15 × (5 + 1 + 3), the goal and a clean sweep; 240 minutes fill no calendar.
        for ($i = 0; $i < 16; $i++) {
            $this->finished($this->anna, '2026-11-03', 15);
        }

        $tuesday = $this->seenBy($this->anna)['me']['days'][1];

        $this->assertSame(15 * 9 + 20 + 25, $tuesday['points']);
        $this->assertFalse($tuesday['day_planned']);
    }

    public function test_a_day_of_few_long_tasks_reaches_the_goal_by_finishing_them_all_but_one_small_task_does_not(): void
    {
        // Anna: two three-hour tasks fill her day and both are finished. Boris: one half hour, finished.
        $this->finished($this->anna, '2026-11-03', 180);
        $this->finished($this->anna, '2026-11-03', 180);
        $this->finished($this->boris, '2026-11-03', 30);

        $anna = $this->seenBy($this->anna)['me']['days'][1];
        $boris = $this->seenBy($this->boris)['me']['days'][1];

        $this->assertSame([true, true, true], [$anna['goal_met'], $anna['sweep'], $anna['day_planned']]);
        $this->assertSame(2 * (5 + 12 + 3) + 20 + 25 + 10, $anna['points']);
        $this->assertSame([false, false, false, 10], [$boris['goal_met'], $boris['sweep'], $boris['day_planned'], $boris['points']]);
    }

    public function test_the_streak_counts_days_in_a_row_with_the_goal_met_skips_days_without_tasks_and_waits_for_today(): void
    {
        $this->setting('planner_daily_goal', 1);
        // Last Friday, Monday and Tuesday met; Wednesday had no tasks; Thursday met; today has an open task.
        foreach (['2026-10-30', '2026-11-02', '2026-11-03', '2026-11-05'] as $day) {
            $this->finished($this->anna, $day, 30);
        }
        $open = $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => '2026-11-06', 'duration_minutes' => 30]);

        $this->assertSame(4, $this->seenBy($this->anna)['me']['streak'], 'today is not over: it neither counts nor breaks the streak');

        DB::table('planner_tasks')->where('id', $open)->update(['completed' => true, 'status' => 'done', 'completed_at' => now()]);
        $me = $this->seenBy($this->anna)['me'];
        $this->assertSame(5, $me['streak']);
        $this->assertTrue($me['today']['goal_met']);
        $badges = collect($me['badges'])->keyBy('code');
        $this->assertTrue($badges['streak_3']['earned']);
        $this->assertSame([false, 5, 7], [$badges['streak_7']['earned'], $badges['streak_7']['have'], $badges['streak_7']['need']]);

        // A day with a task left open breaks it: Thursday's second task was never finished.
        $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => '2026-11-05', 'duration_minutes' => 30]);
        $this->setting('planner_daily_goal', 2);
        $this->assertSame(0, $this->seenBy($this->anna)['me']['streak'], 'with a goal of two, no day reached it');
    }

    public function test_a_task_un_done_takes_its_points_back(): void
    {
        $id = $this->finished($this->anna, '2026-11-06', 60, ['priority' => 'High']);
        $before = $this->seenBy($this->anna)['me']['today'];
        $this->assertSame([5 + 4 + 8 + 3, 1, 1], [$before['points'], $before['done'], $before['important_done']]);

        DB::table('planner_tasks')->where('id', $id)->update(['completed' => false, 'status' => 'todo', 'completed_at' => null]);

        $after = $this->seenBy($this->anna)['me']['today'];
        $this->assertSame([0, 0, 0], [$after['points'], $after['done'], $after['important_done']]);
    }

    public function test_a_task_is_credited_on_the_venues_day_not_utcs(): void
    {
        // Finished on Thursday at 23:30 UTC: in Riga that is Friday, 01:30 — today.
        $this->task(['assigned_to_user_id' => $this->anna->id, 'task_date' => '2026-11-06', 'duration_minutes' => 30, 'completed' => true, 'status' => 'done',
            'completed_at' => CarbonImmutable::parse('2026-11-05 23:30:00', 'UTC')]);

        $me = $this->seenBy($this->anna)['me'];

        $this->assertSame(10, $me['today']['points']);
        $this->assertSame(0, $me['days'][3]['points'], 'nothing on Thursday');
    }

    public function test_the_weeks_ranking_orders_by_points_shares_a_place_and_leaves_out_other_organisations_and_names_without_an_account(): void
    {
        $this->finished($this->anna, '2026-11-03', 120);                       // 5 + 8 + 3 = 16
        $this->finished($this->boris, '2026-11-03', 30);                       // 10
        $this->finished($this->staffMember, '2026-11-03', 30);                 // 10
        $this->doneTask(['employee_name' => 'Outside Cleaner', 'task_date' => '2026-11-03'], 240);
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('planner_tasks')->insert(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-11-03', 'assigned_to_user_id' => $this->boris->id,
            'duration_minutes' => 600, 'status' => 'done', 'completed' => true, 'completed_at' => CarbonImmutable::parse('2026-11-03 10:00:00', 'UTC'), 'priority' => 'High', 'created_at' => now(), 'updated_at' => now()]);

        $seen = $this->seenBy($this->boris);

        $this->assertSame(
            [['Anna Berzina', 16, 1, false], ['Boris Ozols', 10, 2, true], ['Sam Staff', 10, 2, false]],
            array_map(fn ($r) => [$r['name'], $r['points'], $r['rank'], $r['me']], $seen['ranking']),
            'the manager has no work this week and the outside cleaner no account; another organisation\'s task is not Boris\'s',
        );
        $this->assertSame([2, 3], [$seen['me']['week']['rank'], $seen['me']['week']['of']]);
        $this->assertSame(0, $seen['hidden']);
    }

    public function test_who_sees_the_ranking_is_the_organisations_choice_and_a_manager_sees_it_whole(): void
    {
        $dana = $this->person('Dana Eglite');
        $emil = $this->person('Emil Krumins');
        foreach ([[$this->anna, 240], [$this->boris, 120], [$dana, 60], [$emil, 45], [$this->staffMember, 30]] as [$who, $minutes]) {
            $this->finished($who, '2026-11-03', $minutes);
        }
        $names = fn (array $seen) => array_column($seen['ranking'], 'name');

        // Where nobody chose: the top three and one's own place — nobody's last place is shown to the team.
        $podium = $this->seenBy($this->staffMember);
        $this->assertSame('podium', $podium['mode']);
        $this->assertSame(['Anna Berzina', 'Boris Ozols', 'Dana Eglite', 'Sam Staff'], $names($podium));
        $this->assertSame([5, 5, 1], [$podium['me']['week']['rank'], $podium['me']['week']['of'], $podium['hidden']]);
        $this->assertSame(['Anna Berzina', 'Boris Ozols', 'Dana Eglite'], $names($this->seenBy($this->anna)), 'someone on the podium sees the three');
        $this->setting('planner_recognition', 'podium');
        $this->assertSame(['Anna Berzina', 'Boris Ozols', 'Dana Eglite', 'Sam Staff'], $names($this->seenBy($this->staffMember)));

        // The whole table, when a manager opens it to everyone.
        $this->setting('planner_recognition', 'ranking');
        $this->assertSame(['Anna Berzina', 'Boris Ozols', 'Dana Eglite', 'Emil Krumins', 'Sam Staff'], $names($this->seenBy($this->staffMember)));
        $this->assertSame(0, $this->seenBy($this->staffMember)['hidden']);

        // Only one's own points: no place for anyone, and no badge that would tell one.
        $this->setting('planner_recognition', 'own');
        $own = $this->seenBy($this->staffMember);
        $this->assertSame(['Sam Staff'], $names($own));
        $this->assertNull($own['ranking'][0]['rank']);
        $this->assertNull($own['me']['week']['rank']);
        $this->assertSame(4, $own['hidden']);
        $this->assertEmpty(array_intersect(['podium', 'champion'], array_column($own['me']['badges'], 'code')));
        $whole = $this->seenBy($this->manager);
        $this->assertSame(5, count($whole['ranking']));
        $this->assertSame([1, 2, 3, 4, 5], array_column($whole['ranking'], 'rank'));

        // Off: nothing at all, and the workspace is told so.
        $this->setting('planner_recognition', 'off');
        $this->assertSame(['mode' => 'off', 'manager' => false], $this->seenBy($this->staffMember));
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertJsonPath('settings.recognition', 'off');
    }

    public function test_badges_come_from_the_weeks_work_and_last_weeks_places(): void
    {
        $this->setting('planner_daily_goal', 1);
        // Last week Anna led and Boris came second.
        $this->finished($this->anna, '2026-10-28', 240);
        $this->finished($this->boris, '2026-10-28', 30);
        // This week Anna: three important tasks, five timed, on three days, each day's work finished.
        foreach (['2026-11-02', '2026-11-03', '2026-11-04'] as $day) {
            $this->finished($this->anna, $day, 200, ['priority' => 'High'], 190);
            $this->finished($this->anna, $day, 100, [], 95);
        }

        $anna = collect($this->seenBy($this->anna)['me']['badges'])->keyBy('code');
        $boris = collect($this->seenBy($this->boris)['me']['badges'])->keyBy('code');

        foreach (['priority_hero', 'goal_getter', 'clean_sweep', 'well_planned', 'on_time', 'timekeeper', 'streak_3', 'podium', 'champion'] as $code) {
            $this->assertTrue($anna[$code]['earned'], $code);
        }
        $this->assertFalse($anna['streak_7']['earned']);
        $this->assertSame([true, false], [$boris['podium']['earned'], $boris['champion']['earned']]);
        $this->assertSame([false, 0, 3], [$boris['priority_hero']['earned'], $boris['priority_hero']['have'], $boris['priority_hero']['need']]);

        // A row of the ranking counts the same badges as the person's own page, last week's places included …
        $this->task(['title' => 'Something this week', 'task_date' => '2026-11-06', 'assigned_to_user_id' => $this->boris->id]);
        $seen = $this->seenBy($this->anna);
        $rows = collect($seen['ranking'])->keyBy('person');
        $this->assertSame(9, $rows['u' . $this->anna->id]['badges']);
        $this->assertSame(9, collect($seen['me']['badges'])->where('earned', true)->count());
        $this->assertSame(1, $rows['u' . $this->boris->id]['badges']);
        // … and none of them where nobody is told a place.
        $this->setting('planner_recognition', 'own');
        $own = $this->seenBy($this->anna);
        $this->assertSame(7, $own['ranking'][0]['badges']);
        $this->assertSame(7, collect($own['me']['badges'])->where('earned', true)->count());
    }

    public function test_a_manager_sets_who_sees_the_ranking_and_the_daily_goal_and_the_choice_is_audited(): void
    {
        $settings = $this->asStaffMember()->getJson($this->timeApi('settings'))->assertOk()->json();
        $this->assertSame(['podium', 3], [$settings['planner_recognition'], $settings['planner_daily_goal']]);

        $this->asStaffMember()->putJson($this->timeApi('settings/planner_recognition'), ['value' => 'off'])->assertStatus(403);
        $this->asManager()->putJson($this->timeApi('settings/planner_recognition'), ['value' => 'loud'])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/planner_daily_goal'), ['value' => 0])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/planner_daily_goal'), ['value' => 21])->assertStatus(422);

        // Saving what already holds (the default) is no change, and nothing is put on record.
        $this->asManager()->putJson($this->timeApi('settings/planner_recognition'), ['value' => 'podium'])->assertOk()->assertJsonPath('value', 'podium');
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'planner.recognition')->count());

        $this->asManager()->putJson($this->timeApi('settings/planner_recognition'), ['value' => 'ranking'])->assertOk()->assertJsonPath('value', 'ranking');
        $this->asManager()->putJson($this->timeApi('settings/planner_daily_goal'), ['value' => 5])->assertOk()->assertJsonPath('value', 5);
        $this->asManager()->putJson($this->timeApi('settings/planner_recognition'), ['value' => 'ranking'])->assertOk();

        $settings = $this->asStaffMember()->getJson($this->timeApi('settings'))->json();
        $this->assertSame(['ranking', 5], [$settings['planner_recognition'], $settings['planner_daily_goal']]);
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))
            ->assertJsonPath('settings.recognition', 'ranking')->assertJsonPath('settings.daily_goal', 5);
        $this->assertSame(5, $this->seenBy($this->anna)['rules']['daily_goal']);
        $audit = DB::table('audit_logs')->where('action', 'planner.recognition')->get();
        $this->assertCount(1, $audit, 'the same choice again is no change');
        $this->assertSame(['mode' => 'ranking'], json_decode($audit[0]->new_values, true));
        $this->assertSame(['mode' => 'podium'], json_decode($audit[0]->old_values, true));
    }
}
