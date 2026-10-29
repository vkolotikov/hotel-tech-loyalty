<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\CancellationPolicy;
use App\Services\BookingEngineService;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

class ArrivalCancellationTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    public function test_arrival_date_does_not_count_as_check_in_before_the_local_deadline(): void
    {
        $this->setUpStayPortal();
        $this->travelTo('2026-10-10 06:00:00');
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) {
            \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone')->nullable());
        }
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->instance('current_organization_id', $this->org->id);
        $this->setting('booking_cancel_hours', '0');
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $payload = ['id' => 'arrival-deadline', 'arrival' => '2026-10-10', 'departure' => '2026-10-12', 'check-in' => '15:00', 'channel' => ['name' => 'Member portal'], 'price' => 200];
        $mirror = app(BookingEngineService::class)->upsertBookingFromData($payload);
        $this->assertSame('confirmed', $mirror->internal_status);
        $this->assertTrue(CancellationPolicy::forStay($mirror)['can_cancel']);
        $this->assertSame('2026-10-10T15:00:00+03:00', CancellationPolicy::forStay($mirror)['deadline']->toIso8601String());
        $mirror->update(['raw_json' => array_merge($mirror->raw_json, ['_staff_internal_status' => 'checked-in']), 'internal_status' => 'checked-in']);
        $synced = app(BookingEngineService::class)->upsertBookingFromData($payload);
        $this->assertSame('checked-in', $synced->internal_status);
        $this->assertFalse(CancellationPolicy::forStay($synced)['can_cancel']);
    }
}
