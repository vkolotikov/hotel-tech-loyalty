<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/**
 * The planner's settings as the Time Planner keeps them (2026-11-09): the full admin's own `crm_settings` rows, only the
 * planner's keys, read by everyone and changed by a manager — among them the planning mode (`team` or `own`).
 */
class SettingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        config(['admin_access.mode' => 'enforce']);
    }

    public function test_everyone_reads_the_planners_keys_and_only_those(): void
    {
        $this->setting('planner_groups', json_encode([['name' => 'Housekeeping']]));
        $this->setting('chatbot_greeting', 'Hello');

        $answer = $this->asStaffMember()->getJson($this->timeApi('settings'))->assertOk()->json();

        $this->assertSame('team', $answer['planner_planning_mode'], 'the default');
        $this->assertSame(json_encode([['name' => 'Housekeeping']]), $answer['planner_groups']);
        $this->assertArrayNotHasKey('chatbot_greeting', $answer);
    }

    public function test_a_manager_chooses_the_planning_mode_and_it_is_audited(): void
    {
        $this->asStaffMember()->putJson($this->timeApi('settings/planner_planning_mode'), ['value' => 'own'])->assertStatus(403);
        $this->asManager()->putJson($this->timeApi('settings/planner_planning_mode'), ['value' => 'everyone'])->assertStatus(422);

        $this->asManager()->putJson($this->timeApi('settings/planner_planning_mode'), ['value' => 'own'])->assertOk()->assertJsonPath('value', 'own');

        $this->assertSame('own', $this->asStaffMember()->getJson($this->timeApi('settings'))->json('planner_planning_mode'));
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertJsonPath('settings.planning_mode', 'own')->assertJsonPath('staff.can.plan_team', false);
        $audit = DB::table('audit_logs')->where('action', 'planner.planning_mode')->first();
        $this->assertNotNull($audit);
        $this->assertSame(['mode' => 'own'], json_decode($audit->new_values, true));

        $this->asManager()->putJson($this->timeApi('settings/planner_planning_mode'), ['value' => 'own'])->assertOk();
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'planner.planning_mode')->count(), 'no change, no record');
    }

    public function test_lists_and_the_work_day_are_kept_in_the_full_admins_shapes(): void
    {
        $groups = [['name' => 'Housekeeping', 'icon' => 'bed', 'color' => '#22c55e']];
        $this->asManager()->putJson($this->timeApi('settings/planner_groups'), ['value' => json_encode($groups)])->assertOk();
        $this->asManager()->putJson($this->timeApi('settings/planner_channels'), ['value' => 'not a list'])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/business_hours_profile'), ['value' => ['start' => '17:00', 'end' => '08:00']])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/business_hours_profile'), ['value' => ['start' => '08:00', 'end' => '17:00', 'extra' => 'x']])->assertOk();
        $this->asManager()->putJson($this->timeApi('settings/planner_work_hours_per_day'), ['value' => 30])->assertStatus(422);
        $this->asManager()->putJson($this->timeApi('settings/planner_work_hours_per_day'), ['value' => 7.5])->assertOk();

        // The same rows the full admin reads (its crm-settings) and the workspace's bootstrap.
        $rows = DB::table('crm_settings')->where('organization_id', $this->org->id)->pluck('value', 'key');
        $this->assertSame($groups, json_decode(json_decode($rows['planner_groups'], true), true));
        $this->assertSame(['start' => '08:00', 'end' => '17:00'], json_decode($rows['business_hours_profile'], true));
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))
            ->assertJsonPath('settings.window', ['start' => '08:00', 'end' => '17:00'])
            ->assertJsonPath('settings.minutes_per_day', 450)
            ->assertJsonPath('settings.groups.0.icon', 'bed');
    }

    public function test_a_key_that_is_not_the_planners_is_not_written_here(): void
    {
        $this->asManager()->putJson($this->timeApi('settings/chatbot_greeting'), ['value' => 'Hi'])->assertStatus(404);
        $this->asManager()->putJson($this->timeApi('settings/employees'), ['value' => json_encode(['Outside Cleaner'])])->assertStatus(404);
        $this->assertFalse(DB::table('crm_settings')->whereIn('key', ['chatbot_greeting', 'employees'])->exists());
    }
}
