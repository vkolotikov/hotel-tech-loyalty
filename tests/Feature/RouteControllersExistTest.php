<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every routed controller class must actually exist.
 *
 * This is here because it happened. `POST /api/v1/webhooks/ses` was live on
 * production pointing at `SesWebhookController`, a class that ships with the
 * unreleased email work — so the endpoint answered 500 instead of accepting
 * Amazon's bounce and complaint notifications. The route travelled to
 * production in a selective deploy; its controller did not.
 *
 * Nothing caught it. `route:cache` succeeds, because caching only serialises
 * the class *name* and never asks whether it resolves. `route:list` does die,
 * but nobody runs it in CI. The failure surfaces only when a request arrives,
 * which for a webhook means silently losing data from a third party that has
 * no way to tell you it is failing.
 *
 * The check is cheap and total: walk the route table, resolve every
 * controller, and fail loudly on the first one that is missing.
 */
class RouteControllersExistTest extends TestCase
{
    public function test_every_route_points_at_a_class_that_exists(): void
    {
        $missing = [];

        foreach (Route::getRoutes() as $route) {
            $action = $route->getAction('uses');

            // Closure routes have no class to resolve.
            if (!is_string($action) || !str_contains($action, '@')) {
                continue;
            }

            [$class, $method] = explode('@', $action, 2);

            if (!class_exists($class)) {
                $missing[] = sprintf(
                    '%s %s -> %s (class not found)',
                    implode('|', array_diff($route->methods(), ['HEAD'])),
                    $route->uri(),
                    $class,
                );
                continue;
            }

            if (!method_exists($class, $method)) {
                $missing[] = sprintf(
                    '%s %s -> %s::%s (method not found)',
                    implode('|', array_diff($route->methods(), ['HEAD'])),
                    $route->uri(),
                    $class,
                    $method,
                );
            }
        }

        $this->assertSame([], $missing,
            "These routes would 500 on the first request that reached them:\n  "
            . implode("\n  ", $missing));
    }
}
