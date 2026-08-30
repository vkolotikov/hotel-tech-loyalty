<?php
namespace Tests\Feature\Landing;

use App\Http\Middleware\LandingPageSecurity;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The landing host serves markup assembled from customer-supplied content.
 * These headers are what stops a stored-XSS on one tenant's page from being
 * anything more than a defaced page.
 *
 * The schema is set up so an unknown slug is a clean 404 rather than a
 * "no such table" 500: the headers must be asserted on the response the
 * middleware actually produces, not on an error page.
 */
class LandingSecurityHeadersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    public function test_the_page_carries_a_real_content_security_policy(): void
    {
        // The application ships no security-header middleware at all today,
        // and the only CSP in the repo is `frame-ancestors *` on widget
        // routes, which restricts nothing about script execution.
        $csp = $this->get('http://' . $this->host() . '/any-slug')->headers->get('Content-Security-Policy');

        $this->assertNotNull($csp, 'No CSP on the landing host.');
        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringNotContainsString("'unsafe-eval'", $csp);
    }

    /**
     * Task 3 (landing phase 3c; D3): every face the landing template uses
     * is now self-hosted woff2 under public/landing/fonts/, so neither
     * Google Fonts host has any business appearing in this policy any more
     * — style-src no longer needs fonts.googleapis.com for a <link
     * rel="stylesheet">, and font-src no longer needs fonts.gstatic.com for
     * the woff2 files themselves. Removing them also removes the landing
     * page's only external hosts of any kind and the EU consent exposure
     * that came with them (see the spec's own framing of D3).
     */
    public function test_the_csp_names_no_google_fonts_host(): void
    {
        $csp = $this->get('http://' . $this->host() . '/any-slug')->headers->get('Content-Security-Policy');

        $this->assertNotNull($csp, 'No CSP on the landing host.');
        $this->assertStringNotContainsString('fonts.googleapis.com', $csp);
        $this->assertStringNotContainsString('fonts.gstatic.com', $csp);
        $this->assertStringContainsString("font-src 'self'", $csp);
    }

    public function test_it_sets_the_other_headers_that_cost_nothing(): void
    {
        $res = $this->get('http://' . $this->host() . '/any-slug');

        $this->assertSame('nosniff', $res->headers->get('X-Content-Type-Options'));
        $this->assertSame('strict-origin-when-cross-origin', $res->headers->get('Referrer-Policy'));
    }

    public function test_it_sets_no_session_cookie(): void
    {
        // A public marketing page must not set cookies before consent, and
        // there is no session to keep: nobody signs in here.
        $res = $this->get('http://' . $this->host() . '/any-slug');

        // Asserted as a list rather than a loop: with no cookies at all the
        // loop body never runs, PHPUnit marks the test risky, and a genuine
        // regression would be indistinguishable from a pass.
        $names = array_map(fn ($cookie) => $cookie->getName(), $res->headers->getCookies());

        $this->assertNotContains(config('session.cookie'), $names,
            'The landing host started a session.');
    }

    /**
     * The template must never spell an admin host of its own, so the URL a
     * landing page frames and the frame-src that permits it come from one
     * method pair over one config value.
     */
    public function test_a_widget_url_is_built_from_the_same_origin_frame_src_names(): void
    {
        $url = LandingPageSecurity::widgetUrl('/booking-widget', ['org' => 7, 'lang' => 'pl']);

        $this->assertNotNull($url);
        $this->assertStringContainsString('org=7', $url);
        $this->assertStringContainsString('lang=pl', $url);
        $this->assertStringStartsWith(rtrim(config('app.url'), '/') . '/booking-widget?', $url);
        $this->assertStringContainsString($url === null ? '' : parse_url($url, PHP_URL_HOST),
            LandingPageSecurity::policy('nonce'));
    }

    public function test_a_path_frame_src_does_not_name_cannot_be_framed(): void
    {
        // The failure mode this prevents is silent: a page frame-src does not
        // name renders as a blank box with a console message and no other
        // symptom, on a customer's live site.
        $this->expectException(\InvalidArgumentException::class);

        LandingPageSecurity::widgetUrl('/api/v1/booking/slots');
    }

    public function test_an_unusable_app_url_yields_no_frame_rather_than_a_broken_one(): void
    {
        config(['app.url' => 'not a url']);

        $this->assertNull(LandingPageSecurity::widgetUrl('/booking-widget'));
        $this->assertStringContainsString("frame-src 'none'", LandingPageSecurity::policy('nonce'));
    }
}
