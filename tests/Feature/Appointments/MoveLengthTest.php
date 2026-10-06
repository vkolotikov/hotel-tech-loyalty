<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\VenueClock;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** Part F: a length staff set (a resize, or the Move form's Length) is the booking's own until changed or forgotten. */
class MoveLengthTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    private function move(ServiceBooking $booking, array $body): TestResponse
    {
        return $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start'     => '2026-10-06T10:00',
            'master_id' => $this->master->id,
            'revision'  => AppointmentPresenter::revision($booking->fresh()),
        ], $body));
    }

    /** A second person for the same service whose normal length is 30 minutes, working 09:00–17:00 every day. */
    private function secondPerson(): ServiceMaster
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Liam Brown', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $second->id,
            'duration_override_minutes' => 30, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $this->org->id, 'service_master_id' => $second->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $second;
    }

    public function test_a_length_stretches_the_visit_in_place_and_the_next_move_keeps_it(): void
    {
        $booking = $this->seedBooking();

        $this->move($booking, ['length' => 90])->assertOk()
            ->assertJsonPath('booking.start', '2026-10-06T10:00')
            ->assertJsonPath('booking.end', '2026-10-06T11:30')
            ->assertJsonPath('booking.duration_minutes', 90)
            ->assertJsonPath('booking.length_set_by_staff', true)
            ->assertJsonPath('booking.price.total', 60);
        $this->assertSame(90, $booking->fresh()->meta['length_minutes']);

        $this->move($booking, ['start' => '2026-10-06T14:00'])->assertOk()
            ->assertJsonPath('booking.end', '2026-10-06T15:30')
            ->assertJsonPath('booking.length_set_by_staff', true);
    }

    public function test_the_staff_length_goes_with_the_visit_to_another_person(): void
    {
        $booking = $this->seedBooking();
        $second = $this->secondPerson();
        $this->move($booking, ['length' => 90])->assertOk();

        // Liam's normal length is 30 minutes; the visit keeps the 90 staff set.
        $this->move($booking, ['start' => '2026-10-06T14:00', 'master_id' => $second->id])->assertOk()
            ->assertJsonPath('booking.master.id', $second->id)
            ->assertJsonPath('booking.end', '2026-10-06T15:30');
    }

    public function test_normal_length_forgets_the_staff_length(): void
    {
        $booking = $this->seedBooking();
        $this->move($booking, ['length' => 90])->assertOk();

        $this->move($booking, ['start' => '2026-10-06T14:00', 'normal_length' => true])->assertOk()
            ->assertJsonPath('booking.end', '2026-10-06T14:45')
            ->assertJsonPath('booking.length_set_by_staff', false);
        $this->assertArrayNotHasKey('length_minutes', (array) $booking->fresh()->meta);
    }

    public function test_a_length_past_the_hours_or_into_the_next_visit_is_refused(): void
    {
        $booking = $this->seedBooking();
        // 10:00 + 8 hours ends 18:00, past 17:00.
        $this->move($booking, ['length' => 480])->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->seedBooking(['start_at' => '2026-10-06 11:00:00', 'end_at' => '2026-10-06 11:45:00']);
        $this->move($booking, ['length' => 90])->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame('2026-10-06T10:45', VenueClock::wall($booking->fresh()->end_at));
    }

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function badLengths(): array
    {
        return [
            'shorter than 15 minutes'  => [['length' => 10]],
            'longer than 8 hours'      => [['length' => 485]],
            'not in 15-minute steps'   => [['length' => 50]],
            'a length and normal both' => [['length' => 90, 'normal_length' => true]],
        ];
    }

    #[DataProvider('badLengths')]
    public function test_a_length_outside_the_rules_is_refused(array $body): void
    {
        $booking = $this->seedBooking();

        $this->move($booking, $body)->assertStatus(422)->assertJsonPath('error', 'invalid_length');
        $this->assertSame(45, (int) $booking->fresh()->duration_minutes);
    }

    public function test_a_length_change_alone_tells_nobody_and_is_in_the_history(): void
    {
        $this->setClientMessages(true);
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $this->move($booking, ['length' => 60, 'notify_client' => true])->assertOk()->assertJsonPath('client_message', null);

        $audit = AuditLog::where('action', 'service_booking.moved')->where('subject_id', $booking->id)->latest('id')->firstOrFail();
        $this->assertSame(45, $audit->old_values['length']);
        $this->assertSame(60, $audit->new_values['length']);
    }

    public function test_the_free_times_follow_the_length(): void
    {
        $booking = $this->seedBooking();
        $slots = fn (array $extra) => $this->asStaff()->getJson($this->api('slots?' . http_build_query([
            'service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06', 'ignore' => $booking->id,
        ] + $extra)));

        $this->assertSame('16:15', collect($slots([])->assertOk()->json('slots'))->last()['label']);
        $this->assertSame('15:30', collect($slots(['length' => 90])->assertOk()->json('slots'))->last()['label']);
        // The person's normal length, for the Move form's "Normal length (45 min)".
        $this->assertSame(45, $slots(['length' => 90])->json('duration_minutes'));
        $slots(['length' => 50])->assertStatus(422)->assertJsonPath('error', 'invalid_length');
    }
}
