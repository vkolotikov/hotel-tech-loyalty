<?php
namespace Tests\Feature\Landing;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The admin shell must not exist as a file inside the docroot.
 *
 * Host separation is the control behind the whole landing-page feature: the
 * admin SPA keeps a non-expiring, all-abilities Sanctum token in
 * localStorage, and localStorage is per-origin. LandingHostGuard and the two
 * SPA routes both refuse the shell on sites.hexa-tech.uk — and both were
 * irrelevant, because public/spa/index.html was a real file in the docroot
 * and the web server answered it before PHP booted. Confirmed against
 * production: https://sites.hexa-tech.uk/spa/index.html returned 200 with the
 * admin login screen while every kernel-served path on that host returned
 * 404. Laravel Cloud's edge has no per-path or per-domain rule, so it could
 * not be blocked; the file was moved to resources/spa-shell/index.html
 * instead, and routes/web.php reads it from there.
 *
 * These assertions are about the shipped file layout, not about HTTP. That is
 * deliberate and it is the only way this property is observable: a request for
 * a file that exists in public/ never enters the kernel, so no test that goes
 * through $this->get() can see the leak this class exists to prevent. The
 * failure mode being guarded is a rebuild — frontend/dist and public/spa are
 * both committed and Laravel Cloud rebuilds on deploy, so a postbuild that
 * copies dist/ wholesale puts the shell back with nobody noticing.
 */
