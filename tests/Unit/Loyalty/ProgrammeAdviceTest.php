<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Programme\ProgrammeAdvice;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use PHPUnit\Framework\TestCase;

/** "Ways to earn"'s checks (owner 2026-10-26): every rule, by value. */
class ProgrammeAdviceTest extends TestCase
{
    /** The defaults, as a venue that never set anything reads them. */
    private function options(array $more = []): array
    {
        $out = [];
        foreach (ProgrammeOptions::OPTIONS as $key => [, $default]) {
            $out[$key] = $default;
        }

        return $more + $out;
    }

    private function codes(array $options, bool $bookings = true, bool $events = false, array $rewards = [1]): array
    {
        return array_column(ProgrammeAdvice::read($options, ['bookings' => $bookings, 'visit_events' => $events], $rewards)['advice'], 'code');
    }

    public function test_a_venue_with_bookings_and_rewards_on_the_defaults_needs_nothing(): void
    {
        $this->assertSame(['advice' => [], 'not_used' => []], ProgrammeAdvice::read($this->options(), ['bookings' => true, 'visit_events' => false], [1]));
    }

    public function test_without_bookings_points_on_bookings_does_nothing_and_something_else_must_earn(): void
    {
        $read = ProgrammeAdvice::read($this->options(), ['bookings' => false, 'visit_events' => false], [1]);
        $this->assertSame(['points_on_spend'], $read['not_used']);
        $this->assertSame([['code' => 'nothing_earns', 'level' => 'warn', 'way' => 'desk_earn', 'params' => []]], $read['advice']);
        // Any regular way to earn answers it: the desk, a check-in that gives points, the stamp card.
        $this->assertSame([], $this->codes($this->options(['desk_earn_enabled' => true]), false));
        $this->assertSame([], $this->codes($this->options(['checkin_enabled' => true, 'checkin_points' => 10]), false));
        $this->assertSame([], $this->codes($this->options(['stamps_enabled' => true]), false));
        // With bookings but their points switched off, the way to point at is the bookings.
        $this->assertSame('points_on_spend', ProgrammeAdvice::read($this->options(['points_on_bookings' => false]), ['bookings' => true, 'visit_events' => false], [1])['advice'][0]['way']);
    }

    public function test_tiers_by_visits_or_spend_need_something_that_records_them(): void
    {
        $byVisits = $this->options(['tier_progress_by' => 'visits', 'desk_earn_enabled' => false, 'stamps_enabled' => true]);
        $this->assertSame(['visits_without_source'], $this->codes($byVisits, false));
        $this->assertSame([], $this->codes($byVisits, true));
        $this->assertSame([], $this->codes($byVisits, false, true));
        $this->assertSame([], $this->codes(['checkin_enabled' => true] + $byVisits, false));

        $bySpend = $this->options(['tier_progress_by' => 'spend', 'stamps_enabled' => true]);
        $this->assertSame(['spend_without_source'], $this->codes($bySpend, false));
        $this->assertSame([], $this->codes(['desk_earn_enabled' => true] + $bySpend, false));
        $this->assertSame([], $this->codes($bySpend, true));
    }

    public function test_a_stamp_card_reward_no_longer_offered_referrals_that_give_nothing_and_an_empty_catalogue_are_warnings(): void
    {
        $this->assertSame(['stamp_reward_missing'], $this->codes($this->options(['stamps_enabled' => true, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => 9]), true, false, [1, 2]));
        $this->assertSame([], $this->codes($this->options(['stamps_enabled' => true, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => 2]), true, false, [1, 2]));
        $this->assertSame(['referrals_give_nothing'], $this->codes($this->options(['referrer_bonus_points' => 0, 'referee_bonus_points' => 0])));
        $this->assertSame([], $this->codes($this->options(['referral_enabled' => false, 'referrer_bonus_points' => 0, 'referee_bonus_points' => 0])));
        $this->assertSame(['no_rewards'], $this->codes($this->options(), true, false, []));
    }

    public function test_tips_come_after_the_warnings_with_their_numbers(): void
    {
        $read = ProgrammeAdvice::read($this->options(['points_expiry_months' => 3, 'checkin_enabled' => true, 'checkin_points' => 0]), ['bookings' => true, 'visit_events' => false], []);
        $this->assertSame([
            ['code' => 'no_rewards', 'level' => 'warn', 'way' => null, 'params' => []],
            ['code' => 'expiry_short', 'level' => 'tip', 'way' => 'points_expiry', 'params' => ['months' => 3]],
            ['code' => 'checkin_counts_only', 'level' => 'tip', 'way' => 'check_in', 'params' => []],
        ], $read['advice']);
        // Six months and more, or no expiry at all, is not short; a check-in that moves members up by visits is no tip.
        $this->assertSame([], $this->codes($this->options(['points_expiry_months' => 6])));
        $this->assertSame([], $this->codes($this->options(['points_expiry_months' => 0])));
        $this->assertSame([], $this->codes($this->options(['checkin_enabled' => true, 'checkin_points' => 0, 'tier_progress_by' => 'visits'])));
    }

    public function test_every_way_a_check_opens_is_a_way_the_server_has(): void
    {
        $ways = array_keys(ProgrammeOptions::WAYS);
        $read = ProgrammeAdvice::read($this->options(['tier_progress_by' => 'visits', 'referrer_bonus_points' => 0, 'referee_bonus_points' => 0, 'points_expiry_months' => 2, 'checkin_enabled' => true, 'stamps_enabled' => false]), ['bookings' => false, 'visit_events' => false], []);
        foreach ($read['advice'] as $item) {
            $this->assertTrue($item['way'] === null || in_array($item['way'], $ways, true), $item['code']);
        }
        foreach ($read['not_used'] as $way) {
            $this->assertContains($way, $ways);
        }
    }
}
