<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * What a manager teaches the planner's AI and what the planner learns from the weeks behind it (2026-11-14): the
 * knowledge settings and profile fields, the learned lengths and people's figures, readiness, and the lengths a plan
 * now uses for a task without one.
 */
class KnowledgeLearningTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        config(['admin_access.mode' => 'enforce']);
        $this->setting('planner_groups', json_encode([['name' => 'Housekeeping'], ['name' => 'Maintenance']]));
        $this->setting('planner_channels', json_encode([['key' => 'deep_clean', 'label' => 'Deep clean', 'icon' => 'sparkles', 'color' => '#10b981', 'groups' => ['Housekeeping']]]));
    }

    public function test_a_manager_teaches_the_business_types_and_tasks_cleaned_and_everyone_reads_them(): void
    {
        $this->asStaffMember()->putJson($this->timeApi('settings/planner_ai_context'), ['value' => ['about' => 'A spa']])->assertStatus(403);
        $this->asManager()->putJson($this->timeApi('settings/planner_ai_context'), ['value' => ['about' => ' A seaside hotel, 40 rooms. ', 'rules' => 'Rooms ready by 15:00', 'goals' => 'Fair weeks', 'secret' => 'x']])
            ->assertOk()->assertJsonPath('value.about', 'A seaside hotel, 40 rooms.');
        $this->asManager()->putJson($this->timeApi('settings/planner_type_notes'), ['value' => [
            'Housekeeping' => ['notes' => 'Rooms and linen', 'typical_minutes' => 45, 'best_time' => 'morning'],
            'Maintenance'  => ['typical_minutes' => 2, 'best_time' => 'never'],
            'Empty'        => ['notes' => ''],
        ]])->assertOk();
        $this->asManager()->putJson($this->timeApi('settings/planner_task_notes'), ['value' => json_encode(['deep_clean' => ['notes' => 'Behind furniture too', 'typical_minutes' => 90]])])->assertOk();
        $this->asManager()->putJson($this->timeApi('settings/planner_type_notes'), ['value' => 'not json'])->assertStatus(422);

        $settings = $this->asStaffMember()->getJson($this->timeApi('settings'))->assertOk()->json();
        $this->assertSame(['about' => 'A seaside hotel, 40 rooms.', 'rules' => 'Rooms ready by 15:00', 'goals' => 'Fair weeks'], $settings['planner_ai_context']);
        $this->assertSame(['Housekeeping' => ['notes' => 'Rooms and linen', 'typical_minutes' => 45, 'best_time' => 'morning']], $settings['planner_type_notes'], 'a length under 5 minutes, an unknown time and an empty note are dropped');
        $this->assertSame(90, $settings['planner_task_notes']['deep_clean']['typical_minutes']);
    }

    public function test_a_managers_profile_of_a_person_takes_a_job_title_level_strengths_and_what_to_develop(): void
    {
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), [
            'job_title' => 'Head housekeeper', 'level' => 'senior', 'strengths' => 'Calm, fast at turnovers', 'develop' => 'Training juniors',
        ])->assertOk()->assertJsonPath('person.profile.job_title', 'Head housekeeper')->assertJsonPath('person.profile.level', 'senior');
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['level' => 'wizard'])->assertStatus(422);
        $this->asStaffMember()->putJson($this->timeApi('people/' . $this->anna->id), ['job_title' => 'Me'])->assertStatus(403);

        $anna = collect($this->asStaffMember()->getJson($this->timeApi('people'))->json('people'))->firstWhere('name', 'Anna Berzina');
        $this->assertSame(['Head housekeeper', 'senior', 'Calm, fast at turnovers', 'Training juniors'], [$anna['profile']['job_title'], $anna['profile']['level'], $anna['profile']['strengths'], $anna['profile']['develop']]);
    }

    public function test_the_planner_learns_real_lengths_and_who_does_each_type_well(): void
    {
        // Housekeeping planned at 30 minutes; Anna really takes 30, Boris 50 and is late.
        foreach (range(1, 4) as $i) {
            $this->doneTask(['assigned_to_user_id' => $this->anna->id, 'task_group' => 'Housekeeping', 'task_category' => 'deep_clean', 'task_date' => '2026-10-2' . $i], 30, 30);
            $this->doneTask(['assigned_to_user_id' => $this->boris->id, 'task_group' => 'Housekeeping', 'task_category' => 'deep_clean', 'task_date' => '2026-10-2' . $i], 30, 50, late: true);
        }
        // Not this organisation's: never counted.
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'o-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('planner_tasks')->insert(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-10-22', 'task_group' => 'Housekeeping', 'duration_minutes' => 30, 'actual_minutes' => 500, 'status' => 'done', 'priority' => 'Normal', 'completed' => true, 'created_at' => now(), 'updated_at' => now()]);

        $coach = $this->asManager()->getJson($this->timeApi('coach'))->assertOk()->json();
        $type = collect($coach['learning']['types'])->firstWhere('key', 'Housekeeping');
        $this->assertSame([8, 8, 30, 40, 40, 133, 'longer'], [$type['samples'], $type['clocked'], $type['planned_median'], $type['real_median'], $type['suggested'], $type['drift_pct'], $type['advice']]);
        $task = collect($coach['learning']['tasks'])->firstWhere('key', 'deep_clean');
        $this->assertSame('Deep clean', $task['name']);

        $people = collect($coach['learning']['people'])->keyBy('name');
        $this->assertSame(['Housekeeping'], $people['Anna Berzina']['strengths']);
        $this->assertSame(['Housekeeping'], $people['Boris Ozols']['support']);
        $this->assertSame(0, $people['Boris Ozols']['on_time_pct']);
        $this->assertSame('Anna Berzina', $coach['learning']['leaders'][0]['best']['name']);
        $this->assertSame(8, $coach['learning']['totals']['done'], 'another organisation\'s tasks never count');

        // A staff member sees only their own figures and no comparison.
        $mine = $this->actingAs($this->boris, 'sanctum')->getJson($this->timeApi('coach'))->assertOk()->json('learning');
        $this->assertSame(['Boris Ozols'], array_column($mine['people'], 'name'));
        $this->assertSame([], $mine['leaders']);
    }

    public function test_readiness_counts_what_the_ai_knows_and_lacks(): void
    {
        $before = $this->asManager()->getJson($this->timeApi('coach'))->json('readiness');
        $this->asManager()->putJson($this->timeApi('settings/planner_ai_context'), ['value' => ['about' => 'A clinic', 'rules' => 'No double bookings']])->assertOk();
        $this->asManager()->putJson($this->timeApi('people/' . $this->anna->id), ['knowledge' => 'Latvian, Russian'])->assertOk();
        $after = $this->asManager()->getJson($this->timeApi('coach'))->json('readiness');

        $items = collect($after['items'])->keyBy('code');
        $this->assertSame([100, 100], [$items['about']['pct'], $items['rules']['pct']]);
        $this->assertSame(1, $items['people']['count']);
        $this->assertGreaterThan($before['score'], $after['score']);
        $this->assertSame(['about', 'rules', 'types', 'people', 'skills', 'hours', 'history', 'clocked'], array_keys($items->all()));
    }

    public function test_an_estimate_prefers_the_persons_own_history_then_the_managers_typical_length(): void
    {
        foreach (range(1, 3) as $i) {
            $this->doneTask(['assigned_to_user_id' => $this->anna->id, 'task_group' => 'Housekeeping', 'task_date' => '2026-10-2' . $i], 30, 35);
        }
        $this->setting('planner_type_notes', json_encode(['Housekeeping' => ['typical_minutes' => 45]]));

        $this->asStaffMember()->getJson($this->timeApi('estimate?task_group=Housekeeping&person=u' . $this->anna->id))
            ->assertJsonPath('estimate.basis', 'person')->assertJsonPath('estimate.minutes', 35);
        $this->asStaffMember()->getJson($this->timeApi('estimate?task_group=Housekeeping&person=u' . $this->boris->id))
            ->assertJsonPath('estimate.basis', 'typical')->assertJsonPath('estimate.minutes', 45);
    }

    public function test_a_days_plan_gives_a_task_without_a_length_the_typical_one(): void
    {
        $this->setting('planner_type_notes', json_encode(['Housekeeping' => ['typical_minutes' => 75]]));
        $id = $this->task(['assigned_to_user_id' => $this->anna->id, 'task_group' => 'Housekeeping', 'title' => 'Rooms 1-4']);

        $plan = $this->actingAs($this->anna, 'sanctum')->postJson($this->timeApi('plan'), ['date' => '2026-11-04', 'scope' => 'me', 'use_ai' => false])->assertOk()->json();
        $line = collect($plan['proposals'])->firstWhere('task_id', $id);
        $this->assertSame(75, $line['duration_minutes']);
    }
}
