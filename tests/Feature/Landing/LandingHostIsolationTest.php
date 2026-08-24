<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The landing host must serve landing pages and nothing else.
 *
 * Host separation only buys anything if the *whole* application is absent
 * from that origin. It was not: /api answered there, so an admin who loaded
 * the SPA on the landing host could POST /api/v1/auth/login and have the
 * bundle write a non-expiring, all-abilities token into localStorage on the
 * landing origin — the exact state this feature exists to prevent.
 *
 * What these tests cannot see: public/spa/** is a tree of deployed static
 * files, and the front controller serves existing files before PHP is reached
 * (public/.htaccess RewriteCond !-f, nginx try_files). Those requests never
 * enter the kernel, so no HTTP-level test here can observe them. The admin
 * shell used to be one of those files and answered 200 on this host; it now
 * lives outside the docroot. AdminShellIsNotStaticallyServableTest checks the
 * shipped file layout instead of the kernel, which is the only place that
 * property is observable.
 */
class LandingHostIsolationTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // The two "a live page still answers" tests below render a page, and
        // rendering reads services, staff, reviews, hours and contact.
        $this->setUpLandingContentSchema();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    private function adminHost(): string
    {
        return parse_url(config('app.url'), PHP_URL_HOST);
    }

    /**
     * The head of the chain. With no login endpoint on this origin no token
     * can be minted here, so localStorage on the landing origin stays empty
     * whatever else goes wrong.
     */
    public function test_the_login_endpoint_does_not_answer_on_the_landing_host(): void
    {
        $res = $this->postJson('http://' . $this->host() . '/api/v1/auth/login', [
            'email' => 'someone@example.com', 'password' => 'secret',
        ]);

        $this->assertSame(404, $res->getStatusCode(),
            'The login endpoint answered on the landing host; a full-privilege token can be minted into that origin.');
    }

    public function test_the_login_endpoint_still_answers_on_the_admin_host(): void
    {
        // The guard must not have been bought at the cost of the admin.
        $res = $this->postJson('http://' . $this->adminHost() . '/api/v1/auth/login', []);

        $this->assertNotSame(404, $res->getStatusCode(),
            'Login stopped answering on the admin host.');
    }

    /** @dataProvider blockedApiPaths */
    public function test_no_admin_api_answers_on_the_landing_host(string $path): void
    {
        $this->getJson('http://' . $this->host() . $path)->assertNotFound();
    }

    public static function blockedApiPaths(): array
    {
        // Every one of these is a real registered route, verified against the
        // route collection. A path that does not exist anywhere would 404 on
        // the landing host for the wrong reason and prove nothing.
        return [
            'auth session'  => ['/api/v1/auth/me'],
            'billing'       => ['/api/v1/auth/subscription'],
            'admin brands'  => ['/api/v1/admin/brands'],
            'admin setup'   => ['/api/v1/admin/setup/status'],
            'member'        => ['/api/v1/member/profile'],
        ];
    }

    /**
     * Widgets embedded on a landing page are same-origin by necessity: the
     * CSP is `default-src 'self'`, so a template cannot frame or script the
     * admin host. Blocking these would break the pages this feature ships.
     */
    public function test_widget_endpoints_still_answer_on_the_landing_host(): void
    {
        $res = $this->getJson('http://' . $this->host() . '/api/v1/widget/no-such-key/config');

        // The controller's own "not found" payload, not the guard's 404 page:
        // proves the request reached the route rather than being turned away.
        $res->assertJsonPath('error', 'Widget not found or inactive');
    }

    /**
     * The bare landing-host root is the URL a human is most likely to type.
     * It fell through to the SPA catch-all, which is inside the `web` group,
     * so StartSession ran before the route closure could refuse — a public
     * marketing origin setting a session cookie before any consent.
     */
    public function test_the_landing_host_sets_no_cookies_on_paths_it_does_not_own(): void
    {
        foreach (['/', '/admin/settings/profile', '/api/v1/auth/me'] as $path) {
            $res = $this->get('http://' . $this->host() . $path);

            $names = array_map(fn ($cookie) => $cookie->getName(), $res->headers->getCookies());

            $this->assertSame([], $names,
                "The landing host set cookies on {$path}.");
        }
    }

    /**
     * bootstrap/app.php trusts every proxy, and Laravel honours
     * X-Forwarded-Host by default, so $request->getHost() is a value the
     * client sets. A victim's browser will not send it, but the wall must
     * not rest on it.
     */
    public function test_a_forged_forwarded_host_cannot_move_a_request_off_the_landing_host(): void
    {
        $res = $this->withHeaders(['X-Forwarded-Host' => $this->adminHost()])
            ->get('http://' . $this->host() . '/login');

        $res->assertNotFound();
        $this->assertStringNotContainsString('id="root"', $this->bodyOf($res),
            'A forged X-Forwarded-Host served the admin SPA on the landing host.');
    }

    /**
     * The other side of the forgery, and the one the two tests around it
     * cannot see. Commenting out pinHost() entirely leaves them both green:
     * the guard still recognises the landing host (it reads HTTP_HOST as well
     * as getHost()), so a refused path is still refused, and an admitted one
     * still meets the SPA catch-all's own abort_if. Nothing goes wrong from a
     * security standpoint — which is exactly why nothing failed.
     *
     * What goes wrong is availability, and it is total. Route::domain() matches
     * on getHost(), which honours X-Forwarded-Host once TrustProxies has run
     * (bootstrap/app.php trusts every proxy). A request whose own Host header
     * names the landing host but which also carries a forwarded header naming
     * the admin host would therefore be admitted by the guard and then miss
     * landing.show at the router — every published page 404s for anyone whose
     * client, extension or intermediary adds that header. pinHost() drops the
     * forwarded value in precisely that case, so the router is asked the same
     * question the guard was.
     */
    public function test_a_forged_forwarded_host_cannot_take_a_live_page_off_the_air(): void
    {
        LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'glamour-salon',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'The Art of Wellness']],
        ])->sections()->create(['key' => 'hero', 'enabled' => true, 'sort' => 0]);

        $res = $this->withHeaders(['X-Forwarded-Host' => $this->adminHost()])
            ->get('http://' . $this->host() . '/glamour-salon');

        $res->assertOk();

        $body = $this->bodyOf($res);

        $this->assertStringContainsString('The Art of Wellness', $body,
            'A forged X-Forwarded-Host took a published landing page off the air.');
        $this->assertStringNotContainsString('id="root"', $body,
            'A forged X-Forwarded-Host served the admin SPA on the landing host.');
    }

    public function test_a_forged_forwarded_host_cannot_reach_the_api_on_the_landing_host(): void
    {
        $res = $this->withHeaders(['X-Forwarded-Host' => $this->adminHost()])
            ->postJson('http://' . $this->host() . '/api/v1/auth/login', []);

        $this->assertSame(404, $res->getStatusCode(),
            'A forged X-Forwarded-Host reached the login endpoint on the landing host.');
    }

    /**
     * The mirror image of the forgery case. Where a load balancer rewrites
     * Host and puts the real one in X-Forwarded-Host, the forwarded header is
     * the *only* signal naming the landing host — and this middleware is
     * prepended, so it runs before TrustProxies and getHost() cannot be
     * relied on to have picked it up. Trusted proxies are cleared here to pin
     * that ordering down; leaving it to chance would make the assertion pass
     * for the wrong reason.
     */
    public function test_the_guard_sees_its_host_when_only_the_forwarded_header_names_it(): void
    {
        $request = \Illuminate\Http\Request::create('http://internal-load-balancer.invalid/api/v1/auth/login');
        $request->headers->set('X-Forwarded-Host', $this->host());

        $trusted = \Illuminate\Http\Request::getTrustedProxies();
        \Illuminate\Http\Request::setTrustedProxies([], \Illuminate\Http\Request::HEADER_X_FORWARDED_FOR);

        try {
            $this->assertNotSame($this->host(), $request->getHost(),
                'getHost() already resolved the forwarded host; this test is not pinning what it claims to.');

            $this->assertTrue(
                \App\Http\Middleware\LandingHostGuard::addressesLandingHost($request),
                'The guard is blind to its own host behind a Host-rewriting proxy.'
            );
        } finally {
            \Illuminate\Http\Request::setTrustedProxies($trusted, \Illuminate\Http\Request::HEADER_X_FORWARDED_FOR
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_HOST
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_PORT
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO
                | \Illuminate\Http\Request::HEADER_X_FORWARDED_PREFIX);
        }
    }

    /**
     * Request::path() collapses leading slashes, but Laravel's UriValidator
     * matches on rtrim(getPathInfo(), '/'), which does not. So `//login`
     * looked like the slug `login` to the guard and like nothing at all to the
     * router: it missed landing.show, fell to the SPA catch-all inside the
     * `web` group, and StartSession queued cookies before the closure's
     * abort_if could refuse. The guard has to be asked the same question the
     * router is asked.
     *
     * @dataProvider nonCanonicalPaths
     */
    public function test_a_non_canonical_path_is_refused_like_any_other(string $path): void
    {
        $res = $this->get('http://' . $this->host() . $path);

        $res->assertNotFound();

        $names = array_map(fn ($cookie) => $cookie->getName(), $res->headers->getCookies());
        $this->assertSame([], $names, "The landing host set cookies on {$path}.");

        $this->assertNotNull($res->headers->get('Content-Security-Policy'),
            "No CSP on {$path}.");
        $this->assertStringNotContainsString('id="root"', $this->bodyOf($res),
            "The admin SPA shell is being served on {$path}.");
    }

    /**
     * The four assertions above cannot see the thing the `//` rule exists to
     * stop, and a mutation proved it: deleting `str_contains($raw, '//')` from
     * isLandingPath() leaves every one of them green. They pass because the SPA
     * catch-all's own abort_if is a second wall and enforce() still strips the
     * cookie on the way out — so the status is 404, the CSP is there, and no
     * Set-Cookie reaches the client either way.
     *
     * What survives that is the session ROW. Stripping a cookie hides the id;
     * it does not un-insert the row PHP wrote while StartSession ran, and with
     * the id never reaching the browser that row can never be looked up again.
     * `//login` admitted by the guard reaches the `web` group and leaks one
     * throwaway session per request, on a public unauthenticated origin, with
     * SESSION_DRIVER=database in production. That is the same leak
     * test_the_chat_loader_allocates_no_session_on_the_landing_host was written
     * for, arriving down a different path, and this is the only assertion in
     * this file that can see it.
     *
     * @dataProvider nonCanonicalPaths
     */
    public function test_a_non_canonical_path_allocates_no_session(string $path): void
    {
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);

        try {
            foreach (range(1, 3) as $ignored) {
                $this->get('http://' . $this->host() . $path)->assertNotFound();
            }

            $written = array_values(array_diff(scandir($dir), ['.', '..']));

            $this->assertSame([], $written,
                "The landing host allocated " . count($written) . " session(s) refusing {$path}.");
        } finally {
            array_map('unlink', glob($dir . '/*'));
            @rmdir($dir);
        }
    }

    public static function nonCanonicalPaths(): array
    {
        return [
            'double slash slug'    => ['//login'],
            'double slash spa'     => ['//dashboard'],
            'double slash short'   => ['//x'],
            'double slash health'  => ['//up'],
            'double slash preview' => ['//preview/1'],
            'triple slash'         => ['///login'],
            'trailing slash'       => ['/login/'],
        ];
    }

    /**
     * The chat widget is a script that has to run inside the landing page, so
     * its loader and its API stay same-origin. See the guard's docblock for
     * why the other widgets do not.
     */
    public function test_the_chat_loader_is_reachable_on_the_landing_host(): void
    {
        $res = $this->get('http://' . $this->host() . '/w/chat.js');

        $res->assertOk();

        // It lives in routes/web.php, so it runs the `web` group and
        // StartSession queues cookies on it. Being allowed through the guard
        // is not the same as being safe to serve unchanged on this origin.
        $names = array_map(fn ($cookie) => $cookie->getName(), $res->headers->getCookies());
        $this->assertSame([], $names, 'The chat loader set cookies on the landing host.');

        $this->assertNotNull($res->headers->get('Content-Security-Policy'),
            'The chat loader carried no CSP on the landing host.');
    }

    /** The same route on its own host is untouched: cookies and all. */
    public function test_the_chat_loader_is_unchanged_on_the_admin_host(): void
    {
        $this->get('http://' . $this->adminHost() . '/w/chat.js')->assertOk();
    }

    /**
     * Booking, services, reviews and lead forms are iframed from the admin
     * host instead. Their host pages must stay off this origin — a browser
     * boundary isolates them, not a routing rule.
     *
     * Each case also asserts the path resolves to a real route on the admin
     * host. /book/{token} and /form/{embedKey} 404 there too for an unknown
     * token, so "not a 404 on the admin host" would not work for them, and
     * without some such check a typo in the path would pass for free.
     *
     * @dataProvider iframedWidgetPages
     */
    public function test_iframed_widget_host_pages_are_not_reachable_on_the_landing_host(string $path, string $routeUri): void
    {
        $this->get('http://' . $this->host() . $path)->assertNotFound();

        $matched = app('router')->getRoutes()->match(
            \Illuminate\Http\Request::create('http://' . $this->adminHost() . $path)
        );

        $this->assertSame($routeUri, $matched->uri(),
            'This path is not the route it claims to be; the landing-host assertion proves nothing.');
    }

    public static function iframedWidgetPages(): array
    {
        return [
            'booking token'   => ['/book/some-token', 'book/{token}'],
            'booking widget'  => ['/booking-widget', 'booking-widget'],
            'services widget' => ['/services-widget', 'services-widget'],
            'review'          => ['/review/1', 'review/{id}'],
            'kiosk'           => ['/k/some-device-key', 'k/{deviceKey}'],
            'lead form'       => ['/form/some-embed-key', 'form/{embedKey}'],
        ];
    }

    /**
     * The four API prefixes the guard's docblock names as blocked had no test
     * at all: widening the allow pattern from `#^api/v1/widget/#` to
     * `#^api/v1/#` would have left this whole file green.
     *
     * @dataProvider blockedWidgetApiPaths
     */
    public function test_the_iframed_widget_api_prefixes_are_blocked_on_the_landing_host(string $path): void
    {
        $this->getJson('http://' . $this->host() . $path)->assertNotFound();

        // Real, registered routes — otherwise the 404 above means nothing.
        $matched = app('router')->getRoutes()->match(
            \Illuminate\Http\Request::create('http://' . $this->adminHost() . $path)
        );

        $this->assertStringStartsWith('api/v1/', $matched->uri(),
            'This path did not resolve to the API route it claims to be.');
    }

    public static function blockedWidgetApiPaths(): array
    {
        return [
            'booking'    => ['/api/v1/booking/config'],
            'services'   => ['/api/v1/services/config'],
            'reviews'    => ['/api/v1/public/reviews/form/1'],
            'lead forms' => ['/api/v1/public/lead-forms/some-embed-key'],
        ];
    }

    /**
     * The don't-clobber rule was keyed on "is a CSP already present", which is
     * a trap for exactly the additions the guard's docblock invites: the
     * widget routes answer with `Content-Security-Policy: frame-ancestors *`,
     * so an allowed one would have kept that as its entire policy — no
     * default-src, no script-src — and skipped the other three headers too.
     */
    public function test_hardening_replaces_a_foreign_policy_wholesale(): void
    {
        $response = new \Symfony\Component\HttpFoundation\Response('', 200, [
            'Content-Security-Policy' => 'frame-ancestors *',
        ]);

        \App\Http\Middleware\LandingPageSecurity::harden($response, 'test-nonce');

        $csp = $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringNotContainsString('frame-ancestors *', $csp);
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        $this->assertSame('strict-origin-when-cross-origin', $response->headers->get('Referrer-Policy'));
        $this->assertSame('DENY', $response->headers->get('X-Frame-Options'));
    }

    /**
     * The trap in situ. The rule lived in the guard, not in harden(), and it
     * was "is a CSP already present" — so a response that arrived carrying
     * `frame-ancestors *` skipped hardening *wholesale*: no default-src, no
     * script-src, and nosniff / Referrer-Policy / X-Frame-Options all missing
     * too. Every widget page the docblock invites adding answers exactly that
     * way.
     */
    public function test_the_guard_hardens_a_response_that_arrived_with_its_own_policy(): void
    {
        $request = \Illuminate\Http\Request::create('http://' . $this->host() . '/w/chat.js');

        $response = (new \App\Http\Middleware\LandingHostGuard)->handle($request, function () {
            $inner = new \Symfony\Component\HttpFoundation\Response('', 200, [
                'Content-Security-Policy' => 'frame-ancestors *',
            ]);
            $inner->headers->setCookie(new \Symfony\Component\HttpFoundation\Cookie('some_session', 'abc'));

            return $inner;
        });

        $csp = $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("default-src 'self'", $csp,
            'A foreign policy survived on the landing origin.');
        $this->assertStringNotContainsString('frame-ancestors *', $csp);
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        $this->assertSame('strict-origin-when-cross-origin', $response->headers->get('Referrer-Policy'));
        $this->assertSame('DENY', $response->headers->get('X-Frame-Options'));
        $this->assertSame([], $response->headers->getCookies());
    }

    /**
     * The other half of that rule: a landing page's own policy quotes a nonce
     * its template uses, so the guard must not re-issue one on the way out.
     */
    public function test_a_landing_page_keeps_the_nonce_its_template_was_given(): void
    {
        $csp = $this->get('http://' . $this->host() . '/any-slug')
            ->headers->get('Content-Security-Policy');

        $issued = app('request')->attributes->get('csp_nonce');

        $this->assertNotNull($issued, 'LandingPageSecurity issued no nonce.');
        $this->assertStringContainsString("'nonce-{$issued}'", $csp,
            'The response CSP names a different nonce than the one shared with the view.');
    }

    /**
     * /w/chat.js is a `web` route, so StartSession used to run on it. The
     * response cookie was stripped, so the browser could never send the id
     * back and every request allocated a fresh session that would never be
     * reused — one INSERT per request on a public, unauthenticated origin
     * with SESSION_DRIVER=database.
     */
    public function test_the_chat_loader_allocates_no_session_on_the_landing_host(): void
    {
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);

        try {
            foreach (range(1, 3) as $ignored) {
                $this->get('http://' . $this->host() . '/w/chat.js')->assertOk();
            }

            $written = array_values(array_diff(scandir($dir), ['.', '..']));

            $this->assertSame([], $written,
                'The landing host allocated ' . count($written) . ' session(s) serving a static script.');
        } finally {
            array_map('unlink', glob($dir . '/*'));
            @rmdir($dir);
        }
    }

    /**
     * Naming the bare admin origin in frame-src let an XSS on customer content
     * iframe the authenticated admin panel: /login, and every other route the
     * SPA shell answers, sends no X-Frame-Options and no frame-ancestors, so
     * nothing else was stopping it.
     * CSP source expressions take paths; the ruling meant a handful of widget
     * pages, not a whole origin.
     */
    public function test_frame_src_names_widget_paths_rather_than_the_whole_admin_origin(): void
    {
        $csp = $this->get('http://' . $this->host() . '/any-slug')
            ->headers->get('Content-Security-Policy');

        $origin = rtrim(config('app.url'), '/');
        $sources = $this->frameSrcSources($csp);

        $this->assertNotEmpty($sources, 'No frame-src in the CSP.');
        $this->assertNotContains($origin, $sources,
            'frame-src names the bare admin origin, so the admin panel itself can be framed.');

        foreach ($sources as $source) {
            $this->assertStringStartsWith($origin . '/', $source,
                "frame-src source {$source} is not a path on the admin origin.");
        }

        // The pages the ruling actually meant.
        foreach (['/booking-widget', '/services-widget', '/book/', '/review/', '/k/', '/form/'] as $path) {
            $this->assertContains($origin . $path, $sources,
                "frame-src does not allow {$path}, so that widget cannot be embedded.");
        }
    }

    private function frameSrcSources(string $csp): array
    {
        foreach (explode(';', $csp) as $directive) {
            $parts = preg_split('/\s+/', trim($directive), -1, PREG_SPLIT_NO_EMPTY);

            if (($parts[0] ?? null) === 'frame-src') {
                return array_slice($parts, 1);
            }
        }

        return [];
    }

    /**
     * default-src 'self' would block those iframes. frame-src names the admin
     * origin so they load, and nothing else is widened: script-src and
     * style-src still refuse that host.
     */
    public function test_the_csp_allows_framing_the_admin_host_for_the_iframed_widgets(): void
    {
        $csp = $this->get('http://' . $this->host() . '/any-slug')
            ->headers->get('Content-Security-Policy');

        $this->assertStringContainsString('frame-src ', $csp, 'No frame-src in the CSP.');
        $this->assertStringContainsString(rtrim(config('app.url'), '/'), $csp,
            'The CSP does not name the admin origin, so the iframed widgets cannot load.');
        $this->assertStringContainsString("script-src 'self'", $csp,
            'script-src was widened; only framing should have been.');
    }

    /** `/up` is the framework health route; on the landing host it is a slug. */
    public function test_the_health_slug_cannot_be_claimed_by_a_tenant(): void
    {
        $this->assertContains('up', config('landing.reserved_slugs'));
    }

    private function bodyOf(\Illuminate\Testing\TestResponse $res): string
    {
        $base = $res->baseResponse;

        if ($base instanceof \Symfony\Component\HttpFoundation\BinaryFileResponse
            || $base instanceof \Symfony\Component\HttpFoundation\StreamedResponse) {
            return (string) $res->streamedContent();
        }

        return (string) $res->getContent();
    }
}
