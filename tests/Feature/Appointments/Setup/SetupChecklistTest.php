<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupChecklistTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function done(): array
    {
        $list = app(SetupChecklist::class)->for($this->org->id, null);

        return array_column($list['steps'], 'done', 'key') + ['complete' => $list['complete']];
    }

    public function test_the_fixture_venue_has_everything_but_a_named_zone_and_a_first_appointment(): void
    {
        $this->assertSame([
            'timezone' => false, 'service' => true, 'performer' => true, 'hours' => true, 'online' => false, 'messages' => false, 'first_appointment' => false, 'complete' => false,
        ], $this->done());
    }

    public function test_the_list_completes_without_the_optional_step(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->seedBooking();

        $done = $this->done();
        $this->assertFalse($done['online']);
        $this->assertTrue($done['complete']);
    }

    public function test_each_step_follows_its_own_record(): void
    {
        DB::table('service_master_schedules')->delete();
        $this->assertSame([true, true, false], [$this->done()['service'], $this->done()['performer'], $this->done()['hours']]);

        DB::table('service_master_service')->delete();
        $this->assertFalse($this->done()['performer']);

        Service::query()->update(['is_active' => false]);
        $this->assertFalse($this->done()['service']);

        BookingRules::markLinkCopied($this->org->id);
        $this->assertTrue($this->done()['online']);
    }

    public function test_a_widget_booking_counts_as_online_booking_in_use(): void
    {
        $this->seedBooking(['source' => 'widget']);
        HotelSetting::flushCacheFor($this->org->id);

        $this->assertTrue($this->done()['online']);
    }

    public function test_the_bootstrap_carries_the_checklist(): void
    {
        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('readiness.checklist.complete', false)
            ->assertJsonPath('readiness.checklist.steps.0.key', 'timezone')
            ->assertJsonPath('readiness.checklist.steps.4.optional', true);
    }
}
