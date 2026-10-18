<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Comments on a post (spec 2026-10-16 §7.1): everyone comments; you edit or delete your own; managers delete anyone's. */
class CommentsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_everyone_comments_on_any_of_the_brands_posts_in_plain_text_with_lines_kept(): void
    {
        $post = $this->makePost();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => "  Love it.\nMaybe a warmer photo?  "])->assertCreated()
            ->assertJsonPath('comment.type', 'comment')
            ->assertJsonPath('comment.body', "Love it.\nMaybe a warmer photo?")
            ->assertJsonPath('comment.user', ['id' => $this->staffMember->id, 'name' => $this->staffMember->name])
            ->assertJsonPath('comment.mine', true)->assertJsonPath('comment.edited', false)
            ->assertJsonPath('comments_count', 1);
        $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => '<b>Yes</b>'])->assertCreated()
            ->assertJsonPath('comment.body', '<b>Yes</b>')->assertJsonPath('comments_count', 2);

        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.comments_count', 2)->assertJsonPath('post.timeline.1.body', '<b>Yes</b>');
    }

    public function test_a_comment_holds_1_to_2000_characters(): void
    {
        $post = $this->makePost();
        foreach (['', '   ', str_repeat('a', 2001)] as $body) {
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => $body])->assertStatus(422)->assertJsonValidationErrors('body');
        }
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => str_repeat('ā', 2000)])->assertCreated();
        $this->assertSame(1, ContentPlannerPostComment::count());
    }

    public function test_you_edit_your_own_comment_and_it_says_edited(): void
    {
        $post = $this->makePost();
        $id = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'First'])->json('comment.id');

        $this->asManager()->putJson($this->api("comments/{$id}"), ['body' => 'Taken over'])->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->putJson($this->api("comments/{$id}"), ['body' => 'Second'])->assertOk()
            ->assertJsonPath('comment.body', 'Second')->assertJsonPath('comment.edited', true);
        $this->asStaffMember()->putJson($this->api("comments/{$id}"), ['body' => ''])->assertStatus(422)->assertJsonValidationErrors('body');
        $this->assertSame('Second', ContentPlannerPostComment::findOrFail($id)->body);
    }

    public function test_you_delete_your_own_and_managers_delete_anyones(): void
    {
        $post = $this->makePost();
        $staffs = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Mine'])->json('comment.id');
        $managers = $this->asManager()->postJson($this->api("posts/{$post->id}/comments"), ['body' => 'Theirs'])->json('comment.id');
        $left = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => null, 'body' => 'From someone who left']);

        $this->asStaffMember()->deleteJson($this->api("comments/{$managers}"))->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->deleteJson($this->api("comments/{$left->id}"))->assertStatus(403)->assertJsonPath('error', 'not_yours');
        $this->asStaffMember()->putJson($this->api("comments/{$left->id}"), ['body' => 'Mine now'])->assertStatus(403)->assertJsonPath('error', 'not_yours');

        $this->asStaffMember()->deleteJson($this->api("comments/{$staffs}"))->assertOk()->assertJsonPath('deleted', true)->assertJsonPath('comments_count', 2);
        $this->asManager()->deleteJson($this->api("comments/{$left->id}"))->assertOk()->assertJsonPath('comments_count', 1);
        $this->asManager()->deleteJson($this->api("comments/{$staffs}"))->assertNotFound()->assertJsonPath('error', 'not_found');
    }

    public function test_another_brands_post_and_comments_do_not_exist_here(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirPost = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Theirs']);
        $theirs = ContentPlannerPostComment::create(['post_id' => $theirPost->id, 'brand_id' => $second, 'user_id' => $this->manager->id, 'body' => 'Theirs']);

        $this->asManager()->postJson($this->api("posts/{$theirPost->id}/comments"), ['body' => 'Hello'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->putJson($this->api("comments/{$theirs->id}"), ['body' => 'Hello'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("comments/{$theirs->id}"))->assertNotFound();
        $this->assertSame('Theirs', ContentPlannerPostComment::withoutGlobalScopes()->findOrFail($theirs->id)->body);
    }
}
