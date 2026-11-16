<?php

namespace Tests\Feature\Content;

use App\Jobs\AdaptPostVersions;
use App\Jobs\GenerateContentCalendar;
use App\Jobs\GenerateContentStrategy;
use App\Jobs\RewriteRepeatCopies;
use App\Jobs\RunContentWork;
use App\Jobs\ScanContentWebsite;
use App\Jobs\WritePromotionPosts;
use App\Models\Brand;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerStrategy;
use App\Models\ContentPlannerVisualBrief;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentWork;
use App\Models\Staff;
use App\Services\AiUsageService;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentExecution;
use App\Services\Content\ContentGenerationRun;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRepeatRewriter;
use App\Services\Content\ContentSiteScan;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentWorkService;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPlannerStrategyService;
use Carbon\CarbonImmutable;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use OpenAI\Contracts\ClientContract;
use OpenAI\Contracts\Resources\ImagesContract;
use OpenAI\Exceptions\ErrorException;
use Tests\Concerns\SetsUpContentSchema;
use Tests\Concerns\StubsContentPostProviders;
use Tests\TestCase;

class AsyncWorkTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, StubsContentPostProviders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        if (is_file(database_path('migrations/2026_11_13_110000_create_content_work.php')) && ! Schema::hasTable('content_work')) {
            (require database_path('migrations/2026_11_13_110000_create_content_work.php'))->up();
        }
        Http::preventStrayRequests();
        Queue::fake();
    }

    public function test_request_key_is_idempotent_and_dto_never_returns_inputs(): void
    {
        $post = $this->makePost();
        $input = ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'one-press', 'instructions' => 'Private draft instructions'];
        $first = $this->asManager()->postJson($this->api('work'), $input)->assertStatus(202)->json('work');
        $next = $this->postJson($this->api('work'), $input)->assertStatus(202)->json('work');
        $this->assertSame($first['id'], $next['id']);
        $this->assertSame(['id', 'action', 'status', 'post_id', 'started_at', 'finished_at', 'error', 'result', 'can_cancel'], array_keys($first));
        $this->assertStringNotContainsString('Private draft', json_encode($first));
        $this->postJson($this->api('work'), array_replace($input, ['instructions' => 'Different request']))->assertStatus(409)->assertJsonPath('error', 'request_key_used');
        $this->postJson($this->api('work'), array_replace($input, ['request_key' => 'overlapping']))->assertStatus(409)->assertJsonPath('error', 'already_generating');
        Queue::assertPushed(RunContentWork::class, 1);
    }

    public function test_cancellation_during_provider_prevents_words_and_brief_commit(): void
    {
        $post = $this->makePost(['hook' => 'Original']);
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'cancel'])->assertStatus(202)->json('work.id');
        $this->stubContentAi(['hook' => 'AI', 'visual_brief' => ['scene' => 'AI']], function () use ($id) {
            app(ContentWorkService::class)->cancel(ContentWork::findOrFail($id), $this->manager);
        });
        (new RunContentWork($id))->handle();
        $this->assertSame('cancelled', ContentWork::find($id)->status);
        $this->assertSame('Original', $post->fresh()->hook);
        $this->assertNull($post->fresh()->visualBrief);
    }

    public function test_allowance_ignores_a_cached_aggregate_from_another_worker(): void
    {
        $this->setAiCap(100, 0);
        app(ContentAiGate::class)->allow($this->org->fresh());
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'feature' => 'content', 'model' => 'test', 'kind' => 'chat', 'input_tokens' => 0, 'output_tokens' => 0, 'cost_cents' => 100, 'created_at' => now()]);
        $this->expectException(ContentRefused::class);
        app(ContentAiGate::class)->allow($this->org->fresh());
    }

    public function test_cancel_before_start_and_worker_failure_are_terminal_and_release_post_ownership(): void
    {
        $post = $this->makePost();
        $id = $this->asStaffMember()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'before'])->assertStatus(202)->json('work.id');
        $this->deleteJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.status', 'cancelled');
        $this->deleteJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.status', 'cancelled');
        (new RunContentWork($id))->handle();
        Http::assertNothingSent();
        $next = $this->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'next'])->assertStatus(202)->json('work.id');
        (new RunContentWork($next))->failed(new \RuntimeException('PRIVATE_PROVIDER_SENTINEL'));
        $this->getJson($this->api("work/{$next}"))->assertOk()->assertJsonPath('work.status', 'failed')->assertJsonPath('work.error', 'ai_failed');
        $this->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'last'])->assertStatus(202);
    }

    public function test_a_different_staff_member_cannot_cancel_and_another_brand_cannot_read(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'private'])->assertStatus(202)->json('work.id');
        $this->asStaffMember()->deleteJson($this->api("work/{$id}"))->assertStatus(403)->assertJsonPath('error', 'not_yours');
        [$other] = $this->secondBrand();
        $this->asManager()->getJson($this->api("work/{$id}").'?brand_id='.$other)->assertStatus(404);
        $this->asManager()->deleteJson($this->api("work/{$id}"))->assertOk();
    }

    public function test_cancel_capability_is_the_current_viewers_and_terminal_work_cannot_be_cancelled(): void
    {
        $post = $this->makePost();
        $id = $this->asStaffMember()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'capability'])
            ->assertStatus(202)->assertJsonPath('work.can_cancel', true)->json('work.id');
        $other = $this->staffUser($this->org, ['role' => 'staff']);
        $this->actingAs($other, 'sanctum')->getJson($this->api('work').'?post_id='.$post->id)
            ->assertOk()->assertJsonPath('work.id', $id)->assertJsonPath('work.can_cancel', false);
        $this->asManager()->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.can_cancel', true);
        $this->asStaffMember()->deleteJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.can_cancel', false);
        $this->asManager()->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.can_cancel', false);
        $this->assertArrayNotHasKey('requester_id', $this->getJson($this->api("work/{$id}"))->json('work'));
    }

    public function test_budget_exhausted_after_enqueue_stops_before_provider(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'budget'])->assertStatus(202)->json('work.id');
        $this->setAiCap(100, 100);
        (new RunContentWork($id))->handle();
        $this->assertSame('ai_budget_used_up', ContentWork::find($id)->error);
        Http::assertNothingSent();
    }

    public function test_fill_budget_exhausted_after_enqueue_preserves_the_refusal_without_provider(): void
    {
        $this->setAiCap(100, 0);
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'fill', 'date' => '2026-10-05', 'platform' => 'instagram', 'request_key' => 'fill-budget'])
            ->assertStatus(202)->json('work.id');
        $this->setAiCap(100, 100);
        Queue::pushed(RunContentWork::class)->first()->handle();
        $this->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.status', 'failed')
            ->assertJsonPath('work.error', 'ai_budget_used_up')->assertJsonPath('work.result', null)->assertJsonPath('work.can_cancel', false);
        $this->assertSame(0, ContentPlannerPost::count());
        Http::assertNothingSent();
    }

    public function test_fill_reports_a_busy_allowance_lease_without_provider(): void
    {
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'fill', 'date' => '2026-10-05', 'platform' => 'instagram', 'request_key' => 'fill-busy'])
            ->assertStatus(202)->json('work.id');
        $lease = ContentAiGate::lease("content:allowance:{$this->org->id}", 120);
        $this->assertTrue($lease->get());
        try {
            Queue::pushed(RunContentWork::class)->first()->handle();
            $this->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.status', 'failed')->assertJsonPath('work.error', 'ai_busy');
            $this->assertSame(0, ContentPlannerPost::count());
            Http::assertNothingSent();
        } finally {
            $lease->release();
        }
    }

    public function test_fill_preserves_recognized_calendar_reasons_and_hides_unknown_or_missing_reasons(): void
    {
        $reasons = ['access_revoked', 'subscription_required', 'workspace_disabled', 'no_brand', 'brand_not_allowed', 'manager_only',
            'range_in_past', 'cancelled', 'provider_unavailable', 'time_budget_exceeded', 'invalid_ai_response',
            'PRIVATE_PROVIDER_SENTINEL', null, ['invalid']];
        foreach ($reasons as $index => $reason) {
            $id = $this->asManager()->postJson($this->api('work'), ['action' => 'fill', 'date' => '2026-10-05', 'platform' => 'instagram', 'request_key' => 'fill-reason-'.$index])
                ->assertStatus(202)->json('work.id');
            // Exercise the job's result boundary for responses the provider cannot directly produce.
            $this->mock(ContentCalendarGenerationService::class)->shouldReceive('generate')->once()
                ->andReturn(['created' => [], 'skipped_dates' => [], 'failed_windows' => $reason === null ? [] : [['reason' => $reason]], 'weeks_processed' => 0]);
            (new RunContentWork($id))->handle();
            $expected = $index < 11 ? $reason : 'ai_failed';
            $this->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.status', 'failed')
                ->assertJsonPath('work.error', $expected)->assertJsonPath('work.result', null)->assertDontSee('PRIVATE_PROVIDER_SENTINEL');
        }
        $this->assertSame(0, ContentPlannerPost::count());
        Http::assertNothingSent();
    }

    public function test_expired_inactive_restricted_or_disabled_requester_stops_queued_work(): void
    {
        foreach (['subscription', 'seat', 'brand', 'workspace'] as $change) {
            $this->org->update(['subscription_status' => 'ACTIVE', 'settings' => []]);
            Staff::where('user_id', $this->staffMember->id)->update(['is_active' => true]);
            $this->staffMember->brands()->detach();
            $post = $this->makePost();
            $id = $this->asStaffMember()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => $change])->assertStatus(202)->json('work.id');
            match ($change) {
                'subscription' => $this->org->update(['subscription_status' => 'EXPIRED']),
                'seat' => Staff::where('user_id', $this->staffMember->id)->update(['is_active' => false]),
                'brand' => $this->staffMember->brands()->sync([$this->secondBrand()[0]]),
                'workspace' => $this->org->update(['settings' => ['workspaces' => ['content' => ['enabled' => false]]]]),
            };
            (new RunContentWork($id))->handle();
            $this->assertSame('failed', ContentWork::find($id)->status, $change);
            $this->assertContains(ContentWork::find($id)->error, ['subscription_required', 'access_revoked', 'brand_not_allowed', 'workspace_disabled']);
        }
        Http::assertNothingSent();
    }

    public function test_revision_changed_while_queued_is_refused_without_provider_and_success_is_pollable(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'stale'])->assertStatus(202)->json('work.id');
        $post->update(['hook' => 'Human']);
        (new RunContentWork($id))->handle();
        $this->assertSame('changed_elsewhere', ContentWork::find($id)->error);
        Http::assertNothingSent();
        $next = $this->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'fresh'])->assertStatus(202)->json('work.id');
        $calls = 0;
        $this->stubContentAi(['hook' => 'AI', 'visual_brief' => ['scene' => 'AI']], function () use (&$calls) {
            $calls++;
        });
        (new RunContentWork($next))->handle();
        (new RunContentWork($next))->handle();
        $this->assertSame(1, $calls);
        $this->getJson($this->api('work').'?post_id='.$post->id)->assertOk()->assertJsonPath('work.status', 'succeeded')->assertJsonPath('work.result.post_id', $post->id);
    }

    public function test_fill_cancellation_during_provider_prevents_creation(): void
    {
        $id = $this->asStaffMember()->postJson($this->api('work'), ['action' => 'fill', 'date' => '2026-10-05', 'platform' => 'instagram', 'request_key' => 'fill'])->assertStatus(202)->json('work.id');
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function () use ($id) {
            app(ContentWorkService::class)->cancel(ContentWork::find($id), $this->staffMember);

            return Http::response($this->calendarReply([$this->calendarItem('2026-10-05', 'instagram')]));
        });
        (new RunContentWork($id))->handle();
        $this->assertSame('cancelled', ContentWork::find($id)->status);
        $this->assertSame(0, ContentPlannerPost::count());
    }

    public function test_json_repair_rechecks_allowance_after_first_paid_response(): void
    {
        $this->setAiCap(1, 0);
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function () {
            $response = $this->calendarReply([]);
            $response['content'][0]['text'] = 'invalid JSON';

            return Http::response($response);
        });
        try {
            app(AiClient::class)->generateJson($this->profile, 'quality_check', 'test');
            $this->fail('repair exceeded allowance');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_budget_used_up', $e->errorCode);
        }
        Http::assertSentCount(1);
    }

    public function test_calendar_preserves_partial_results_when_next_week_exhausts_budget(): void
    {
        $this->setAiCap(1, 0);
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        $result = app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-10-05', '2026-10-18');
        $this->assertCount(1, $result['created']);
        $this->assertSame('ai_budget_used_up', $result['failed_windows'][0]['reason']);
        Http::assertSentCount(1);
    }

    public function test_queued_calendar_recomputes_today_and_cannot_insert_yesterday_after_midnight(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-05 23:59:59'));
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-07'])->assertStatus(202);
        $job = Queue::pushed(GenerateContentCalendar::class)->first();
        $this->travelTo(CarbonImmutable::parse('2026-10-06 00:00:00'));
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function ($request) {
            $this->assertStringNotContainsString('2026-10-05', $request->body());

            return Http::response($this->calendarReply([$this->calendarItem('2026-10-06', 'instagram')]));
        });
        $job->handle(app(ContentCalendarGenerationService::class));
        $this->assertSame(['2026-10-06'], ContentPlannerPost::get()->map(fn ($p) => $p->scheduled_date->format('Y-m-d'))->all());
    }

    public function test_midnight_during_provider_discards_newly_past_items(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-05 23:59:59'));
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function () {
            $this->travelTo(CarbonImmutable::parse('2026-10-06 00:00:01'));

            return Http::response($this->calendarReply([$this->calendarItem('2026-10-05', 'instagram'), $this->calendarItem('2026-10-06', 'instagram')]));
        });
        $result = app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-10-05', '2026-10-06');
        $this->assertCount(1, $result['created']);
        $this->assertSame('2026-10-06', $result['created'][0]->scheduled_date->format('Y-m-d'));
        $this->assertSame('date_in_past', $result['skipped_dates'][0]['reason']);
    }

    public function test_shared_allowance_lease_serializes_brands_and_rechecks_spend_after_release(): void
    {
        $this->setAiCap(1, 0);
        $gate = app(ContentAiGate::class);
        $gate->attempt($this->org->id, function () use ($gate) {
            [$other] = $this->secondBrand();
            app()->instance('current_brand_id', $other);
            try {
                $gate->attempt($this->org->id, fn () => $this->fail('parallel provider'));
                $this->fail('no lease');
            } catch (ContentRefused $e) {
                $this->assertSame('ai_busy', $e->errorCode);
            }
            app(AiUsageService::class)->recordUsage($this->org->id, 'claude-sonnet-5', 20, 30, 'content');
        });
        try {
            $gate->attempt($this->org->id, fn () => $this->fail('over budget'));
            $this->fail('stale allowance');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_budget_used_up', $e->errorCode);
        }
    }

    public function test_image_fallback_checks_fresh_budget_after_definitive_access_failure(): void
    {
        $post = $this->makePost();
        ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'A calm room']);
        config(['openai.api_key' => 'test-only', 'openai.image_model' => 'gpt-image-1', 'openai.image_fallback_model' => 'gpt-image-1-mini']);
        $images = \Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->andReturnUsing(function () {
            $this->setAiCap(100, 100);
            throw new ErrorException(['message' => 'Organization must be verified'], new Response(403));
        });
        $client = \Mockery::mock(ClientContract::class);
        $client->shouldReceive('images')->andReturn($images);
        $service = app(ImageGenerationService::class);
        (new \ReflectionProperty($service, 'client'))->setValue($service, $client);
        try {
            $service->generateForPost($post);
            $this->fail('fallback exceeded cap');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_budget_used_up', $e->errorCode);
        }
    }

    public function test_calendar_cancel_during_provider_keeps_cancelled_state_and_releases_brand(): void
    {
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-07'])->assertStatus(202);
        $job = Queue::pushed(GenerateContentCalendar::class)->first();
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function () {
            ContentGenerationRun::cancel($this->org->id, $this->brandId, $this->manager);

            return Http::response($this->calendarReply([$this->calendarItem('2026-10-05', 'instagram')]));
        });
        $job->handle(app(ContentCalendarGenerationService::class));
        $this->assertSame(0, ContentPlannerPost::count());
        $this->assertSame('cancelled', ContentGenerationRun::describe($this->brandId)['status']);
        $owner = app(ContentAiGate::class)->startGeneration($this->org->id, $this->brandId);
        app(ContentAiGate::class)->endGeneration($this->org->id, $this->brandId, $owner);
    }

    public function test_every_post_action_polls_a_safe_result_and_honours_in_flight_cancellation(): void
    {
        foreach (['rewrite', 'quality', 'brief', 'image'] as $action) {
            foreach ([false, true] as $cancel) {
                $post = $this->makePost(['hook' => 'Original']);
                if ($action === 'image') {
                    ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Original scene', 'image_url' => '/kept.png']);
                }
                $id = $this->asStaffMember()->postJson($this->api('work'), ['action' => $action, 'post_id' => $post->id, 'type' => 'shorter', 'request_key' => $action.'-'.(int) $cancel])->assertStatus(202)->json('work.id');
                $during = $cancel ? function () use ($id) {
                    app(ContentWorkService::class)->cancel(ContentWork::find($id), $this->staffMember);
                } : null;
                if ($action === 'image') {
                    $this->stubContentImage($during);
                } else {
                    $this->stubContentAi($action === 'quality' ? ['overall' => 8, 'scores' => [], 'verdict' => 'Good'] : ['scene' => 'Generated scene'], $during);
                }
                (new RunContentWork($id))->handle();
                $row = ContentWork::find($id);
                $this->assertSame($cancel ? 'cancelled' : 'succeeded', $row->status, $action);
                if ($cancel) {
                    $this->assertNull($row->result);
                    $this->assertSame(0, $post->variations()->count());
                    $this->assertNull($post->fresh()->quality_score);
                    $this->assertSame($action === 'image' ? '/kept.png' : null, $post->fresh()->visualBrief?->image_url);
                } else {
                    $this->assertSame($post->id, $row->result['post_id']);
                    if ($action === 'rewrite') {
                        $this->assertSame(['id', 'type', 'copy'], array_keys($row->result['variation']));
                    }
                    if ($action === 'quality') {
                        $this->assertSame(8, $row->result['quality']['overall']);
                    }
                }
                $this->app->forgetInstance(ImageGenerationService::class);
            }
        }
    }

    public function test_fill_success_returns_and_indexes_the_new_post_and_deadline_failure_is_safe(): void
    {
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'fill', 'date' => '2026-10-05', 'platform' => 'instagram', 'request_key' => 'fill-success'])->assertStatus(202)->json('work.id');
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        (new RunContentWork($id))->handle();
        $row = ContentWork::find($id);
        $this->assertSame('succeeded', $row->status);
        $this->assertSame($row->result['post_id'], (int) $row->post_id);
        $this->getJson($this->api('work').'?post_id='.$row->post_id)->assertOk()->assertJsonPath('work.id', $id);
        $post = $this->makePost();
        $late = $this->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'dead'])->assertStatus(202)->json('work.id');
        ContentWork::whereKey($late)->update(['status' => 'running', 'started_at' => now()->subSeconds(121), 'owner' => 'dead-worker']);
        $this->getJson($this->api("work/{$late}"))->assertOk()->assertJsonPath('work.status', 'failed')->assertJsonPath('work.error', 'ai_failed');
        $this->assertNull(ContentWork::find($late)->owner);
    }

    public function test_provider_failure_is_not_automatically_retried_and_never_leaks_into_work(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'failed-provider'])->assertStatus(202)->json('work.id');
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(fn () => Http::response(['error' => ['message' => 'PRIVATE_PROVIDER_SENTINEL']], 503));
        (new RunContentWork($id))->handle();
        Http::assertSentCount(1);
        $this->getJson($this->api("work/{$id}"))->assertOk()->assertJsonPath('work.error', 'ai_failed')->assertDontSee('PRIVATE_PROVIDER_SENTINEL');
    }

    public function test_legacy_calls_share_a_sub_web_timeout_and_queued_images_get_longer_budget(): void
    {
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function ($request, $options) {
            $this->assertLessThanOrEqual(45, $options['timeout']);
            $this->assertLessThanOrEqual(5, $options['connect_timeout']);

            return Http::response($this->calendarReply([]));
        });
        app(AiClient::class)->generateJson($this->profile, 'quality_check', 'test');
        $context = new ContentExecution($this->org->id, $this->brandId, $this->manager->id, false, null, new CalendarGenerationBudget(null, 100));
        $context->run(function () {
            $service = app(ImageGenerationService::class);
            $this->assertGreaterThan(45, ContentExecution::budget()->requestTimeout());
            $this->assertLessThanOrEqual(90, ContentExecution::budget()->requestTimeout());
        });
    }

    public function test_a_disabled_organisation_cannot_run_previously_queued_work(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'disabled-org'])->assertStatus(202)->json('work.id');
        $this->org->update(['is_active' => false]);
        $calls = 0;
        $this->stubContentAi(['hook' => 'AI'], function () use (&$calls) {
            $calls++;
        });
        (new RunContentWork($id))->handle();
        $this->assertSame('access_revoked', ContentWork::find($id)->error);
        $this->assertSame(0, $calls);
    }

    public function test_a_deleted_brand_cannot_run_previously_queued_work(): void
    {
        $post = $this->makePost();
        $id = $this->asManager()->postJson($this->api('work'), ['action' => 'write', 'post_id' => $post->id, 'request_key' => 'deleted-brand'])->assertStatus(202)->json('work.id');
        Brand::findOrFail($this->brandId)->delete();
        $calls = 0;
        $this->stubContentAi(['hook' => 'AI'], function () use (&$calls) {
            $calls++;
        });
        (new RunContentWork($id))->handle();
        $this->assertSame('no_brand', ContentWork::find($id)->error);
        $this->assertSame(0, $calls);
    }

    public function test_calendar_losing_its_brand_lease_during_provider_cannot_insert(): void
    {
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-07'])->assertStatus(202);
        $job = Queue::pushed(GenerateContentCalendar::class)->first();
        $nextOwner = null;
        config(['services.anthropic.api_key' => 'test-only']);
        Http::fake(function () use ($job, &$nextOwner) {
            app(ContentAiGate::class)->endGeneration($this->org->id, $this->brandId, $job->lockOwner);
            $nextOwner = app(ContentAiGate::class)->startGeneration($this->org->id, $this->brandId);

            return Http::response($this->calendarReply([$this->calendarItem('2026-10-05', 'instagram')]));
        });
        try {
            $job->handle(app(ContentCalendarGenerationService::class));
            $this->assertSame(0, ContentPlannerPost::count());
        } finally {
            if ($nextOwner) {
                app(ContentAiGate::class)->endGeneration($this->org->id, $this->brandId, $nextOwner);
            }
        }
    }

    public function test_all_legacy_queued_actions_refuse_a_deactivated_requester_before_their_provider(): void
    {
        $post = $this->makePost();
        $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])->assertCreated();
        $this->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14', 'ai_rewrite' => true])->assertCreated();
        $this->postJson($this->api('strategies'), [])->assertStatus(202);
        $this->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-07'])->assertStatus(202);
        $site = ContentSite::create(['brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'status' => 'scanning', 'scan_token' => 'test-token', 'scan_queued_at' => now(), 'url' => 'https://example.test']);
        $promotion = ContentPromotion::create(['brand_id' => $this->brandId, 'planner_profile_id' => $this->profile->id, 'batch' => (string) Str::uuid(), 'status' => 'queued', 'slots' => [], 'posts_wanted' => 1, 'created_by' => $this->manager->id]);
        Staff::where('user_id', $this->manager->id)->update(['is_active' => false]);
        Queue::pushed(AdaptPostVersions::class)->first()->handle(app(ContentVersionAdapter::class), app(ContentAiGate::class));
        Queue::pushed(RewriteRepeatCopies::class)->first()->handle(app(ContentRepeatRewriter::class), app(ContentAiGate::class));
        Queue::pushed(GenerateContentStrategy::class)->first()->handle(app(ContentPlannerStrategyService::class));
        Queue::pushed(GenerateContentCalendar::class)->first()->handle(app(ContentCalendarGenerationService::class));
        (new ScanContentWebsite($site->id, 'test-token', true, $this->manager->id))->handle(app(ContentSiteScan::class));
        (new WritePromotionPosts($promotion->id))->handle(app(ContentPromotionPosts::class), app(ContentAiGate::class));
        Http::assertNothingSent();
        $this->assertSame('failed', $site->fresh()->status);
        $this->assertSame('failed', $promotion->fresh()->status);
        $this->assertSame('failed', ContentPlannerStrategy::first()->status);
        $this->assertSame('failed', ContentGenerationRun::describe($this->brandId)['status']);
        $this->assertFalse(app()->bound(ContentExecution::class));
    }
}
