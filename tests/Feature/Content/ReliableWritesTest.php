<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPostEvent;
use App\Models\ContentPlannerVisualBrief;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\Concerns\StubsContentPostProviders;
use Tests\TestCase;

class ReliableWritesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, StubsContentPostProviders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        Http::preventStrayRequests();
    }

    public function test_same_second_save_and_approval_refuse_stale_revision(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'needs_review', 'hook' => 'Read']);
        $seen = $post->updated_at->toISOString();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00.200000'));
        $fresh = $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'New'])->assertOk()->json('post.updated_at');
        $this->assertNotSame($seen, $fresh);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Stale'])->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->asManager()->postJson($this->api("posts/{$post->id}/approve"), ['updated_at' => $seen])->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('New', $post->fresh()->hook);
    }

    public function test_revisions_increase_with_frozen_and_backward_clocks_and_accept_equivalent_instants(): void
    {
        $post = $this->makePost();
        $last = $post->updated_at;
        foreach (['2026-10-05 06:00:00', '2026-10-05 05:59:00'] as $index => $clock) {
            $this->travelTo(CarbonImmutable::parse($clock));
            $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $last->copy()->setTimezone('Europe/Riga')->format('Y-m-d\TH:i:s.uP'), 'hook' => "Edit {$index}"])->assertOk();
            $next = $post->fresh()->updated_at;
            $this->assertTrue($next->greaterThan($last));
            $this->assertMatchesRegularExpression('/\.\d{6}Z$/', $next->toISOString());
            $last = $next;
        }
    }

    public function test_ai_write_preserves_intervening_edit_publication_platform_or_deletion(): void
    {
        foreach (['hook', 'status', 'platform', 'delete'] as $change) {
            $post = $this->makePost(['hook' => 'Original']);
            $this->stubContentAi(['hook' => 'AI', 'main_copy' => 'AI body', 'visual_brief' => ['scene' => 'AI scene']], function () use ($post, $change) {
                $current = $post->fresh();
                if ($change === 'delete') { $current->delete(); return; }
                $current->update([$change => match ($change) { 'hook' => 'Human', 'status' => 'published', 'platform' => 'linkedin' }]);
            });
            $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))->assertStatus($change === 'delete' ? 404 : 409);
            $this->assertSame(0, ContentPlannerVisualBrief::where('post_id', $post->id)->count());
            if ($change !== 'delete') $this->assertNotSame('AI', $post->fresh()->hook);
        }
    }

    public function test_ai_normalizes_schema_lengths_and_rolls_back_words_if_brief_fails(): void
    {
        $post = $this->makePost(['hook' => 'Original']);
        $this->stubContentAi(['hook' => str_repeat('h', 600), 'cta' => str_repeat('c', 300), 'visual_brief' => ['style' => str_repeat('s', 300), 'mood' => str_repeat('m', 120), 'visual_type' => str_repeat('v', 60), 'aspect_ratio' => str_repeat('a', 30), 'text_overlay' => str_repeat('t', 300)]]);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))->assertOk();
        $this->assertSame(255, mb_strlen($post->fresh()->cta));
        $this->assertSame(255, mb_strlen($post->fresh()->visualBrief->style));
        $this->assertSame(100, mb_strlen($post->fresh()->visualBrief->mood));

        $other = $this->makePost(['hook' => 'Original', 'status' => 'draft']);
        $this->stubContentAi(['hook' => 'AI', 'visual_brief' => ['scene' => 'Fail persistence']]);
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement("CREATE TRIGGER content_test_reject_brief BEFORE INSERT ON content_planner_visual_briefs WHEN NEW.scene = 'Fail persistence' BEGIN SELECT RAISE(ABORT, 'Simulated storage constraint'); END");
        } else {
            DB::statement("ALTER TABLE content_planner_visual_briefs ADD CONSTRAINT content_test_reject_brief CHECK (scene IS DISTINCT FROM 'Fail persistence')");
        }
        $this->asStaffMember()->postJson($this->api("posts/{$other->id}/write"))->assertStatus(502);
        $this->assertSame('Original', $other->fresh()->hook);
        $this->assertSame('draft', $other->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $other->id)->count());
    }

    public function test_published_create_save_and_repeated_mark_have_consistent_metadata_and_goals(): void
    {
        $this->profile->channels()->where('platform', 'instagram')->update(['posts_per_week' => 1]);
        $created = $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'published'])->assertCreated()->json('post');
        $this->assertNotNull($created['published_at']);
        $post = $this->makePost();
        $saved = $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->updated_at->toISOString(), 'status' => 'published'])->assertOk()->json('post');
        $this->assertNotNull($saved['published_at']);
        $this->travel(1)->day();
        $this->asManager()->postJson($this->api("posts/{$post->id}/mark-published"), ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk()->assertJsonPath('post.published_at', $saved['published_at']);
        $goals = $this->asManager()->getJson($this->api('goals'))->assertOk()->json('platforms');
        $this->assertSame(2, collect($goals)->firstWhere('platform', 'instagram')['published']);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'status' => 'draft'])->assertOk()->assertJsonPath('post.published_at', null)->assertJsonPath('post.published_url', null);
    }

    public function test_image_and_brief_invalidate_staff_approval_atomically(): void
    {
        $this->profile->update(['requires_approval' => true]);
        foreach (['approved', 'ready_to_publish'] as $status) {
            foreach (['image', 'visual-brief'] as $action) {
                $post = $this->makePost(['status' => $status]);
                ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Old visual']);
                if ($action === 'image') $this->stubContentImage(); else $this->stubContentAi(['scene' => 'New scene']);
                $this->asStaffMember()->postJson($this->api("posts/{$post->id}/{$action}"))->assertOk()->assertJsonPath('post.status', 'needs_review');
                $this->assertSame(['changed_after_approval'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('kind')->all());
                $this->assertTrue($post->fresh()->updated_at->gt($post->updated_at));
            }
        }
    }

    public function test_image_failure_and_historical_errors_are_safe_on_subsequent_reads(): void
    {
        $post = $this->makePost();
        $brief = ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Old visual', 'image_error' => 'PRIVATE_OLD_SENTINEL']);
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertDontSee('PRIVATE_OLD_SENTINEL');
        $this->stubContentImage(fail: true);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/image"))->assertStatus(502)->assertDontSee('PRIVATE_PROVIDER_SENTINEL');
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.visual_brief.image_error', 'ai_failed');
    }

    public function test_image_and_brief_preserve_changes_made_while_provider_runs(): void
    {
        foreach (['image', 'visual-brief', 'quality'] as $action) {
            foreach (['hook', 'platform', 'status', 'delete'] as $change) {
                $post = $this->makePost();
                ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Old visual']);
                $during = function () use ($post, $change) {
                    if ($change === 'delete') { $post->fresh()->delete(); return; }
                    $post->fresh()->update([$change => match ($change) { 'hook' => 'Human', 'platform' => 'linkedin', 'status' => 'published' }]);
                };
                if ($action === 'image') $this->stubContentImage($during); else $this->stubContentAi(['scene' => 'New visual', 'overall' => 9], $during);
                $this->asStaffMember()->postJson($this->api("posts/{$post->id}/{$action}"))->assertStatus($change === 'delete' ? 404 : 409)
                    ->assertJsonPath('error', $change === 'delete' ? 'not_found' : 'changed_elsewhere');
                if ($change !== 'delete') $this->assertSame('Old visual', $post->fresh()->visualBrief->scene);
            }
        }
    }

    public function test_sent_back_survives_quality_and_ends_on_same_second_edit(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'needs_review']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/send-back"), ['note' => 'Revise'])->assertOk()->assertJsonPath('post.sent_back', true);
        $seen = $post->fresh()->updated_at->toISOString();
        $this->stubContentAi(['overall' => 7]);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/quality"))->assertOk()->assertJsonPath('post.sent_back', true)->assertJsonPath('post.updated_at', $seen);
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Revised'])->assertOk()->assertJsonPath('post.sent_back', false);
    }

    public function test_legacy_publication_backfill_preserves_known_facts_and_uses_saved_venue_day(): void
    {
        DB::table('hotel_settings')->updateOrInsert(['organization_id' => $this->org->id, 'key' => 'hotel_timezone'], ['value' => 'Europe/Riga', 'type' => 'string', 'group' => 'general', 'label' => 'Planning timezone']);
        $dated = $this->makePost(['scheduled_date' => '2026-10-04', 'scheduled_time' => '09:30']);
        $undated = $this->makePost(['scheduled_date' => null]);
        $known = $this->makePost(['status' => 'published', 'published_at' => '2026-10-03 05:00:00']);
        DB::table('content_planner_posts')->whereIn('id', [$dated->id, $undated->id])->update(['status' => 'published', 'published_at' => null]);
        (require database_path('migrations/2026_11_13_100000_precision_and_publication_for_content_posts.php'))->up();
        $this->assertSame('2026-10-04T06:30:00.000000Z', $dated->fresh()->published_at->toISOString());
        $this->assertTrue($undated->fresh()->published_at->eq($undated->updated_at));
        $this->assertTrue($known->fresh()->published_at->eq($known->published_at));
        $this->assertTrue($dated->fresh()->updated_at->eq($dated->updated_at));
    }

    public function test_audience_removal_advances_revision_and_noop_save_does_not(): void
    {
        $audience = $this->profile->audiences()->create(['name' => 'Clients', 'brand_id' => $this->brandId]);
        $post = $this->makePost(['audience_id' => $audience->id]);
        $seen = $post->updated_at->toISOString();
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen])->assertOk()->assertJsonPath('post.updated_at', $seen);
        app(\App\Services\Content\ContentBrandEditor::class)->deleteAudience($this->profile, $audience);
        $this->assertTrue($post->fresh()->updated_at->gt($post->updated_at));
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Stale'])->assertStatus(409);
    }

    public function test_provider_runs_without_a_write_transaction_and_failed_commit_keeps_approval_event_out(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'approved']);
        $transactions = DB::transactionLevel();
        $this->stubContentAi(['hook' => 'AI', 'visual_brief' => ['scene' => 'Fail persistence']], function () use ($transactions) {
            $this->assertSame($transactions, DB::transactionLevel());
        });
        ContentPlannerVisualBrief::creating(function ($brief) { if ($brief->scene === 'Fail persistence') throw new \RuntimeException('Simulated brief storage failure'); });
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))->assertStatus(502);
        $this->assertSame('approved', $post->fresh()->status);
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }

    public function test_audience_removal_advances_every_revision_beyond_the_first_batch_and_refuses_the_final_snapshot(): void
    {
        $audience = $this->profile->audiences()->create(['name' => 'Clients', 'brand_id' => $this->brandId]);
        $snapshots = collect(range(1, 1001))->map(fn () => $this->makePost(['audience_id' => $audience->id, 'hook' => 'Original']));
        $last = $snapshots->last();

        app(\App\Services\Content\ContentBrandEditor::class)->deleteAudience($this->profile, $audience);

        $current = \App\Models\ContentPlannerPost::whereIn('id', $snapshots->pluck('id'))->get()->keyBy('id');
        $this->assertCount(1001, $current);
        foreach ($snapshots as $snapshot) {
            $this->assertNull($current[$snapshot->id]->audience_id);
            $this->assertTrue($current[$snapshot->id]->updated_at->gt($snapshot->updated_at), "Post {$snapshot->id} must advance when its audience is removed.");
        }

        $called = false;
        try {
            app(\App\Services\Content\ContentPostWrites::class)->apply($last, function ($post) use (&$called) {
                $called = true;
                $post->update(['hook' => 'Obsolete AI output']);
            });
            $this->fail('A captured revision from the final batch must be refused.');
        } catch (\App\Services\Content\ContentRefused $e) {
            $this->assertSame('changed_elsewhere', $e->errorCode);
        }
        $this->assertFalse($called);
        $this->assertSame('Original', $last->fresh()->hook);
    }

    public function test_link_only_edit_advances_revision_under_frozen_clock(): void
    {
        $post = $this->makePost();
        $seen = $post->updated_at->toISOString();
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'link' => 'https://example.com/new'])->assertOk();
        $this->assertTrue($post->fresh()->updated_at->gt($post->updated_at));
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'link' => null])->assertStatus(409);
    }

    public function test_image_storage_failure_preserves_the_current_visual_and_approval(): void
    {
        $this->profile->update(['requires_approval' => true]);
        $post = $this->makePost(['status' => 'approved']);
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Old visual', 'image_url' => '/storage/old.png', 'image_status' => 'ready']);
        $this->stubContentImage();
        $disk = Mockery::mock(\Illuminate\Contracts\Filesystem\Filesystem::class);
        $disk->shouldReceive('put')->once()->andReturn(false);
        Storage::shouldReceive('disk')->with('public')->andReturn($disk);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/image"))->assertStatus(502);
        $this->assertSame('approved', $post->fresh()->status);
        $this->assertSame('/storage/old.png', $post->fresh()->visualBrief->image_url);
        $this->assertTrue($post->fresh()->updated_at->eq($post->updated_at));
        $this->assertSame(0, ContentPlannerPostEvent::where('post_id', $post->id)->count());
    }
}
