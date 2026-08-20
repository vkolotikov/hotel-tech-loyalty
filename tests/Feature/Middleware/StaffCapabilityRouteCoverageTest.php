<?php

namespace Tests\Feature\Middleware;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The capability flags must actually be attached to routes.
 *
 * RequireStaffCapability works — it has its own unit test. The recurring
 * defect is different and cheaper to make: the flag is stored on the staff
 * row, edited in the team UI, returned to the client and rendered as if it
 * means something, while no route ever asks the middleware to check it.
 * can_manage_offers was like that. So was can_view_analytics: a receptionist
 * with the flag switched off could call every analytics endpoint directly and
 * read revenue, cohort and at-risk-member data.
 *
 * A middleware nobody applies is indistinguishable from no middleware, so
 * these tests assert the wiring rather than the mechanism.
 */
class StaffCapabilityRouteCoverageTest extends TestCase
{
    /** @return list<array{uri:string,methods:array,caps:array}> */
    private function adminRoutes(string $prefix): array
    {
        $out = [];

        foreach (Route::getRoutes() as $route) {
            if (!str_starts_with($route->uri(), $prefix)) {
                continue;
            }

            $caps = array_values(array_filter(
                $route->gatherMiddleware(),
                fn ($m) => is_string($m) && str_starts_with($m, 'staff.can:'),
            ));

            $out[] = [
                'uri'     => $route->uri(),
                'methods' => array_values(array_diff($route->methods(), ['HEAD'])),
                'caps'    => $caps,
            ];
        }

        return $out;
    }

    public function test_every_analytics_endpoint_requires_the_analytics_capability(): void
    {
        $routes = $this->adminRoutes('api/v1/admin/analytics/');

        $this->assertNotEmpty($routes, 'Expected analytics routes to exist.');

        foreach ($routes as $r) {
            $this->assertContains('staff.can:can_view_analytics', $r['caps'],
                "{$r['uri']} is readable by any authenticated staff member, including one whose "
                . 'can_view_analytics flag is switched off in the team screen.');
        }
    }

    public function test_the_analytics_export_is_gated_too(): void
    {
        // The export is the one that leaves the building, so it must not be
        // the endpoint someone forgot.
        $export = collect($this->adminRoutes('api/v1/admin/analytics/'))
            ->firstWhere('uri', 'api/v1/admin/analytics/export');

        $this->assertNotNull($export);
        $this->assertContains('staff.can:can_view_analytics', $export['caps']);
    }

    public function test_changing_the_rewards_catalogue_requires_offer_management(): void
    {
        // Any authenticated staff member could create, edit or delete rewards —
        // a receptionist could empty the catalogue.
        foreach ($this->adminRoutes('api/v1/admin/rewards') as $r) {
            $writes = array_intersect($r['methods'], ['POST', 'PUT', 'PATCH', 'DELETE']);

            if ($writes === [] || str_contains($r['uri'], 'redemptions')) {
                continue;
            }

            $this->assertContains('staff.can:can_manage_offers', $r['caps'],
                "{$r['uri']} (" . implode('/', $writes) . ') changes the rewards catalogue without a capability check.');
        }
    }

    public function test_fulfilling_a_redemption_requires_the_redeem_capability(): void
    {
        // Handing the reward over is the counter action, so it hangs off
        // can_redeem_points rather than offer management.
        foreach (['fulfill', 'cancel'] as $action) {
            $route = collect($this->adminRoutes('api/v1/admin/rewards'))
                ->first(fn ($r) => str_contains($r['uri'], "redemptions/{id}/{$action}"));

            $this->assertNotNull($route, "Expected a rewards redemption {$action} route.");
            $this->assertContains('staff.can:can_redeem_points', $route['caps']);
        }
    }

    public function test_reading_the_catalogue_stays_open(): void
    {
        // Deliberately ungated: helping a member at the counter means being
        // able to see what is on offer and what they redeemed. Gating reads
        // would push staff to share an owner login, which is worse.
        $list = collect($this->adminRoutes('api/v1/admin/rewards'))
            ->first(fn ($r) => $r['uri'] === 'api/v1/admin/rewards' && in_array('GET', $r['methods'], true));

        $this->assertNotNull($list);
        $this->assertSame([], $list['caps'],
            'Reading the rewards catalogue should not require a capability.');
    }
}
