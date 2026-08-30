<?php
namespace Tests\Unit\Support;

use App\Support\AssetVersion;
use Tests\TestCase;

/**
 * F2 (phase 3c final fix wave): the cache-bust query string for
 * ruled_page.css/js. Deliberately does not create, edit or delete anything
 * under public/ — every assertion below reads real, already-committed
 * files (the two the fix actually targets, plus a couple of others already
 * on disk for the "different inputs" comparisons) rather than mutating the
 * filesystem to manufacture a scenario.
 *
 * Extends Tests\TestCase (the full framework bootstrap), unlike AccentTest's
 * plain PHPUnit\Framework\TestCase: Accent is pure maths with no framework
 * dependency at all, where public_path() — everything this class calls —
 * resolves through app()->publicPath(), which needs a real
 * Illuminate\Foundation\Application bound as the container, not merely
 * whatever ran `artisan test` itself. No database trait is used: nothing
 * here touches one.
 */
class AssetVersionTest extends TestCase
{
    public function test_a_real_file_gets_a_non_empty_version_query(): void
    {
        $query = AssetVersion::query('landing/ruled_page.css');

        $this->assertMatchesRegularExpression('/^\?v=[0-9a-f]{10}$/', $query);
    }

    public function test_two_different_files_get_different_versions(): void
    {
        $css = AssetVersion::hash('landing/ruled_page.css');
        $js  = AssetVersion::hash('landing/ruled_page.js');

        $this->assertNotNull($css);
        $this->assertNotNull($js);
        $this->assertNotSame($css, $js, 'Two different files produced the same version hash.');
    }

    public function test_the_same_file_gets_the_same_version_every_call(): void
    {
        $first  = AssetVersion::query('landing/ruled_page.css');
        $second = AssetVersion::query('landing/ruled_page.css');

        $this->assertSame($first, $second, 'Calling the helper twice for the same unchanged file gave two different versions.');
    }

    /**
     * The guard the brief asks for: a missing file must not throw, warn, or
     * otherwise take the page down — it degrades to today's un-versioned
     * behaviour (an empty string, so the caller's URL is unaffected).
     */
    public function test_a_missing_file_returns_an_empty_query_rather_than_erroring(): void
    {
        $this->assertSame('', AssetVersion::query('landing/this-file-does-not-exist-at-all.css'));
        $this->assertNull(AssetVersion::hash('landing/this-file-does-not-exist-at-all.css'));
    }

    /** A directory is not a file; is_file() already says so before md5_file() ever runs on it. */
    public function test_a_directory_path_returns_an_empty_query_rather_than_erroring(): void
    {
        $this->assertSame('', AssetVersion::query('landing/fonts'));
    }

    /** Escaping public/ is not this helper's job to police, but it must not crash on the attempt either. */
    public function test_a_path_traversal_attempt_does_not_throw(): void
    {
        $this->assertIsString(AssetVersion::query('../../../../etc/passwd'));
    }
}
