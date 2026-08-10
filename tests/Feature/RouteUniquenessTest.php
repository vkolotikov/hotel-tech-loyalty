<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * No two routes may claim the same method + URI.
 *
 * Laravel silently keeps the last registration, so a duplicate is not an
 * error — it is a page that quietly stops working. The Segments admin page
 * was dead for exactly this reason: `admin/segments` was registered twice,
 * against two unrelated models, so index/store/show/update/destroy resolved
 * to `campaign_segments` while preview + send still resolved to
 * `member_segments`. Every save 422'd on a field the SPA never sends, and
 * `send` looked up ids from one table in the other.
 *
 * Nothing in the framework would have told us. This test does.
 */
class RouteUniquenessTest extends TestCase
{
    public function test_no_route_uri_is_registered_twice_for_the_same_method(): void
    {
        $seen = [];
        $duplicates = [];

        foreach (Route::getRoutes() as $route) {
            foreach ($route->methods() as $method) {
                if ($method === 'HEAD') {
                    continue; // always mirrors GET
                }

                $key = $method . ' ' . $route->uri();
                $action = $route->getActionName();

                if (isset($seen[$key])) {
                    $duplicates[$key] = sprintf(
                        '%s is registered by both %s and %s',
                        $key,
                        $seen[$key],
                        $action
                    );
                }

                $seen[$key] = $action;
            }
        }

        $this->assertSame(
            [],
            array_values($duplicates),
            "Duplicate route registrations found. Laravel keeps the LAST one, so the\n"
            . "earlier handler is silently unreachable:\n  " . implode("\n  ", $duplicates)
        );
    }
}
