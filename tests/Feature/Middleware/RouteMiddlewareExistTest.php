<?php

namespace Tests\Feature\Middleware;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RouteMiddlewareExistTest extends TestCase
{
    public function test_every_route_middleware_alias_resolves_to_an_existing_handler(): void
    {
        $missing = [];

        foreach (Route::getRoutes() as $route) {
            foreach (app('router')->gatherRouteMiddleware($route) as $middleware) {
                if (! is_string($middleware)) {
                    continue;
                }

                $class = explode(':', $middleware, 2)[0];
                if (! class_exists($class) || ! method_exists($class, 'handle')) {
                    $missing[] = $route->uri().' -> '.$middleware;
                }
            }
        }

        // A missing alias can fail twice: once in the request pipeline, then
        // during kernel termination after the error response was already sent.
        $this->assertSame([], array_values(array_unique($missing)),
            'Every routed middleware must ship with its alias and handler.');
    }
}
