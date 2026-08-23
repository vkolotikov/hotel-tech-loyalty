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
}
