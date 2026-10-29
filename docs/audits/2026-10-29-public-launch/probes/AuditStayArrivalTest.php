<?php

namespace Tests\Audit;

use App\Services\Booking\CancellationPolicy;
use App\Services\BookingEngineService;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

/** Reproduction of the current early-cancellation cutoff, entirely on SQLite/mocked PMS. */
class AuditStayArrivalTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    public function test_sync_closes_cancellation_before_the_configured_arrival_deadline(): void
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
        $mirror = app(BookingEngineService::class)->upsertBookingFromData([
            'id' => 'audit-arrival', 'arrival' => '2026-10-10', 'departure' => '2026-10-12',
            'check-in' => '15:00', 'channel' => ['name' => 'Member portal'], 'price' => 200,
        ]);
        $this->assertSame('checked-in', $mirror->internal_status);
        $this->assertSame('not_cancellable', CancellationPolicy::forStay($mirror)['reason']);
        // The same stay is inside its intended deadline when the date-derived status is removed.
        $mirror->internal_status = 'confirmed';
        $this->assertTrue(CancellationPolicy::forStay($mirror)['can_cancel']);
        $this->assertSame('2026-10-10T15:00:00+03:00', CancellationPolicy::forStay($mirror)['deadline']->toIso8601String());
    }
}
