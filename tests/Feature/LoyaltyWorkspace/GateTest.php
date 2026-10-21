<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Who reaches HexaTech Loyalty at all (spec 2026-10-21 §6.3, §6.4). */
class GateTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_every_loyalty_route_carries_the_gate(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/loyalty/'));

        $this->assertGreaterThan(25, $routes->count());
        foreach ($routes as $route) {
            $this->assertContains('workspace:loyalty', $route->gatherMiddleware(), "{$route->uri()} is reachable without the workspace flag");
        }
    }

    public function test_every_organisation_has_it_until_switched_off_and_then_the_next_call_is_refused(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk();
        $this->org->setWorkspace('loyalty', false);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
        $this->asStaffMember()->getJson($this->api('members'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_an_appointments_only_organisation_is_refused(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->asManager()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_an_anonymous_caller_and_a_member_never_reach_it(): void
    {
        $member = User::create(['organization_id' => $this->org->id, 'name' => 'Member', 'email' => 'member-' . uniqid() . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member']);

        $this->getJson($this->api('bootstrap'))->assertStatus(401);
        $this->actingAs($member, 'sanctum')->getJson($this->api('bootstrap'))->assertStatus(403);
    }
}
