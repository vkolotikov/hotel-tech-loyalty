<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WorkspaceMessagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    private function create(array $extra = [], ?string $key = null): \Illuminate\Testing\TestResponse
    {
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);

        return $this->asStaff()->postJson($this->api('bookings'), array_merge([
            'client_id' => $client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra), ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    /** A second team member who offers the fixture's service, working every day 09:00–17:00 (as seedBookableService builds one). */
    private function secondMaster(): ServiceMaster
    {
        $orgId = $this->org->id;
        $master = ServiceMaster::withoutGlobalScopes()->create(['organization_id' => $orgId, 'name' => 'Ilze Ozola', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $orgId, 'service_id' => $this->service->id, 'service_master_id' => $master->id,
            'price_override' => null, 'duration_override_minutes' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $orgId, 'service_master_id' => $master->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $master;
    }

    public function test_a_booking_made_by_staff_tells_the_client_as_the_box_says(): void
    {
        $this->create(['notify_client' => true])->assertStatus(201)
            ->assertJsonPath('client_message.kind', 'booked')
            ->assertJsonPath('client_message.status', 'queued')
            ->assertJsonPath('client_message.recipient', 'sophie@example.test')
            ->assertJsonPath('booking.client_email', 'sophie@example.test')
            ->assertJsonPath('booking.messages.0.kind', 'booked');
    }

    public function test_unticked_or_venue_off_records_the_choice_and_sends_nothing(): void
    {
        $this->create(['notify_client' => false])->assertJsonPath('client_message.reason', 'not_requested');
        $this->create(['start' => '2026-10-06T12:00'])->assertJsonPath('client_message.reason', 'not_requested'); // venue default off
        Queue::assertNothingPushed();
    }

    public function test_a_retried_create_does_not_email_twice(): void
    {
        $this->setClientMessages(true);
        $key = (string) Str::uuid();
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);
        $body = ['client_id' => $client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00'];

        $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key])->assertStatus(201);
        $this->asStaff()->postJson($this->api('bookings'), $body, ['Idempotency-Key' => $key])->assertOk()
            ->assertJsonPath('replayed', true)
            ->assertJsonPath('client_message', null);

        $this->assertSame(1, ClientMessage::where('kind', 'booked')->count());
    }

    public function test_a_move_says_the_former_time_and_a_person_only_move_still_counts(): void
    {
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);
        $move = fn (array $body) => $this->asStaff()->patchJson($this->api("bookings/{$booking->id}"), array_merge([
            'start' => '2026-10-06T14:00', 'master_id' => $this->master->id, 'revision' => AppointmentPresenter::revision($booking->fresh()), 'notify_client' => true,
        ], $body));

        $move([])->assertOk()->assertJsonPath('client_message.kind', 'moved');
        $row = ClientMessage::where('kind', 'moved')->latest('id')->first();
        $this->assertSame(['2026-10-06 14:00:00', '2026-10-06 10:00:00'], [$row->for_start_at->format('Y-m-d H:i:s'), $row->previous_start_at->format('Y-m-d H:i:s')]);

        $second = $this->secondMaster();
        $move(['master_id' => $second->id])->assertOk()->assertJsonPath('client_message.kind', 'moved');

        $move(['master_id' => $second->id])->assertOk()->assertJsonPath('client_message', null); // nothing changed
    }

    public function test_confirm_and_cancel_tell_the_client_and_other_actions_do_not(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'pending']);
        $act = fn ($b, string $action, array $extra = []) => $this->asStaff()->postJson($this->api("bookings/{$b->id}/actions"), array_merge([
            'action' => $action, 'revision' => AppointmentPresenter::revision($b->fresh()), 'notify_client' => true,
        ], $extra));

        $act($pending, 'confirm')->assertOk()->assertJsonPath('client_message.kind', 'confirmed');
        $act($pending, 'start')->assertOk()->assertJsonPath('client_message', null);

        $other = $this->seedBooking(['customer_email' => 'sophie@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $act($other, 'cancel', ['reason' => 'Therapist ill'])->assertOk()
            ->assertJsonPath('client_message.kind', 'cancelled')
            ->assertJsonPath('booking.messages.0.kind', 'cancelled');
    }

    public function test_the_actions_say_which_ones_ask_about_the_client(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'pending']);
        $actions = collect($this->asStaff()->getJson($this->api("bookings/{$pending->id}"))->assertOk()->json('booking.actions'))->keyBy('key');

        $this->assertSame('ask', $actions['confirm']['consequences']['message']);
        $this->assertSame('ask', $actions['cancel']['consequences']['message']);
        $this->assertSame('none', $actions['no_show']['consequences']['message']);
    }

    public function test_the_detail_lists_the_messages_newest_first_and_knows_the_address(): void
    {
        $client = $this->seedClient(['email' => 'client@example.test', 'email_key' => 'client@example.test']);
        $booking = $this->seedBooking(['customer_email' => '', 'guest_id' => $client->id]);
        ClientMessage::create(['service_booking_id' => $booking->id, 'kind' => 'booked', 'status' => 'sent', 'channel' => 'email', 'locale' => 'en', 'recipient' => 'client@example.test', 'for_start_at' => $booking->start_at]);
        $this->travel(1)->minutes();
        ClientMessage::create(['service_booking_id' => $booking->id, 'kind' => 'reminder', 'status' => 'skipped', 'reason' => 'suppressed', 'channel' => 'email', 'locale' => 'en', 'recipient' => 'client@example.test', 'for_start_at' => $booking->start_at]);

        $this->asStaff()->getJson($this->api("bookings/{$booking->id}"))->assertOk()
            ->assertJsonPath('booking.client_email', 'client@example.test')
            ->assertJsonPath('booking.messages.0.kind', 'reminder')
            ->assertJsonPath('booking.messages.0.reason', 'suppressed')
            ->assertJsonPath('booking.messages.1.kind', 'booked');
    }
}
