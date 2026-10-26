<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Programme\TierAdvice;
use PHPUnit\Framework\TestCase;

/** Program's checks (release 10, the owner's Figma 163:88), read by value. */
class TierAdviceTest extends TestCase
{
    /** @return array{id: int, name: string, is_active: bool, invitation_only: bool, min_points: int|float|null, min_visits: int|float|null, min_spend: int|float|null} */
    private function tier(int $id, string $name, int|float|null $points, array $more = []): array
    {
        // The overrides first: `+` keeps the left side's keys.
        return $more + ['id' => $id, 'name' => $name, 'is_active' => true, 'invitation_only' => false, 'min_points' => $points, 'min_visits' => null, 'min_spend' => null];
    }

    public function test_tiers_reached_by_earning_that_start_at_the_same_figure_are_named_in_the_ladders_order(): void
    {
        // The owner's own example: Learner, Member, Bronze and Client all start at 0; Silver and Preferred at 1,000.
        $tiers = [
            $this->tier(1, 'Learner', 0), $this->tier(2, 'Member', 0), $this->tier(3, 'Bronze', 0), $this->tier(4, 'Client', 0),
            $this->tier(5, 'Scholar', 800), $this->tier(6, 'Silver', 1000), $this->tier(7, 'Preferred', 1000), $this->tier(8, 'Plus', 2000),
        ];

        $this->assertSame([
            [
                'code' => 'tiers_share_threshold', 'level' => 'warn', 'params' => ['value' => 0],
                'tiers' => [['id' => 1, 'name' => 'Learner'], ['id' => 2, 'name' => 'Member'], ['id' => 3, 'name' => 'Bronze'], ['id' => 4, 'name' => 'Client']],
                'benefits' => [],
            ],
            [
                'code' => 'tiers_share_threshold', 'level' => 'warn', 'params' => ['value' => 1000],
                'tiers' => [['id' => 6, 'name' => 'Silver'], ['id' => 7, 'name' => 'Preferred']],
                'benefits' => [],
            ],
        ], TierAdvice::read($tiers, [], [], 'points'));
    }

    public function test_a_switched_off_or_invitation_only_tier_is_not_on_the_ladder_members_climb(): void
    {
        $tiers = [
            $this->tier(1, 'Silver', 0),
            $this->tier(2, 'Old silver', 0, ['is_active' => false]),
            $this->tier(3, 'Friends', 0, ['invitation_only' => true]),
            $this->tier(4, 'Gold', 1000),
        ];

        $this->assertSame([], TierAdvice::read($tiers, [], [], 'points'));
    }

    public function test_it_reads_the_programmes_own_measure_and_a_tier_without_a_floor_there_is_not_on_it(): void
    {
        $tiers = [
            $this->tier(1, 'Regular', 0, ['min_visits' => 5]),
            $this->tier(2, 'Friend', 0, ['min_visits' => 5]),
            $this->tier(3, 'Patron', 0, ['min_visits' => null]),
            $this->tier(4, 'Big spender', 0, ['min_spend' => 100]),
            $this->tier(5, 'Spender', 0, ['min_spend' => 100.0]),
        ];

        // By visits: Regular and Friend share 5 visits; Patron has no visits floor; the points floors (all 0) do not count.
        $this->assertSame([['id' => 1, 'name' => 'Regular'], ['id' => 2, 'name' => 'Friend']], TierAdvice::read($tiers, [], [], 'visits')[0]['tiers']);
        $this->assertCount(1, TierAdvice::read($tiers, [], [], 'visits'));
        // By spend: 100 and 100.0 are the same figure.
        $this->assertSame(['value' => 100], TierAdvice::read($tiers, [], [], 'spend')[0]['params']);
        $this->assertSame([['id' => 4, 'name' => 'Big spender'], ['id' => 5, 'name' => 'Spender']], TierAdvice::read($tiers, [], [], 'spend')[0]['tiers']);
        $this->assertSame(['value' => 99.5], TierAdvice::read([$this->tier(1, 'A', 0, ['min_spend' => 99.5]), $this->tier(2, 'B', 0, ['min_spend' => 99.5])], [], [], 'spend')[0]['params']);
    }

    public function test_a_benefit_switched_on_that_no_tier_in_use_gives_is_a_tip_naming_each_in_the_catalogues_order(): void
    {
        $tiers = [$this->tier(1, 'Silver', 0), $this->tier(2, 'Old gold', 1000, ['is_active' => false])];
        $benefits = [
            ['id' => 10, 'name' => 'Late checkout', 'is_active' => true],
            ['id' => 11, 'name' => 'Spa ritual', 'is_active' => true],
            ['id' => 12, 'name' => 'Welcome drink', 'is_active' => true],
            ['id' => 13, 'name' => 'Retired perk', 'is_active' => false],
        ];
        // Late checkout is given by Silver; the spa ritual only by a switched-off tier; the welcome drink by none.
        $givenBy = [10 => [1], 11 => [2]];

        $this->assertSame([[
            'code' => 'benefit_unused', 'level' => 'tip', 'params' => ['n' => 2], 'tiers' => [],
            'benefits' => [['id' => 11, 'name' => 'Spa ritual'], ['id' => 12, 'name' => 'Welcome drink']],
        ]], TierAdvice::read($tiers, $benefits, $givenBy, 'points'));
        $this->assertSame([], TierAdvice::read($tiers, [$benefits[0], $benefits[3]], $givenBy, 'points'));
    }
}
