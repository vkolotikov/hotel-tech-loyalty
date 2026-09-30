<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceMaster;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CreateAppointmentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function body(Guest $client, array $overrides = []): array
    {
        return array_merge([
            'client_id'  => $client->id,
            'service_id' => $this->service->id,
            'master_id'  => $this->master->id,
            'start'      => '2026-10-06T10:00',
        ], $overrides);
    }

    private function create(array $body, ?string $key = null): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    public function test_a_members_appointment_carries_the_client_and_the_member(): void
    {
        $ada = $this->seedMemberClient();

        $response = $this->create($this->body($ada, ['staff_notes' => 'Prefers firm pressure']))
            ->assertStatus(201)
            ->assertJsonPath('replayed', false)
            ->assertJsonPath('booking.start', '2026-10-06T10:00')
            ->assertJsonPath('booking.end', '2026-10-06T10:45')
            ->assertJsonPath('booking.status', 'confirmed')
            ->assertJsonPath('booking.client.id', $ada->id)
            ->assertJsonPath('booking.client.member.id', $this->member->id)
            ->assertJsonPath('booking.price.total', 60)
            ->assertJsonPath('booking.payment.state', 'not_paid_online');

        $booking = ServiceBooking::findOrFail($response->json('booking.id'));
        $this->assertSame($ada->id, (int) $booking->guest_id);
        $this->assertSame($this->member->id, (int) $booking->member_id);
        $this->assertSame('Ada Member', $booking->customer_name);
        $this->assertSame('ada@example.test', $booking->customer_email);
        $this->assertSame('2026-10-06 10:00:00', $booking->start_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 10:45:00', $booking->end_at->format('Y-m-d H:i:s'));
        $this->assertSame(45, $booking->duration_minutes);
        $this->assertSame('60.00', $booking->service_price);
        $this->assertSame('60.00', $booking->total_amount);
        $this->assertSame('unpaid', $booking->payment_status);
        $this->assertSame('admin', $booking->source);
        $this->assertSame('Prefers firm pressure', $booking->staff_notes);
        $this->assertStringStartsWith('SVC-', $booking->booking_reference);
    }

    public function test_the_audit_row_names_who_created_it(): void
    {
        $id = $this->create($this->body($this->seedClient()))->assertStatus(201)->json('booking.id');

        $row = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $id)->firstOrFail();
        $this->assertSame('service_booking.created', $row->action);
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame($this->staff->id, (int) $row->causer_id);
    }

    public function test_a_phone_only_client_is_booked_with_an_empty_email_and_no_member(): void
    {
        $sophie = $this->seedClient();

        $response = $this->create($this->body($sophie))->assertStatus(201)
            ->assertJsonPath('booking.client.email', null)
            ->assertJsonPath('booking.client.phone', '+44 7700 900123')
            ->assertJsonPath('booking.client.member', null);

        $booking = ServiceBooking::findOrFail($response->json('booking.id'));
        $this->assertSame('', $booking->customer_email);
        $this->assertNull($booking->member_id);
        $this->assertSame($sophie->id, (int) $booking->guest_id);
    }

    public function test_a_taken_time_is_refused_and_nothing_is_written(): void
    {
        $this->seedBooking(); // 10:00–10:45 with the same person

        $this->create($this->body($this->seedClient(), ['start' => '2026-10-06T10:30']))
            ->assertStatus(409)->assertJsonPath('error', 'slot_taken');

        $this->assertSame(1, ServiceBooking::count());
        $this->assertSame(0, ServiceBookingSubmission::count());
    }

    public function test_a_time_outside_working_hours_is_refused(): void
    {
        $this->create($this->body($this->seedClient(), ['start' => '2026-10-06T08:00']))->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->create($this->body($this->seedClient(['phone' => '2', 'phone_key' => '2']), ['start' => '2026-10-06T16:30']))->assertStatus(409); // would end 17:15
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_team_member_who_does_not_perform_the_service_is_refused(): void
    {
        $other = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Not Trained', 'is_active' => true]);

        $this->create($this->body($this->seedClient(), ['master_id' => $other->id]))
            ->assertStatus(422)->assertJsonPath('error', 'master_not_eligible');
    }

    public function test_the_same_key_and_body_replays_the_first_appointment(): void
    {
        $body = $this->body($this->seedClient());
        $key = (string) Str::uuid();

        $first = $this->create($body, $key)->assertStatus(201)->json('booking.id');
        $second = $this->create($body, $key)->assertStatus(200)->assertJsonPath('replayed', true)->json('booking.id');

        $this->assertSame($first, $second);
        $this->assertSame(1, ServiceBooking::count());
        $this->assertSame(1, ServiceBookingSubmission::where('source', 'staff')->count());
    }

    public function test_a_key_reused_for_a_different_appointment_is_refused(): void
    {
        $client = $this->seedClient();
        $key = (string) Str::uuid();
        $this->create($this->body($client), $key)->assertStatus(201);

        $this->create($this->body($client, ['start' => '2026-10-06T12:00']), $key)
            ->assertStatus(422)->assertJsonPath('error', 'idempotency_key_reused');
        $this->assertSame(1, ServiceBooking::count());
    }

    public function test_a_request_without_a_usable_key_is_refused(): void
    {
        $body = $this->body($this->seedClient());

        $this->asStaff()->postJson($this->api('bookings'), $body)->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->create($body, 'short')->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->create($body, str_repeat('k', 81))->assertStatus(422)->assertJsonPath('error', 'idempotency_key_required');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_time_the_clock_skips_is_refused(): void
    {
        // Riga, 28 March 2027: 03:00 becomes 04:00. There is no 03:30.
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();

        $this->create($this->body($this->seedClient(), ['start' => '2027-03-28T03:30']))
            ->assertStatus(422)->assertJsonPath('error', 'time_does_not_exist');
    }

    public function test_a_day_that_has_passed_and_a_malformed_time_are_refused(): void
    {
        $client = $this->seedClient();

        $this->create($this->body($client, ['start' => '2026-10-04T10:00']))->assertStatus(422)->assertJsonPath('error', 'before_today');
        $this->create($this->body($client, ['start' => 'not-a-time']))->assertStatus(422)->assertJsonPath('error', 'invalid_time');
        $this->create($this->body($client, ['start' => '2026-10-06T10:00:00+03:00']))->assertStatus(422); // longer than the wall-clock form
    }

    public function test_staff_may_record_a_walk_in_who_started_earlier_today(): void
    {
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 12:00:00'));

        $this->create($this->body($this->seedClient(), ['start' => '2026-10-05T09:00', 'source' => 'walk_in']))
            ->assertStatus(201)->assertJsonPath('booking.source', 'walk_in');
    }

    public function test_unknown_clients_services_and_people_are_not_found(): void
    {
        $client = $this->seedClient();
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => Guest::create(['full_name' => 'Theirs', 'phone' => '9', 'phone_key' => '9']));
        $retired = Service::create(['organization_id' => $this->org->id, 'name' => 'Retired', 'duration_minutes' => 30, 'price' => 10, 'is_active' => false]);

        $this->create($this->body($client, ['client_id' => $theirs->id]))->assertStatus(404)->assertJsonPath('error', 'client_not_found');
        $this->create($this->body($client, ['service_id' => $retired->id]))->assertStatus(404)->assertJsonPath('error', 'service_not_found');
        $this->create($this->body($client, ['master_id' => 999999]))->assertStatus(404)->assertJsonPath('error', 'master_not_found');
        $this->create($this->body($client, ['source' => 'widget']))->assertStatus(422);
    }
}
