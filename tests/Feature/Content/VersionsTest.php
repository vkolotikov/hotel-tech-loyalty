<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Versions per platform (spec 2026-10-19 §3): linked sibling posts, each an ordinary post. Today is Monday 5 October 2026. */
class VersionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_making_versions_copies_the_post_as_drafts_for_each_platform_in_one_group(): void
    {
        $post = $this->makePost([
            'status' => 'approved', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '18:00', 'title' => 'Autumn offer',
            'hook' => 'Three colours for October', 'main_copy' => 'Warm tones.', 'cta' => 'Book now', 'hashtags' => ['#autumn'],
            'language' => 'en', 'generated_by' => 'manual', 'created_by' => $this->manager->id,
        ]);
        $seen = $post->updated_at->toISOString();

        $answer = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook']])
            ->assertCreated()
            ->assertJsonCount(2, 'versions')
            ->assertJsonPath('versions.0.platform', 'linkedin')
            ->assertJsonPath('versions.1.platform', 'facebook')
            ->assertJsonPath('versions.0.status', 'draft')
            ->assertJsonPath('versions.0.scheduled_date', '2026-10-07')
            ->assertJsonPath('versions.0.scheduled_time', '18:00')
            ->assertJsonPath('versions.0.group_size', 3)
            ->assertJsonPath('post.group_size', 3)
            ->assertJsonPath('post.group.id', $post->id)
            ->assertJsonPath('post.group.posts.0.id', $post->id)
            ->assertJsonPath('post.group.posts.1.platform', 'linkedin')
            ->assertJsonPath('post.group.posts.1.status', 'draft');

        $version = ContentPlannerPost::findOrFail($answer->json('versions.0.id'));
        $this->assertSame('Autumn offer', $version->title);
        $this->assertSame('Three colours for October', $version->hook);
        $this->assertSame('Warm tones.', $version->main_copy);
        $this->assertSame('Book now', $version->cta);
        $this->assertSame(['#autumn'], $version->hashtags);
        $this->assertSame('version', $version->generated_by);
        $this->assertSame($this->staffMember->id, (int) $version->created_by);
        $this->assertSame($post->id, (int) $version->group_id);
        $this->assertSame($post->id, (int) $post->fresh()->group_id);
        $this->assertSame('approved', $post->fresh()->status, 'the original keeps its status');
        $this->assertSame($seen, $post->fresh()->updated_at->toISOString(), 'joining a group is not an edit');
    }

    public function test_a_version_gets_its_own_copy_of_the_picture_and_none_of_the_published_details_or_the_series(): void
    {
        $post = $this->makePost(['status' => 'published', 'published_url' => 'https://instagram.com/p/1', 'published_at' => now()]);
        $post->forceFill(['series_id' => $post->id])->save();
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'description' => 'A warm still life', 'image_url' => 'https://cdn.example.test/a.png', 'image_status' => 'ready']);

        $id = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])
            ->assertCreated()
            ->assertJsonPath('versions.0.image_url', 'https://cdn.example.test/a.png')
            ->json('versions.0.id');

        $version = ContentPlannerPost::findOrFail($id);
        $this->assertSame('draft', $version->status);
        $this->assertNull($version->published_url);
        $this->assertNull($version->published_at);
        $this->assertNull($version->series_id);
        $brief = ContentPlannerVisualBrief::where('post_id', $id)->firstOrFail();
        $this->assertSame('A warm still life', $brief->description);
        // A change to one brief is that post's alone.
        $brief->update(['description' => 'Changed']);
        $this->assertSame('A warm still life', ContentPlannerVisualBrief::where('post_id', $post->id)->value('description'));
    }

    public function test_a_platform_already_in_the_group_is_refused_and_nothing_of_the_call_is_made(): void
    {
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['facebook', 'linkedin']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->assertSame(2, ContentPlannerPost::where('group_id', $post->id)->count(), 'nothing of a refused call is made');

        // Made from a version, a new one joins the same group.
        $version = ContentPlannerPost::where('group_id', $post->id)->where('id', '!=', $post->id)->firstOrFail();
        $this->asStaffMember()->postJson($this->api("posts/{$version->id}/versions"), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->asStaffMember()->postJson($this->api("posts/{$version->id}/versions"), ['platforms' => ['x']])
            ->assertCreated()->assertJsonPath('post.group.id', $post->id)->assertJsonPath('versions.0.group_size', 3);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => []])->assertStatus(422)->assertJsonValidationErrors('platforms');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['myspace']])->assertStatus(422)->assertJsonValidationErrors('platforms.0');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['tiktok', 'tiktok']])->assertStatus(422);

        $other = $this->otherOrganization();
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/versions"), ['platforms' => ['linkedin']])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_unlink_and_delete_leave_the_others_grouped_and_an_open_panel_can_still_save(): void
    {
        $post = $this->makePost();
        [$linkedin, $facebook] = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook']])
            ->json('versions.*.id');
        $seen = ContentPlannerPost::findOrFail($linkedin)->updated_at->toISOString();

        $this->asStaffMember()->deleteJson($this->api("posts/{$linkedin}/group"))->assertOk()
            ->assertJsonPath('post.group', null)->assertJsonPath('post.group_size', 0);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.group_size', 2)->assertJsonCount(2, 'post.group.posts');
        // Leaving a group is not an edit: the panel's version still saves.
        $this->asStaffMember()->putJson($this->api("posts/{$linkedin}"), ['updated_at' => $seen, 'hook' => 'Mine'])->assertOk();

        // Deleting the original leaves the others grouped under its id.
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['x']])->assertCreated();
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}"))->assertOk();
        $this->asStaffMember()->getJson($this->api("posts/{$facebook}"))->assertJsonPath('post.group_size', 2)->assertJsonPath('post.group.id', $post->id);

        // The last one left is no longer in a group; unlinking a post in none changes nothing.
        $this->asStaffMember()->deleteJson($this->api("posts/{$facebook}/group"))->assertOk()->assertJsonPath('post.group', null);
        $x = ContentPlannerPost::where('platform', 'x')->firstOrFail();
        $this->assertNull($x->group_id);
        $this->asStaffMember()->deleteJson($this->api("posts/{$x->id}/group"))->assertOk()->assertJsonPath('post.group', null);
    }

    // Final review: unlinking the original, then making versions from it again, put it back in its old group — with two
    // LinkedIn versions — because the others kept its id as their group's key.
    public function test_an_unlinked_original_making_versions_again_starts_a_new_group_and_the_old_one_keeps_one_per_platform(): void
    {
        $post = $this->makePost();
        [$linkedin, $facebook] = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook']])
            ->json('versions.*.id');
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}/group"))->assertOk()->assertJsonPath('post.group', null);

        // The two left take the oldest one's id as their key.
        $this->asStaffMember()->getJson($this->api("posts/{$facebook}"))->assertJsonPath('post.group.id', $linkedin)->assertJsonCount(2, 'post.group.posts');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated()
            ->assertJsonPath('post.group.id', $post->id)
            ->assertJsonCount(2, 'post.group.posts');
        $this->assertSame(['facebook', 'linkedin'], ContentPlannerPost::where('group_id', $linkedin)->orderBy('platform')->pluck('platform')->all());
    }

    public function test_a_duplicate_is_not_in_the_group_the_lists_carry_the_group_size_and_a_post_without_a_day_gives_versions_without_one(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()
            ->assertJsonPath('post.group_size', 0)->assertJsonPath('post.group', null);
        $rows = collect($this->asStaffMember()->getJson($this->api('posts?from=2026-10-07&to=2026-10-07'))->assertOk()->json('data'));
        $this->assertSame(['instagram' => 2, 'linkedin' => 2], $rows->pluck('group_size', 'platform')->sortKeys()->all());

        $idea = $this->makePost(['scheduled_date' => null, 'status' => 'idea']);
        $this->asStaffMember()->postJson($this->api("posts/{$idea->id}/versions"), ['platforms' => ['tiktok']])->assertCreated()
            ->assertJsonPath('versions.0.scheduled_date', null)
            ->assertJsonPath('versions.0.scheduled_time', null)
            ->assertJsonPath('versions.0.status', 'draft');
    }
}
