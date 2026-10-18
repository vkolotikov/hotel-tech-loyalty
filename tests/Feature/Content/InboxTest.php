<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostComment;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The "For you" bell (spec 2026-10-16 §8): what waits for a manager, and the news since a person last looked. */
class InboxTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    private function comment(ContentPlannerPost $post, ?int $userId, string $body, ?string $at = null): ContentPlannerPostComment
    {
        $comment = ContentPlannerPostComment::create(['post_id' => $post->id, 'brand_id' => $post->brand_id, 'user_id' => $userId, 'body' => $body]);
        if ($at) {
            $comment->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }

        return $comment;
    }

    public function test_a_manager_sees_each_post_waiting_for_approval_until_it_is_acted_on(): void
    {
        $this->staffMember->forceFill(['name' => 'Anna'])->save();
        $waiting = $this->makePost(['status' => 'needs_review', 'title' => 'Autumn offer', 'created_by' => $this->staffMember->id]);
        $this->makePost(['status' => 'draft']);

        $this->asManager()->getJson($this->api('inbox'))->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.kind', 'waiting')
            ->assertJsonPath('items.0.post.id', $waiting->id)
            ->assertJsonPath('items.0.post.title', 'Autumn offer')
            ->assertJsonPath('items.0.by.name', 'Anna')
            ->assertJsonPath('items.0.unread', true);
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 0)->assertJsonPath('items', []);

        // Seen does not clear what waits: it stays, no longer new, until a manager acts on it.
        $this->asManager()->postJson($this->api('inbox/seen'))->assertOk()->assertJsonPath('count', 1);
        $this->asManager()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('items.0.unread', false);

        $this->asManager()->postJson($this->api("posts/{$waiting->id}/approve"), ['updated_at' => $waiting->fresh()->updated_at->toISOString()])->assertOk();
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);

        $this->makePost(['status' => 'needs_review']);
        $this->profile->forceFill(['requires_approval' => false])->save();
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);
    }

    public function test_the_writer_hears_when_their_post_is_approved_or_sent_back_until_they_have_seen_it(): void
    {
        $approved = $this->makePost(['status' => 'needs_review', 'created_by' => $this->staffMember->id]);
        $sentBack = $this->makePost(['status' => 'needs_review', 'created_by' => $this->staffMember->id, 'scheduled_date' => '2026-10-08']);
        $this->asManager()->postJson($this->api("posts/{$approved->id}/approve"), ['updated_at' => $approved->fresh()->updated_at->toISOString()])->assertOk();
        $this->travel(1)->minutes();
        $this->asManager()->postJson($this->api("posts/{$sentBack->id}/send-back"), ['note' => 'Shorter, please.'])->assertOk();

        $inbox = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json();
        $this->assertSame(['sent_back', 'approved'], array_column($inbox['items'], 'kind'));
        $this->assertSame('Shorter, please.', $inbox['items'][0]['note']);
        $this->assertSame(['id' => $this->manager->id, 'name' => $this->manager->name], $inbox['items'][0]['by']);
        $this->assertSame($sentBack->id, $inbox['items'][0]['post']['id']);
        $this->assertTrue($inbox['items'][0]['unread']);
        // What a manager did themselves is no news to them.
        $this->asManager()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 0);

        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => $inbox['read_at']])->assertOk()->assertJsonPath('count', 0);
        $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('items', []);
    }

    public function test_comments_by_others_reach_the_writer_and_those_who_commented_before_them(): void
    {
        $colleague = $this->staffUser($this->org, ['role' => 'staff']);
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $this->comment($post, $this->manager->id, 'Early word', '2026-10-05 05:00:00');
        $this->comment($post, $colleague->id, 'I agree', '2026-10-05 05:10:00');
        $this->comment($post, $this->manager->id, 'Final word', '2026-10-05 05:20:00');
        // Review Focus 4: someone who has since left.
        $this->comment($post, null, 'From someone who left', '2026-10-05 05:30:00');

        $writer = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 4)->json('items');
        $this->assertSame(['From someone who left', 'Final word', 'I agree', 'Early word'], array_column($writer, 'note'));
        $this->assertSame(['comment'], array_values(array_unique(array_column($writer, 'kind'))));
        $this->assertNull($writer[0]['by']);
        $this->assertSame($post->id, $writer[0]['post']['id']);

        // A colleague hears of the comments after their own first one; the manager, of the others' after theirs.
        $theirs = $this->actingAs($colleague, 'sanctum')->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertSame(['From someone who left', 'Final word'], array_column($theirs, 'note'));
        $managers = $this->asManager()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertSame(['From someone who left', 'I agree'], array_column($managers, 'note'));
    }

    // Review Focus 5.
    public function test_the_bell_is_per_brand_and_seen_is_per_brand(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $secondProfile->forceFill(['requires_approval' => true])->save();
        $there = fn (array $attributes) => ContentPlannerPost::create($attributes + ['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Second studio']);
        $mineHere = $this->makePost(['created_by' => $this->manager->id]);
        $this->makePost(['status' => 'needs_review']);
        $mineThere = $there(['created_by' => $this->manager->id]);
        $there(['status' => 'needs_review']);
        $there(['status' => 'needs_review']);
        $this->comment($mineHere, $this->staffMember->id, 'On the first brand', '2026-10-05 05:00:00');
        $this->comment($mineThere, $this->staffMember->id, 'On the second brand', '2026-10-05 05:00:00');

        $first = $this->asManager()->getJson($this->api('inbox') . "?brand_id={$this->brandId}")->assertOk()->assertJsonPath('count', 2)->json('items');
        $this->assertEqualsCanonicalizing(['waiting', 'comment'], array_column($first, 'kind'));
        $this->assertSame('On the first brand', collect($first)->firstWhere('kind', 'comment')['note']);
        $other = $this->asManager()->getJson($this->api('inbox') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 3)->json('items');
        $this->assertSame('On the second brand', collect($other)->firstWhere('kind', 'comment')['note']);

        $this->asManager()->postJson($this->api('inbox/seen') . "?brand_id={$this->brandId}")->assertOk()->assertJsonPath('count', 1);
        $this->asManager()->getJson($this->api('inbox/count') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 3);
    }

    public function test_seen_takes_the_lists_read_at_never_goes_back_and_never_runs_ahead(): void
    {
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $this->comment($post, $this->manager->id, 'First');
        $readAt = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 1)->json('read_at');

        $this->travel(1)->minutes();
        $this->comment($post, $this->manager->id, 'Second, after the list was read');
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => $readAt])->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => '2026-10-01T00:00:00Z'])->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => '2030-01-01T00:00:00Z'])->assertOk()->assertJsonPath('count', 0);

        $this->travel(1)->minutes();
        $this->comment($post, $this->manager->id, 'Third');
        $this->asStaffMember()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 1);
        $this->asStaffMember()->postJson($this->api('inbox/seen'), ['at' => 'soon'])->assertStatus(422)->assertJsonValidationErrors('at');
    }

    public function test_the_list_keeps_the_newest_50_shortens_long_words_and_leaves_out_news_older_than_30_days(): void
    {
        $post = $this->makePost(['created_by' => $this->staffMember->id]);
        $start = CarbonImmutable::parse('2026-10-04 06:00:00');
        for ($i = 0; $i < 55; $i++) {
            $this->comment($post, $this->manager->id, "Comment {$i}", $start->addMinutes($i)->toDateTimeString());
        }
        $this->comment($post, $this->manager->id, str_repeat('x', 300), '2026-10-05 05:59:00');
        $this->comment($post, $this->manager->id, 'Long ago', '2026-09-04 05:00:00');

        $items = $this->asStaffMember()->getJson($this->api('inbox'))->assertOk()->assertJsonPath('count', 56)->json('items');

        $this->assertCount(50, $items);
        $this->assertSame(str_repeat('x', 200) . '…', $items[0]['note']);
        $this->assertSame('Comment 54', $items[1]['note']);
        $this->assertSame('Comment 6', $items[49]['note']);
    }

    public function test_a_brand_without_a_profile_has_an_empty_bell(): void
    {
        [$second] = $this->secondBrand(false);
        $this->asManager()->getJson($this->api('inbox') . "?brand_id={$second}")->assertOk()->assertJsonPath('items', [])->assertJsonPath('count', 0);
        $this->asManager()->getJson($this->api('inbox/count') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 0);
        $this->asManager()->postJson($this->api('inbox/seen') . "?brand_id={$second}")->assertOk()->assertJsonPath('count', 0);
    }
}
