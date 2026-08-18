<?php

namespace Tests\Feature\Widget;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every rate limit on the public widget must have its own counter.
 *
 * Laravel resolves an unnamed throttle key for a guest as sha1(domain|ip). The
 * route is not part of it. So nesting `throttle:5,1` inside `throttle:200,1`
 * does not create a stricter limit on the inner route — it creates a SECOND
 * limiter reading the SAME counter with a lower ceiling.
 *
 * The consequence was backwards from the intent. A visitor holding an ordinary
 * conversation spent the shared counter on /message and /poll within seconds,
 * so /lead and /rate — nominally 5/min — answered 429 during normal use, while
 * no endpoint actually had the specific ceiling its numbers advertised.
 *
 * A third argument prefixes the cache key. This test asserts on route
 * definitions rather than by hammering endpoints because the defect lives in
 * the configuration, and because a behavioural test would need the limiter's
 * real cache store to be meaningful.
 */
class WidgetThrottleBucketsTest extends TestCase
{
    /**
     * @return list<array{uri:string,throttles:list<string>}>
     */
    private function widgetRoutes(): array
    {
        $out = [];

        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (!str_starts_with($uri, 'api/v1/widget/')) {
                continue;
            }

            $throttles = array_values(array_filter(
                $route->gatherMiddleware(),
                fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'),
            ));

            $out[] = ['uri' => $uri, 'throttles' => $throttles];
        }

        return $out;
    }

    public function test_the_widget_surface_is_actually_rate_limited(): void
    {
        $routes = $this->widgetRoutes();

        $this->assertNotEmpty($routes, 'Expected public widget routes under api/v1/widget/.');

        foreach ($routes as $route) {
            $this->assertNotEmpty($route['throttles'],
                "{$route['uri']} is public and unauthenticated but carries no throttle.");
        }
    }

    public function test_nested_throttles_never_share_a_bucket(): void
    {
        foreach ($this->widgetRoutes() as $route) {
            if (count($route['throttles']) < 2) {
                continue; // only the outer group limiter — nothing to collide with
            }

            $prefixes = array_map(function (string $throttle) {
                $parts = explode(',', substr($throttle, strlen('throttle:')));
                // throttle:max,decay[,prefix] — an absent third part is the
                // shared-bucket case this test exists to catch.
                return $parts[2] ?? '';
            }, $route['throttles']);

            $named = array_filter($prefixes, fn ($p) => $p !== '');

            $this->assertCount(count($prefixes) - 1, $named,
                "{$route['uri']} nests " . count($prefixes) . ' throttles; all but the outer group limiter '
                . 'must carry a distinct third argument, otherwise they share one counter keyed on domain+IP. '
                . 'Found: ' . implode(' ', $route['throttles']));

            $this->assertSame(count($named), count(array_unique($named)),
                "{$route['uri']} reuses a throttle prefix, which puts two limiters back on one counter.");
        }
    }

    public function test_distinct_endpoints_do_not_reuse_each_others_prefix(): void
    {
        // Two different endpoints sharing a prefix is the same defect one level
        // up: /lead and /rate both at 5/min would drain a single budget.
        $seen = [];

        foreach ($this->widgetRoutes() as $route) {
            foreach ($route['throttles'] as $throttle) {
                $parts  = explode(',', substr($throttle, strlen('throttle:')));
                $prefix = $parts[2] ?? '';
                if ($prefix === '') {
                    continue;
                }

                $this->assertArrayNotHasKey($prefix, $seen,
                    "Throttle prefix '{$prefix}' is used by both {$route['uri']} and " . ($seen[$prefix] ?? '?') . '.');

                $seen[$prefix] = $route['uri'];
            }
        }

        $this->assertNotEmpty($seen, 'Expected at least one named throttle on the widget surface.');
    }
}
