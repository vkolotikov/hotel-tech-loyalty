<?php

namespace Tests\Feature\Pwa;

use Tests\TestCase;

/**
 * The web manifest is what turns the admin into an installable desktop app.
 *
 * Browsers are unforgiving here and silent about it: miss one required field
 * and the Install action simply never appears, with no error anywhere. So the
 * fields Chrome and Edge actually gate on are asserted individually rather
 * than eyeballed once and assumed.
 *
 * The manifest is generated per request because it is fetched before sign-in,
 * when the host is the only brand signal available. That makes host handling
 * the thing most likely to rot, so it is covered too.
 */
class WebManifestTest extends TestCase
{
    private function manifest(string $host = 'loyalty.hotel-tech.ai'): array
    {
        return $this->get('http://' . $host . '/manifest.webmanifest')->json();
    }

    public function test_it_is_served_with_the_manifest_content_type(): void
    {
        // Chrome rejects a manifest served as text/html outright. application/
        // json is tolerated, but the registered type is what we intend.
        $this->get('http://loyalty.hotel-tech.ai/manifest.webmanifest')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/manifest+json');
    }

    public function test_the_spa_catch_all_does_not_swallow_it(): void
    {
        // routes/web.php ends in a /{any} fallback that serves the React shell.
        // If the manifest ever falls through to it, the browser gets HTML and
        // the app silently stops being installable.
        $body = $this->get('http://loyalty.hotel-tech.ai/manifest.webmanifest')->getContent();

        $this->assertStringNotContainsString('<!doctype html', strtolower($body));
        $this->assertIsArray(json_decode($body, true), 'Manifest is not valid JSON.');
    }

    public function test_it_carries_every_field_installability_depends_on(): void
    {
        $m = $this->manifest();

        foreach (['name', 'short_name', 'start_url', 'scope', 'display', 'icons'] as $key) {
            $this->assertArrayHasKey($key, $m, "Manifest is missing '{$key}'.");
        }

        // Anything other than these three leaves the app opening in a normal
        // browser tab, which defeats the point of installing it.
        $this->assertContains($m['display'], ['standalone', 'fullscreen', 'minimal-ui']);
        $this->assertSame('/', $m['start_url']);
        $this->assertSame('/', $m['scope']);
    }

    public function test_it_ships_the_icon_sizes_browsers_require(): void
    {
        $m = $this->manifest();

        $sizes = array_column($m['icons'], 'sizes');
        $this->assertContains('192x192', $sizes, 'Chrome requires a 192px icon to offer installation.');
        $this->assertContains('512x512', $sizes, 'Chrome requires a 512px icon to offer installation.');

        $purposes = array_column($m['icons'], 'purpose');
        $this->assertContains('maskable', $purposes,
            'Without a maskable icon, Windows and Android crop the mark to their own shape and clip it.');
    }

    public function test_every_icon_it_advertises_actually_exists(): void
    {
        // A manifest pointing at a missing icon is not an error the browser
        // reports — it just declines to install.
        foreach ($this->manifest()['icons'] as $icon) {
            $source = base_path('frontend/public' . str_replace('/spa', '', $icon['src']));

            $this->assertFileExists($source,
                "Manifest advertises {$icon['src']} but nothing builds it.");
            $this->assertSame("\x89PNG", substr(file_get_contents($source), 0, 4),
                "{$icon['src']} is not a PNG.");
        }
    }

    public function test_taskbar_shortcuts_point_at_real_screens(): void
    {
        // These become the Windows jump list. A shortcut to a route the SPA
        // does not have lands the user on a blank screen inside their own app.
        $app = file_get_contents(base_path('frontend/src/App.tsx'));

        foreach ($this->manifest()['shortcuts'] as $shortcut) {
            $this->assertStringContainsString(
                'path="' . $shortcut['url'] . '"',
                $app,
                "Jump-list shortcut '{$shortcut['name']}' points at {$shortcut['url']}, which is not a route.",
            );
        }
    }

    public function test_each_sub_brand_installs_under_its_own_name(): void
    {
        // All the GTM hosts run the same build. Without per-host naming every
        // one of them would install as the same tile.
        $this->assertSame('HotelTechAI', $this->manifest('loyalty.hotel-tech.ai')['short_name']);
        $this->assertSame('MedTechAI', $this->manifest('med.hexa-tech.uk')['short_name']);
        $this->assertSame('BeautyTech', $this->manifest('beauty-tech.uk')['short_name']);
    }

    public function test_an_unknown_host_still_produces_a_usable_manifest(): void
    {
        // Custom tenant domains are on the roadmap, and a preview URL is a host
        // nobody listed. Neither should break installation.
        $m = $this->manifest('some-tenant-domain.example');

        $this->assertSame(config('pwa.default.short_name'), $m['short_name']);
        $this->assertNotEmpty($m['name']);
    }

    public function test_short_names_stay_short_enough_for_a_start_menu_tile(): void
    {
        // Windows truncates hard, and a truncated name is how you end up with
        // two tiles that read identically.
        foreach (config('pwa.hosts') + ['_' => config('pwa.default')] as $host => $brand) {
            $this->assertLessThanOrEqual(12, mb_strlen($brand['short_name']),
                "short_name for {$host} is too long for a Start Menu tile.");
        }
    }

    public function test_the_host_list_matches_the_one_the_frontend_uses(): void
    {
        // frontend/src/lib/industryHosts.ts already maps these hosts to
        // sub-brands. Two lists of the same hosts in two languages drift, so
        // this fails the moment a domain is added on one side only.
        $ts = file_get_contents(base_path('frontend/src/lib/industryHosts.ts'));

        preg_match('/HOST_INDUSTRY[^{]*\{(.*?)\n\}/s', $ts, $m);
        $this->assertNotEmpty($m, 'Could not locate HOST_INDUSTRY in industryHosts.ts.');

        preg_match_all("/'([a-z0-9.-]+\.[a-z]{2,})'\s*:/i", $m[1], $found);
        $this->assertNotEmpty($found[1], 'Parsed no hosts out of HOST_INDUSTRY.');

        foreach ($found[1] as $host) {
            $this->assertArrayHasKey($host, config('pwa.hosts'),
                "{$host} is a known sub-brand host in the frontend but has no PWA identity, "
                . 'so it would install under the generic platform name.');
        }
    }
}
