<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use App\Models\ServiceBooking;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The fixture's clock: Monday 5 October 2026, 06:00 UTC. A 24-hour reminder is due for an appointment at 06:00 on the 6th. */
class RemindersTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->setClientMessages(false, 24);
    }

    private function at(string $start, array $attrs = []): ServiceBooking
    {
        $booking = $this->seedBooking(array_merge(['customer_email' => 'sophie@example.test', 'start_at' => $start, 'end_at' => CarbonImmutable::parse($start)->addMinutes(45)->format('Y-m-d H:i:s')], $attrs));
        $booking->forceFill(['created_at' => '2026-10-01 09:00:00'])->saveQuietly();

        return $booking;
    }

    private function runReminders(): void
    {
        $this->artisan('appointments:send-reminders')->assertSuccessful();
    }

    private function reminded(int $id): bool
    {
        return ClientMessage::where('service_booking_id', $id)->where('kind', 'reminder')->exists();
    }

    public function test_the_window_is_the_last_thirty_minutes_before_now_plus_the_venues_hours(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        $edge = $this->at('2026-10-06 05:35:00');
        $tooSoon = $this->at('2026-10-06 05:30:00');
        $notYet = $this->at('2026-10-06 06:05:00');

        $this->runReminders();

        $this->assertTrue($this->reminded($due->id));
        $this->assertTrue($this->reminded($edge->id));
        $this->assertFalse($this->reminded($tooSoon->id));
        $this->assertFalse($this->reminded($notYet->id));
    }

    public function test_running_twice_sends_once_and_a_missed_run_is_caught_up(): void
    {
        $due = $this->at('2026-10-06 06:20:00');

        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:25:00')); // the 06:20 moment passed 5 minutes ago
        $this->runReminders();
        $this->runReminders();

        $this->assertSame(1, ClientMessage::where('service_booking_id', $due->id)->where('kind', 'reminder')->count());

        $late = $this->at('2026-10-06 05:40:00'); // its moment was 45 minutes ago: too late, not sent
        $this->runReminders();
        $this->assertFalse($this->reminded($late->id));
    }

    public function test_booked_or_moved_inside_the_window_and_cancelled_get_none(): void
    {
        $bookedLate = $this->at('2026-10-06 06:00:00');
        $bookedLate->forceFill(['created_at' => '2026-10-05 05:59:00'])->saveQuietly(); // before the moment: still gets one
        $bookedInside = $this->at('2026-10-06 05:50:00');
        $bookedInside->forceFill(['created_at' => '2026-10-05 05:55:00'])->saveQuietly(); // after its 05:50 moment

        $moved = $this->at('2026-10-06 05:45:00');
        ClientMessage::create(['service_booking_id' => $moved->id, 'kind' => 'moved', 'status' => 'sent', 'channel' => 'email', 'locale' => 'en', 'for_start_at' => $moved->start_at]);

        $cancelled = $this->at('2026-10-06 05:55:00', ['status' => 'cancelled']);

        $this->runReminders();

        $this->assertTrue($this->reminded($bookedLate->id));
        $this->assertFalse($this->reminded($bookedInside->id));
        $this->assertFalse($this->reminded($moved->id));
        $this->assertFalse($this->reminded($cancelled->id));
    }

    public function test_a_venue_east_of_utc_counts_on_its_own_clock_and_a_venue_switched_off_sends_nothing(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save(); // 09:00 there
        app()->forgetScopedInstances();
        $riga = $this->at('2026-10-06 09:00:00');
        $utcTime = $this->at('2026-10-06 06:00:00');

        $this->runReminders();
        $this->assertTrue($this->reminded($riga->id));
        $this->assertFalse($this->reminded($utcTime->id));

        $this->setClientMessages(false, 0);
        $later = $this->at('2026-10-06 08:55:00');
        $this->runReminders();
        $this->assertFalse($this->reminded($later->id));
    }

    public function test_a_person_only_move_does_not_send_the_reminder_again(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        $this->runReminders();

        $due->update(['service_master_id' => $this->master->id]); // same time, same row
        $this->runReminders();

        $this->assertSame(1, ClientMessage::where('service_booking_id', $due->id)->where('kind', 'reminder')->count());
    }

    public function test_a_setting_left_by_a_deleted_organisation_does_not_stop_the_others(): void
    {
        $due = $this->at('2026-10-06 06:00:00');
        DB::table('hotel_settings')->insert([
            'organization_id' => 999999, 'key' => 'client_messages_reminder_hours', 'value' => '24', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->runReminders();

        $this->assertTrue($this->reminded($due->id));
    }
}
