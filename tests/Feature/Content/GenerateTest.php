<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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
        $lock = Cache::lock("content:generate:{$this->org->id}:{$this->brandId}", 300);
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
}
