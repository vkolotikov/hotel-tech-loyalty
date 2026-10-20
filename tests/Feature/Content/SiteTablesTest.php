<?php

namespace Tests\Feature\Content;

use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Release 6's tables (spec 2026-10-20 §6.1): a site per profile, its pages, its promotions, and a post's page. */
class SiteTablesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function site(): ContentSite
    {
        return ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example']);
    }

    public function test_a_site_its_pages_and_a_promotion_keep_their_values(): void
    {
        $site = $this->site();
        $page = ContentSitePage::create([
            'site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/blog/autumn-colours',
            'url_hash' => hash('sha256', 'https://lumiere.example/blog/autumn-colours'), 'kind' => 'article', 'title' => 'Autumn colours',
            'published_at' => '2026-09-01 10:00:00', 'last_seen_at' => now(),
        ]);
        $promotion = ContentPromotion::create([
            'planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $page->id, 'batch' => 'b-1',
            'status' => 'queued', 'posts_wanted' => 2, 'slots' => [['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']],
        ]);
        $post = $this->makePost(['site_page_id' => $page->id]);

        $site->refresh();
        $this->assertSame('new', $site->status);
        $this->assertFalse($site->summary_edited);
        $this->assertSame($this->org->id, (int) $site->organization_id);
        $this->assertSame('2026-09-01', $page->fresh()->published_at->format('Y-m-d'));
        $this->assertSame('instagram', $promotion->fresh()->slots[0]['platform']);
        $this->assertTrue($promotion->fresh()->use_picture);
        $this->assertSame(0, $promotion->fresh()->posts_made);
        $this->assertSame($page->id, $promotion->fresh()->page->id);
        $this->assertSame($page->id, (int) $post->fresh()->site_page_id);
    }

    public function test_one_site_per_profile_and_one_row_per_address(): void
    {
        $site = $this->site();
        $row = ['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/', 'url_hash' => hash('sha256', 'https://lumiere.example/'), 'kind' => 'page', 'title' => 'Home'];
        ContentSitePage::create($row);

        $this->expectException(QueryException::class);
        ContentSitePage::create($row);
    }

    public function test_a_second_site_for_the_same_profile_is_refused(): void
    {
        $this->site();
        $this->expectException(QueryException::class);
        $this->site();
    }

    public function test_the_campaign_name_comes_from_the_address_else_the_title(): void
    {
        $page = new ContentSitePage(['url' => 'https://lumiere.example/blog/How-To_Choose%20Colour.html', 'title' => 'Ignored']);
        $this->assertSame('promote-how-to-choose-colour', $page->campaignName());
        $this->assertSame('promote-our-prices', (new ContentSitePage(['url' => 'https://lumiere.example/', 'title' => 'Our prices']))->campaignName());
        $this->assertSame('promote-website', (new ContentSitePage(['url' => 'https://lumiere.example/', 'title' => '']))->campaignName());
        $long = (new ContentSitePage(['url' => 'https://lumiere.example/' . str_repeat('a-', 40), 'title' => '']))->campaignName();
        $this->assertLessThanOrEqual(58, strlen($long));
        $this->assertStringEndsNotWith('-', $long);
    }
}
