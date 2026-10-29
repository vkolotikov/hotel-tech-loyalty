<?php

namespace Tests\Feature\Content;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Who posts it (spec 2026-10-19 §4.1, §4.4): a member of the brand's team; the poster may mark an approved post published. */
class PosterTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_team_is_the_active_staff_who_can_use_the_brand_with_names_and_roles_only(): void
    {
        $this->manager->forceFill(['name' => 'Mia'])->save();
        $this->staffMember->forceFill(['name' => 'Sam'])->save();
        $inactive = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $inactive->forceFill(['name' => 'Ivy'])->save();
        [$secondBrand] = $this->secondBrand(false);
        $elsewhere = $this->staffUser($this->org, ['role' => 'staff']);
        $elsewhere->forceFill(['name' => 'Eve'])->save();
        DB::table('brand_user')->insert(['brand_id' => $secondBrand, 'user_id' => $elsewhere->id]);
        $here = $this->staffUser($this->org, ['role' => 'staff']);
        $here->forceFill(['name' => 'Hal'])->save();
        DB::table('brand_user')->insert(['brand_id' => $this->brandId, 'user_id' => $here->id]);
        $other = $this->otherOrganization();
        $this->staffUser($other['org'])->forceFill(['name' => 'Oz'])->save();

        $this->asStaffMember()->getJson($this->api('team'))->assertOk()->assertExactJson(['team' => [
            ['id' => $here->id, 'name' => 'Hal', 'role' => 'staff'],
            ['id' => $this->manager->id, 'name' => 'Mia', 'role' => 'manager'],
            ['id' => $this->staffMember->id, 'name' => 'Sam', 'role' => 'staff'],
        ]]);
    }

    public function test_who_posts_it_is_set_on_a_new_post_a_save_and_a_schedule_cleared_and_refused_for_someone_off_the_team(): void
    {
        $this->manager->forceFill(['name' => 'Mia'])->save();
        $post = $this->makePost();

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $this->manager->id])
            ->assertOk()
            ->assertJsonPath('post.poster_id', $this->manager->id)
            ->assertJsonPath('post.poster', ['id' => $this->manager->id, 'name' => 'Mia']);

        $outsider = $this->staffUser($this->otherOrganization()['org']);
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'poster_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), [
            'updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-08', 'poster_id' => $this->staffMember->id,
        ])->assertOk()->assertJsonPath('post.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), [
            'updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-09', 'poster_id' => $outsider->id,
        ])->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'linkedin', 'poster_id' => $this->staffMember->id])
            ->assertCreated()->assertJsonPath('post.poster.id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'linkedin', 'poster_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'poster_id' => null])
            ->assertOk()->assertJsonPath('post.poster', null)->assertJsonPath('post.poster_id', null);
    }

    public function test_someone_who_left_or_was_switched_off_counts_as_nobody_and_their_post_still_saves(): void
    {
        $leaver = $this->staffUser($this->org, ['role' => 'staff']);
        $post = $this->makePost(['poster_id' => $leaver->id]);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.poster.id', $leaver->id);

        DB::table('staff')->where('user_id', $leaver->id)->update(['is_active' => false]);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.poster', null)->assertJsonPath('post.poster_id', $leaver->id);
        // The form sent again with the same poster is no change.
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $leaver->id, 'hook' => 'New'])->assertOk();
        // Choosing them for another post is.
        $another = $this->makePost();
        $this->asManager()->putJson($this->api("posts/{$another->id}"), ['updated_at' => $another->updated_at->toISOString(), 'poster_id' => $leaver->id])
            ->assertStatus(422)->assertJsonValidationErrors('poster_id');

        $gone = $this->staffUser($this->org, ['role' => 'staff']);
        $theirs = $this->makePost(['poster_id' => $gone->id]);
        // The row itself: User::delete() also clears the permission package's tables, which this test schema lacks.
        DB::table('users')->where('id', $gone->id)->delete();
        $this->asManager()->getJson($this->api("posts/{$theirs->id}"))->assertJsonPath('post.poster', null);
    }

    public function test_changing_who_posts_it_keeps_an_approved_post_approved(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'poster_id' => $this->staffMember->id])
            ->assertOk()->assertJsonPath('post.status', 'approved')->assertJsonPath('post.poster_id', $this->staffMember->id);
        $this->assertSame(0, $post->events()->count());
    }

    public function test_the_poster_may_mark_an_approved_or_ready_post_published_while_approvals_are_on_and_no_other_staff_case_changes(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $mark = fn (int $id) => $this->asStaffMember()->postJson($this->api("posts/{$id}/mark-published"), ['published_url' => 'https://instagram.com/p/abc']);

        $approved = $this->makePost(['status' => 'approved', 'poster_id' => $this->staffMember->id]);
        $mark($approved->id)->assertOk()->assertJsonPath('post.status', 'published')->assertJsonPath('post.published_url', 'https://instagram.com/p/abc');
        $ready = $this->makePost(['status' => 'ready_to_publish', 'poster_id' => $this->staffMember->id]);
        $mark($ready->id)->assertOk()->assertJsonPath('post.status', 'published');

        $draft = $this->makePost(['status' => 'draft', 'poster_id' => $this->staffMember->id]);
        $mark($draft->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $review = $this->makePost(['status' => 'needs_review', 'poster_id' => $this->staffMember->id]);
        $mark($review->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $someoneElses = $this->makePost(['status' => 'approved', 'poster_id' => $this->manager->id]);
        $mark($someoneElses->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $nobodys = $this->makePost(['status' => 'approved']);
        $mark($nobodys->id)->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('draft', $draft->fresh()->status);

        // Managers as before.
        $this->asManager()->postJson($this->api("posts/{$draft->id}/mark-published"))->assertOk()->assertJsonPath('post.status', 'published');
    }

    public function test_versions_repeat_copies_and_duplicates_keep_who_posts_it(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'poster_id' => $this->staffMember->id]);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated()
            ->assertJsonPath('versions.0.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated()
            ->assertJsonPath('copies.0.poster_id', $this->staffMember->id);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()
            ->assertJsonPath('post.poster_id', $this->staffMember->id);
    }

    // 5A-1 review: a poster whose staff row was switched off is nobody — their open session cannot mark the post published.
    public function test_a_poster_switched_off_cannot_mark_their_post_published_while_approvals_are_on(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved', 'poster_id' => $this->staffMember->id]);
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['is_active' => false]);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"))->assertStatus(403)->assertJsonPath('error', 'staff_inactive');
        $this->assertSame('approved', $post->fresh()->status);
    }
}
