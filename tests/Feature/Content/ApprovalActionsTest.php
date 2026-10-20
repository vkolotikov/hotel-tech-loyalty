<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerVisualBrief;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentQualityService;
use App\Services\ContentVisualBriefService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The three approval steps (spec 2026-10-16 §6.2): only while the brand's switch is on. */
class ApprovalActionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    // A post already in review: see test_sending_a_post_already_in_review_again_changes_nothing (owner, 2026-10-20).
    public function test_staff_send_a_post_for_approval_from_idea_draft_or_needs_visual(): void
    {
        foreach (['idea', 'draft', 'needs_visual'] as $status) {
            $post = $this->makePost(['status' => $status]);
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk()
                ->assertJsonPath('post.status', 'needs_review')
                ->assertJsonPath('post.timeline.0.kind', 'sent_for_approval')
                ->assertJsonPath('post.timeline.0.user.id', $this->staffMember->id);
        }
        foreach (['approved', 'ready_to_publish', 'published', 'skipped', 'archived'] as $status) {
            $post = $this->makePost(['status' => $status]);
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertStatus(409)
                ->assertJsonPath('error', 'wrong_status')->assertJsonPath('post.status', $status);
            $this->assertSame($status, $post->fresh()->status);
        }
    }

    public function test_a_manager_approves_a_post_in_review_as_they_read_it(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $read = $post->fresh()->updated_at->toISOString();
        $this->travel(1)->minutes();
        $post->update(['hook' => 'Changed since']);

        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $read])->assertStatus(409)
            ->assertJsonPath('error', 'changed_elsewhere')->assertJsonPath('post.hook', 'Changed since');
        $this->assertSame('needs_review', $post->fresh()->status);

        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk()
            ->assertJsonPath('post.status', 'approved')->assertJsonPath('post.timeline.0.kind', 'approved')
            ->assertJsonPath('post.timeline.0.user.id', $this->manager->id);
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertStatus(409)
            ->assertJsonPath('error', 'wrong_status');
    }

    public function test_a_manager_sends_a_post_back_with_a_note_and_it_becomes_a_sent_back_draft(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), [])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => '   '])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => str_repeat('a', 2001)])->assertStatus(422)->assertJsonValidationErrors('note');

        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => "Shorter, please.\nAnd a warmer photo."])->assertOk()
            ->assertJsonPath('post.status', 'draft')->assertJsonPath('post.sent_back', true)
            ->assertJsonPath('post.timeline.0.kind', 'sent_back')
            ->assertJsonPath('post.timeline.0.note', "Shorter, please.\nAnd a warmer photo.");
    }

    public function test_only_managers_approve_or_send_back_and_nothing_happens_while_approvals_are_off(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $read = fn () => ['updated_at' => $post->fresh()->updated_at->toISOString()];
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/approve"), $read())->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'No'])->assertStatus(403)->assertJsonPath('error', 'manager_only');

        $this->profile->forceFill(['requires_approval' => false])->save();
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), $read())->assertStatus(409)->assertJsonPath('error', 'approvals_off');
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'No'])->assertStatus(409)->assertJsonPath('error', 'approvals_off');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertStatus(409)->assertJsonPath('error', 'approvals_off');

        $this->assertSame('needs_review', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::count());
    }

    public function test_another_organisations_post_does_not_exist_here(): void
    {
        $other = $this->otherOrganization();
        $this->asManager()->postJson($this->api("posts/{$other['post']->id}/send-back"), ['note' => 'No'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/send-for-approval"))->assertNotFound()->assertJsonPath('error', 'not_found');
    }

    // Owner, 2026-10-20 (4B question): sending a post already in review again does nothing — no second step, no new bell item.
    public function test_sending_a_post_already_in_review_again_changes_nothing(): void
    {
        $post = $this->makePost(['status' => 'draft']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk()
            ->assertJsonPath('post.status', 'needs_review')->assertJsonCount(1, 'post.timeline');
        $this->assertSame(1, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    // Owner, 2026-10-20 (4B question): "sent back" ends when someone works on the post, not on a quality check or a repeat.
    public function test_a_sent_back_post_stays_sent_back_through_a_quality_check_and_a_repeat(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'Warmer, please.'])->assertOk();
        $this->travel(5)->seconds();
        // The quality check's AI client is final and talks through the Anthropic SDK (no Http::fake): its save is tested.
        ContentQualityService::saveScore($post->fresh(), ['overall' => 8]);
        $this->assertSame(['overall' => 8], $post->fresh()->quality_score);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', true);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', true);
        // Work on the post still ends it.
        $fresh = $post->fresh();
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $fresh->updated_at->toISOString(), 'hook' => 'Warmer now'])->assertOk()
            ->assertJsonPath('post.sent_back', false);
    }

    // Final review: "sent back" ends when someone works on the post — a new picture or a new visual brief is work on it.
    public function test_a_new_picture_or_visual_brief_ends_sent_back(): void
    {
        $this->mock(ImageGenerationService::class, fn ($images) => $images->shouldReceive('generateForPost')->once()
            ->andReturnUsing(fn ($p) => ContentPlannerVisualBrief::create(['post_id' => $p->id, 'image_url' => '/storage/a.png', 'image_status' => 'ready'])));
        $this->mock(ContentVisualBriefService::class, fn ($briefs) => $briefs->shouldReceive('generateFor')->once()
            ->andReturnUsing(fn ($p) => ContentPlannerVisualBrief::create(['post_id' => $p->id, 'description' => 'A warm still life'])));
        foreach (['image', 'visual-brief'] as $action) {
            $post = $this->makePost(['status' => 'needs_review']);
            $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'A warmer picture, please.'])->assertOk();
            $this->travel(5)->seconds();
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/{$action}"))->assertOk()->assertJsonPath('post.sent_back', false);
            $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', false);
        }
    }

    // Final review: leaving a series (Stop repeating) is no more an edit than joining one — "sent back" stays.
    public function test_a_sent_back_post_stays_sent_back_when_its_repeats_stop(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'Warmer, please.'])->assertOk();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        $this->travel(5)->seconds();
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}/repeat"))->assertOk();
        $this->assertNull($post->fresh()->series_id);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.sent_back', true);
    }
}
