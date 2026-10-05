<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class FullAdminMessagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
    }

    public function test_a_booking_made_in_the_full_admin_tells_the_client(): void
    {
        $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Walk In', 'customer_email' => 'walkin@example.test', 'start_at' => '2026-10-06T10:00:00', 'notify_client' => true,
        ])->assertStatus(201)
            ->assertJsonPath('client_message.kind', 'booked')
            ->assertJsonPath('client_message.status', 'queued');
    }

    public function test_status_changes_tell_only_for_confirm_from_pending_and_cancel(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'pending']);
        $patch = fn ($b, array $body) => $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", $body + ['notify_client' => true]);

        $patch($pending, ['status' => 'confirmed'])->assertOk()->assertJsonPath('client_message.kind', 'confirmed');
        $patch($pending, ['status' => 'confirmed'])->assertOk()->assertJsonPath('client_message', null); // already confirmed
        $patch($pending, ['status' => 'in_progress'])->assertOk()->assertJsonPath('client_message', null);
        $patch($pending, ['payment_status' => 'paid'])->assertOk()->assertJsonPath('client_message', null);
        $patch($pending, ['status' => 'cancelled'])->assertOk()->assertJsonPath('client_message.kind', 'cancelled');
        $patch($pending, ['status' => 'cancelled'])->assertOk()->assertJsonPath('client_message', null); // already cancelled
    }

    public function test_delete_cancels_and_tells_unless_unticked(): void
    {
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$booking->id}", ['notify_client' => false])->assertOk()
            ->assertJsonPath('message', 'Booking cancelled')
            ->assertJsonPath('client_message.reason', 'not_requested');
    }

    public function test_bulk_cancel_tells_each_client_once_and_skips_rows_already_cancelled(): void
    {
        $a = $this->seedBooking(['customer_email' => 'a@example.test']);
        $b = $this->seedBooking(['customer_email' => '', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $c = $this->seedBooking(['customer_email' => 'c@example.test', 'status' => 'cancelled', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$a->id, $b->id, $c->id], 'action' => 'cancel', 'notify_client' => true])
            ->assertOk()
            ->assertJsonPath('client_messages', ['queued' => 1, 'skipped' => 1]);

        $this->assertSame(0, ClientMessage::where('service_booking_id', $c->id)->count());
        $this->assertSame('no_recipient', ClientMessage::where('service_booking_id', $b->id)->value('reason'));
    }

    public function test_cancelling_a_visit_that_already_ended_tells_nobody(): void
    {
        // Tidying last week's no-shows or completed visits must not email "Cancelled" about a visit that is over.
        $noShow = $this->seedBooking(['customer_email' => 'a@example.test', 'status' => 'no_show']);
        $completed = $this->seedBooking(['customer_email' => 'b@example.test', 'status' => 'completed', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $live = $this->seedBooking(['customer_email' => 'c@example.test', 'status' => 'in_progress', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$noShow->id, $completed->id, $live->id], 'action' => 'cancel', 'notify_client' => true])
            ->assertJsonPath('client_messages', ['queued' => 1, 'skipped' => 0]);
        $this->assertSame(0, ClientMessage::whereIn('service_booking_id', [$noShow->id, $completed->id])->count());

        $other = $this->seedBooking(['customer_email' => 'd@example.test', 'status' => 'completed', 'start_at' => '2026-10-06 16:00:00', 'end_at' => '2026-10-06 16:45:00']);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$other->id}/status", ['status' => 'cancelled', 'notify_client' => true])
            ->assertOk()->assertJsonPath('client_message', null);
        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$other->id}", ['notify_client' => true])
            ->assertOk()->assertJsonPath('client_message', null);
    }

    public function test_bulk_mark_status_to_confirmed_tells_pending_rows_only_and_other_bulk_actions_none(): void
    {
        $pending = $this->seedBooking(['customer_email' => 'a@example.test', 'status' => 'pending']);
        $confirmed = $this->seedBooking(['customer_email' => 'b@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$pending->id, $confirmed->id], 'action' => 'mark_status', 'value' => 'confirmed', 'notify_client' => true])
            ->assertJsonPath('client_messages', ['queued' => 1, 'skipped' => 0]);
        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$pending->id], 'action' => 'mark_no_show', 'notify_client' => true])
            ->assertJsonPath('client_messages', ['queued' => 0, 'skipped' => 0]);
    }
}
