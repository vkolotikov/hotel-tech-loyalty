<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use App\Models\ContentPlannerPostEvent;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What a post shows for the team (spec 2026-10-16 §6.3, §7.1): its writer, comments, history and "sent back". */
class PostReviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function comment(ContentPlannerPost $post, ?int $userId, string $body, ?string $at = null): ContentPlannerPostComment
    {
        $comment = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => $userId, 'body' => $body]);
        if ($at) {
            $comment->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }

        return $comment;
    }

    private function event(ContentPlannerPost $post, ?int $userId, string $kind, ?string $note = null, ?string $at = null): ContentPlannerPostEvent
    {
        $event = ContentPlannerPostEvent::create(['post_id' => $post->id, 'brand_id' => $this->brandId, 'user_id' => $userId, 'kind' => $kind, 'note' => $note]);
        if ($at) {
            $event->forceFill(['created_at' => $at])->save();
        }

        return $event;
    }

    public function test_the_post_says_who_wrote_it_and_a_post_the_ai_or_a_repeat_made_says_nothing(): void
    {
        $this->staffMember->forceFill(['name' => 'Anna'])->save();
        $id = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Mine', 'scheduled_date' => '2026-10-07'])->assertCreated()->json('post.id');
        $this->asManager()->getJson($this->api("posts/{$id}"))->assertOk()->assertJsonPath('post.author', 'Anna');

        // Final review: the calendar keeps who pressed Generate in created_by; that person did not write the post.
        $this->fakeAi([$this->calendarItem('2026-10-08', 'instagram')]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertOk();
        $generated = ContentPlannerPost::where('generated_by', 'calendar')->firstOrFail();
        $this->assertSame((int) $this->manager->id, (int) $generated->created_by);
        $this->asStaffMember()->getJson($this->api("posts/{$generated->id}"))->assertOk()->assertJsonPath('post.author', null);

        // A repeat copy: whoever repeated the post did not write it either.
        $this->asManager()->postJson($this->api("posts/{$id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated();
        $copy = ContentPlannerPost::where('series_id', $id)->where('id', '!=', $id)->firstOrFail();
        $this->asStaffMember()->getJson($this->api("posts/{$copy->id}"))->assertOk()->assertJsonPath('post.author', null);
    }

    // Review Focus 4: a removed member's comments and steps stay, with no name.
    public function test_the_timeline_holds_comments_and_steps_oldest_first_and_marks_my_comments(): void
    {
        $post = $this->makePost();
        $this->event($post, $this->staffMember->id, 'sent_for_approval', null, '2026-10-05 07:00:00');
        $this->comment($post, $this->manager->id, 'Shorter please', '2026-10-05 08:00:00');
        $this->event($post, $this->manager->id, 'sent_back', 'Shorter please', '2026-10-05 08:01:00');
        $this->comment($post, null, 'From someone who left', '2026-10-05 09:00:00');

        $timeline = $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->json('post.timeline');

        $this->assertSame(['event', 'comment', 'event', 'comment'], array_column($timeline, 'type'));
        $this->assertSame('sent_for_approval', $timeline[0]['kind']);
        $this->assertSame(['id' => $this->manager->id, 'name' => $this->manager->name], $timeline[1]['user']);
        $this->assertFalse($timeline[1]['mine']);
        $this->assertSame('Shorter please', $timeline[2]['note']);
        $this->assertNull($timeline[3]['user']);
        $this->assertSame('From someone who left', $timeline[3]['body']);
        $this->assertTrue($this->asManager()->getJson($this->api("posts/{$post->id}"))->json('post.timeline.1.mine'));
    }

    public function test_the_timeline_keeps_the_newest_200(): void
    {
        $post = $this->makePost();
        $start = CarbonImmutable::parse('2026-09-01 08:00:00');
        for ($i = 0; $i < 150; $i++) {
            $this->comment($post, $this->manager->id, "Comment {$i}", $start->addMinutes($i * 2)->toDateTimeString());
        }
        for ($i = 0; $i < 60; $i++) {
            $this->event($post, $this->manager->id, 'approved', null, $start->addMinutes($i * 2 + 1)->toDateTimeString());
        }

        $timeline = $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()->json('post.timeline');

        $this->assertCount(200, $timeline);
        $this->assertSame('Comment 149', $timeline[199]['body']);
        $this->assertSame('Comment 5', $timeline[0]['body']);
    }

    public function test_cards_carry_their_comment_count_on_the_plan_the_ideas_board_and_the_posts_list(): void
    {
        $dated = $this->makePost(['scheduled_date' => '2026-10-07']);
        $idea = $this->makePost(['scheduled_date' => null, 'status' => 'idea']);
        $this->comment($dated, $this->manager->id, 'One');
        $this->comment($dated, $this->staffMember->id, 'Two');
        $this->comment($idea, $this->manager->id, 'Three');

        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()
            ->assertJsonPath('posts.0.comments_count', 2)->assertJsonPath('unscheduled.0.comments_count', 1);
        $this->asStaffMember()->getJson($this->api('ideas'))->assertOk()->assertJsonPath('columns.idea.posts.0.comments_count', 1);
        $posts = collect($this->asStaffMember()->getJson($this->api('posts'))->assertOk()->json('data'));
        $this->assertSame(2, $posts->firstWhere('id', $dated->id)['comments_count']);
        $found = collect($this->asStaffMember()->getJson($this->api('find?q=Autumn'))->assertOk()->json('posts'));
        $this->assertSame(2, $found->firstWhere('id', $dated->id)['comments_count']);
    }

    // Review Focus 3.
    public function test_sent_back_lasts_until_the_post_is_changed_not_when_it_is_commented(): void
    {
        $post = $this->makePost(['status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $post->forceFill(['updated_at' => '2026-10-05 06:00:00'])->save();
        $this->event($post, $this->manager->id, 'sent_back', 'Shorter please', '2026-10-05 06:00:00');
        $sentBack = fn () => $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()->json('posts.0.sent_back');

        $this->assertTrue($sentBack());
        $this->comment($post, $this->staffMember->id, 'On it');
        $this->assertTrue($sentBack());

        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['hook' => 'Shorter', 'updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk()
            ->assertJsonPath('post.sent_back', false);
        $this->assertFalse($sentBack());

        $approved = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-08']);
        $this->event($approved, $this->manager->id, 'sent_back', 'x');
        $this->assertFalse(collect($this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->json('posts'))->firstWhere('id', $approved->id)['sent_back'], 'only a draft is "sent back"');
    }
}
