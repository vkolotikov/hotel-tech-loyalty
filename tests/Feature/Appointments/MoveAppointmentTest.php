<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MoveAppointmentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function move(ServiceBooking $booking, array $body): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start'     => '2026-10-06T14:00',
            'master_id' => $this->master->id,
            'revision'  => AppointmentPresenter::revision($booking->fresh()),
        ], $body));
    }

    /** A second person who performs the seeded service, working 09:00–17:00 every day. */
    private function secondPerson(?int $durationOverride = null): ServiceMaster
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Liam Brown', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $second->id,
            'duration_override_minutes' => $durationOverride, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $this->org->id, 'service_master_id' => $second->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $second;
    }

    public function test_the_detail_call_answers_the_full_appointment(): void
    {
        $booking = $this->seedBooking(['staff_notes' => 'Prefers firm pressure']);

        $this->asStaff()->getJson($this->api("bookings/{$booking->id}"))->assertOk()
            ->assertJsonPath('booking.id', $booking->id)
            ->assertJsonPath('booking.notes.staff', 'Prefers firm pressure')
            ->assertJsonPath('booking.client.phone', '+44 7700 900123')
            ->assertJsonCount(8, 'booking.actions'); // Part F: reopen
    }

    public function test_another_organisations_appointment_is_not_found(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => $this->seedBooking());

        $this->asStaff()->getJson($this->api("bookings/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaff()->patchJson($this->api("bookings/{$theirs->id}"), ['start' => '2026-10-06T14:00', 'master_id' => $this->master->id, 'revision' => 'x'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_moving_changes_the_time_and_nothing_else(): void
    {
        $booking = $this->seedBooking([
            'guest_id' => $this->seedClient()->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_777',
            'service_price' => 55, 'total_amount' => 55,
        ]);
        $before = $booking->fresh();

        $this->move($booking, [])->assertOk()
            ->assertJsonPath('booking.start', '2026-10-06T14:00')
            ->assertJsonPath('booking.end', '2026-10-06T14:45')
            ->assertJsonPath('booking.price.total', 55);

        $after = $booking->fresh();
        $this->assertSame('2026-10-06 14:00:00', $after->start_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 14:45:00', $after->end_at->format('Y-m-d H:i:s'));
        foreach (['booking_reference', 'service_id', 'service_master_id', 'guest_id', 'service_price', 'total_amount', 'status', 'payment_status', 'stripe_payment_intent_id', 'customer_name'] as $kept) {
            $this->assertSame($before->{$kept}, $after->{$kept}, $kept);
        }
        $this->assertNotSame(AppointmentPresenter::revision($before), AppointmentPresenter::revision($after));

        $audit = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->where('action', 'service_booking.moved')->firstOrFail();
        $this->assertSame($this->staff->id, (int) $audit->causer_id);
        $this->assertSame('2026-10-06T10:00', $audit->old_values['start']);
        $this->assertSame('2026-10-06T14:00', $audit->new_values['start']);
    }

    public function test_an_appointment_does_not_conflict_with_itself(): void
    {
        $booking = $this->seedBooking(); // 10:00–10:45

        $this->move($booking, ['start' => '2026-10-06T10:15'])->assertOk()->assertJsonPath('booking.start', '2026-10-06T10:15');
    }

    public function test_moving_onto_another_appointment_is_refused_and_nothing_changes(): void
    {
        $booking = $this->seedBooking();
        $this->seedBooking(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->move($booking, ['start' => '2026-10-06T14:30'])->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->move($booking, ['start' => '2026-10-06T16:45'])->assertStatus(409)->assertJsonPath('error', 'slot_taken'); // past closing
        $this->assertSame('2026-10-06 10:00:00', $booking->fresh()->start_at->format('Y-m-d H:i:s'));
    }

    public function test_a_stale_revision_is_refused_with_the_current_appointment(): void
    {
        $booking = $this->seedBooking();
        $seenByOperatorB = AppointmentPresenter::revision($booking->fresh());

        // Operator A marks the client as arrived.
        $booking->update(['status' => 'in_progress']);

        $this->move($booking, ['revision' => $seenByOperatorB])
            ->assertStatus(409)
            ->assertJsonPath('error', 'stale')
            ->assertJsonPath('current.id', $booking->id)
            ->assertJsonPath('current.status', 'in_progress')
            ->assertJsonPath('current.start', '2026-10-06T10:00');

        $this->assertSame('2026-10-06 10:00:00', $booking->fresh()->start_at->format('Y-m-d H:i:s'));
        $this->assertSame(0, AuditLog::where('action', 'service_booking.moved')->count());
    }

    /** @return array<string, array{0: string}> */
    public static function finalStatuses(): array
    {
        return ['completed' => ['completed'], 'cancelled' => ['cancelled'], 'no_show' => ['no_show']];
    }

    #[DataProvider('finalStatuses')]
    public function test_a_finished_appointment_cannot_be_moved(string $status): void
    {
        $booking = $this->seedBooking(['status' => $status]);

        $this->move($booking, [])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
    }

    public function test_moving_to_another_person_uses_that_persons_duration_and_keeps_the_price(): void
    {
        $booking = $this->seedBooking();
        $liam = $this->secondPerson(durationOverride: 60);

        $this->move($booking, ['master_id' => $liam->id, 'start' => '2026-10-06T11:00'])->assertOk()
            ->assertJsonPath('booking.master.id', $liam->id)
            ->assertJsonPath('booking.end', '2026-10-06T12:00')
            ->assertJsonPath('booking.duration_minutes', 60)
            ->assertJsonPath('booking.price.total', 60);
    }

    public function test_moving_to_someone_who_does_not_perform_the_service_is_refused(): void
    {
        $booking = $this->seedBooking();
        $untrained = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Not Trained', 'is_active' => true]);

        $this->move($booking, ['master_id' => $untrained->id])->assertStatus(422)->assertJsonPath('error', 'master_not_eligible');
        $this->move($booking, ['master_id' => 999999])->assertStatus(404)->assertJsonPath('error', 'master_not_found');
    }

    public function test_a_move_needs_a_time_a_person_and_a_revision(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), ['start' => '2026-10-06T14:00'])->assertStatus(422);
        $this->move($booking, ['start' => '2026-10-04T10:00'])->assertStatus(422)->assertJsonPath('error', 'before_today');
        $this->move($booking, ['start' => 'soon'])->assertStatus(422)->assertJsonPath('error', 'invalid_time');
    }
}
