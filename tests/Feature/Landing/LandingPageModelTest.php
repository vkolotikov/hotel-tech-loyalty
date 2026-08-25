<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class LandingPageModelTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
    }

    public function test_a_page_belongs_to_an_org_and_brand(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1,
            'slug' => 'glamour-salon', 'template_key' => 'ruled_page',
            'industry' => 'beauty', 'status' => 'draft',
        ]);

        $this->assertSame('glamour-salon', $page->fresh()->slug);
        $this->assertSame('draft', $page->fresh()->status);
    }

    public function test_published_scope_excludes_drafts(): void
    {
        // A draft reachable at the public URL would publish work in progress.
        // Different brand_id values: one org, two brands, one page each — the
        // landing_pages_org_brand_unique constraint allows this combination.
        LandingPage::create(['organization_id' => 1, 'brand_id' => 1, 'slug' => 'draft-one',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'draft']);
        LandingPage::create(['organization_id' => 1, 'brand_id' => 2, 'slug' => 'live-one',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now()]);

        $slugs = LandingPage::withoutGlobalScopes()->published()->pluck('slug')->all();

        $this->assertSame(['live-one'], $slugs);
    }

    public function test_json_columns_round_trip_as_arrays(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'json-test',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'draft',
            'theme' => ['font_pair' => 'fraunces_inter', 'logo_media_id' => 12],
            'seo'   => ['title' => 'Glamour Salon'],
        ]);

        $this->assertSame('fraunces_inter', $page->fresh()->theme['font_pair']);
        $this->assertSame('Glamour Salon', $page->fresh()->seo['title']);
    }

    // ─── The `url` accessor (Task 10) ─────────────────────────────────────

    /**
     * `$appends = ['url']` means `getUrlAttribute()` runs on EVERY future
     * `toArray()`/`toJson()` of this model, not only the admin controller
     * call sites that exist today — so it must not be able to throw, even
     * for a row nothing has written a slug to yet.
     * `LandingOnboardingService::probePage()` builds exactly this kind of
     * unsaved, slug-less instance (to ask `PageContent` for counts before
     * a page exists), and while that instance is never serialized today,
     * "never serialized today" is not a guarantee this test can make about
     * every caller written after it.
     */
    public function test_the_url_accessor_is_null_rather_than_throwing_without_a_slug(): void
    {
        $page = new LandingPage(['organization_id' => 1, 'brand_id' => 1, 'industry' => 'beauty']);

        $this->assertNull($page->url);
        // The whole point of the guard: toArray() (what every admin
        // controller actually calls via response()->json(['page' => ...]))
        // must not throw either, not just the bare accessor.
        $this->assertArrayHasKey('url', $page->toArray());
    }

    /**
     * Once a slug exists, `url` names the SAME public route the tenant's
     * page actually renders at — `landing.show`, the identical named route
     * `routes/landing.php` binds to `config('landing.host')` — rather than
     * a second, hand-built scheme+host+path.
     */
    public function test_the_url_accessor_names_the_public_route_once_a_slug_exists(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'glamour-salon',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'draft',
        ]);

        $this->assertStringContainsString(config('landing.host'), $page->url);
        $this->assertStringEndsWith('/glamour-salon', $page->url);
    }
}
