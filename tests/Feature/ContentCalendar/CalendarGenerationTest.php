<?php

namespace Tests\Feature\ContentCalendar;

use App\Http\Controllers\Api\V1\Admin\ContentPlannerCalendarController;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Models\User;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use Database\Factories\OrganizationFactory;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class CalendarGenerationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private ContentPlannerProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['services.anthropic.api_key' => 'calendar-test-key']);
        $this->setUpKnowledgeSchema();
        (require database_path('migrations/2026_07_08_000000_create_content_planner_tables.php'))->up();
        (require database_path('migrations/2026_07_08_200000_upgrade_content_planner_tables.php'))->up();
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        $brandId = $org->defaultBrand()->firstOrFail()->id;
        app()->instance('current_brand_id', $brandId);
        $this->profile = ContentPlannerProfile::create(['name' => 'Test profile', 'brand_id' => $brandId]);
        ContentPlannerChannel::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $brandId,
            'platform' => 'linkedin', 'label' => 'LinkedIn', 'active' => true]);
        DB::table('users')->insert(['id' => 7, 'organization_id' => $org->id, 'email' => 'calendar@example.test', 'user_type' => 'staff']);
        $this->actingAs(User::findOrFail(7));
        $knowledge = Mockery::mock(ContentKnowledgeService::class);
        $knowledge->shouldReceive('summarizeForAi')->andReturn('Test business context.');
        $this->app->instance(ContentKnowledgeService::class, $knowledge);
        Route::post('/api/_calendar-regression', [ContentPlannerCalendarController::class, 'generate']);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        parent::tearDown();
    }

    public function test_normal_generation_saves_drafts_and_visuals_with_enforced_calendar_transport_options(): void
    {
        Http::fake(function ($request, $options) {
            $this->assertGreaterThan(0, $options['timeout']);
            $this->assertLessThanOrEqual(90, $options['timeout']);
            $this->assertSame(5.0, (float) $options['connect_timeout']);
            $this->assertFalse($options['allow_redirects']);

            return Http::response($this->message([$this->item('2026-09-07')]));
        });

        $this->generate('2026-09-07', '2026-09-13')->assertOk()
            ->assertJsonPath('status', 'completed')->assertJsonPath('created_count', 1)
            ->assertJsonPath('failed_windows', []);
        $this->assertSame(1, ContentPlannerPost::count());
        $this->assertSame(1, ContentPlannerVisualBrief::count());
        Http::assertSentCount(1);
    }

    #[DataProvider('providerFailures')]
    public function test_provider_failure_stops_later_weeks_without_sdk_or_transport_retries(string $failure): void
    {
        $attempts = 0;
        Http::fake(function () use ($failure, &$attempts) {
            $attempts++;
            if ($failure === 'connection') {
                throw new ConnectionException('Private provider detail');
            }

            return Http::response(['error' => ['type' => 'overloaded_error', 'message' => 'Private provider detail']], 503, ['Retry-After' => '600']);
        });

        $this->generate('2026-09-07', '2026-09-27')->assertStatus(503)
            ->assertJsonPath('status', 'failed')->assertJsonPath('created_count', 0)
            ->assertJsonPath('failed_windows.0.start_date', '2026-09-07')
            ->assertJsonPath('failed_windows.0.reason', 'provider_unavailable')
            ->assertJsonPath('failed_windows.1.reason', 'not_attempted')
            ->assertDontSee('Private provider detail');
        $this->assertSame(1, $attempts);
        $this->assertSame(0, ContentPlannerPost::count());
    }

    public static function providerFailures(): array
    {
        return [['connection'], ['server']];
    }

    public function test_partial_generation_reports_remaining_windows_and_preserves_saved_posts(): void
    {
        Http::fakeSequence()->push($this->message([$this->item('2026-09-07')]))
            ->push(['error' => ['type' => 'overloaded_error', 'message' => 'Unavailable']], 503);

        $this->generate('2026-09-07', '2026-09-27')->assertOk()
            ->assertJsonPath('status', 'partial')->assertJsonPath('created_count', 1)
            ->assertJsonPath('failed_windows.0.start_date', '2026-09-14')
            ->assertJsonPath('failed_windows.1.start_date', '2026-09-21');
        $this->assertSame(1, ContentPlannerPost::count());
        Http::assertSentCount(2);
    }

    public function test_shared_budget_caps_later_attempts_and_stops_before_another_week(): void
    {
        $elapsed = 0.0;
        $budget = new CalendarGenerationBudget(function () use (&$elapsed) { return $elapsed; });
        $timeouts = [];
        $dates = ['2026-09-07', '2026-09-14', '2026-09-21'];
        Http::fake(function ($request, $options) use (&$elapsed, &$timeouts, &$dates) {
            $timeouts[] = $options['timeout'];
            $elapsed += 80;

            return Http::response($this->message([$this->item(array_shift($dates))]));
        });

        $result = app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-09-07', '2026-10-04', [], $budget);

        $this->assertSame([90.0, 90.0, 80.0], array_map('floatval', $timeouts));
        $this->assertCount(3, $result['created']);
        $this->assertSame('2026-09-28', $result['failed_windows'][0]['start_date']);
        $this->assertSame('time_budget_exceeded', $result['failed_windows'][0]['reason']);
        Http::assertSentCount(3);
    }

    public function test_json_repair_uses_the_same_budget(): void
    {
        $elapsed = 200.0;
        $budget = new CalendarGenerationBudget(function () use (&$elapsed) { return $elapsed; });
        // Start this chunk with only 40 seconds remaining in its shared budget.
        $elapsed += 200;
        $calls = 0;
        Http::fake(function ($request, $options) use (&$elapsed, &$calls) {
            $calls++;
            $this->assertSame(40.0, (float) $options['timeout']);
            $elapsed += 40;

            return Http::response($this->message([], 'not valid JSON'));
        });

        $result = app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-09-07', '2026-09-13', [], $budget);

        $this->assertSame(1, $calls);
        $this->assertSame('time_budget_exceeded', $result['failed_windows'][0]['reason']);
        $this->assertSame([], $result['created']);
    }

    #[DataProvider('invalidRanges')]
    public function test_invalid_ranges_return_422_without_ai_calls(string $start, string $end): void
    {
        $this->generate($start, $end)->assertUnprocessable()->assertJsonValidationErrors('end_date');
        Http::assertNothingSent();
    }

    public static function invalidRanges(): array
    {
        return [['2026-09-14', '2026-09-07'], ['2026-09-07', '2026-12-01']];
    }

    public function test_local_database_failure_is_not_a_provider_503(): void
    {
        Schema::drop('content_planner_ai_generations');
        Http::fakeSequence()->push($this->message([$this->item('2026-09-07')]));

        $this->generate('2026-09-07', '2026-09-13')->assertStatus(500)
            ->assertJsonPath('error', 'Calendar generation failed');
        $this->assertSame(0, ContentPlannerPost::count());
        Http::assertSentCount(1);
    }

    public function test_invalid_json_after_one_repair_stops_without_spending_on_later_weeks(): void
    {
        Http::fakeSequence()->push($this->message([], 'incomplete {'))
            ->push($this->message([], 'still incomplete {'));

        $this->generate('2026-09-07', '2026-09-27')->assertStatus(503)
            ->assertJsonPath('created_count', 0)
            ->assertJsonPath('failed_windows.0.reason', 'invalid_ai_response')
            ->assertJsonPath('failed_windows.2.end_date', '2026-09-27');
        Http::assertSentCount(2);
        $this->assertSame(0, ContentPlannerPost::count());
    }

    public function test_json_repair_can_succeed_without_changing_normal_draft_creation(): void
    {
        Http::fakeSequence()->push($this->message([], 'incomplete {'))
            ->push($this->message([$this->item('2026-09-07')]));

        $this->generate('2026-09-07', '2026-09-13')->assertOk()
            ->assertJsonPath('status', 'completed')->assertJsonPath('created_count', 1);
        Http::assertSentCount(2);
    }

    public function test_malformed_items_are_not_reported_as_a_completed_empty_calendar(): void
    {
        Http::fakeSequence()->push($this->message([null, ['date' => [], 'platform' => []]]));

        $this->generate('2026-09-07', '2026-09-27')->assertStatus(503)
            ->assertJsonPath('status', 'failed')->assertJsonPath('created_count', 0)
            ->assertJsonPath('failed_windows.0.reason', 'invalid_ai_response');
        Http::assertSentCount(1);
    }

    public function test_retrying_empty_slots_keeps_previously_saved_posts(): void
    {
        Http::fakeSequence()->push($this->message([$this->item('2026-09-07')]))
            ->push($this->message([$this->item('2026-09-07'), $this->item('2026-09-08')]));

        $this->generate('2026-09-07', '2026-09-13')->assertOk()->assertJsonPath('created_count', 1);
        $firstId = ContentPlannerPost::firstOrFail()->id;
        $this->generate('2026-09-07', '2026-09-13')->assertOk()->assertJsonPath('created_count', 1)
            ->assertJsonPath('skipped_dates.0.reason', 'slot_already_filled');
        $this->assertSame(2, ContentPlannerPost::count());
        $this->assertNotNull(ContentPlannerPost::find($firstId));
    }

    public function test_failed_visual_insert_does_not_leave_an_unreported_post(): void
    {
        // Reproduce a real database failure after the parent post was inserted.
        Schema::drop('content_planner_visual_briefs');
        Http::fakeSequence()->push($this->message([$this->item('2026-09-07')]));

        $response = $this->generate('2026-09-07', '2026-09-13');
        $this->assertSame(0, ContentPlannerPost::count());
        $response->assertStatus(500);
    }

    private function generate(string $start, string $end)
    {
        return $this->postJson('/api/_calendar-regression', ['planner_profile_id' => $this->profile->id,
            'start_date' => $start, 'end_date' => $end, 'fill_empty_only' => true]);
    }

    private function item(string $date): array
    {
        return ['date' => $date, 'platform' => 'linkedin', 'topic' => 'Test topic',
            'draft_copy' => 'A useful draft.', 'visual_idea' => 'A test visual.'];
    }

    private function message(array $items, ?string $text = null): array
    {
        return ['id' => 'msg_calendar_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
            'content' => [['type' => 'text', 'text' => $text ?? json_encode(['items' => $items])]],
            'stop_reason' => 'end_turn', 'stop_sequence' => null, 'usage' => ['input_tokens' => 20, 'output_tokens' => 30]];
    }
}
