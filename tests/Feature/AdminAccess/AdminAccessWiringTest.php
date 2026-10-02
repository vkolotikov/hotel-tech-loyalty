<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessMap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AdminAccessWiringTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private const OUTSIDE = [
        'api/v1/auth/billing/checkout', 'api/v1/auth/billing/activate', 'api/v1/auth/billing/portal',
        'api/v1/auth/billing/refresh', 'api/v1/auth/billing/start-trial', 'api/v1/auth/apply-industry',
        'api/v1/integrations/leads', 'mcp',
    ];

    /** @return Collection<int, RoutingRoute> */
    private function routes(): Collection
    {
        return collect(Route::getRoutes()->getRoutes());
    }

    public function test_every_admin_route_runs_the_map_between_admin_and_the_subscription_check(): void
    {
        $admin = $this->routes()->filter(fn (RoutingRoute $r) => str_starts_with($r->uri(), 'api/v1/admin/'));
        $this->assertGreaterThan(600, $admin->count());

        foreach ($admin as $route) {
            $middleware = $route->gatherMiddleware();
            $at = array_search('admin.access', $middleware, true);
            $this->assertNotFalse($at, "{$route->uri()} does not run admin.access");
            $this->assertGreaterThan(array_search('admin', $middleware, true), $at, "{$route->uri()}: admin.access runs before admin");
            $subscription = array_search('check.subscription', $middleware, true);
            if ($subscription !== false) {
                $this->assertLessThan($subscription, $at, "{$route->uri()}: admin.access runs after check.subscription");
            }
        }
    }

    public function test_the_staff_routes_outside_admin_run_it_and_the_callers_own_routes_do_not(): void
    {
        foreach (self::OUTSIDE as $uri) {
            $route = $this->routes()->first(fn (RoutingRoute $r) => $r->uri() === $uri && in_array('POST', $r->methods(), true));
            $this->assertNotNull($route, $uri);
            $this->assertContains('admin.access', $route->gatherMiddleware(), $uri);
        }

        foreach (['api/v1/auth/me', 'api/v1/auth/subscription', 'api/v1/auth/logout', 'api/v1/auth/push-token', 'api/v1/chatbot/message', 'api/v1/member/profile'] as $uri) {
            foreach ($this->routes()->filter(fn (RoutingRoute $r) => $r->uri() === $uri) as $route) {
                $this->assertNotContains('admin.access', $route->gatherMiddleware(), $uri);
            }
        }
    }

    public function test_every_route_that_runs_it_has_a_key(): void
    {
        $unmapped = $this->routes()
            ->filter(fn (RoutingRoute $r) => in_array('admin.access', $r->gatherMiddleware(), true))
            ->filter(fn (RoutingRoute $r) => AccessMap::keyFor($r) === null)
            ->map(fn (RoutingRoute $r) => $r->uri())->values()->all();

        $this->assertSame([], $unmapped);
    }

    public function test_in_report_mode_a_full_customer_works_as_before_and_is_recorded(): void
    {
        $this->setUpAppointments();
        config(['admin_access.mode' => 'report']);
        $receptionist = $this->staffUser($this->org, ['role' => 'receptionist']);

        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();
        $answer = $this->actingAs($receptionist, 'sanctum')->getJson('/api/v1/admin/audit-logs');

        $this->assertNotContains($answer->json('error'), ['not_allowed', 'staff_inactive', 'not_in_plan']);
        $this->assertSame(1, DB::table('admin_access_refusals')->where('rule', 'admin/audit-logs')->where('enforced', false)->count());
    }

    public function test_enforced_a_receptionist_is_refused_before_the_controller(): void
    {
        $this->setUpAppointments();
        config(['admin_access.mode' => 'enforce']);
        $receptionist = $this->staffUser($this->org, ['role' => 'receptionist']);

        $this->actingAs($receptionist, 'sanctum')->getJson('/api/v1/admin/audit-logs')
            ->assertStatus(403)
            ->assertExactJson(['error' => 'not_allowed', 'message' => 'Only an owner or a manager can do this.']);
        $this->actingAs($receptionist, 'sanctum')->getJson($this->api('bootstrap'))->assertOk();
    }

    public function test_an_appointments_only_organisation_reaches_the_workspace_and_nothing_else(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();
        $this->asStaff()->getJson('/api/v1/admin/members')->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
        $this->asStaff()->postJson('/api/v1/auth/billing/checkout', [])->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_a_lapsed_appointments_only_workspace_still_gets_its_own_notice(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking'], 'subscription_status' => 'EXPIRED'])->save();

        $this->asStaff()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'subscription_required');
    }
}
