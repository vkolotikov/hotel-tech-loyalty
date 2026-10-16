<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerKeyDate;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The Plan's key dates (spec 2026-10-16 §3.4, §9.2). The organisation is in the beauty industry. */
class PlanKeyDatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** The range's key dates as lines: "date id kind" (a trailing * for a substitute day) or "start..end title kind". @return list<string> */
    private function keyDates(string $from, string $to, ?int $brand = null): array
    {
        $days = $this->asStaffMember()->getJson($this->api("plan?from={$from}&to={$to}" . ($brand ? "&brand_id={$brand}" : '')))->assertOk()->json('key_dates');

        return array_map(fn (array $d) => isset($d['date'])
            ? "{$d['date']} {$d['id']} {$d['kind']}" . ($d['substitute'] ? '*' : '')
            : "{$d['start']}.." . ($d['end'] ?? '') . " {$d['title']} {$d['kind']}", $days);
    }

    private function choose(array $settings): void
    {
        $this->profile->forceFill($settings)->save();
    }

    public function test_the_plan_carries_the_brands_holidays_and_special_days(): void
    {
        $this->choose(['holiday_country' => 'GB']);

        $this->assertSame(
            ['2026-12-24 christmas_eve marketing', '2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday', '2026-12-28 gb.boxing_day holiday*', '2026-12-31 new_years_eve marketing'],
            $this->keyDates('2026-12-21', '2026-12-31'),
        );
        $this->asStaffMember()->getJson($this->api('plan?from=2026-12-21&to=2026-12-31'))->assertJsonPath('key_dates.1.name_en', 'Christmas Day');
    }

    public function test_a_range_across_new_year_brings_the_observed_and_substitute_days(): void
    {
        $this->choose(['holiday_country' => 'US', 'marketing_days' => false]);
        $this->assertSame(
            ['2027-12-24 christmas holiday*', '2027-12-25 christmas holiday', '2027-12-31 new_year holiday*', '2028-01-01 new_year holiday'],
            $this->keyDates('2027-12-20', '2028-01-09'),
        );

        $this->choose(['holiday_country' => 'GB']);
        $this->assertSame(
            ['2027-12-25 christmas holiday', '2027-12-26 gb.boxing_day holiday', '2027-12-27 christmas holiday*', '2027-12-28 gb.boxing_day holiday*', '2028-01-01 new_year holiday', '2028-01-03 new_year holiday*'],
            $this->keyDates('2027-12-20', '2028-01-09'),
        );
    }

    public function test_none_means_no_holidays_never_chosen_means_the_guess_and_the_switch_hides_special_days(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->assertSame(['2026-06-23 lv.ligo holiday', '2026-06-24 midsummer holiday'], $this->keyDates('2026-06-22', '2026-06-26'));

        $this->choose(['holiday_country' => 'none']);
        $this->assertSame([], $this->keyDates('2026-06-22', '2026-06-26'));

        $this->choose(['holiday_country' => 'GB']);
        $this->assertContains('2026-12-24 christmas_eve marketing', $this->keyDates('2026-12-21', '2026-12-27'));
        $this->choose(['marketing_days' => false]);
        $this->assertSame(['2026-12-25 christmas holiday', '2026-12-26 gb.boxing_day holiday'], $this->keyDates('2026-12-21', '2026-12-27'));
    }

    public function test_events_that_overlap_the_range_and_notes_on_its_days_show(): void
    {
        $this->choose(['holiday_country' => 'none', 'marketing_days' => false]);
        $own = fn (array $a) => ContentPlannerKeyDate::create($a + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId]);
        $own(['kind' => 'event', 'title' => 'Autumn offer', 'start_date' => '2026-09-28', 'end_date' => '2026-10-08']);
        $own(['kind' => 'note', 'title' => 'Photographer', 'start_date' => '2026-10-07']);
        $own(['kind' => 'note', 'title' => 'Next week', 'start_date' => '2026-10-12']);
        $own(['kind' => 'event', 'title' => 'Over', 'start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        [$second] = $this->secondBrand();
        $this->asManager()->postJson($this->api("key-dates?brand_id={$second}"), ['kind' => 'event', 'title' => 'Theirs', 'start_date' => '2026-10-06'])->assertCreated();

        $this->assertSame(['2026-09-28..2026-10-08 Autumn offer event', '2026-10-07.. Photographer note'], $this->keyDates('2026-10-05', '2026-10-11'));
    }

    public function test_the_industry_days_follow_the_organisation(): void
    {
        $this->choose(['holiday_country' => 'none']);

        $this->assertSame(['2026-06-13 global_wellness industry'], $this->keyDates('2026-06-08', '2026-06-14'));
    }

    public function test_a_brand_without_a_profile_still_sees_the_guessed_holidays(): void
    {
        $this->org->forceFill(['country' => 'FR'])->save();
        [$second] = $this->secondBrand(false);

        $this->assertContains('2026-07-14 fr.bastille holiday', $this->keyDates('2026-07-13', '2026-07-19', $second));
    }
}
