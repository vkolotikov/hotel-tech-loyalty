<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPostEvent;
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

    public function test_staff_send_a_post_for_approval_from_idea_draft_needs_visual_or_needs_review(): void
    {
        foreach (['idea', 'draft', 'needs_visual', 'needs_review'] as $status) {
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
}
