<?php

namespace Tests\Feature\Appointments;

use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * previewForServiceBooking() is what the appointment panel prints before
 * staff press Complete. It must never disagree with what
 * awardForServiceBooking() then does.
 */
class PointsPreviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
    }

    public function test_a_members_visit_previews_the_points_the_award_gives(): void
    {
        $f = $this->seedPointsFixture(); // 10 points per currency unit, tier earn rate 1.5
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed', 'total_amount' => 54]);
        $service = app(BookingPointsService::class);

        $preview = $service->previewForServiceBooking($booking);

        $this->assertSame(['points' => 810, 'reason' => null], $preview); // floor(54 * 10 * 1.5)

        $booking->update(['status' => 'completed']);
        $tx = $service->awardForServiceBooking($booking->fresh());
        $this->assertSame($preview['points'], (int) $tx->points);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function reasons(): array
    {
        return [
            'no member on the booking' => [['member_id' => null], 'not_a_member'],
            'already awarded'          => [['points_awarded_at' => '2026-09-01 10:00:00'], 'already_awarded'],
            'refunded'                 => [['payment_status' => 'refunded'], 'refunded'],
            'nothing to pay'           => [['total_amount' => 0], 'zero_amount'],
        ];
    }

    #[DataProvider('reasons')]
    public function test_a_visit_that_earns_nothing_says_why(array $attrs, string $reason): void
    {
        $f = $this->seedPointsFixture();
        $booking = $this->pointsBooking($f['orgId'], $f['member'], array_merge(['status' => 'confirmed'], $attrs));
        $service = app(BookingPointsService::class);

        $this->assertSame(['points' => 0, 'reason' => $reason], $service->previewForServiceBooking($booking));

        // And the worker agrees: completing it awards nothing.
        $booking->update(['status' => 'completed']);
        $this->assertNull($service->awardForServiceBooking($booking->fresh()));
    }

    public function test_points_for_bookings_switched_off_is_its_own_reason(): void
    {
        $f = $this->seedPointsFixture();
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $f['orgId'], 'key' => 'points_on_bookings', 'value' => 'false']);
        HotelSetting::flushCacheFor($f['orgId']);
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);
        $service = app(BookingPointsService::class);

        $this->assertFalse($service->pointsOnBookingsEnabled($f['orgId']));
        $this->assertSame(['points' => 0, 'reason' => 'points_on_bookings_off'], $service->previewForServiceBooking($booking));
    }

    public function test_a_venue_without_an_active_tier_has_no_programme(): void
    {
        $f = $this->seedPointsFixture();
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $f['orgId'])->update(['is_active' => false]);
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);

        $this->assertSame(
            ['points' => 0, 'reason' => 'programme_off'],
            app(BookingPointsService::class)->previewForServiceBooking($booking),
        );
    }

    public function test_the_preview_writes_nothing(): void
    {
        $f = $this->seedPointsFixture();
        $booking = $this->pointsBooking($f['orgId'], $f['member'], ['status' => 'confirmed']);

        app(BookingPointsService::class)->previewForServiceBooking($booking);

        $this->assertNull($booking->fresh()->points_awarded_at);
        $this->assertSame(0, \App\Models\PointsTransaction::where('member_id', $f['member']->id)->count());
    }
}