class AdminShellIsNotStaticallyServableTest extends TestCase
{
    // Only the two HTTP tests need these: on the landing host /login and
    // /dashboard match the landing slug pattern, so the guard lets them
    // through to a page lookup that has to find no row rather than no table.
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
    }

    /** Directories inside public/ that are not ours to walk. */
    private const SKIPPED = ['storage', 'build', 'hot'];

    /** Extensions that cannot be an HTML document; skipped to keep the walk cheap. */
    private const BINARY = [
        'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'woff', 'woff2', 'ttf',
        'eot', 'otf', 'pdf', 'zip', 'mp4', 'webm', 'map',
    ];

    private function docroot(): string
    {
        return rtrim(str_replace('\\', '/', public_path()), '/');
    }

    private function shellPath(): string
    {
        return resource_path('spa-shell/index.html');
    }

    /**
     * The exact file that used to leak. Called out on its own so a failure
     * names it rather than making someone read a list of paths.
     */
    public function test_the_shell_is_not_at_its_old_docroot_path(): void
    {
        $this->assertFileDoesNotExist(
            public_path('spa/index.html'),
            'The admin shell is back inside the docroot. The web server serves it before PHP '
            . 'boots, so it answers on the landing host too and the abort_if in routes/web.php '
            . 'never runs. Check frontend/scripts/postbuild.mjs — it is the thing that puts it there.',
        );
    }

    /**
     * Renaming the file would defeat the check above, and a build could put
     * the shell anywhere under public/. Look for the document itself.
     */
    public function test_no_file_anywhere_in_the_docroot_is_the_admin_shell(): void
    {
        $found = [];

        foreach ($this->docrootFiles() as $path) {
            if ($this->looksLikeTheAdminShell($path)) {
                $found[] = ltrim(substr(str_replace('\\', '/', $path), strlen($this->docroot())), '/');
            }
        }

        $this->assertSame([], $found,
            'These files in the docroot are the admin SPA shell: ' . implode(', ', $found)
            . '. Anything under public/ is served by the web server on every host, the landing '
            . 'host included, without PHP ever running.');
    }

    /**
     * The other half: the routes read the shell from resources/spa-shell, and
     * if it is not there they fall back to the stock `welcome` view. That
     * fallback is sane but it is not the admin panel, so a missing shell means
     * the console is down rather than insecure. Fail loudly here instead.
     */
    public function test_the_shell_the_routes_read_exists_outside_the_docroot(): void
    {
        $shell = $this->shellPath();

        $this->assertFileExists($shell,
            'resources/spa-shell/index.html is missing, so / and /{any} serve the welcome page '
            . 'instead of the admin panel.');

        $this->assertStringNotContainsString(
            $this->docroot(),
            str_replace('\\', '/', realpath($shell)),
            'The shell the routes read resolves to a path inside the docroot, which puts it back '
            . 'in front of the web server.',
        );

        $this->assertStringContainsString('<div id="root">', (string) file_get_contents($shell),
            'resources/spa-shell/index.html is not the React shell.');
    }

    /**
     * A shell that does not match the committed build points at asset hashes
     * the build no longer contains, so every lazily-loaded route 404s. This is
     * what a rebuild that publishes assets but forgets the shell looks like.
     */
    public function test_the_shell_matches_the_committed_build_output(): void
    {
        $built = base_path('frontend/dist/index.html');

        if (! is_file($built)) {
            $this->markTestSkipped('frontend/dist is not present in this checkout.');
        }

        $this->assertSame(
            file_get_contents($built),
            file_get_contents($this->shellPath()),
            'resources/spa-shell/index.html is not the shell frontend/dist was built with, so it '
            . 'references asset hashes that may no longer exist in public/spa/assets.',
        );
    }

    /**
     * The layout above only holds until the next `npm run build`. postbuild is
     * what reproduces it, and it was previously an inline `node -e` one-liner
     * that recursively copied dist/ into public/spa — restore anything like
     * that and the shell is back in the docroot on the next deploy.
     *
     * This inspects the build script rather than running it, because node is
     * not guaranteed on the machine running PHPUnit. It is a tripwire on the
     * one edit that silently undoes the fix, not a test of the copy logic;
     * the copy logic asserts its own outcome and fails the build.
     */
    public function test_the_build_still_publishes_the_shell_out_of_the_docroot(): void
    {
        $manifest = json_decode((string) file_get_contents(base_path('frontend/package.json')), true);

        $this->assertSame('node scripts/postbuild.mjs', $manifest['scripts']['postbuild'] ?? null,
            'The postbuild step no longer delegates to frontend/scripts/postbuild.mjs. Whatever '
            . 'replaced it must still keep index.html out of public/spa.');

        $script = base_path('frontend/scripts/postbuild.mjs');
        $this->assertFileExists($script);

        $source = (string) file_get_contents($script);

        $this->assertStringContainsString('EXCLUDED_FROM_DOCROOT', $source,
            'postbuild no longer excludes anything from the docroot copy.');

        // Asserted by INTENT, not by matching one line of the script verbatim.
        // The first version of this test pinned the literal string
        // "PUBLIC_SPA, 'index.html'", which broke the moment the closing check
        // was generalised from that single filename to a loop over every
        // exclusion -- a change that made the guarantee STRONGER. A test that
        // fails when the thing it protects gets better is measuring the wrong
        // thing.
        foreach (['index.html', 'stats.html'] as $mustBeExcluded) {
            $this->assertMatchesRegularExpression(
                '/EXCLUDED_FROM_DOCROOT\s*=\s*new Set\(\[[^\]]*' . preg_quote($mustBeExcluded, '/') . '/',
                $source,
                "postbuild no longer excludes {$mustBeExcluded} from the docroot copy. "
                . 'index.html is the admin shell; stats.html is the bundle analyser report, '
                . 'which names every source module in the admin bundle and was once live at '
                . '/spa/stats.html on the public tenant marketing host.'
            );
        }

        $this->assertStringContainsString('fs.existsSync(path.join(PUBLIC_SPA', $source,
            'postbuild no longer verifies, after publishing, that its exclusions really did '
            . 'stay out of public/spa. Without that check the copy logic can regress silently.');
    }

    /**
     * Moving the file is only half of it: / and /{any} have to still find it.
     * These are the routes real admins land on.
     */
    public function test_the_admin_host_still_gets_the_shell(): void
    {
        $host = parse_url(config('app.url'), PHP_URL_HOST);

        foreach (['/', '/login', '/dashboard'] as $path) {
            $res = $this->get('http://' . $host . $path);

            $res->assertOk();
            // Unchanged by the move, and load-bearing: served `public` with no
            // max-age, browsers and the CDN invent an expiry from
            // Last-Modified and keep handing out HTML that names asset hashes
            // the next build has already deleted.
            $res->assertHeader('Cache-Control', 'must-revalidate, no-cache, public');

            $body = $res->streamedContent();

            $this->assertStringContainsString('<div id="root">', $body,
                "{$path} did not serve the admin shell.");
            $this->assertStringContainsString('/spa/assets/', $body,
                "{$path} served a shell that does not load the admin bundle.");
        }
    }

    /** And the landing host still must not get it, by any of those paths. */
    public function test_the_landing_host_still_gets_nothing(): void
    {
        foreach (['/', '/login', '/dashboard'] as $path) {
            $this->get('http://' . config('landing.host') . $path)
                ->assertNotFound();
        }
    }

    /** Every regular file under public/, skipping symlinks and generated trees. */
    private function docrootFiles(): iterable
    {
        $stack = [$this->docroot()];

        while ($stack !== []) {
            $dir = array_pop($stack);

            foreach ((array) scandir($dir) as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }

                // public/storage links into storage/app/public — tenant
                // uploads, not deployed code. Skipped by name and before any
                // stat, because on Windows it is a junction that PHP reports
                // as neither a link nor a directory and then refuses to read.
                if ($dir === $this->docroot() && in_array($entry, self::SKIPPED, true)) {
                    continue;
                }

                $full = $dir . '/' . $entry;

                if (is_link($full)) {
                    continue;
                }

                if (is_dir($full)) {
                    $stack[] = $full;
                    continue;
                }

                if (! is_file($full) || ! is_readable($full)) {
                    continue;
                }

                if (in_array(strtolower(pathinfo($entry, PATHINFO_EXTENSION)), self::BINARY, true)) {
                    continue;
                }

                yield $full;
            }
        }
    }

    /**
     * An HTML document that mounts the admin bundle. Both markers are required
     * so the Expo web builds under public/app and public/staff — which also
     * render into #root, but from their own bundles — are not reported here.
     * They are a separate exposure on the landing host; they are not this one.
     */
    private function looksLikeTheAdminShell(string $path): bool
    {
        $head = (string) file_get_contents($path, false, null, 0, 262144);

        if (stripos($head, '<html') === false) {
            return false;
        }

        return str_contains($head, '<div id="root">')
            && str_contains($head, '/spa/assets/');
    }
}
