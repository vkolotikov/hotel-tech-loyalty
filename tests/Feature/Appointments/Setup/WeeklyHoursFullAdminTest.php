<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Booking\Setup\WeeklyHours;
use App\Services\ServiceSchedulingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WeeklyHoursFullAdminTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_full_admin_refuses_malformed_hours_and_keeps_the_old_week(): void
    {
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", [
            'schedules' => [['day_of_week' => 1, 'start_time' => '18:00', 'end_time' => '09:00']],
        ])->assertStatus(422)->assertJsonValidationErrors('schedules.0');

        $this->assertSame(7, DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->count());
    }

    public function test_the_full_admin_stores_good_hours_in_the_stored_form(): void
    {
        $this->asStaff()->putJson("/api/v1/admin/service-masters/{$this->master->id}", [
            'schedules' => [['day_of_week' => 1, 'start_time' => '10:00', 'end_time' => '16:00']],
        ])->assertOk();

        $rows = DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame(['10:00:00', '16:00:00'], [substr((string) $rows[0]->start_time, 0, 8), substr((string) $rows[0]->end_time, 0, 8)]);
    }

    public function test_a_window_ending_at_midnight_is_bookable_to_the_end_of_the_day(): void
    {
        WeeklyHours::replace($this->master, WeeklyHours::normalise(array_map(
            fn ($d) => ['day_of_week' => $d, 'start_time' => '22:00', 'end_time' => '24:00'], range(0, 6)
        )));

        $slots = app(ServiceSchedulingService::class)->availableSlots($this->service, '2026-10-06', $this->master->id, 15, -2 * 24 * 60); // the scheduler's own notice off

        $this->assertSame('23:15', end($slots)['time_label']);
    }
}
