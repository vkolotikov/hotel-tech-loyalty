<?php

namespace Tests\Unit\Booking;

use App\Services\Booking\PromotionException;
use App\Services\Booking\StayCombination;
use App\Services\Booking\StayPromotions;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class StayPromotionsTest extends TestCase
{
    private function price(array $p = [], array $q = [], array $daily = []): array
    {
        return StayPromotions::calculate(array_merge([
            'status' => 'published', 'booking_from' => '2026-11-27T00:00:00+02:00', 'booking_until' => '2026-11-28T00:00:00+02:00',
            'currency' => 'EUR', 'type' => 'percentage', 'value' => 20, 'min_nights' => 1,
            'excluded_dates' => [],
        ], $p), array_merge(['check_in' => '2027-01-10', 'check_out' => '2027-01-13', 'currency' => 'EUR'], $q),
            [['unit_id' => '101', 'room_total' => 300]], [true], $daily, CarbonImmutable::parse('2026-11-26T22:00:00Z'));
    }

    public function test_booking_window_uses_instants_and_allows_future_stays(): void
    {
        $this->assertEquals(60, $this->price()['discount']);
        $this->expectException(PromotionException::class);
        $this->price(['booking_until' => '2026-11-27T00:00:00+02:00']);
    }

    public function test_second_night_is_its_actual_rate_once_for_a_longer_stay(): void
    {
        $p = $this->price(['type' => 'second_night_free'], [], ['101' => ['2027-01-11' => ['available' => true, 'price' => 125]]]);
        $this->assertEquals(125, $p['discount']);
        $this->expectException(PromotionException::class);
        $this->price(['type' => 'second_night_free']);
    }

    public function test_free_night_requires_two_nights(): void
    {
        $this->expectException(PromotionException::class);
        $this->expectExceptionMessage('at least 2 nights');
        $this->price(['type' => 'second_night_free'], ['check_out' => '2027-01-11']);
    }

    public function test_excluded_nights_include_the_middle_but_never_departure_night(): void
    {
        $this->assertEquals(60, $this->price(['excluded_dates' => [['from' => '2027-01-13', 'until' => '2027-01-13']]])['discount']);
        $this->expectException(PromotionException::class);
        $this->price(['excluded_dates' => [['from' => '2027-01-11', 'until' => '2027-01-11']]]);
    }

    public function test_fixed_discounts_are_capped_and_room_shares_never_discount_extras(): void
    {
        $this->assertEquals(300, $this->price(['type' => 'fixed_amount', 'value' => 500])['discount']);
        $shares = StayCombination::stayShares([100, 200], 80, [100, 200]);
        $this->assertEquals([80, 0], array_column($shares, 'total'));
        $this->assertEquals([100, 200], array_column($shares, 'discount'));
    }

    public function test_only_eligible_rooms_share_a_fixed_discount_with_exact_rounding(): void
    {
        $r = StayPromotions::calculate(['status' => 'published', 'booking_from' => '2026-01-01', 'booking_until' => '2027-01-01', 'currency' => 'EUR', 'type' => 'fixed_amount', 'value' => 50.01, 'min_nights' => 1],
            ['check_in' => '2027-05-01', 'check_out' => '2027-05-03', 'currency' => 'EUR'],
            [['unit_id' => '1', 'room_total' => 100], ['unit_id' => '2', 'room_total' => 150], ['unit_id' => '3', 'room_total' => 200]], [true, false, true], [], CarbonImmutable::parse('2026-11-01'));
        $this->assertEquals(50.01, $r['discount']);
        $this->assertEquals(0, $r['room_discounts'][1]);
        $this->assertEquals(5001, (int) round(array_sum($r['room_discounts']) * 100));
    }
}
