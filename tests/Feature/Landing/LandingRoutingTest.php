<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Routing on the dedicated landing host.
 *
 * `test_a_published_page_renders` deliberately lives in Task 8: it needs the
 * Blade template, which does not exist yet. Everything here asserts routing,
 * 404 behaviour and the absence of the admin SPA — none of which reach a view.
 */
class LandingRoutingTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    /**
     * The SPA shell goes out as a BinaryFileResponse, whose getContent() is
     * `false`. Asserting "shell absent" against that string would pass even
     * while the shell was being served, so read the body the way the client
     * would.
     */
    private function body(\Illuminate\Testing\TestResponse $res): string
    {
        $base = $res->baseResponse;

        if ($base instanceof \Symfony\Component\HttpFoundation\BinaryFileResponse
            || $base instanceof \Symfony\Component\HttpFoundation\StreamedResponse) {
            return (string) $res->streamedContent();
        }

        return (string) $res->getContent();
    }

    private function make(string $slug, string $status): LandingPage
    {
        return LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
        ]);
    }

    /**
     * The SPA catch-all in routes/web.php matches every path on every host and
     * is registered from a route file of its own, so "does the landing route
     * even get a look in?" is a real question with a real wrong answer. Match
     * the route rather than request it: the template is Task 8's.
     */
    public function test_a_slug_on_the_landing_host_reaches_the_landing_controller(): void
    {
        $route = app('router')->getRoutes()->match(
            Request::create('http://' . $this->host() . '/glamour-salon')
        );

        $this->assertSame('landing.show', $route->getName(),
            'The landing host matched some other route before landing.show.');
    }

    /** No session cookie is possible if the `web` group never runs. */
    public function test_the_landing_routes_do_not_run_the_web_middleware_group(): void
    {
        $route = app('router')->getRoutes()->match(
            Request::create('http://' . $this->host() . '/glamour-salon')
        );

        // gatherRouteMiddleware resolves group names to classes; the route's
        // own gatherMiddleware() would just say "web" and the assertion would
        // pass whether or not the group ran.
        $this->assertNotContains(
            \Illuminate\Session\Middleware\StartSession::class,
            app('router')->gatherRouteMiddleware($route),
            'The landing host starts a session.'
        );
    }

    public function test_a_draft_is_not_reachable_publicly(): void
    {
        // Publishing work in progress by accident is the failure here.
        $this->make('not-ready', 'draft');

        $this->get('http://' . $this->host() . '/not-ready')->assertNotFound();
    }

    public function test_an_unknown_slug_is_a_404_not_an_error(): void
    {
        $this->get('http://' . $this->host() . '/nobody')->assertNotFound();
    }

    public function test_the_admin_spa_is_not_served_on_the_landing_host(): void
    {
        // This is the entire security control. If the SPA renders here, the
        // admin's non-expiring localStorage token becomes same-origin with
        // customer-supplied content.
        $body = $this->body($this->get('http://' . $this->host() . '/login'));

        $this->assertStringNotContainsString('id="root"', $body,
            'The admin SPA shell is being served on the landing host.');
    }

    /**
     * A nested path is not a landing slug, so it falls through to the SPA
     * catch-all — which is exactly the route that must refuse to answer here.
     */
    public function test_a_nested_path_on_the_landing_host_is_not_the_admin_spa(): void
    {
        $res = $this->get('http://' . $this->host() . '/admin/settings/profile');

        $res->assertNotFound();
        $this->assertStringNotContainsString('id="root"', $this->body($res),
            'The admin SPA shell is being served on the landing host.');
    }

    /** The `/` route in routes/web.php serves the same shell as the catch-all. */
    public function test_the_root_of_the_landing_host_is_not_the_admin_spa(): void
    {
        $res = $this->get('http://' . $this->host() . '/');

        $res->assertNotFound();
        $this->assertStringNotContainsString('id="root"', $this->body($res),
            'The admin SPA shell is being served on the landing host.');
    }

    /** The admin host is untouched: the SPA still answers there. */
    public function test_the_admin_host_still_serves_the_spa(): void
    {
        $body = $this->body($this->get('http://' . parse_url(config('app.url'), PHP_URL_HOST) . '/login'));

        $this->assertStringContainsString('id="root"', $body,
            'The admin SPA stopped being served on its own host.');
    }

    /**
     * Note what this does and does not prove. `api/v1/admin/me` does not exist
     * on any host, so the 404 is not evidence that the API is scoped away from
     * the landing host — it is not. `api/v1/auth/me` does exist and answers
     * here with a 401. That is currently harmless: routes/api.php never runs
     * the `web` group and Sanctum is not configured statefully, so the landing
     * origin holds no credential an XSS could spend. Scoping /api to the admin
     * host is worth doing, but it is a change to routes/api.php, not to this
     * feature.
     */
    public function test_the_landing_host_does_not_serve_the_api(): void
    {
        $this->get('http://' . $this->host() . '/api/v1/admin/me')->assertNotFound();

        $authenticated = $this->getJson('http://' . $this->host() . '/api/v1/auth/me');

        $this->assertNotSame(200, $authenticated->getStatusCode(),
            'The landing host served an authenticated admin API response.');
    }
}
