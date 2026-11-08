<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** Who reaches HexaTech CRM's own endpoints at all (2026-11-07). */
class GateTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    public function test_every_crm_route_carries_the_gate(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/crm/'));

        $this->assertGreaterThanOrEqual(5, $routes->count());
        foreach ($routes as $route) {
            $this->assertContains('workspace:crm', $route->gatherMiddleware(), "{$route->uri()} is reachable without the workspace flag");
        }
    }

    public function test_every_organisation_has_it_until_switched_off_and_then_the_next_call_is_refused(): void
    {
        $this->asStaffMember()->getJson($this->crmApi('bootstrap'))->assertOk();
        $this->org->setWorkspace('crm', false);

        $this->asStaffMember()->getJson($this->crmApi('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
        $this->asStaffMember()->getJson($this->crmApi('today'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_an_organisation_on_another_module_is_refused_and_on_crm_admitted(): void
    {
        $this->org->forceFill(['entitled_products' => ['loyalty']])->save();
        $this->asManager()->getJson($this->crmApi('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');

        $this->org->forceFill(['entitled_products' => ['crm_chat']])->save();
        $this->asManager()->getJson($this->crmApi('bootstrap'))->assertOk()->assertJsonPath('name', 'HexaTech CRM');
    }

    public function test_an_anonymous_caller_and_a_member_never_reach_it(): void
    {
        $member = User::create(['organization_id' => $this->org->id, 'name' => 'Member', 'email' => 'member-' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member']);

        $this->getJson($this->crmApi('bootstrap'))->assertStatus(401);
        $this->actingAs($member, 'sanctum')->getJson($this->crmApi('bootstrap'))->assertStatus(403);
    }
}
