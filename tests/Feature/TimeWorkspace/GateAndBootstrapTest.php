<?php

namespace Tests\Feature\TimeWorkspace;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/** Who reaches HexaTech Time Planner (2026-11-09), and what the workspace learns before it draws anything. */
class GateAndBootstrapTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    public function test_every_route_carries_the_workspace_gate_and_all_but_the_bootstrap_the_planners_plan_gate(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/time/'));

        $this->assertGreaterThanOrEqual(16, $routes->count());
        foreach ($routes as $route) {
            $middleware = $route->gatherMiddleware();
            $this->assertContains('workspace:time', $middleware, "{$route->uri()} is reachable without the workspace flag");
            if ($route->uri() !== 'api/v1/admin/time/bootstrap') {
                $this->assertContains('feature:time_management', $middleware, "{$route->uri()} skips the plan's time_management");
            }
        }
    }

    public function test_every_organisation_has_it_until_switched_off(): void
    {
        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertOk()->assertJsonPath('name', 'HexaTech Time Planner');
        $this->org->setWorkspace('time', false);

        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
        $this->asStaffMember()->getJson($this->timeApi('today'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_without_time_management_the_bootstrap_says_so_and_everything_else_is_locked(): void
    {
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true']])->save();

        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertOk()->assertJsonPath('features.time_management', false);
        $this->asStaffMember()->getJson($this->timeApi('today'))->assertStatus(402)->assertJsonPath('code', 'feature_locked');
    }

    public function test_an_organisation_on_modules_does_not_have_it(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();

        $this->assertFalse($this->org->fresh()->workspaceEnabled('time'));
        $this->asManager()->getJson($this->timeApi('bootstrap'))->assertStatus(403);
    }

    public function test_an_anonymous_caller_and_a_member_never_reach_it(): void
    {
        $member = User::create(['organization_id' => $this->org->id, 'name' => 'Member', 'email' => 'member-' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member']);

        $this->getJson($this->timeApi('bootstrap'))->assertStatus(401);
        $this->actingAs($member, 'sanctum')->getJson($this->timeApi('bootstrap'))->assertStatus(403);
    }

    public function test_the_bootstrap_carries_the_venue_the_lists_the_rights_and_my_counts(): void
    {
        // Settings as the full admin writes them: JSON text inside the JSON column, older plain names beside objects.
        DB::table('crm_settings')->insert(['organization_id' => $this->org->id, 'key' => 'planner_groups', 'value' => json_encode(json_encode(['Housekeeping', ['name' => 'Front Office', 'icon' => 'concierge-bell', 'color' => '#3b82f6']])), 'created_at' => now(), 'updated_at' => now()]);
        $this->setting('planner_channels', [['key' => 'deep_clean', 'label' => 'Deep clean', 'icon' => 'sparkles', 'color' => '#10b981', 'groups' => ['Housekeeping']], ['label' => 'no key']]);
        $this->setting('planner_work_hours_per_day', 7.5);
        $this->setting('business_hours_profile', ['start' => '08:00', 'end' => '17:00']);
        $this->task(['assigned_to_user_id' => $this->staffMember->id, 'employee_name' => 'Sam Staff']);
        $this->task(['employee_name' => 'Sam Staff', 'task_date' => '2026-11-02']);
        $this->task(['employee_name' => 'Sam Staff', 'task_date' => '2026-11-04', 'completed' => true, 'status' => 'done']);
        $this->task(['task_date' => null, 'task_group' => 'Housekeeping']);
        $other = DB::table('organizations')->insertGetId(['name' => 'Other', 'slug' => 'other-' . uniqid(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('planner_tasks')->insert(['organization_id' => $other, 'title' => 'Not ours', 'task_date' => '2026-11-04', 'employee_name' => 'Sam Staff', 'status' => 'todo', 'priority' => 'High', 'completed' => false, 'created_at' => now(), 'updated_at' => now()]);

        $this->asStaffMember()->getJson($this->timeApi('bootstrap'))->assertOk()
            ->assertJsonPath('venue.timezone', 'Europe/Riga')
            ->assertJsonPath('venue.today', '2026-11-04')
            ->assertJsonPath('features.time_management', true)
            ->assertJsonPath('staff.key', 'u' . $this->staffMember->id)
            ->assertJsonPath('staff.can.plan_team', false)
            ->assertJsonPath('staff.can.edit_people', false)
            ->assertJsonPath('settings.window', ['start' => '08:00', 'end' => '17:00'])
            ->assertJsonPath('settings.minutes_per_day', 450)
            ->assertJsonPath('settings.groups', [['name' => 'Housekeeping', 'icon' => null, 'color' => null], ['name' => 'Front Office', 'icon' => 'concierge-bell', 'color' => '#3b82f6']])
            ->assertJsonPath('settings.channels.0.label', 'Deep clean')
            ->assertJsonCount(1, 'settings.channels')
            ->assertJsonPath('counts', ['today_open' => 1, 'overdue' => 1, 'pool' => 1]);

        $this->asManager()->getJson($this->timeApi('bootstrap'))->assertOk()->assertJsonPath('staff.can.plan_team', true);
    }

    public function test_it_is_on_by_default_and_the_command_switches_it(): void
    {
        $this->assertSame(['enabled' => true, 'landing' => false], $this->org->fresh()->workspace('time'));

        $this->artisan('workspace:time', ['org' => $this->org->id, '--off' => true])->expectsOutputToContain('HexaTech Time Planner off')->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('time'));
        $this->artisan('workspace:time', ['org' => $this->org->id, '--on' => true, '--landing' => true])->expectsOutputToContain('landing on')->assertSuccessful();
        $this->assertTrue($this->org->fresh()->workspace('time')['landing']);
        $this->assertFalse($this->org->fresh()->workspace('crm')['landing']);
    }
}
