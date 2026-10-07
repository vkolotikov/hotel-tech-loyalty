<?php

namespace Tests\Feature\Security;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every rate limit nested inside a group's limit must have its own counter —
 * the rule WidgetThrottleBucketsTest enforces for the widget, for the whole API.
 *
 * Laravel keys an unnamed throttle on the signed-in user's id (or, for a guest,
 * on domain|ip). The route is not part of the key. So `throttle:5,1` inside the
 * signed-in group's `throttle:240,1` is not a stricter limit on that route: it
 * is a second limiter reading the group's counter with a lower ceiling. The
 * admin SPA spends dozens of requests a minute just being open, so
 * POST /auth/apply-industry answered "Too many requests" on every click
 * (2026-10-07), and billing checkout and the member portal's payments sat
 * behind the same shared counter at 30/min.
 *
 * A third argument prefixes the cache key and gives the route its own bucket.
 * Named limiters (`throttle:portal-coupon`) already key themselves and are
 * left alone.
 */
class NestedThrottleBucketsTest extends TestCase
{
    /**
     * Inner `throttle:max,decay[,prefix]` limiters, per route, outer group limiter excluded.
     *
     * @return list<array{uri:string,inner:list<string>}>
     */
    private function nested(): array
    {
        $out = [];

        foreach (Route::getRoutes() as $route) {
            $throttles = array_values(array_filter(
                $route->gatherMiddleware(),
                fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'),
            ));

            if (count($throttles) < 2) {
                continue;
            }

            // Numeric limiters only: a named limiter has no comma and keys itself.
            $inner = array_values(array_filter(
                array_slice($throttles, 1),
                fn (string $t) => str_contains($t, ','),
            ));

            if ($inner !== []) {
                $out[] = ['uri' => implode('|', $route->methods()) . ' ' . $route->uri(), 'inner' => $inner];
            }
        }

        return $out;
    }

    private static function prefix(string $throttle): string
    {
        return explode(',', substr($throttle, strlen('throttle:')))[2] ?? '';
    }

    public function test_the_industry_switch_has_a_bucket_of_its_own(): void
    {
        $route = collect(Route::getRoutes())->first(fn ($r) => $r->uri() === 'api/v1/auth/apply-industry');

        $this->assertNotNull($route);
        $this->assertContains('throttle:5,1,apply-industry', $route->gatherMiddleware());
    }

    public function test_no_inner_limiter_reads_its_groups_counter(): void
    {
        $shared = [];

        foreach ($this->nested() as $route) {
            foreach ($route['inner'] as $throttle) {
                if (self::prefix($throttle) === '') {
                    $shared[] = "{$route['uri']} ({$throttle})";
                }
            }
        }

        $this->assertSame([], $shared,
            'These inner limiters have no third argument, so they count the whole session\'s requests '
            . 'instead of their own route\'s.');
    }

    public function test_distinct_endpoints_do_not_reuse_each_others_prefix(): void
    {
        $seen = [];

        foreach ($this->nested() as $route) {
            $path = substr($route['uri'], strpos($route['uri'], ' ') + 1);

            foreach ($route['inner'] as $throttle) {
                $prefix = self::prefix($throttle);
                if ($prefix === '') {
                    continue;
                }

                $this->assertTrue(!isset($seen[$prefix]) || $seen[$prefix] === $path,
                    "Throttle prefix '{$prefix}' is used by both {$path} and " . ($seen[$prefix] ?? '?') . '.');

                $seen[$prefix] = $path;
            }
        }

        $this->assertNotEmpty($seen);
    }
}
