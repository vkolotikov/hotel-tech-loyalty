<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Services\Content\ContentApproval;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Two requests on one post at the same moment (owner, 2026-10-20: "approve all fixes"). A test runs one request at a
 * time, so the other request is staged: it lands right after this one has read the post and before it writes — the
 * window a check-then-act leaves open. Every write re-checks the post under a row lock first.
 */
class ConcurrentWritesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    /** Runs $other once, right after the request first reads post $postId: the other request, already through. */
    private function afterTheRead(int $postId, callable $other): void
    {
        $done = false;
        DB::listen(function (QueryExecuted $query) use ($postId, $other, &$done) {
            if ($done || !str_starts_with(strtolower(ltrim($query->sql)), 'select')
                || !str_contains($query->sql, 'from "content_planner_posts"') || !preg_match('/"id" = \?/', $query->sql)
                || (int) ($query->bindings[0] ?? 0) !== $postId) {
                return;
            }
            $done = true;
            $other();
        });
    }

    /** The other request's save: new words, a later version. */
    private function savedElsewhere(ContentPlannerPost $post, array $fields = ['hook' => 'Theirs']): void
    {
        DB::table('content_planner_posts')->where('id', $post->id)->update($fields + ['updated_at' => now()->addSeconds(5)]);
    }

    // Deferred minor of the small-fixes batch: a double click sent for approval twice.
    public function test_a_second_send_for_approval_at_the_same_moment_records_nothing(): void
    {
        $post = $this->makePost(['status' => 'draft']);
        $this->afterTheRead($post->id, function () use ($post) {
            DB::table('content_planner_posts')->where('id', $post->id)->update(['status' => 'needs_review', 'updated_at' => now()->addSeconds(5)]);
            ContentApproval::record($post, 'sent_for_approval', $this->staffMember->id);
        });
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/send-for-approval"))->assertOk()->assertJsonPath('post.status', 'needs_review');
        $this->assertSame(1, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    // 4B-1 review #4: two managers approving at once both succeeded.
    public function test_a_second_approve_at_the_same_moment_is_refused_and_records_nothing(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->afterTheRead($post->id, function () use ($post) {
            DB::table('content_planner_posts')->where('id', $post->id)->update(['status' => 'approved', 'updated_at' => now()->addSeconds(5)]);
            ContentApproval::record($post, 'approved', $this->manager->id);
        });
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->updated_at->toISOString()])
            ->assertStatus(409)->assertJsonPath('error', 'wrong_status')->assertJsonPath('post.status', 'approved');
        $this->assertSame(1, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    // 4B-1 review #4: a save between Approve's freshness check and its update — the manager approved words they never read.
    public function test_approve_refuses_words_changed_after_its_check(): void
    {
        $post = $this->makePost(['status' => 'needs_review', 'hook' => 'Read by the manager']);
        $this->afterTheRead($post->id, fn () => $this->savedElsewhere($post));
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $post->updated_at->toISOString()])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('needs_review', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    public function test_a_second_send_back_at_the_same_moment_is_refused_and_its_note_is_not_lost_silently(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->afterTheRead($post->id, function () use ($post) {
            DB::table('content_planner_posts')->where('id', $post->id)->update(['status' => 'draft', 'updated_at' => now()->addSeconds(5)]);
            ContentApproval::record($post, 'sent_back', $this->manager->id, 'Shorter.');
        });
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'Warmer.'])
            ->assertStatus(409)->assertJsonPath('error', 'wrong_status');
        $this->assertSame(['Shorter.'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('note')->all());
    }

    // Deferred minor of the small-fixes batch: Make versions from a post, while a save moves that post to the platform the
    // new version took — the save skipped the group's check, because the post had no group when it was read.
    public function test_a_platform_change_racing_make_versions_is_refused(): void
    {
        $post = $this->makePost(['platform' => 'instagram']);
        $this->afterTheRead($post->id, function () use ($post) {
            DB::table('content_planner_posts')->where('id', $post->id)->update(['group_id' => $post->id]);
            $this->makePost(['platform' => 'linkedin', 'group_id' => $post->id]);
        });
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'platform' => 'linkedin'])
            ->assertStatus(409)->assertJsonPath('error', 'version_exists');
        $this->assertSame('instagram', $post->fresh()->platform);
    }

    // A save that passed its version check just before someone else's save landed overwrote it (F3, spec 2026-10-14 §7).
    public function test_a_save_refuses_a_post_changed_after_its_check(): void
    {
        $post = $this->makePost(['hook' => 'Mine before']);
        $this->afterTheRead($post->id, fn () => $this->savedElsewhere($post));
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'hook' => 'Mine'])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere')->assertJsonPath('post.hook', 'Theirs');
        $this->assertSame('Theirs', $post->fresh()->hook);
    }

    public function test_a_move_refuses_a_post_changed_after_its_check(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->afterTheRead($post->id, fn () => $this->savedElsewhere($post, ['scheduled_date' => '2026-10-09']));
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $post->updated_at->toISOString(), 'scheduled_date' => '2026-10-08'])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('2026-10-09', $post->fresh()->scheduled_date->format('Y-m-d'));
    }

    // Race-fix review: Unlink decided "no group" from the copy read before its lock, so a delete racing Make versions left
    // the new version keyed to the deleted post (and the group's lock with no row).
    public function test_a_delete_racing_make_versions_leaves_no_version_keyed_to_the_deleted_post(): void
    {
        $post = $this->makePost(['platform' => 'instagram']);
        $version = null;
        $this->afterTheRead($post->id, function () use ($post, &$version) {
            DB::table('content_planner_posts')->where('id', $post->id)->update(['group_id' => $post->id]);
            $version = $this->makePost(['platform' => 'linkedin', 'group_id' => $post->id]);
        });
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}"))->assertOk();
        $this->assertNull($version->fresh()->group_id);
    }

    // Race-fix review: a write on a post deleted at the same moment answered a generic "Not found".
    public function test_a_write_on_a_post_deleted_at_the_same_moment_says_it_no_longer_exists(): void
    {
        $saved = $this->makePost();
        $this->afterTheRead($saved->id, fn () => DB::table('content_planner_posts')->where('id', $saved->id)->delete());
        $this->asStaffMember()->putJson($this->api("posts/{$saved->id}"), ['updated_at' => $saved->updated_at->toISOString(), 'platform' => 'linkedin'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');

        $approved = $this->makePost(['status' => 'needs_review']);
        $this->afterTheRead($approved->id, fn () => DB::table('content_planner_posts')->where('id', $approved->id)->delete());
        $this->asManager()->postJson($this->api("posts/{$approved->id}/approve"), ['updated_at' => $approved->updated_at->toISOString()])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    // Race-fix review: Mark published checked the status it read — the poster could publish a post a manager had just
    // taken back.
    public function test_the_posters_mark_published_refuses_a_post_taken_back_at_the_same_moment(): void
    {
        $post = $this->makePost(['status' => 'approved', 'poster_id' => $this->staffMember->id]);
        $this->afterTheRead($post->id, fn () => $this->savedElsewhere($post, ['status' => 'draft']));
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"))->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('draft', $post->fresh()->status);
    }

    // Race-fix review: Mark ready worked out "approved" from the status it read — a post sent back meanwhile was recorded
    // as approved.
    public function test_mark_ready_records_no_approval_for_a_post_sent_back_at_the_same_moment(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->afterTheRead($post->id, function () use ($post) {
            $this->savedElsewhere($post, ['status' => 'draft']);
            ContentApproval::record($post, 'sent_back', $this->manager->id, 'Shorter.');
        });
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertOk()->assertJsonPath('post.status', 'ready_to_publish');
        $this->assertSame(['sent_back'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('kind')->all());
    }
}
