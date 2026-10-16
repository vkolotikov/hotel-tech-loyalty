<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use App\Services\Content\ContentKeyDates;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPostGenerationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Key dates in the AI's context (spec 2026-10-16 §3.6): holidays, special days and the brand's events; never notes. */
class KeyDatesAiTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->profile->forceFill(['holiday_country' => 'GB'])->save();
        $this->profile = $this->profile->fresh();
        ContentPlannerKeyDate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'event', 'title' => 'Winter open day', 'details' => 'Free mini facials', 'start_date' => '2026-12-22']);
        ContentPlannerKeyDate::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'kind' => 'note', 'title' => 'Photographer at ten', 'start_date' => '2026-12-23']);
    }

    public function test_the_ai_is_told_holidays_special_days_and_events_by_day_never_notes(): void
    {
        $this->assertSame(
            "- 2026-12-22: Winter open day (the brand's own event) — Free mini facials\n"
            . "- 2026-12-24: Christmas Eve (marketing day)\n"
            . "- 2026-12-25: Christmas Day (public holiday)\n"
            . '- 2026-12-26: Boxing Day (public holiday)',
            ContentKeyDates::forAi($this->org, $this->profile, '2026-12-21', '2026-12-27'),
        );
        $this->assertSame('- 2026-12-28: Boxing Day (public holiday, substitute day off)', ContentKeyDates::forAi($this->org, $this->profile, '2026-12-28', '2026-12-28'));
        $this->assertSame('', ContentKeyDates::forAi($this->org, $this->profile, '2026-12-23', '2026-12-23'));

        $this->profile->forceFill(['marketing_days' => false])->save();
        $this->assertStringNotContainsString('Christmas Eve', ContentKeyDates::forAi($this->org, $this->profile->fresh(), '2026-12-21', '2026-12-27'));
    }

    public function test_generate_and_fill_tell_the_ai_the_windows_key_dates(): void
    {
        config(['services.anthropic.api_key' => 'key-dates-test-key']);
        Http::preventStrayRequests();
        $prompts = [];
        Http::fake(function ($request) use (&$prompts) {
            $prompts[] = $request->body();
            $items = [['date' => '2026-12-23', 'platform' => 'instagram', 'topic' => 'Winter glow', 'draft_copy' => 'A useful draft.', 'visual_idea' => 'A candle-lit room.']];

            return Http::response(['id' => 'msg_key_dates', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
                'content' => [['type' => 'text', 'text' => json_encode(['items' => $items])]],
                'stop_reason' => 'end_turn', 'stop_sequence' => null, 'usage' => ['input_tokens' => 20, 'output_tokens' => 30]]);
        });
        $this->actingAs($this->manager);

        app(ContentCalendarGenerationService::class)->generate($this->profile, '2026-12-21', '2026-12-27', ['platforms' => ['instagram']]);

        $this->assertCount(1, $prompts);
        $this->assertStringContainsString('KEY DATES IN THIS WINDOW', $prompts[0]);
        $this->assertStringContainsString('Christmas Day (public holiday)', $prompts[0]);
        $this->assertStringContainsString('Winter open day', $prompts[0]);
        $this->assertStringNotContainsString('Photographer', $prompts[0]);
    }

    public function test_write_tells_the_ai_the_key_dates_of_the_posts_day_only(): void
    {
        $service = app(ContentPostGenerationService::class);
        $prompt = fn ($post) => (new \ReflectionMethod($service, 'buildPostPrompt'))->invoke($service, $post, $this->profile, null);

        $christmas = $prompt($this->makePost(['scheduled_date' => '2026-12-25']));
        $this->assertStringContainsString("# KEY DATES ON THIS POST'S DAY", $christmas);
        $this->assertStringContainsString('Christmas Day (public holiday)', $christmas);
        $this->assertStringNotContainsString('Christmas Eve', $christmas);
        $this->assertStringNotContainsString('KEY DATES', $prompt($this->makePost(['scheduled_date' => null])));
        $this->assertStringNotContainsString('Photographer', $prompt($this->makePost(['scheduled_date' => '2026-12-23'])));
    }
}
