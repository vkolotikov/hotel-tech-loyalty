<?php
namespace Tests\Unit\Support;

use App\Models\Organization;
use App\Support\LandingSlug;
use Tests\TestCase;

class LandingSlugTest extends TestCase
{
    public function test_it_normalises_what_a_person_would_type(): void
    {
        $this->assertSame('glamour-salon', LandingSlug::normalise('  Glamour Salon  '));
        $this->assertSame('cafe-mimi', LandingSlug::normalise('Café Mimi'));
        $this->assertSame('a-b', LandingSlug::normalise('a---b'));
    }

    public function test_it_rejects_shapes_that_break_a_url(): void
    {
        $this->assertFalse(LandingSlug::isValid('ab'));                 // too short
        $this->assertFalse(LandingSlug::isValid(str_repeat('a', 64)));  // too long
        $this->assertFalse(LandingSlug::isValid('-leading'));
        $this->assertFalse(LandingSlug::isValid('trailing-'));
        $this->assertFalse(LandingSlug::isValid('Has Spaces'));
        $this->assertFalse(LandingSlug::isValid('under_score'));
        $this->assertTrue(LandingSlug::isValid('glamour-salon'));
    }

    public function test_it_rejects_smuggled_control_characters(): void
    {
        // PCRE's `$` matches before a trailing newline unless the pattern
        // carries the D modifier, so an otherwise-valid slug with a \n glued
        // to the end used to validate. isValid() runs on values read back
        // from the database, not only on user input, so a bad row could
        // put a raw control character into a redirect's Location header.
        $this->assertFalse(LandingSlug::isValid("glamour-salon\n"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\r"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\r\n"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\0"));
        $this->assertFalse(LandingSlug::isValid("glamour-salon\t"));
        $this->assertFalse(LandingSlug::isValid("glamour\nsalon"));
    }

    public function test_it_accepts_the_exact_boundary_lengths(): void
    {
        // The two rejections above prove 2 and 64 chars are invalid, but
        // never that MIN/MAX are actually 3 and 63 - an off-by-one on
        // either constant (e.g. MIN bumped to 4, or MAX dropped to 62)
        // would leave both existing assertions green.
        $this->assertTrue(LandingSlug::isValid(str_repeat('a', 3)));
        $this->assertTrue(LandingSlug::isValid(str_repeat('a', 63)));
    }

    public function test_it_reserves_our_own_words(): void
    {
        // A tenant owning "admin" or "api" on the public host would shadow a
        // route we may need, and "beauty" would read as one of our brands.
        foreach (['api', 'admin', 'login', 'spa', 'assets', 'storage', 'www', 'sites', 'beauty', 'medical'] as $word) {
            $this->assertTrue(LandingSlug::isReserved($word), "{$word} should be reserved");
        }

        $this->assertFalse(LandingSlug::isReserved('glamour-salon'));
    }

    /**
     * A slug that names a real directory under public/ is unservable, and
     * fails SILENTLY.
     *
     * The front controller serves existing paths before PHP ever runs —
     * Apache's `RewriteCond %{REQUEST_FILENAME} !-d`, nginx's `try_files
     * $uri $uri/` — so /staff returns the Expo staff app shell and /build,
     * /landing and /widget return the web server's own 404. Laravel is never
     * reached, so nothing in the request cycle can notice or report it. The
     * tenant's POST is accepted with a 201, the admin shows the page as
     * live, and the address simply never works.
     *
     * Hardcoded here rather than only scanned for: public/build is a build
     * artefact and public/storage is a symlink created by `artisan
     * storage:link`, so a checkout that has run neither would scan an
     * incomplete directory and pass on nothing.
     */
    public function test_it_reserves_the_directories_the_web_server_answers_before_php(): void
    {
        foreach (['build', 'landing', 'staff', 'widget', 'assets', 'spa', 'app', 'storage'] as $dir) {
            $this->assertTrue(LandingSlug::isReserved($dir),
                "/{$dir} is a real directory under public/, so a tenant holding that slug is unreachable.");
        }
    }

    /**
     * ...and the same question asked of the tree as it stands, so a
     * directory added to public/ later cannot slip in unreserved. This is
     * the half that keeps working without anyone remembering to edit a list.
     *
     * Names that could never be registered as a slug are skipped rather than
     * reserved: `isValid()` is enforced on every write path, so a directory
     * called `js` or `.well-known` is not a hazard and demanding a
     * reservation for it would fail this test for no reason. is_dir()
     * follows symlinks deliberately — `public/storage` is one, and -d on
     * Apache stats through it just the same.
     */
    public function test_no_directory_under_public_can_be_registered_as_a_slug(): void
    {
        $entries = scandir(public_path());

        $this->assertNotFalse($entries, 'public/ could not be read.');

        $found = 0;

        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || !is_dir(public_path($entry))) {
                continue;
            }

            if (!LandingSlug::isValid($entry)) {
                continue;
            }

            $found++;
            $this->assertTrue(
                LandingSlug::isReserved($entry),
                "public/{$entry} shadows /{$entry} on the landing host: the web server answers it "
                . 'before Laravel, so a tenant holding that slug gets a page that never resolves. '
                . 'Add it to config/landing.php reserved_slugs.'
            );
        }

        $this->assertGreaterThan(0, $found, 'Nothing under public/ was checked; this test is asleep.');
    }

    public function test_it_reserves_every_industry_id_in_the_shape_a_slug_actually_takes(): void
    {
        // Organization::INDUSTRIES contains 'real_estate' — a compound id
        // whose slug form is 'real-estate', not the underscored original.
        // Comparing raw ids against a normalised slug lets that one through,
        // so this walks every industry id through the same normalise() a
        // caller would use, covering any future compound id too.
        foreach (Organization::INDUSTRIES as $industry) {
            $slugForm = LandingSlug::normalise($industry);

            $this->assertTrue(
                LandingSlug::isReserved($slugForm),
                "{$slugForm} (slug form of industry '{$industry}') should be reserved"
            );
        }
    }
}
