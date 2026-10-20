<?php

namespace Tests\Feature\Content;

use App\Jobs\GenerateContentCalendar;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentAiGate;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use App\Support\SharedCache;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class GenerateTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_manager_generates_a_week_and_the_spend_is_counted(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram'), $this->calendarItem('2026-10-06', 'linkedin')]);

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('created_count', 2)
            ->assertJsonPath('posts.0.status', 'draft');
        $this->assertSame('content', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
    }

    public function test_staff_may_not_generate_a_whole_calendar(): void
    {
        $this->fakeAi([]);
        $this->asStaffMember()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_second_generation_for_the_brand_is_refused_while_one_runs(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        // The lock lives in the cache the web app and the queue worker share.
        $lock = SharedCache::store()->lock("content:generate:{$this->org->id}:{$this->brandId}", 300);
        $this->assertTrue($lock->get());

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');

        $lock->release();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertOk();
    }

    public function test_a_provider_failure_answers_503_and_frees_the_brand(): void
    {
        // The provider fails the first request and answers the second.
        $this->fakeAiTurns([[[], 500], [[$this->calendarItem('2026-10-05', 'instagram')], 200]]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(503)
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('created_count', 0)
            ->assertJsonPath('failed_windows.0.reason', 'provider_unavailable');

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertOk()->assertJsonPath('created_count', 1);
    }

    public function test_the_range_the_budget_and_the_channels_are_checked(): void
    {
        $this->fakeAi([]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-01', 'to' => '2026-12-31'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-11', 'to' => '2026-10-05'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11', 'platforms' => ['myspace']])->assertStatus(422);

        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->update(['active' => false]);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(422)->assertJsonPath('error', 'no_channels');

        $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }

    public function test_generating_this_week_on_a_thursday_writes_nothing_for_the_days_already_gone(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-08 06:00:00')); // Thursday
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram'), $this->calendarItem('2026-10-08', 'linkedin')]);

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertOk()
            ->assertJsonPath('created_count', 1)
            ->assertJsonPath('posts.0.scheduled_date', '2026-10-08');
        $this->assertSame(0, ContentPlannerPost::whereDate('scheduled_date', '<', '2026-10-08')->count());

        // A range that is already over asks nothing of the AI.
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-09-28', 'to' => '2026-10-04'])
            ->assertStatus(422)->assertJsonPath('error', 'range_in_past');
        Http::assertSentCount(1);
    }

    // Generate on the queue (2026-10-20): production cuts a request off at 60 s and one week took 65 s — the run is a job.
    public function test_on_the_queue_generate_answers_running_and_the_status_follows_the_run(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asStaffMember()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'idle');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(202)->assertJsonPath('status', 'running');
        Queue::assertPushed(GenerateContentCalendar::class, 1);
        $this->asStaffMember()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'running');
        // A second press while it runs.
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');

        // The worker runs it.
        Queue::pushed(GenerateContentCalendar::class)->first()->handle(app(ContentCalendarGenerationService::class));
        $this->asManager()->getJson($this->api('generate'))->assertOk()
            ->assertJsonPath('status', 'completed')->assertJsonPath('created_count', 1)->assertJsonPath('posts.0.status', 'draft');
        // The brand is free again.
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-12', 'to' => '2026-10-18'])->assertStatus(202);
    }

    public function test_fill_with_ai_is_refused_while_a_queued_generation_runs(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => '2026-10-07', 'platform' => 'instagram'])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');
    }

    // Review Focus 1: a run whose job never finishes does not say "running" forever.
    public function test_a_run_that_never_finishes_reads_as_failed_and_frees_the_brand(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        // Its job starts on the worker, then dies (a deploy, a crash) without reporting.
        $job = Queue::pushed(GenerateContentCalendar::class)->first();
        $this->assertTrue(app(ContentAiGate::class)->resumeGeneration($job->organizationId, $job->brandId, $job->lockOwner));
        \App\Services\Content\ContentGenerationRun::started($job->brandId, $job->lockOwner);
        $this->asManager()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'running');
        $this->travel(ContentAiGate::RUN_SECONDS + 1)->seconds();
        $this->asManager()->getJson($this->api('generate'))->assertOk()
            ->assertJsonPath('status', 'failed')->assertJsonPath('error', 'generation_failed');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
    }

    public function test_a_job_that_throws_records_the_failure_and_frees_the_brand(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        $calendar = Mockery::mock(ContentCalendarGenerationService::class);
        $calendar->shouldReceive('generate')->once()->andThrow(new \RuntimeException('provider exploded'));
        Queue::pushed(GenerateContentCalendar::class)->first()->handle($calendar);
        $this->asManager()->getJson($this->api('generate'))->assertOk()
            ->assertJsonPath('status', 'failed')->assertJsonPath('error', 'generation_failed')->assertJsonPath('created_count', 0);
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
    }

    // Queue review: a run's time starts when its job starts — a job waiting behind others is not called failed at 660 s.
    public function test_a_run_waiting_in_the_queue_is_not_called_failed_and_a_lost_one_is_after_the_queue_allowance(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        $this->travel(ContentAiGate::RUN_SECONDS + 1)->seconds();
        $this->asManager()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'running');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(409);

        $this->travel(ContentAiGate::QUEUED_SECONDS)->seconds();
        $this->asManager()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'failed')->assertJsonPath('error', 'generation_failed');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
    }

    // Queue review: a job that comes late (after its run was called lost and a new one started) writes nothing.
    public function test_a_late_job_does_not_overwrite_the_newer_run(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        $late = Queue::pushed(GenerateContentCalendar::class)->first();
        $this->travel(ContentAiGate::QUEUED_SECONDS + 1)->seconds();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-12', 'to' => '2026-10-18'])->assertStatus(202);
        $posts = ContentPlannerPost::count();

        $late->handle(app(ContentCalendarGenerationService::class));
        $this->assertSame($posts, ContentPlannerPost::count());
        $this->asManager()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'running')->assertJsonPath('from', '2026-10-12');
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-12', 'to' => '2026-10-18'])->assertStatus(409);
    }

    // Queue review: on the worker nobody is signed in — the posts still say who pressed Generate (the bell needs it).
    public function test_posts_written_on_the_worker_are_the_managers_who_pressed_generate(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        Auth::forgetGuards();
        Queue::pushed(GenerateContentCalendar::class)->first()->handle(app(ContentCalendarGenerationService::class));
        $this->assertSame([$this->manager->id], ContentPlannerPost::where('generated_by', '!=', 'manual')->pluck('created_by')->map(fn ($id) => (int) $id)->unique()->values()->all());
        $this->assertNull(Auth::user());
    }

    // Queue review: on the queue a run is not cut at the in-request 240 s budget — a month can finish.
    public function test_a_queued_run_has_the_longer_ai_time_budget(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]); // nothing reaches the network
        Queue::fake();
        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertStatus(202);
        $calendar = Mockery::mock(ContentCalendarGenerationService::class);
        $calendar->shouldReceive('generate')->once()
            ->withArgs(fn ($profile, $from, $to, $opts, $budget) => $budget instanceof CalendarGenerationBudget && $budget->remaining() > CalendarGenerationBudget::MAX_SECONDS + 200)
            ->andReturn(['created' => [], 'skipped_dates' => [], 'failed_windows' => [], 'weeks_processed' => 1]);
        Queue::pushed(GenerateContentCalendar::class)->first()->handle($calendar);
        $this->asManager()->getJson($this->api('generate'))->assertOk()->assertJsonPath('status', 'completed');
    }
}
