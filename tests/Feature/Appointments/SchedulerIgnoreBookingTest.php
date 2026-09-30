<?php

namespace Tests\Feature\Appointments;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Moving an appointment asks the scheduler "is this slot free, not counting
 * the appointment I am moving?". Without the optional booking id the
 * scheduler sees the appointment's own row as the conflict.
 */
class SchedulerIgnoreBookingTest extends TestCase
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

    public function test_reserve_slot_refuses_the_bookings_own_time_unless_told_to_ignore_it(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $scheduler = app(ServiceSchedulingService::class);

        try {
            $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:15:00+00:00');
            $this->fail('The overlapping slot was reserved.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('no longer available', $e->getMessage());
        }

        $slot = $scheduler->reserveSlot($service, $master->id, '2026-10-06T10:15:00+00:00', $own->id);
        $this->assertSame('2026-10-06 10:15:00', $slot['start']->format('Y-m-d H:i:s'));
        $this->assertSame($master->id, $slot['master']->id);
    }

    public function test_ignoring_one_booking_still_sees_every_other(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $this->booking($service->id, $master->id, '2026-10-06 11:00:00', '2026-10-06 11:45:00');

        $this->expectException(\RuntimeException::class);
        app(ServiceSchedulingService::class)->reserveSlot($service, $master->id, '2026-10-06T10:30:00+00:00', $own->id);
    }

    public function test_available_slots_offer_the_ignored_bookings_time(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $own = $this->booking($service->id, $master->id, '2026-10-06 10:00:00', '2026-10-06 10:45:00');
        $scheduler = app(ServiceSchedulingService::class);

        $labels = fn (array $slots) => array_column($slots, 'time_label');

        $this->assertNotContains('10:00', $labels($scheduler->availableSlots($service, '2026-10-06', $master->id, null, 0)));
        $this->assertContains('10:00', $labels($scheduler->availableSlots($service, '2026-10-06', $master->id, null, 0, $own->id)));
    }

    public function test_working_windows_are_the_schedule_minus_time_off(): void
    {
        ['master' => $master] = $this->seedBookableService($this->orgId);
        DB::table('service_master_time_off')->insert([
            'organization_id' => $this->orgId, 'service_master_id' => $master->id,
            'date' => '2026-10-06', 'start_time' => '13:00:00', 'end_time' => '14:00:00', 'reason' => 'Lunch',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $windows = app(ServiceSchedulingService::class)->workingWindows($master, CarbonImmutable::parse('2026-10-06'));

        $this->assertSame(
            [['09:00', '13:00'], ['14:00', '17:00']],
            array_map(fn ($w) => [$w['start']->format('H:i'), $w['end']->format('H:i')], $windows),
        );
    }
}
