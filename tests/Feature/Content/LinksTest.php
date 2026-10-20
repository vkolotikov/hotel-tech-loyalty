<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A post's Link and its short link (spec 2026-10-19 §5.1, §5.2, §5.5, §7.2). Today is Monday 5 October 2026. */
class LinksTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function go(string $code): string
    {
        return 'http://' . config('landing.host') . '/go/' . $code;
    }

    public function test_a_link_saved_with_a_post_becomes_its_short_link_and_a_new_address_keeps_the_code(): void
    {
        $created = $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Autumn', 'link' => '  https://lumiere.example/autumn  '])
            ->assertCreated();
        $code = $created->json('post.link.code');
        $this->assertMatchesRegularExpression('/^[abcdefghijkmnpqrstuvwxyz23456789]{7}$/', (string) $code);
        $created->assertJsonPath('post.link.short_url', route('content.go', ['code' => $code]))
            ->assertJsonPath('post.link.destination', 'https://lumiere.example/autumn')
            ->assertJsonPath('post.link.on', true)
            ->assertJsonPath('post.link.clicks', 0)
            ->assertJsonPath('post.link.clicks_bio', 0)
            ->assertJsonCount(14, 'post.link.days')
            ->assertJsonPath('post.link.days.13', ['day' => '2026-10-05', 'clicks' => 0])
            ->assertJsonPath('post.link.days.0', ['day' => '2026-09-22', 'clicks' => 0])
            ->assertJsonPath('post.clicks', 0);

        $this->asManager()->putJson($this->api("posts/{$created->json('post.id')}"), ['link' => 'https://lumiere.example/winter', 'updated_at' => $created->json('post.updated_at')])
            ->assertOk()->assertJsonPath('post.link.code', $code)->assertJsonPath('post.link.destination', 'https://lumiere.example/winter');
        $this->assertSame(1, ContentLink::count());
        // A post saved without a Link has none.
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Plain'])->assertCreated()->assertJsonPath('post.link', null);
    }

    public function test_clearing_the_link_switches_its_code_off_and_a_new_address_switches_the_same_code_on(): void
    {
        $post = $this->makePost();
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $code = ContentLinks::ofPost($post)->code;
        $save = fn (?string $link) => $this->asManager()->putJson($this->api("posts/{$post->id}"), ['link' => $link, 'updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk();

        $save(null)->assertJsonPath('post.link.on', false)->assertJsonPath('post.link.destination', null)->assertJsonPath('post.link.code', $code);
        $this->get($this->go($code))->assertNotFound()->assertSee('This link is no longer active');
        $save('')->assertJsonPath('post.link.on', false);
        $save('https://lumiere.example/winter')->assertJsonPath('post.link.on', true)->assertJsonPath('post.link.code', $code);
        $this->get($this->go($code))->assertStatus(302);
        $this->assertSame(1, ContentLink::count());
    }

    public function test_a_bad_link_is_refused_and_nothing_of_the_save_is_kept(): void
    {
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'New', 'link' => 'ftp://lumiere.example'])
            ->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->assertSame(0, ContentPlannerPost::where('topic', 'New')->count());

        $post = $this->makePost(['hook' => 'Old hook']);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['hook' => 'New hook', 'link' => 'javascript:alert(1)', 'updated_at' => $post->updated_at->toISOString()])
            ->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->assertSame('Old hook', $post->fresh()->hook);
        $this->assertSame(0, ContentLink::count());
    }

    public function test_the_tags_follow_the_posts_platform_and_campaign(): void
    {
        $post = $this->makePost();
        $save = fn (array $fields) => $this->asManager()->putJson($this->api("posts/{$post->id}"), $fields + ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk();
        $save(['link' => 'https://lumiere.example/autumn']);
        $this->assertSame(
            ['utm_source' => 'instagram', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => "post-{$post->id}"],
            ContentLinks::ofPost($post)->utm,
        );

        $campaign = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Autumn Offer', 'status' => 'draft']);
        $save(['campaign_id' => $campaign->id]);
        $this->assertSame('autumn-offer', ContentLinks::ofPost($post)->utm['utm_campaign']);
        $save(['platform' => 'linkedin']);
        $link = ContentLinks::ofPost($post);
        $this->assertSame('linkedin', $link->utm['utm_source']);
        $this->get($this->go($link->code))
            ->assertHeader('Location', "https://lumiere.example/autumn?utm_source=linkedin&utm_medium=social&utm_campaign=autumn-offer&utm_content=post-{$post->id}");
    }

    public function test_deleting_a_post_keeps_its_short_link_working(): void
    {
        $post = $this->makePost();
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $link = ContentLinks::ofPost($post);
        $this->asManager()->deleteJson($this->api("posts/{$post->id}"))->assertOk();

        $link->refresh();
        $this->assertNull($link->post_id);
        $this->assertSame('https://lumiere.example/autumn', $link->destination);
        $this->get($this->go($link->code))->assertStatus(302);
    }

    // Review Focus 4: a Link-only change moves the post's version on; under approvals it is a change of words.
    public function test_a_new_link_is_a_change_of_words_and_of_the_post(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved']);
        ContentLinks::set($post, 'https://lumiere.example/a');
        $seen = $post->fresh()->updated_at->toISOString();
        $this->travel(5)->minutes();

        // The same address again changes nothing.
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/a', 'updated_at' => $seen])
            ->assertOk()->assertJsonPath('post.status', 'approved')->assertJsonPath('post.updated_at', $seen);
        // A new one sends the approved post back to review.
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/b', 'updated_at' => $seen])
            ->assertOk()->assertJsonPath('post.status', 'needs_review')->assertJsonPath('post.link.destination', 'https://lumiere.example/b');
        $this->assertSame(['changed_after_approval'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('kind')->all());
        // A panel still holding the old version cannot put the old Link back.
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/a', 'updated_at' => $seen])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('https://lumiere.example/b', ContentLinks::ofPost($post)->destination);

        // A manager's new Link keeps an approved post approved.
        $approved = $this->makePost(['status' => 'approved']);
        $this->asManager()->putJson($this->api("posts/{$approved->id}"), ['link' => 'https://lumiere.example/d', 'updated_at' => $approved->updated_at->toISOString()])
            ->assertOk()->assertJsonPath('post.status', 'approved');
    }

    public function test_cards_carry_their_clicks_and_the_panel_its_last_fourteen_days(): void
    {
        $post = $this->makePost();
        $plain = $this->makePost(['topic' => 'No link']);
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $linkId = ContentLinks::ofPost($post)->id;
        DB::table('content_link_clicks')->insert([
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'direct', 'clicks' => 3],
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'bio', 'clicks' => 2],
            ['link_id' => $linkId, 'day' => '2026-09-22', 'via' => 'direct', 'clicks' => 1],
            ['link_id' => $linkId, 'day' => '2026-09-21', 'via' => 'direct', 'clicks' => 7],
        ]);

        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.link.clicks', 13)
            ->assertJsonPath('post.link.clicks_bio', 2)
            ->assertJsonPath('post.link.days.0', ['day' => '2026-09-22', 'clicks' => 1])
            ->assertJsonPath('post.link.days.12', ['day' => '2026-10-04', 'clicks' => 0])
            ->assertJsonPath('post.link.days.13', ['day' => '2026-10-05', 'clicks' => 5])
            ->assertJsonPath('post.clicks', 13);
        $cards = collect($this->asManager()->getJson($this->api('posts'))->assertOk()->json('data'))->keyBy('id');
        $this->assertSame(13, $cards[$post->id]['clicks']);
        $this->assertSame(0, $cards[$plain->id]['clicks']);
    }

    // 5B-1 review: a post save and its Link are one write — a Link that cannot be written leaves the post as it was.
    public function test_a_save_whose_short_link_cannot_be_written_changes_nothing(): void
    {
        ContentLink::creating(fn () => throw new \RuntimeException('the link store is down'));
        $posts = ContentPlannerPost::count();
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'New', 'link' => 'https://lumiere.example/new'])->assertStatus(500);
        $this->assertSame($posts, ContentPlannerPost::count());

        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'draft', 'topic' => 'Before']);
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), [
            'updated_at' => $post->updated_at->toISOString(), 'topic' => 'After', 'status' => 'needs_review', 'link' => 'https://lumiere.example/after',
        ])->assertStatus(500);
        $this->assertSame('Before', $post->fresh()->topic);
        $this->assertSame('draft', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
        ContentLink::flushEventListeners();
    }
}
