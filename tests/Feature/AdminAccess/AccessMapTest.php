<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\RequireStaffCapability;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AccessMapTest extends TestCase
{
    /** The route production would dispatch this request to. */
    private function route(string $method, string $uri): RoutingRoute
    {
        return Route::getRoutes()->match(Request::create('/' . $uri, $method));
    }

    /** @return Collection<int, RoutingRoute> */
    private function routes(): Collection
    {
        return collect(Route::getRoutes()->getRoutes());
    }

    public function test_an_area_reads_for_staff_and_changes_for_managers(): void
    {
        $rule = AccessMap::ruleFor($this->route('PUT', 'api/v1/admin/services/5'));

        $this->assertSame(['admin/services', 'staff', 'manager', 'booking'], [$rule->key, $rule->read, $rule->change, $rule->product]);
        $this->assertSame('staff', $rule->forMethod('GET'));
        $this->assertSame('staff', $rule->forMethod('head'));
        $this->assertSame('manager', $rule->forMethod('PUT'));
        $this->assertSame('manager', $rule->forMethod('DELETE'));
    }

    public function test_the_longest_key_wins(): void
    {
        $this->assertSame('admin/bookings', AccessMap::ruleFor($this->route('GET', 'api/v1/admin/bookings'))->key);

        $submissions = AccessMap::ruleFor($this->route('GET', 'api/v1/admin/bookings/submissions'));
        $this->assertSame(['admin/bookings/submissions', 'manager'], [$submissions->key, $submissions->read]);

        $send = AccessMap::ruleFor($this->route('POST', 'api/v1/admin/email-templates/7/send'));
        $this->assertSame(['admin/email-templates/{template}/send', 'staff'], [$send->key, $send->change]);
        $this->assertSame('manager', AccessMap::ruleFor($this->route('PUT', 'api/v1/admin/email-templates/7'))->change);

        $this->assertSame('staff', AccessMap::ruleFor($this->route('POST', 'api/v1/admin/reviews/invitations'))->change);
        $this->assertSame('manager', AccessMap::ruleFor($this->route('POST', 'api/v1/admin/reviews/forms'))->change);
    }

    public function test_the_staff_routes_outside_admin_have_keys(): void
    {
        $checkout = AccessMap::ruleFor($this->route('POST', 'api/v1/auth/billing/checkout'));
        $this->assertSame(['auth/billing', 'manager', 'admin'], [$checkout->key, $checkout->change, $checkout->product]);
        $this->assertSame('auth/apply-industry', AccessMap::ruleFor($this->route('POST', 'api/v1/auth/apply-industry'))->key);
        $leads = AccessMap::ruleFor($this->route('POST', 'api/v1/integrations/leads'));
        $this->assertSame(['integrations/leads', 'staff', 'crm'], [$leads->key, $leads->change, $leads->product]);
        $this->assertSame('mcp', AccessMap::ruleFor($this->route('POST', 'mcp'))->key);
    }

    public function test_the_theme_and_the_callers_own_account_are_in_every_plan(): void
    {
        foreach (['GET api/v1/admin/branding/theme', 'GET api/v1/admin/me/preferences', 'PUT api/v1/admin/me/preferences', 'POST api/v1/admin/push-token'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertContains(AccessMap::ruleFor($this->route($method, $uri))->product, AccessMap::PLAN_PRODUCTS, $call);
        }
        $this->assertSame('appointments', AccessMap::ruleFor($this->route('GET', 'api/v1/admin/appointments/bootstrap'))->product);
        $this->assertNotContains(AccessMap::ruleFor($this->route('GET', 'api/v1/admin/members'))->product, AccessMap::PLAN_PRODUCTS);
    }

    public function test_a_route_no_key_matches_is_manager_only_and_named(): void
    {
        // Keys match whole segments: admin/team is not admin/teamwork.
        $rule = AccessMap::ruleFor(new RoutingRoute(['GET'], 'api/v1/admin/teamwork', fn () => null));

        $this->assertSame(['unmapped:admin/teamwork', 'manager', 'manager', 'admin'], [$rule->key, $rule->read, $rule->change, $rule->product]);
        $this->assertNull(AccessMap::keyFor(new RoutingRoute(['GET'], 'api/v1/admin/teamwork', fn () => null)));
    }

    public function test_every_admin_route_has_a_key_and_every_key_a_route(): void
    {
        $admin = $this->routes()->filter(fn (RoutingRoute $r) => str_starts_with($r->uri(), 'api/v1/admin/'));
        $this->assertGreaterThan(600, $admin->count());

        $unmapped = $admin->filter(fn (RoutingRoute $r) => AccessMap::keyFor($r) === null)->map(fn (RoutingRoute $r) => $r->uri())->values()->all();
        $this->assertSame([], $unmapped, 'Every admin route needs an AccessMap key.');

        $used = $this->routes()->map(fn (RoutingRoute $r) => AccessMap::keyFor($r))->filter()->unique()->values()->all();
        $this->assertSame([], array_values(array_diff(array_keys(AccessMap::MAP), $used)), 'A key no route uses.');
    }

    public function test_every_rule_is_a_role_or_a_known_capability_and_every_product_is_known(): void
    {
        $rules = array_merge(['staff', 'manager'], RequireStaffCapability::CAPABILITIES);

        foreach (AccessMap::MAP as $key => [$read, $change, $product]) {
            $this->assertContains($read, $rules, $key);
            $this->assertContains($change, $rules, $key);
            $this->assertContains($product, AccessMap::PRODUCTS, $key);
        }
    }
}
