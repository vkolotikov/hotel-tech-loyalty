<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\GroupPayment;
use App\Services\Booking\StayCombination;
use PHPUnit\Framework\TestCase;

/**
 * The pure rules of a member-portal combination (StayCombination): how one
 * price is shared between its rows, and who sleeps in which room — and how a
 * refund of the one payment is shared between the rooms it paid for
 * (GroupPayment, release 5).
 */
class StayCombinationTest extends TestCase
{
    public function test_the_shares_add_up_to_the_one_price_to_the_cent(): void
    {
        foreach ([
            // rooms, extras, gross
            [[200.0, 160.0], 0.0, 324.0],
            [[200.0, 160.0], 0.0, 310.0],
            [[200.0, 160.0], 30.0, 351.0],
            [[99.99, 33.33, 66.67], 12.34, 150.01],
            [[100.0, 100.0, 100.0], 0.0, 299.99],
            [[0.01, 500.0], 0.0, 0.01],
            [[120.0, 80.0], 15.0, 0.0],
            [[200.0, 160.0], 0.0, 360.0],
        ] as [$rooms, $extras, $gross]) {
            $shares = StayCombination::shares($rooms, $extras, $gross);

            $this->assertCount(count($rooms), $shares);
            $this->assertSame((int) round($gross * 100), (int) round(array_sum(array_column($shares, 'total')) * 100), json_encode([$rooms, $extras, $gross]));
            foreach ($shares as $i => $s) {
                $list = $rooms[$i] + ($i === 0 ? $extras : 0);
                $this->assertEqualsWithDelta($list, $s['list'], 0.001, 'each list is its own room (the extras on the first)');
                $this->assertGreaterThanOrEqual(0, $s['total'], 'no room is charged less than nothing');
                $this->assertLessThanOrEqual($list + 0.001, $s['total'], 'no room is charged more than its list price');
                $this->assertEqualsWithDelta($s['list'] - $s['total'], $s['discount'], 0.001);
            }
        }
    }

    public function test_the_discount_is_shared_in_proportion_to_the_list_prices(): void
    {
        $this->assertSame(
            [['list' => 200.0, 'discount' => 20.0, 'total' => 180.0], ['list' => 160.0, 'discount' => 16.0, 'total' => 144.0]],
            StayCombination::shares([200.0, 160.0], 0.0, 324.0),
        );
        $this->assertSame(
            [['list' => 200.0, 'discount' => 0.0, 'total' => 200.0], ['list' => 160.0, 'discount' => 0.0, 'total' => 160.0]],
            StayCombination::shares([200.0, 160.0], 0.0, 360.0),
            'no discount, no shares of one',
        );
    }

    public function test_every_room_gets_an_adult_then_fills_up_in_turn(): void
    {
        $this->assertSame([['adults' => 2, 'children' => 0], ['adults' => 2, 'children' => 0]], StayCombination::party([2, 2], 4, 0));
        $this->assertSame([['adults' => 3, 'children' => 0], ['adults' => 1, 'children' => 1]], StayCombination::party([3, 2], 4, 1));
        $this->assertSame([['adults' => 1, 'children' => 1], ['adults' => 1, 'children' => 1], ['adults' => 1, 'children' => 0]], StayCombination::party([2, 2, 2], 3, 2));
        $this->assertSame([['adults' => 2, 'children' => 2], ['adults' => 1, 'children' => 0]], StayCombination::party([4, 2], 3, 2));
    }

    public function test_a_party_the_rooms_cannot_take_has_no_split(): void
    {
        $this->assertNull(StayCombination::party([2, 2], 5, 0), 'not enough beds');
        $this->assertNull(StayCombination::party([2, 2], 1, 3), 'a room without an adult');
        $this->assertNull(StayCombination::party([4], 3, 0), 'one room is not a combination');
        $this->assertNull(StayCombination::party([2, 0], 2, 0), 'a room that sleeps nobody');
    }

    public function test_the_room_locks_are_one_order_for_any_order_of_rooms(): void
    {
        $this->assertSame(['room:3:7', 'room:3:12', 'room:3:100'], StayCombination::roomLockKeys(3, ['100', '7', '12', '7']));
        $this->assertSame(StayCombination::roomLockKeys(3, ['12', '100']), StayCombination::roomLockKeys(3, ['100', '12']));
    }

    public function test_a_refund_of_the_one_payment_is_shared_between_the_rooms_to_the_cent(): void
    {
        $this->assertSame([200.0, 160.0], GroupPayment::refundShares([200.0, 160.0], 360.0), 'in full: each room its own total');
        $this->assertSame([125.0, 100.0], GroupPayment::refundShares([200.0, 160.0], 225.0));
        $this->assertSame([200.0, 160.0], GroupPayment::refundShares([200.0, 160.0], 999.0), 'never more than the rooms cost');
        $this->assertSame([0.0, 0.0], GroupPayment::refundShares([200.0, 160.0], 0.0));
        $this->assertSame([42.5], GroupPayment::refundShares([180.0], 42.5), 'one room takes it all');
        foreach ([[[99.99, 33.33, 66.67], 150.01], [[100.0, 100.0, 100.0], 0.01], [[0.01, 500.0], 250.0], [[180.0, 144.0], 323.99]] as [$totals, $refunded]) {
            $shares = GroupPayment::refundShares($totals, $refunded);
            $this->assertSame((int) round(min($refunded, array_sum($totals)) * 100), (int) round(array_sum($shares) * 100), json_encode([$totals, $refunded]));
            foreach ($shares as $i => $share) {
                $this->assertGreaterThanOrEqual(0, $share);
                $this->assertLessThanOrEqual($totals[$i] + 0.001, $share, 'no room is refunded more than it cost');
            }
        }
    }
}
