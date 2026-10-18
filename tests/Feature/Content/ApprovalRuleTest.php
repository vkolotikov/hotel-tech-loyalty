<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerVisualBrief;
use App\Services\Content\ContentRepeatRewriter;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPostGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What staff may not do while approvals are on, and the history it leaves (spec 2026-10-16 §6.2, §6.4). */
class ApprovalRuleTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['requires_approval' => true])->save();
    }

    private function save(ContentPlannerPost $post, array $fields)
    {
        return $this->putJson($this->api("posts/{$post->id}"), $fields + ['updated_at' => $post->fresh()->updated_at->toISOString()]);
    }

    /** @return list<string> */
    private function kinds(ContentPlannerPost $post): array
    {
        return ContentPlannerPostEvent::where('post_id', $post->id)->orderBy('id')->pluck('kind')->all();
    }

    public function test_staff_cannot_set_approved_ready_or_published_nor_mark_ready_or_published(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        foreach (['approved', 'ready_to_publish', 'published'] as $status) {
            $this->asStaffMember();
            $this->save($post, ['status' => $status])->assertStatus(403)->assertJsonPath('error', 'needs_approval')
                ->assertJsonPath('message', 'Only a manager can approve posts while approvals are on for this brand.');
        }
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/mark-published"), [])->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'approved'])->assertStatus(403)->assertJsonPath('error', 'needs_approval');
        $this->assertSame('needs_review', $post->fresh()->status);
        $this->assertSame(1, ContentPlannerPost::count());
    }

    // Review Focus 1: an old tab sends the forbidden status with new words; nothing of it is saved.
    public function test_a_staff_save_with_a_status_only_managers_set_is_refused_whole(): void
    {
        $post = $this->makePost(['status' => 'needs_review', 'hook' => 'Old hook']);
        $this->asStaffMember();
        $this->save($post, ['status' => 'approved', 'hook' => 'New hook'])->assertStatus(403);
        $this->assertSame('Old hook', $post->fresh()->hook);
    }

    public function test_managers_do_everything_and_with_the_switch_off_staff_do_too(): void
    {
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager();
        $this->save($post, ['status' => 'approved'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-ready"))->assertOk()->assertJsonPath('post.status', 'ready_to_publish');
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-published"), [])->assertOk()->assertJsonPath('post.status', 'published');

        $this->profile->forceFill(['requires_approval' => false])->save();
        $other = $this->makePost(['status' => 'draft']);
        $this->asStaffMember();
        $this->save($other, ['status' => 'approved'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($other), 'no history while approvals are off');
    }

    public function test_staff_setting_needs_review_sends_the_post_for_approval_and_a_manager_approving_it_is_recorded(): void
    {
        $post = $this->makePost(['status' => 'draft']);
        $this->asStaffMember();
        $this->save($post, ['status' => 'needs_review'])->assertOk();
        $this->asManager();
        $this->save($post, ['status' => 'approved'])->assertOk();

        $events = ContentPlannerPostEvent::where('post_id', $post->id)->orderBy('id')->get();
        $this->assertSame(['sent_for_approval', 'approved'], $events->pluck('kind')->all());
        $this->assertSame([$this->staffMember->id, $this->manager->id], $events->pluck('user_id')->map(fn ($id) => (int) $id)->all());

        $created = $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'needs_review', 'topic' => 'Waiting'])->assertCreated();
        $this->assertSame(['sent_for_approval'], $this->kinds(ContentPlannerPost::findOrFail($created->json('post.id'))));
    }

    public function test_a_staff_change_to_an_approved_posts_words_sends_it_back_to_review(): void
    {
        foreach (['topic' => 'New topic', 'hook' => 'New hook', 'main_copy' => 'New text', 'cta' => 'Book now', 'hashtags' => ['#new'], 'platform' => 'linkedin'] as $field => $value) {
            $post = $this->makePost(['status' => 'approved', 'hashtags' => []]);
            $this->asStaffMember();
            $this->save($post, [$field => $value])->assertOk()->assertJsonPath('post.status', 'needs_review');
            $this->assertSame(['changed_after_approval'], $this->kinds($post), $field);
        }
        $ready = $this->makePost(['status' => 'ready_to_publish']);
        $this->asStaffMember();
        $this->save($ready, ['hook' => 'Changed'])->assertOk()->assertJsonPath('post.status', 'needs_review');

        $managers = $this->makePost(['status' => 'approved']);
        $this->asManager();
        $this->save($managers, ['hook' => 'Manager words'])->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($managers));
    }

    // Review Focus 2: day and time are not words; the post's own status sent again is not a change.
    public function test_moving_an_approved_posts_day_keeps_it_approved_even_with_its_status_resent(): void
    {
        $post = $this->makePost(['status' => 'approved']);
        $this->asStaffMember();
        $this->save($post, ['scheduled_date' => '2026-10-09', 'scheduled_time' => '09:30', 'status' => 'approved'])->assertOk()
            ->assertJsonPath('post.status', 'approved')->assertJsonPath('post.scheduled_date', '2026-10-09');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'scheduled_date' => '2026-10-12'])
            ->assertOk()->assertJsonPath('post.status', 'approved');
        $this->assertSame([], $this->kinds($post));
    }

    public function test_ai_reworded_repeat_copies_wait_for_approval_and_plain_copies_keep_the_status(): void
    {
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->andReturn(['hook' => 'Fresh hook', 'main_copy' => 'Fresh text']);
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $plain = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$plain->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated();
        $this->assertSame(['approved', 'approved'], ContentPlannerPost::where('series_id', $plain->id)->where('id', '!=', $plain->id)->orderBy('id')->pluck('status')->all());

        $reworded = $this->makePost(['status' => 'approved', 'scheduled_date' => '2026-10-08']);
        $this->asStaffMember()->postJson($this->api("posts/{$reworded->id}/repeat"), ['every' => 'week', 'until' => '2026-10-22', 'ai_rewrite' => true])->assertCreated();
        $this->assertSame(['needs_review', 'needs_review'], ContentPlannerPost::where('series_id', $reworded->id)->where('id', '!=', $reworded->id)->orderBy('id')->pluck('status')->all());
    }

    // Final review: Write with AI and a new image put a post into review "another way" (spec §6.2); the step is recorded.
    public function test_an_ai_write_or_image_that_puts_a_staff_post_into_review_records_the_step(): void
    {
        $posts = Mockery::mock(ContentPostGenerationService::class);
        $posts->shouldReceive('generate')->andReturnUsing(function (ContentPlannerPost $post) {
            $post->update(['hook' => 'AI hook', 'status' => 'needs_review']);

            return ['post' => $post->fresh(['visualBrief']), 'ai_response' => []];
        });
        $this->app->instance(ContentPostGenerationService::class, $posts);
        $images = Mockery::mock(ImageGenerationService::class);
        $images->shouldReceive('generateForPost')->andReturnUsing(function (ContentPlannerPost $post) {
            if ($post->status === 'needs_visual') {
                $post->update(['status' => 'needs_review']);
            }

            return new ContentPlannerVisualBrief();
        });
        $this->app->instance(ImageGenerationService::class, $images);

        $approved = $this->makePost(['status' => 'approved']);
        $draft = $this->makePost(['status' => 'draft']);
        $visual = $this->makePost(['status' => 'needs_visual']);
        $this->asStaffMember()->postJson($this->api("posts/{$approved->id}/write"))->assertOk()->assertJsonPath('post.status', 'needs_review');
        $this->asStaffMember()->postJson($this->api("posts/{$draft->id}/write"))->assertOk();
        $this->asStaffMember()->postJson($this->api("posts/{$visual->id}/image"))->assertOk();

        $this->assertSame(['changed_after_approval'], $this->kinds($approved));
        $this->assertSame(['sent_for_approval'], $this->kinds($draft));
        $this->assertSame(['sent_for_approval'], $this->kinds($visual));
        $this->assertSame($this->staffMember->id, (int) ContentPlannerPostEvent::where('post_id', $approved->id)->value('user_id'));

        $managers = $this->makePost(['status' => 'approved']);
        $this->asManager()->postJson($this->api("posts/{$managers->id}/write"))->assertOk();
        $this->assertSame([], $this->kinds($managers), "a manager's own AI write is no approval step");
    }

    // Final review: a manager taking a post out of review by Mark ready, Mark published or the status list approves it.
    public function test_a_manager_taking_a_post_out_of_review_toward_publishing_records_it_as_approved(): void
    {
        $ready = $this->makePost(['status' => 'needs_review', 'created_by' => $this->staffMember->id]);
        $published = $this->makePost(['status' => 'needs_review']);
        $listed = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$ready->id}/mark-ready"))->assertOk();
        $this->asManager()->postJson($this->api("posts/{$published->id}/mark-published"), [])->assertOk();
        $this->asManager();
        $this->save($listed, ['status' => 'ready_to_publish'])->assertOk();

        $this->assertSame(['approved'], $this->kinds($ready));
        $this->assertSame(['approved'], $this->kinds($published));
        $this->assertSame(['approved'], $this->kinds($listed));
        $this->asStaffMember()->getJson($this->api('inbox/count'))->assertOk()->assertJsonPath('count', 1);

        // Already past review: no further step.
        $this->asManager()->postJson($this->api("posts/{$ready->id}/mark-published"), [])->assertOk();
        $this->assertSame(['approved'], $this->kinds($ready));
    }
}
