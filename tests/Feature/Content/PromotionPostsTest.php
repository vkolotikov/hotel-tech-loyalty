<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\PromotionWriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Writing one page's promotion posts (spec 2026-10-20 §4.4): the AI replaced, the page and its picture faked. */
class PromotionPostsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private const URL = 'https://lumiere.example/blog/autumn-colours';
    private const IMAGE = 'https://lumiere.example/a.png';

    private ContentSitePage $page;
    /** @var list<array> */
    public array $calls = [];
    /** @var (\Closure(array, array): list<array|null>)|null */
    public ?\Closure $answer = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['filesystems.media_disk' => 'public']);
        Storage::fake('public');
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready']);
        $this->page = ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => self::URL, 'url_hash' => hash('sha256', self::URL),
            'kind' => 'article', 'title' => 'Autumn colours', 'description' => 'Three warm tones.', 'image_url' => self::IMAGE, 'body' => 'Kept text.']);
        $this->fakeWebsite([
            self::URL => '<html><head><title>Autumn colours</title></head><body><article><p>Fresh text.</p></article></body></html>',
            self::IMAGE => [self::pngBytes()],
        ]);
        $test = $this;
        $this->app->instance(PromotionWriter::class, new class($test) extends PromotionWriter {
            public function __construct(private PromotionPostsTest $test)
            {
            }

            public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
            {
                $this->test->calls[] = compact('page', 'slots', 'earlierHooks', 'instructions');
                if ($this->test->answer !== null) {
                    return ($this->test->answer)($page, $slots);
                }

                return array_map(fn (array $slot) => ['platform' => $slot['platform'], 'angle' => 'question', 'topic' => 'Warm tones',
                    'hook' => 'Hook ' . $slot['date'], 'main_copy' => 'Copy.', 'short_copy' => null, 'cta' => 'Read more',
                    'hashtags' => ['#hair'], 'post_type' => 'how_to', 'visual_idea' => 'A warm still life.'], $slots);
            }
        });
    }

    private function row(array $attributes = []): ContentPromotion
    {
        return ContentPromotion::create($attributes + [
            'planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->page->id, 'batch' => 'b-1',
            'status' => 'writing', 'started_at' => now(), 'posts_wanted' => 2, 'created_by' => $this->manager->id, 'instructions' => 'Mention the offer.',
            'slots' => [['platform' => 'linkedin', 'date' => '2026-10-06', 'time' => '09:00'], ['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']],
        ]);
    }

    private function write(ContentPromotion $row): ContentPromotion
    {
        app(ContentPromotionPosts::class)->write($row);

        return $row->fresh();
    }

    public function test_each_slot_becomes_a_draft_that_promotes_the_page(): void
    {
        $row = $this->write($this->row());

        $this->assertSame('done', $row->status);
        $this->assertSame(2, $row->posts_made);
        $this->assertNull($row->error);
        $this->assertNotNull($row->finished_at);
        $posts = ContentPlannerPost::where('site_page_id', $this->page->id)->orderBy('scheduled_date')->get();
        $this->assertSame(['linkedin', 'instagram'], $posts->pluck('platform')->all());
        $first = $posts[0];
        $this->assertSame('2026-10-06', $first->scheduled_date->format('Y-m-d'));
        $this->assertSame('09:00', substr((string) $first->scheduled_time, 0, 5));
        $this->assertSame('draft', $first->status);
        $this->assertSame('promotion', $first->generated_by);
        $this->assertSame($this->manager->id, (int) $first->created_by);
        $this->assertSame('Promote: Autumn colours', $first->goal);
        $this->assertSame('Promotes ' . self::URL . ' — question', $first->strategic_reason);
        $this->assertSame(['kind' => 'promotion', 'page_id' => $this->page->id, 'angle' => 'question'], $first->source_context);
        $this->assertSame('consideration', $first->funnel_stage);
        $this->assertSame('how_to', $first->post_type);
        $this->assertSame(['#hair'], $first->hashtags);
        $this->assertSame('en', $first->language);
        $this->assertSame('Warm tones', $first->topic);
    }

    public function test_each_post_has_its_own_tracked_link_and_link_friendly_text_carries_it(): void
    {
        $this->write($this->row());
        [$linkedin, $instagram] = ContentPlannerPost::where('site_page_id', $this->page->id)->orderBy('scheduled_date')->get()->all();

        $linkedinLink = ContentLink::withoutGlobalScopes()->where('post_id', $linkedin->id)->first();
        $this->assertSame(self::URL, $linkedinLink->destination);
        $this->assertSame('promote-autumn-colours', $linkedinLink->utm['utm_campaign']);
        $this->assertSame('linkedin', $linkedinLink->utm['utm_source']);
        $this->assertSame("Copy.\n\n" . ContentLinks::shortUrl($linkedinLink->code), $linkedin->main_copy);
        $this->assertNotSame($linkedinLink->code, ContentLink::withoutGlobalScopes()->where('post_id', $instagram->id)->value('code'));
        $this->assertSame('Copy.', $instagram->main_copy);
    }

    public function test_the_pages_picture_is_copied_once_and_shared(): void
    {
        $this->write($this->row());
        $this->write($this->row(['batch' => 'b-2', 'slots' => [['platform' => 'linkedin', 'date' => '2026-10-13', 'time' => null]], 'posts_wanted' => 1]));

        $images = ContentPlannerPost::where('site_page_id', $this->page->id)->with('visualBrief')->get()->map(fn ($post) => $post->visualBrief?->image_url)->unique()->values();
        $this->assertCount(1, $images);
        $this->assertStringStartsWith('/storage/', $images[0]);
        $this->assertSame($images[0], $this->page->fresh()->picture_url);
        $this->assertSame(self::IMAGE, $this->page->fresh()->picture_source);
        $this->assertSame('ready', ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->image_status);
        $this->assertSame('A warm still life.', ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->description);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->url() === self::IMAGE));
    }

    public function test_without_the_picture_switch_no_picture_is_used(): void
    {
        $this->write($this->row(['use_picture' => false]));

        $this->assertNull(ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->image_url);
        $this->assertCount(0, Http::recorded(fn (Request $request) => $request->url() === self::IMAGE));
    }

    public function test_the_writer_reads_the_page_again_with_the_instructions_and_earlier_hooks(): void
    {
        $this->makePost(['site_page_id' => $this->page->id, 'hook' => 'Old hook']);
        $this->write($this->row());

        $this->assertSame('Fresh text.', $this->calls[0]['page']['text']);
        $this->assertSame('Fresh text.', $this->page->fresh()->body);
        $this->assertSame(['Old hook'], $this->calls[0]['earlierHooks']);
        $this->assertSame('Mention the offer.', $this->calls[0]['instructions']);
        $this->assertSame([['platform' => 'linkedin', 'date' => '2026-10-06', 'time' => '09:00'], ['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']], $this->calls[0]['slots']);
    }

    public function test_a_page_that_cannot_be_read_again_uses_its_kept_text(): void
    {
        $this->fakeWebsite([]);
        $this->write($this->row(['use_picture' => false]));

        $this->assertSame('Kept text.', $this->calls[0]['page']['text']);
    }

    /** Final review: read again at writing time, a page that now leaves the site or answers a short error keeps its text. */
    public function test_a_page_that_now_redirects_off_the_site_or_answers_a_short_error_keeps_its_text(): void
    {
        $this->fakeWebsite([
            self::URL => ['', 301, ['Location' => 'https://elsewhere.example/']],
            'https://elsewhere.example/' => '<html><body><main><p>Another site entirely, with its own long text about other things.</p></main></body></html>',
        ]);
        $this->write($this->row(['use_picture' => false]));
        $this->assertSame('Kept text.', $this->calls[0]['page']['text']);

        $this->page->update(['body' => str_repeat('Copper suits warm skin. ', 40)]);
        $this->fakeWebsite([self::URL => '<html><body><main><p>Page not found</p></main></body></html>']);
        $this->write($this->row(['batch' => 'b-2', 'use_picture' => false]));
        $this->assertStringStartsWith('Copper suits warm skin.', $this->calls[1]['page']['text']);
        $this->assertStringStartsWith('Copper suits warm skin.', (string) $this->page->fresh()->body);
    }

    public function test_a_failing_writer_partial_and_empty_answers_and_a_gone_page(): void
    {
        $this->answer = fn () => throw new \RuntimeException('provider down');
        $failed = $this->write($this->row());
        $this->assertSame(['failed', 'ai_failed', 0], [$failed->status, $failed->error, $failed->posts_made]);
        $this->assertSame(0, ContentPlannerPost::where('site_page_id', $this->page->id)->count());

        $this->answer = fn (array $page, array $slots) => [['platform' => 'linkedin', 'angle' => null, 'topic' => null, 'hook' => 'H', 'main_copy' => 'C', 'short_copy' => null, 'cta' => null, 'hashtags' => [], 'post_type' => null, 'visual_idea' => null], null];
        $partial = $this->write($this->row(['batch' => 'b-2']));
        $this->assertSame(['done', 'ai_incomplete', 1], [$partial->status, $partial->error, $partial->posts_made]);
        $this->assertSame('Autumn colours', ContentPlannerPost::where('site_page_id', $this->page->id)->value('topic'));

        $this->answer = fn () => [null, null];
        $empty = $this->write($this->row(['batch' => 'b-3']));
        $this->assertSame(['failed', 'ai_failed'], [$empty->status, $empty->error]);

        $gone = $this->write($this->row(['batch' => 'b-4', 'site_page_id' => null]));
        $this->assertSame(['failed', 'page_gone'], [$gone->status, $gone->error]);
    }

    public function test_the_campaign_tag_is_the_campaign_then_the_page_then_the_plan(): void
    {
        $campaign = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Autumn Sale']);
        $this->assertSame('autumn-sale', ContentLinks::tagsFor($this->makePost(['campaign_id' => $campaign->id, 'site_page_id' => $this->page->id]))['utm_campaign']);
        $this->assertSame('promote-autumn-colours', ContentLinks::tagsFor($this->makePost(['site_page_id' => $this->page->id]))['utm_campaign']);
        $this->assertSame('content-plan', ContentLinks::tagsFor($this->makePost())['utm_campaign']);
    }
}
