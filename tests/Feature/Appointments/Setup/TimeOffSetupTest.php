<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMasterTimeOff;
use App\Services\Booking\Setup\TimeOffSetup;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TimeOffSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_range_is_one_row_per_day_and_to_defaults_to_from(): void
    {
        $this->assertSame([
            ['date' => '2026-10-06', 'start_time' => null, 'end_time' => null],
            ['date' => '2026-10-07', 'start_time' => null, 'end_time' => null],
            ['date' => '2026-10-08', 'start_time' => null, 'end_time' => null],
        ], TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2026-10-08']));

        $this->assertSame(
            [['date' => '2026-10-06', 'start_time' => '12:00:00', 'end_time' => '14:00:00']],
            TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'start_time' => '12:00', 'end_time' => '14:00']),
        );
    }

    public function test_a_day_already_off_all_day_is_not_doubled_and_a_partial_day_still_gets_its_entry(): void
    {
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-07']);
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-08', 'start_time' => '09:00:00', 'end_time' => '10:00:00']);

        $rows = TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2026-10-08']);
        $this->assertSame(['2026-10-06', '2026-10-08'], array_column($rows, 'date'));

        TimeOffSetup::add($this->master, $rows, 'Holiday');
        $this->assertSame(4, ServiceMasterTimeOff::where('service_master_id', $this->master->id)->count());
        $this->assertSame('Holiday', ServiceMasterTimeOff::where('service_master_id', $this->master->id)->whereDate('date', '2026-10-06')->value('reason'));
    }

    public function test_more_than_a_year_at_once_is_refused(): void
    {
        $this->expectException(ValidationException::class);
        TimeOffSetup::plan($this->master, ['from' => '2026-10-06', 'to' => '2027-10-08']);
    }
}
