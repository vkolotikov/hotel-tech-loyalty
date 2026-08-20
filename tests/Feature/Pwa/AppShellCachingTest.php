<?php

namespace Tests\Feature\Pwa;

use Tests\TestCase;

/**
 * The SPA shell must always be revalidated before it is reused.
 *
 * It was being served as `Cache-Control: public` with no max-age. That is an
 * invitation for the browser, and for the CDN in front of it, to invent an
 * expiry from Last-Modified and serve the HTML from cache for as long as they
 * like. Two things go wrong when they do.
 *
 * The first is visible: the frontend is rebuilt on every deploy, asset
 * filenames are content-hashed, and the old files are gone. Stale HTML points
 * at hashes that no longer exist, so any route the user had not already
 * visited fails to load.
 *
 * The second is quieter, and is how this was found: the install prompt only
 * appears once the browser has parsed a manifest, and the <link> to that
 * manifest lives in the shell. Anyone holding cached HTML from before the
 * manifest shipped simply never saw an install option, with nothing to
 * indicate why.
 *
 * `no-cache` is not `no-store` — the response may still be kept, it just has
 * to be revalidated, so an unchanged shell costs a 304 rather than a full
 * download.
 */
class AppShellCachingTest extends TestCase
{
    /** @return list<string> */
    private function shellRoutes(): array
    {
        return ['/', '/login', '/customers'];
    }

    /**
     * The shell is returned via response()->file(), which is a
     * BinaryFileResponse: it streams from disk, so getContent() on it is
     * empty. Buffer what it actually writes instead of reading the file
     * behind its back, so the test still fails if the route stops serving it.
     */
    private function shellHtml(string $uri = '/login'): string
    {
        $response = $this->get($uri);

        ob_start();
        $response->baseResponse->sendContent();

        return (string) ob_get_clean();
    }

    public function test_the_shell_is_never_served_without_revalidation(): void
    {
        foreach ($this->shellRoutes() as $uri) {
            $cacheControl = $this->get($uri)->headers->get('Cache-Control') ?? '';

            $this->assertMatchesRegularExpression(
                '/\b(no-cache|no-store|max-age=0)\b/',
                $cacheControl,
                "{$uri} is served as '{$cacheControl}'. Without no-cache the browser and the CDN "
                . 'pick their own expiry, and users keep running HTML that points at deleted assets.',
            );
        }
    }

    public function test_the_shell_is_not_marked_publicly_cacheable_indefinitely(): void
    {
        // The exact header that caused this: cacheable, shared, no expiry.
        foreach ($this->shellRoutes() as $uri) {
            $cacheControl = $this->get($uri)->headers->get('Cache-Control') ?? '';

            $unrevalidatedPublic = str_contains($cacheControl, 'public')
                && !str_contains($cacheControl, 'no-cache');

            $this->assertFalse($unrevalidatedPublic,
                "{$uri} is '{$cacheControl}' — publicly cacheable with no revalidation.");
        }
    }

    public function test_the_shell_still_links_the_manifest(): void
    {
        // Belt and braces with WebManifestTest: a perfect manifest that nothing
        // references makes the app no more installable than having none at all.
        $html = $this->shellHtml();

        $this->assertStringContainsString('rel="manifest"', $html,
            'The shell no longer links the web manifest, so nothing is installable.');
        $this->assertStringContainsString('/manifest.webmanifest', $html);
    }

    public function test_the_shell_does_not_still_announce_itself_as_admin(): void
    {
        // React sets document.title once it boots, but the static title is what
        // Windows reads when pinning the app, and it used to be "admin".
        $html = $this->shellHtml();

        $this->assertStringNotContainsString('<title>admin</title>', $html);
    }
}
