<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_staff_write_a_post_for_a_day_and_read_it_back(): void
    {
        $id = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'scheduled_date' => '2026-10-07', 'topic' => 'Autumn colours'])
            ->assertCreated()
            ->assertJsonPath('post.platform', 'instagram')
            ->assertJsonPath('post.scheduled_date', '2026-10-07')
            ->assertJsonPath('post.status', 'draft')
            ->assertJsonPath('post.language', 'en')
            ->json('post.id');

        $this->asStaffMember()->getJson($this->api("posts/{$id}"))->assertOk()->assertJsonPath('post.topic', 'Autumn colours');
        $this->assertSame($this->brandId, (int) ContentPlannerPost::find($id)->brand_id);
    }

    public function test_a_save_sends_back_what_it_read_and_gets_the_new_post(): void
    {
        $post = $this->makePost(['hook' => 'Old hook']);
        $seen = $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->json('post.updated_at');

        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'New hook', 'scheduled_time' => '10:30', 'hashtags' => ['#autumn']])
            ->assertOk()
            ->assertJsonPath('post.hook', 'New hook')
            ->assertJsonPath('post.scheduled_time', '10:30')
            ->assertJsonPath('post.hashtags', ['#autumn']);
    }

    public function test_a_move_keeps_the_time_and_the_tray_clears_both(): void
    {
        $post = $this->makePost(['scheduled_time' => '09:00']);
        $seen = $post->fresh()->updated_at->toISOString();

        $moved = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertOk()
            ->assertJsonPath('post.scheduled_date', '2026-10-09')
            ->assertJsonPath('post.scheduled_time', '09:00')
            ->json('post.updated_at');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $moved, 'scheduled_date' => null])
            ->assertOk()
            ->assertJsonPath('post.scheduled_date', null)
            ->assertJsonPath('post.scheduled_time', null);
    }

    public function test_duplicate_mark_ready_mark_published_and_delete(): void
    {
        $post = $this->makePost();

        $copy = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))
            ->assertCreated()
            ->assertJsonPath('post.status', 'draft')
            ->assertJsonPath('post.scheduled_date', '2026-10-12')
            ->json('post.id');
        $this->assertNotSame($post->id, $copy);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertOk()->assertJsonPath('post.status', 'ready_to_publish');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), ['published_url' => 'https://instagram.com/p/abc'])
            ->assertOk()
            ->assertJsonPath('post.status', 'published')
            ->assertJsonPath('post.published_url', 'https://instagram.com/p/abc');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), ['published_url' => 'not a link'])->assertStatus(422);

        $this->asStaffMember()->deleteJson($this->api("posts/{$copy}"))->assertOk();
        $this->assertNull(ContentPlannerPost::find($copy));
    }

    public function test_the_list_filters_pages_and_finds(): void
    {
        $this->makePost(['topic' => 'Autumn colours', 'status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['topic' => 'Winter care', 'platform' => 'linkedin', 'status' => 'ready_to_publish', 'scheduled_date' => '2026-10-20']);
        $this->makePost(['topic' => 'An idea for later', 'status' => 'idea', 'scheduled_date' => null]);

        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('meta.total', 3)
            ->assertJsonPath('data.0.topic', 'Winter care')       // newest scheduled first
            ->assertJsonPath('data.2.topic', 'An idea for later'); // unscheduled last
        $this->asStaffMember()->getJson($this->api('posts?platform=linkedin'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?status=draft'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?unscheduled=1'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?from=2026-10-01&to=2026-10-10'))->assertJsonCount(1, 'data');
        $this->asStaffMember()->getJson($this->api('posts?q=WINTER'))->assertJsonCount(1, 'data');

        $this->asStaffMember()->getJson($this->api('find?q=autumn'))->assertOk()->assertJsonCount(1, 'posts')->assertJsonPath('posts.0.topic', 'Autumn colours');
        $this->asStaffMember()->getJson($this->api('find?q=a'))->assertOk()->assertJsonCount(0, 'posts');
    }

    public function test_the_list_leaves_archived_posts_out_unless_asked_for(): void
    {
        $this->makePost(['topic' => 'Live post']);
        $this->makePost(['topic' => 'Old post', 'status' => 'archived']);

        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Live post')->assertJsonPath('meta.total', 1);
        $this->asStaffMember()->getJson($this->api('posts?status=archived'))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Old post');
    }

    public function test_a_card_shows_the_image_only_when_it_is_ready(): void
    {
        $post = $this->makePost();
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'image_url' => '/storage/x.png', 'image_status' => 'failed']);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.image_url', null)->assertJsonPath('post.visual_brief.image_status', 'failed');

        $post->visualBrief()->update(['image_status' => 'ready']);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.image_url', '/storage/x.png');
    }

    public function test_a_post_saved_with_no_day_has_no_time_either(): void
    {
        $post = $this->makePost(['scheduled_time' => '09:00']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => null])
            ->assertOk()->assertJsonPath('post.scheduled_date', null)->assertJsonPath('post.scheduled_time', null);
    }

    public function test_find_and_posts_put_posts_with_no_day_last(): void
    {
        $this->makePost(['topic' => 'Autumn idea', 'scheduled_date' => null]);
        $this->makePost(['topic' => 'Autumn dated', 'scheduled_date' => '2026-10-07', 'scheduled_time' => null]);
        $this->makePost(['topic' => 'Autumn timed', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '09:00']);

        $this->asStaffMember()->getJson($this->api('find?q=autumn'))->assertOk()->assertJsonPath('posts.2.topic', 'Autumn idea');
        $this->asStaffMember()->getJson($this->api('posts'))->assertOk()
            ->assertJsonPath('data.0.topic', 'Autumn timed')->assertJsonPath('data.1.topic', 'Autumn dated')->assertJsonPath('data.2.topic', 'Autumn idea');
    }
}
