<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\BookingCapability;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * "Can this venue be booked online" has one answer for the landing page,
 * the portal and anything else that asks. The precondition is exactly what
 * ServiceSchedulingService enforces: an active service, linked to an active
 * master, who has an active schedule row with a real window.
 */
class BookingCapabilityTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceCatalogSchema();
        $this->setUpAvailabilitySchema();

        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedTinyInteger('day_of_week');
                $table->string('start_time', 8);
                $table->string('end_time', 8);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    private function service(int $orgId, bool $active = true): int
    {
        return DB::table('services')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Massage', 'duration_minutes' => 60,
            'price' => 80, 'is_active' => $active, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function master(int $orgId, bool $active = true): int
    {
        return DB::table('service_masters')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Anna', 'is_active' => $active,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function link(int $orgId, int $serviceId, int $masterId): void
    {
        DB::table('service_master_service')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId, 'service_id' => $serviceId,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function schedule(int $orgId, int $masterId, string $start = '09:00:00', string $end = '17:00:00', bool $active = true): void
    {
        DB::table('service_master_schedules')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId, 'day_of_week' => 1,
            'start_time' => $start, 'end_time' => $end, 'is_active' => $active,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_full_rota_makes_appointments_bookable(): void
    {
        $s = $this->service(1); $m = $this->master(1);
        $this->link(1, $s, $m); $this->schedule(1, $m);

        $this->assertTrue(app(BookingCapability::class)->appointmentsBookable(1));
    }

    public function test_a_service_with_no_master_or_no_window_is_not_bookable(): void
    {
        $s = $this->service(1);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'no master');

        $m = $this->master(1); $this->link(1, $s, $m);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'no schedule');

        $this->schedule(1, $m, '17:00:00', '09:00:00');
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'empty window');

        $this->schedule(1, $m, '09:00:00', '17:00:00', false);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'inactive schedule');
    }

    public function test_another_organisations_rota_does_not_count(): void
    {
        $s = $this->service(2); $m = $this->master(2);
        $this->link(2, $s, $m); $this->schedule(2, $m);

        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1));
        $this->assertTrue(app(BookingCapability::class)->appointmentsBookable(2));
    }

    public function test_stays_need_an_active_room(): void
    {
        $this->assertFalse(app(BookingCapability::class)->staysBookable(1));

        DB::table('booking_rooms')->insert([
            'organization_id' => 1, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertFalse(app(BookingCapability::class)->staysBookable(1), 'inactive room');

        DB::table('booking_rooms')->insert([
            'organization_id' => 1, 'pms_id' => 'r2', 'name' => 'Garden', 'max_guests' => 2,
            'base_price' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertTrue(app(BookingCapability::class)->staysBookable(1));
        $this->assertFalse(app(BookingCapability::class)->staysBookable(2));
    }
}
