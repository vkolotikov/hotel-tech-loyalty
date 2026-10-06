<?php

namespace Tests\Feature\Appointments;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Part F: a length staff set for one booking replaces the person's normal one
 * in reserveSlot() and availableSlots(); without it nothing changes, for any
 * caller (widget, portal, chat, full admin).
 */
class SchedulerLengthTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));
        $this->orgId = Organization::create(['name' => 'Lumi', 'slug' => 'lumi-' . uniqid(), 'industry' => 'beauty'])->id;
        app()->instance('current_organization_id', $this->orgId);
    }

    private function booking(int $serviceId, int $masterId, string $start, string $end): ServiceBooking
    {
        return ServiceBooking::create([
            'organization_id' => $this->orgId, 'service_id' => $serviceId, 'service_master_id' => $masterId,
            'customer_name' => 'Ada', 'customer_email' => 'ada@example.test',
            'start_at' => $start, 'end_at' => $end, 'duration_minutes' => 45,
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'admin',
        ]);
    }

    public function test_reserve_slot_takes_a_length_and_checks_the_hours_and_overlaps_on_it(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $scheduler = app(ServiceSchedulingService::class);

        $slot = $scheduler->reserveSlot($service, $master->id, '2026-10-06T15:00:00+00:00', null, 90);
        $this->assertSame('2026-10-06 16:30:00', $slot['end']->format('Y-m-d H:i:s'));
        $this->assertSame(90, $slot['duration_minutes']);
        $this->assertSame(60.0, $slot['price']); // the price never follows the length

        try {
            // 15:00 + 150 minutes ends 17:30, past the 09:00–17:00 hours.
            $scheduler->reserveSlot($service, $master->id, '2026-10-06T15:00:00+00:00', null, 150);
            $this->fail('Reserved past the working hours.');
        } catch (\RuntimeException) {
            $this->addToAssertionCount(1);
        }

        // 10:00 + 90 minutes reaches the 11:00 appointment; the normal 45 does not.
        $this->booking($service->id, $master->id, '2026-10-06 11:00:00', '2026-10-06 11:45:00');
        $this->assertSame('2026-10-06 10:45:00', $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:00:00+00:00')['end']->format('Y-m-d H:i:s'));
        $this->expectException(\RuntimeException::class);
        $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:00:00+00:00', null, 90);
    }

    public function test_available_slots_offer_only_starts_where_the_length_fits(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $scheduler = app(ServiceSchedulingService::class);

        $normal = $scheduler->availableSlots($service, '2026-10-06', $master->id);
        $long = $scheduler->availableSlots($service, '2026-10-06', $master->id, null, 60, null, 90);

        $this->assertSame('16:15', end($normal)['time_label']);
        $this->assertSame(45, $normal[0]['duration_minutes']);
        $this->assertSame('15:30', end($long)['time_label']);
        $this->assertSame(90, $long[0]['duration_minutes']);
    }
}
