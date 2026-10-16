<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerStrategy;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class ContentGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_every_content_route_carries_the_gate_and_the_brand(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/content/'));

        $this->assertNotEmpty($routes);
        foreach ($routes as $route) {
            $middleware = $route->gatherMiddleware();
            $this->assertContains('workspace:content', $middleware, "{$route->uri()} is reachable without the workspace flag");
            $this->assertContains('content.brand', $middleware, "{$route->uri()} runs without a pinned brand");
        }
    }

    public function test_an_organisation_switched_off_is_refused_and_the_next_call_after_switching_off_too(): void
    {
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk();
        $this->org->setWorkspace('content', false);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
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

    public function test_staff_are_refused_every_manager_action(): void
    {
        $strategy = ContentPlannerStrategy::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'title' => 'Plan', 'status' => 'active']);
        $audience = ContentPlannerAudience::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Locals', 'active' => true]);
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->firstOrFail();

        $managerOnly = [
            ['POST', 'generate'],
            ['POST', 'strategies'], ['POST', "strategies/{$strategy->id}/activate"], ['POST', "strategies/{$strategy->id}/archive"],
            ['PUT', 'brand/profile'], ['PUT', 'brand/voice'],
            ['POST', 'brand/audiences'], ['PUT', "brand/audiences/{$audience->id}"], ['DELETE', "brand/audiences/{$audience->id}"],
            ['POST', 'brand/channels'], ['PUT', "brand/channels/{$channel->id}"], ['DELETE', "brand/channels/{$channel->id}"],
            ['POST', 'brand/quick-setup'], ['POST', 'brand/setup'], ['POST', 'brand/refresh-knowledge'],
            ['POST', 'brand/snippets'], ['PUT', 'brand/snippets/1'], ['DELETE', 'brand/snippets/1'], ['POST', 'brand/snippets/suggest'],
        ];
        foreach ($managerOnly as [$method, $path]) {
            $this->asStaffMember()->json($method, $this->api($path))
                ->assertStatus(403)
                ->assertJsonPath('error', 'manager_only');
        }
        $this->assertSame('active', $strategy->fresh()->status);
        $this->assertNotNull($audience->fresh());
        $this->assertNotNull($channel->fresh());
    }

    public function test_the_old_content_planner_api_is_gone(): void
    {
        $this->asManager()->getJson('/api/v1/admin/content-planner/profile')->assertNotFound();
        $this->asManager()->postJson('/api/v1/admin/content-planner/calendar/generate', [])->assertNotFound();
        $this->assertArrayNotHasKey('admin/content-planner', \App\Support\AdminAccess\AccessMap::MAP);
    }
}
