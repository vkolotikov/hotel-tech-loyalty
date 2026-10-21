<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentLinks;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What each page shows, undoing a promotion, and posts that keep their page (spec 2026-10-20 §4.6, §4.7). */
class PromotionPagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    private ContentSitePage $page;
    private ContentSitePage $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready', 'scanned_at' => now()]);
        foreach (['autumn', 'winter'] as $slug) {
            $url = "https://lumiere.example/blog/{$slug}";
            $pages[] = ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url),
                'kind' => 'article', 'title' => ucfirst($slug), 'last_seen_at' => now()]);
        }
        [$this->page, $this->other] = $pages;
    }

    private function promoPost(string $status, ?ContentSitePage $page = null): ContentPlannerPost
    {
        $post = $this->makePost(['site_page_id' => ($page ?? $this->page)->id, 'status' => $status, 'generated_by' => 'promotion']);
        ContentLinks::set($post, ($page ?? $this->page)->url);

        return $post;
    }

    public function test_each_page_shows_its_posts_published_clicks_and_last_promotion(): void
    {
        $published = $this->promoPost('published');
        $this->promoPost('draft');
        $this->promoPost('archived');
        $link = ContentLink::withoutGlobalScopes()->where('post_id', $published->id)->first();
        DB::table('content_link_clicks')->insert([
            ['link_id' => $link->id, 'day' => '2026-10-04', 'via' => 'direct', 'clicks' => 5],
            ['link_id' => $link->id, 'day' => '2026-10-05', 'via' => 'bio', 'clicks' => 2],
        ]);

        $pages = collect($this->asStaffMember()->getJson($this->api('site'))->assertOk()->json('pages'))->keyBy('id');
        $this->assertSame(2, $pages[$this->page->id]['posts']);
        $this->assertSame(1, $pages[$this->page->id]['published']);
        $this->assertSame(7, $pages[$this->page->id]['clicks']);
        $this->assertNotNull($pages[$this->page->id]['last_promoted_at']);
        $this->assertSame(0, $pages[$this->other->id]['posts']);
    }

    // Final review (6-1), deferred minor: a page's clicks lost a removed post's clicks (its link stays, without its post).
    public function test_a_pages_clicks_count_every_visit_also_through_removed_posts(): void
    {
        $published = $this->promoPost('published');
        $draft = $this->promoPost('draft');
        $archived = $this->promoPost('archived');
        foreach ([[$published, 5], [$draft, 3], [$archived, 2]] as [$post, $clicks]) {
            $link = ContentLink::withoutGlobalScopes()->where('post_id', $post->id)->first();
            DB::table('content_link_clicks')->insert(['link_id' => $link->id, 'day' => '2026-10-04', 'via' => 'direct', 'clicks' => $clicks]);
        }
        // A post of this page whose Link now goes elsewhere still counts, once.
        $moved = $this->promoPost('published');
        ContentLinks::set($moved, 'https://lumiere.example/elsewhere');
        $link = ContentLink::withoutGlobalScopes()->where('post_id', $moved->id)->first();
        DB::table('content_link_clicks')->insert(['link_id' => $link->id, 'day' => '2026-10-04', 'via' => 'direct', 'clicks' => 4]);

        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()->assertJsonPath('removed', 1);
        $page = collect($this->asStaffMember()->getJson($this->api('site'))->json('pages'))->firstWhere('id', $this->page->id);
        $this->assertSame(2, $page['posts']);
        $this->assertSame(14, $page['clicks']);
        $this->assertSame(0, collect($this->asStaffMember()->getJson($this->api('site'))->json('pages'))->firstWhere('id', $this->other->id)['clicks']);
    }

    // Fixes-batch review: GET site (read every few seconds during a scan) must not read every brand's clicks; the read is
    // bounded by the pages' brand, which the content_links brand index serves.
    public function test_the_clicks_read_is_bounded_by_the_pages_brand(): void
    {
        $reads = [];
        DB::listen(function (QueryExecuted $query) use (&$reads) {
            if (str_contains($query->sql, 'content_link_clicks')) {
                $reads[] = $query->sql;
            }
        });
        $this->asStaffMember()->getJson($this->api('site'))->assertOk();
        $this->assertCount(1, $reads);
        $this->assertMatchesRegularExpression('/"content_links"\."brand_id" in \(select "brand_id" from "content_site_pages"/', $reads[0]);
    }

    public function test_everyone_reads_a_pages_posts_by_day_without_archived_ones(): void
    {
        $later = $this->promoPost('draft');
        $later->update(['scheduled_date' => '2026-10-20']);
        $sooner = $this->promoPost('published');
        $sooner->update(['scheduled_date' => '2026-10-08']);
        $this->promoPost('archived');
        $this->promoPost('draft', $this->other);

        $ids = collect($this->asStaffMember()->getJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()->json('posts'))->pluck('id')->all();
        $this->assertSame([$sooner->id, $later->id], $ids);
        $this->asStaffMember()->getJson($this->api('site/pages/999999/posts'))->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_remove_draft_posts_deletes_only_the_pages_unfinished_promotion_posts(): void
    {
        $drafts = [$this->promoPost('draft'), $this->promoPost('idea'), $this->promoPost('needs_review'), $this->promoPost('needs_visual')];
        $approved = $this->promoPost('approved');
        $this->promoPost('published');
        $otherPage = $this->promoPost('draft', $this->other);

        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()
            ->assertJsonPath('removed', 4)
            ->assertJsonPath('kept', 2)
            ->assertJsonPath('page.id', $this->page->id)
            ->assertJsonPath('page.posts', 2);
        foreach ($drafts as $post) {
            $this->assertNull(ContentPlannerPost::find($post->id));
            // Its short link keeps working (release 5b): the row stays, without its post.
            $this->assertNotNull(ContentLink::withoutGlobalScopes()->where('destination', $this->page->url)->whereNull('post_id')->first());
        }
        $this->assertNotNull($approved->fresh());
        $this->assertNotNull($otherPage->fresh());
    }

    // Final review (6-1), deferred minor: a post approved in another tab while Remove draft posts ran was still removed.
    public function test_remove_draft_posts_keeps_a_post_approved_meanwhile(): void
    {
        $draft = $this->promoPost('draft');
        $meanwhile = $this->promoPost('draft');
        $done = false;
        DB::listen(function (QueryExecuted $query) use ($meanwhile, &$done) {
            if ($done || !str_starts_with(strtolower(ltrim($query->sql)), 'select')
                || !str_contains($query->sql, 'from "content_planner_posts"') || !str_contains($query->sql, '"site_page_id"')) {
                return;
            }
            $done = true;
            DB::table('content_planner_posts')->where('id', $meanwhile->id)->update(['status' => 'approved', 'updated_at' => now()->addSeconds(5)]);
        });

        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()->assertJsonPath('removed', 1);
        $this->assertNull(ContentPlannerPost::find($draft->id));
        $this->assertSame('approved', $meanwhile->fresh()->status);
    }

    public function test_only_managers_remove_drafts_and_not_while_a_promotion_runs(): void
    {
        $this->asStaffMember()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertStatus(403);
        $this->asManager()->deleteJson($this->api('site/pages/999999/posts'))->assertStatus(404)->assertJsonPath('error', 'not_found');

        ContentPromotion::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->page->id,
            'batch' => 'b', 'status' => 'queued', 'posts_wanted' => 1, 'slots' => []]);
        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertStatus(409)->assertJsonPath('error', 'already_promoting');
    }

    public function test_the_panel_says_which_page_a_post_promotes(): void
    {
        $post = $this->promoPost('draft');

        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.promotes', ['id' => $this->page->id, 'title' => 'Autumn', 'url' => 'https://lumiere.example/blog/autumn']);
        $this->asStaffMember()->getJson($this->api('posts/' . $this->makePost()->id))->assertOk()->assertJsonPath('post.promotes', null);
    }

    public function test_versions_repeat_copies_and_duplicates_keep_the_page(): void
    {
        $post = $this->promoPost('draft');

        $versions = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => false])->assertCreated()->json('versions');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($versions[0]['id'])->site_page_id);

        $copies = $this->asManager()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21', 'ai_rewrite' => false])->assertCreated()->json('copies');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($copies[0]['id'])->site_page_id);

        $duplicate = $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->json('post');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($duplicate['id'])->site_page_id);
        $this->assertSame('promote-autumn', ContentLink::withoutGlobalScopes()->where('post_id', $duplicate['id'])->first()->utm['utm_campaign']);
    }
}
