<?php

namespace Tests\Feature\Content;

use App\Jobs\WritePromotionPosts;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\PromotionWriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A promotion from the press to its last page (spec 2026-10-20 §4.2, §4.5); the queue is sync, the AI replaced. */
class PromotionTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private ContentSite $site;
    /** @var list<ContentSitePage> */
    private array $pages = [];
    /** @var list<string> */
    public array $written = [];
    /** @var (\Closure(array): void)|null */
    public ?\Closure $onWrite = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->fakeWebsite([]);
        $this->site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready', 'scanned_at' => now()]);
        foreach ([1, 2, 3] as $i) {
            $url = "https://lumiere.example/blog/post-{$i}";
            $this->pages[] = ContentSitePage::create(['site_id' => $this->site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url),
                'kind' => 'article', 'title' => "Post {$i}", 'body' => "Body {$i}", 'last_seen_at' => now()]);
        }
        $test = $this;
        $this->app->instance(PromotionWriter::class, new class($test) extends PromotionWriter {
            public function __construct(private PromotionTest $test)
            {
            }

            public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
            {
                $this->test->written[] = $page['title'];
                if ($this->test->onWrite !== null) {
                    ($this->test->onWrite)($page);
                }

                return array_map(fn (array $slot) => ['platform' => $slot['platform'], 'angle' => 'tip', 'topic' => 'T', 'hook' => 'H ' . $slot['date'],
                    'main_copy' => 'C', 'short_copy' => null, 'cta' => null, 'hashtags' => [], 'post_type' => null, 'visual_idea' => null], $slots);
            }
        });
    }

    /** @return array<string, mixed> */
    private function body(array $overrides = []): array
    {
        return $overrides + [
            'page_ids' => [$this->pages[0]->id, $this->pages[1]->id], 'posts_per_page' => 2, 'platforms' => ['instagram', 'linkedin'],
            'from' => '2026-10-05', 'to' => '2026-10-18', 'per_week' => 3,
        ];
    }

    private function queuedRow(array $attributes = []): ContentPromotion
    {
        return ContentPromotion::create($attributes + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->pages[0]->id,
            'batch' => 'old', 'status' => 'queued', 'posts_wanted' => 1, 'slots' => [['platform' => 'instagram', 'date' => '2026-10-07', 'time' => null]]]);
    }

    public function test_the_preview_says_how_many_fit_without_writing(): void
    {
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body())->assertOk()
            ->assertExactJson(['wanted' => 4, 'fit' => 4, 'first_date' => '2026-10-05', 'last_date' => '2026-10-16', 'weeks' => 2]);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15]))->assertOk()
            ->assertJsonPath('wanted', 30)->assertJsonPath('fit', 6);
        $this->assertSame(0, ContentPlannerPost::count());
        $this->assertSame([], $this->written);
    }

    public function test_the_checks_refuse_what_cannot_be_promoted(): void
    {
        $this->asStaffMember()->postJson($this->api('promotions/preview'), $this->body())->assertStatus(403);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['page_ids' => [999999]]))->assertStatus(404)->assertJsonPath('error', 'page_not_found');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['platforms' => ['blog']]))->assertStatus(422);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['platforms' => ['tiktok']]))->assertStatus(422)->assertJsonPath('error', 'no_channels');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15, 'page_ids' => array_fill(0, 14, $this->pages[0]->id)]))->assertStatus(422);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['from' => '2026-09-01', 'to' => '2026-09-30']))->assertStatus(422)->assertJsonPath('error', 'range_in_past');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['to' => '2027-06-01']))->assertStatus(422);
    }

    public function test_too_many_posts_in_one_press_are_refused(): void
    {
        foreach (range(4, 14) as $i) {
            $url = "https://lumiere.example/blog/post-{$i}";
            $this->pages[] = ContentSitePage::create(['site_id' => $this->site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url), 'kind' => 'article', 'title' => "Post {$i}"]);
        }
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15, 'page_ids' => array_map(fn ($page) => $page->id, $this->pages)]))
            ->assertStatus(422)->assertJsonPath('error', 'too_many_posts');
    }

    public function test_a_manager_promotes_and_every_page_gets_its_posts(): void
    {
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('created_count', 4)
            ->assertJsonPath('wanted_count', 4)
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.0.title', 'Post 1')
            ->assertJsonPath('pages.1.status', 'done');
        $this->assertSame(['Post 1', 'Post 2'], $this->written);
        $this->assertSame(2, ContentPlannerPost::where('site_page_id', $this->pages[0]->id)->count());
        $this->assertSame([$this->manager->id], ContentPlannerPost::where('generated_by', 'promotion')->pluck('created_by')->map(fn ($id) => (int) $id)->unique()->values()->all());
    }

    public function test_posts_that_do_not_fit_refuse_the_press(): void
    {
        $this->asManager()->postJson($this->api('promotions'), $this->body(['posts_per_page' => 15]))
            ->assertStatus(422)->assertJsonPath('error', 'period_too_short')->assertJsonPath('fit', 6)->assertJsonPath('wanted', 30);
    }

    public function test_a_second_promotion_while_one_runs_is_refused(): void
    {
        $this->queuedRow();
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(409)->assertJsonPath('error', 'already_promoting');
    }

    public function test_a_stale_promotion_gives_way_and_is_marked_failed(): void
    {
        $old = $this->queuedRow(['status' => 'writing', 'started_at' => now()->subMinutes(11)]);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->assertSame(['failed', 'promotion_failed'], [$old->fresh()->status, $old->fresh()->error]);
    }

    public function test_nothing_is_promoted_while_the_site_is_scanned_or_the_budget_is_used_up(): void
    {
        $this->site->forceFill(['status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()])->save();
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(409)->assertJsonPath('error', 'scan_running');

        $this->site->forceFill(['status' => 'ready'])->save();
        $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }

    public function test_the_budget_running_out_midway_stops_the_rest(): void
    {
        $this->onWrite = fn () => $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('promotions'), $this->body(['page_ids' => [$this->pages[0]->id, $this->pages[1]->id, $this->pages[2]->id]]))
            ->assertOk()
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.1.status', 'failed')
            ->assertJsonPath('pages.1.error', 'ai_budget_used_up')
            ->assertJsonPath('pages.2.error', 'ai_budget_used_up');
        $this->assertSame(['Post 1'], $this->written);
    }

    public function test_one_failing_page_does_not_stop_the_others(): void
    {
        $this->onWrite = function (array $page) {
            if ($page['title'] === 'Post 2') {
                throw new \RuntimeException('provider down');
            }
        };
        $this->asManager()->postJson($this->api('promotions'), $this->body(['page_ids' => [$this->pages[0]->id, $this->pages[1]->id, $this->pages[2]->id], 'to' => '2026-10-25']))
            ->assertOk()
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.1.status', 'failed')
            ->assertJsonPath('pages.1.error', 'ai_failed')
            ->assertJsonPath('pages.2.status', 'done');
    }

    public function test_stop_leaves_the_queued_pages_unwritten(): void
    {
        $this->queuedRow(['batch' => 'b-1']);
        $this->queuedRow(['batch' => 'b-1', 'site_page_id' => $this->pages[1]->id]);

        $this->asManager()->deleteJson($this->api('promotions/current'))->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('pages.0.status', 'stopped')
            ->assertJsonPath('pages.1.status', 'stopped');
        $this->asStaffMember()->deleteJson($this->api('promotions/current'))->assertStatus(403);
    }

    public function test_the_current_promotion_reads_idle_then_finished_then_idle_again(): void
    {
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertExactJson(['status' => 'idle']);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertJsonPath('status', 'finished');

        $this->travel(61)->minutes();
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertExactJson(['status' => 'idle']);
    }

    public function test_a_late_job_does_nothing_and_a_killed_job_moves_on_to_the_next_page(): void
    {
        $stopped = $this->queuedRow(['batch' => 'b-1', 'status' => 'stopped']);
        (new WritePromotionPosts($stopped->id))->handle(app(ContentPromotionPosts::class), app(\App\Services\Content\ContentAiGate::class));
        $this->assertSame([], $this->written);

        $writing = $this->queuedRow(['batch' => 'b-2', 'status' => 'writing', 'started_at' => now(), 'created_by' => $this->manager->id]);
        $next = $this->queuedRow(['batch' => 'b-2', 'site_page_id' => $this->pages[1]->id, 'created_by' => $this->manager->id]);
        (new WritePromotionPosts($writing->id))->failed(new \RuntimeException('killed'));

        $this->assertSame(['failed', 'promotion_failed'], [$writing->fresh()->status, $writing->fresh()->error]);
        $this->assertSame('done', $next->fresh()->status);
        $this->assertSame(['Post 2'], $this->written);
    }

    public function test_an_inactive_channel_is_not_used(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'linkedin')->update(['active' => false]);

        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->assertSame(['instagram'], ContentPlannerPost::where('generated_by', 'promotion')->pluck('platform')->unique()->values()->all());
    }
}
