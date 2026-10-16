<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/**
 * Posting goals and streaks (spec 2026-10-15 §7). The clock stands at Monday 5 October 2026, 06:00 UTC; the channels'
 * targets are Instagram 2 and LinkedIn 1 a week, set since August.
 */
class GoalsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->update(['posts_per_week' => 2, 'created_at' => '2026-08-03 09:00:00']);
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'linkedin')->update(['posts_per_week' => 1, 'created_at' => '2026-08-03 09:00:00']);
    }

    private function published(string $platform, string $at): void
    {
        $this->makePost(['platform' => $platform, 'status' => 'published', 'published_at' => $at, 'scheduled_date' => substr($at, 0, 10)]);
    }

    private function meetWeek(string $monday): void
    {
        $this->published('instagram', "{$monday} 09:00:00");
        $this->published('instagram', "{$monday} 12:00:00");
        $this->published('linkedin', "{$monday} 10:00:00");
    }

    public function test_this_weeks_progress_per_platform(): void
    {
        $this->published('instagram', '2026-10-05 05:00:00');
        $this->makePost(['platform' => 'instagram', 'status' => 'draft', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['platform' => 'instagram', 'status' => 'archived', 'scheduled_date' => '2026-10-08']);
        $this->makePost(['platform' => 'instagram', 'status' => 'skipped', 'scheduled_date' => '2026-10-09']);

        $this->asStaffMember()->getJson($this->api('goals'))->assertOk()
            ->assertJsonPath('week', ['from' => '2026-10-05', 'to' => '2026-10-11'])
            ->assertJsonPath('platforms', [
                ['platform' => 'instagram', 'target' => 2, 'published' => 1, 'planned' => 1],
                ['platform' => 'linkedin', 'target' => 1, 'published' => 0, 'planned' => 0],
            ]);
    }

    public function test_the_streak_counts_weeks_in_a_row_and_the_current_week_once_met(): void
    {
        foreach (['2026-09-14', '2026-09-21', '2026-09-28'] as $monday) {
            $this->meetWeek($monday);
        }
        $this->published('instagram', '2026-09-08 09:00:00'); // a short week before them ends the count

        $this->asStaffMember()->getJson($this->api('goals'))->assertOk()
            ->assertJsonPath('streak', ['weeks' => 3, 'current_met' => false, 'at_risk' => false, 'short_by' => 3]);

        $this->meetWeek('2026-10-05');
        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.weeks', 4)->assertJsonPath('streak.current_met', true)->assertJsonPath('streak.short_by', 0);
    }

    public function test_weeks_before_the_first_target_was_set_do_not_count(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->update(['created_at' => '2026-09-23 09:00:00']);
        // 14 September had as many posts as today's targets ask, but no target existed yet.
        foreach (['2026-09-14', '2026-09-21', '2026-09-28'] as $monday) {
            $this->meetWeek($monday);
        }

        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.weeks', 2);
    }

    public function test_from_friday_a_running_streak_short_this_week_is_at_risk(): void
    {
        $this->meetWeek('2026-09-28');
        $this->travelTo(CarbonImmutable::parse('2026-10-08 18:00:00')); // Thursday
        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('streak.at_risk', false);

        $this->travelTo(CarbonImmutable::parse('2026-10-09 00:30:00')); // Friday
        $this->asStaffMember()->getJson($this->api('goals'))
            ->assertJsonPath('streak', ['weeks' => 1, 'current_met' => false, 'at_risk' => true, 'short_by' => 3]);
    }

    public function test_the_week_is_the_venues(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-11 20:45:00')); // Sunday 23:45 in Riga
        $this->published('instagram', '2026-10-11 20:30:00'); // Sunday 23:30 in Riga: this week
        $this->published('instagram', '2026-10-04 21:30:00'); // Monday 00:30 in Riga: this week (still Sunday in UTC)
        $this->published('instagram', '2026-10-04 20:30:00'); // Sunday 23:30 in Riga: last week

        $this->asStaffMember()->getJson($this->api('goals'))
            ->assertJsonPath('week', ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertJsonPath('platforms.0.published', 2);
    }

    public function test_only_this_brands_posts_count_and_a_brand_without_targets_has_none(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'published', 'published_at' => '2026-10-05 05:00:00', 'scheduled_date' => '2026-10-05']);

        $this->asStaffMember()->getJson($this->api('goals'))->assertJsonPath('platforms.0.published', 0);
        $this->asManager()->getJson($this->api("goals?brand_id={$second}"))->assertOk()
            ->assertJsonPath('platforms', [])->assertJsonPath('streak', ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]);
    }
}
