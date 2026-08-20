<?php

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Widget colours arrive as unauthenticated query-string input and are written
 * straight into a <style> block.
 *
 * Blade's {{ }} is HTML escaping. It is not CSS escaping, and inside a <style>
 * element — a raw text element — HTML entities are not decoded either, so
 * escaping the angle brackets neither stops the injection nor lets it break
 * back out into HTML. A payload needs no character that {{ }} touches:
 *
 *     /booking-widget?color=%23fff}%20*{background:url(https://evil.example/x)}
 *
 * rendered, verbatim, as:
 *
 *     --primary: #fff} * {background:url(https://evil.example/x)};
 *
 * That is not script execution — modern browsers dropped expression() — but it
 * is enough to deface a customer's embedded widget and to exfiltrate through
 * attribute selectors, from nothing more than a crafted link. No login needed.
 *
 * Write-time validation could not have caught it: these values come from the
 * URL and never meet a validator. App\Support\CssColor normalises at render.
 *
 * Note on style: these assertions run against a small extract rather than the
 * whole document. The booking widget alone is 104KB, and PHPUnit's failure
 * formatter cannot render a haystack that size on this PHP build — a genuine
 * failure would crash the reporter instead of telling you what broke.
 */
class WidgetColourInjectionTest extends TestCase
{
    // The repo builds tables per test rather than running the 137 migrations,
    // which do not survive sqlite. The booking widget resolves a Brand by
    // widget_token, and setUpMinimalSchema() alone has no brands table -- it
    // 500s with "no such table: brands", which the local PHP 8.3 build cannot
    // even render as a test failure. setUpBookingConfirmSchema() composes down
    // to the minimal set and adds brands.
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingConfirmSchema();
    }

    /** Breaks out of the declaration using only characters {{ }} leaves alone. */
    private const PAYLOAD = '#fff} * {background:url(https://evil.example/x)}';

    public static function publicWidgetRoutes(): array
    {
        return [
            'booking widget'  => ['/booking-widget'],
            'services widget' => ['/services-widget'],
        ];
    }

    /** Everything the page says about colour, and nothing else. */
    private function colourDeclarations(string $uri): string
    {
        $body = $this->get($uri)->getContent();

        preg_match_all('/--[a-z-]+:\s*[^;}]{0,120}[;}]|theme-color" content="[^"]{0,120}"/i', $body, $m);

        return implode("\n", $m[0]);
    }

    /** @dataProvider publicWidgetRoutes */
    public function test_a_crafted_colour_cannot_inject_css(string $uri): void
    {
        $declarations = $this->colourDeclarations($uri . '?color=' . urlencode(self::PAYLOAD));

        $this->assertStringNotContainsString('evil.example', $declarations,
            "{$uri} wrote an attacker-supplied value into a style declaration.");

        // The brace is the whole trick — without it the payload is inert.
        $this->assertStringNotContainsString('} * {', $declarations,
            "{$uri} let the payload close the declaration it was placed in.");
    }

    /** @dataProvider publicWidgetRoutes */
    public function test_the_whole_document_is_free_of_the_payload(string $uri): void
    {
        // Colour reaches more than one sink: a <style> block, a theme-color
        // meta tag, and a @json config the script hands to setProperty. A fix
        // that only closes the first one leaves the others reflecting.
        $body = $this->get($uri . '?color=' . urlencode(self::PAYLOAD))->getContent();

        $this->assertSame(0, substr_count($body, 'evil.example'),
            "{$uri} still reflects the payload somewhere in the document.");
    }

    /** @dataProvider publicWidgetRoutes */
    public function test_a_legitimate_colour_still_works(string $uri): void
    {
        // The fix must not cost every embedded widget its brand colour.
        $declarations = $this->colourDeclarations($uri . '?color=' . urlencode('#c9a84c'));

        $this->assertStringContainsString('#c9a84c', $declarations,
            "{$uri} dropped a valid brand colour.");
    }

    /** @dataProvider publicWidgetRoutes */
    public function test_an_omitted_colour_falls_back_rather_than_emitting_nothing(string $uri): void
    {
        // An empty custom property cascades to an invalid value and the widget
        // renders unstyled — which is how a "safe" fix breaks a live site.
        $declarations = $this->colourDeclarations($uri);

        $this->assertMatchesRegularExpression('/--primary:\s*#[0-9a-fA-F]{6}/', $declarations,
            "{$uri} emitted no usable primary colour when none was supplied.");
    }
}
