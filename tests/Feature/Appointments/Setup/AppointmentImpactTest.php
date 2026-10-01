<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentImpactTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private AppointmentImpact $impact;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->impact = app(AppointmentImpact::class);
    }

    private function week(array $days, string $from = '09:00', string $to = '17:00'): array
    {
        return WeeklyHours::normalise(array_map(fn ($d) => ['day_of_week' => $d, 'start_time' => $from, 'end_time' => $to], $days));
    }

    public function test_a_week_without_the_appointments_day_or_hour_strands_it(): void
    {
        $booking = $this->seedBooking();

        $this->assertSame(0, $this->impact->forWeek($this->master, $this->week(range(0, 6)))['total']);
        $offTuesday = $this->impact->forWeek($this->master, $this->week([0, 1, 3, 4, 5, 6]));
        $this->assertSame(1, $offTuesday['total']);
        $this->assertSame([
            'id' => $booking->id, 'start' => '2026-10-06T10:00', 'end' => '2026-10-06T10:45',
            'client' => 'Sophie Williams', 'service' => 'Deep Tissue Massage', 'team_member' => 'Mara Ilves',
        ], $offTuesday['affected'][0]);
        $this->assertSame(1, $this->impact->forWeek($this->master, $this->week(range(0, 6), '10:30', '17:00'))['total']);
    }

    public function test_time_off_strands_what_it_overlaps(): void
    {
        $this->seedBooking();

        $this->assertSame(1, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => null, 'end_time' => null]])['total']);
        $this->assertSame(1, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => '10:30:00', 'end_time' => '11:00:00']])['total']);
        $this->assertSame(0, $this->impact->forTimeOff($this->master, [['date' => '2026-10-06', 'start_time' => '12:00:00', 'end_time' => '13:00:00']])['total']);
        $this->assertSame(0, $this->impact->forTimeOff($this->master, [['date' => '2026-10-07', 'start_time' => null, 'end_time' => null]])['total']);
    }

    public function test_only_upcoming_active_appointments_count(): void
    {
        $this->seedBooking();
        $this->seedBooking(['status' => 'cancelled']);
        $this->seedBooking(['start_at' => '2026-10-05 05:00:00', 'end_at' => '2026-10-05 05:45:00']); // before "now" (06:00)

        $this->assertSame(1, $this->impact->forMaster($this->master)['total']);
        $this->assertSame(1, $this->impact->forService($this->service)['total']);
        $this->assertSame(1, $this->impact->forMasterService($this->master, $this->service->id)['total']);
        $this->assertSame(0, $this->impact->forMasterService($this->master, $this->service->id + 999)['total']);
    }

    public function test_the_list_stops_at_fifty_and_the_total_does_not(): void
    {
        foreach (range(0, 54) as $n) {
            $day = sprintf('2026-10-%02d', 6 + intdiv($n, 8));
            $hour = 9 + $n % 8;
            $this->seedBooking(['start_at' => sprintf('%s %02d:00:00', $day, $hour), 'end_at' => sprintf('%s %02d:45:00', $day, $hour)]);
        }

        $all = $this->impact->forMaster($this->master);
        $this->assertSame(55, $all['total']);
        $this->assertCount(50, $all['affected']);
        $this->assertSame(['affected' => [], 'total' => 0], AppointmentImpact::none());
    }
}
