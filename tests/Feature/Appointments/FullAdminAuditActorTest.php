<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * The full admin's own endpoints, for an organisation that never opted in
 * to the workspace: every audit row they write must say who did it and to
 * which booking.
 */
class FullAdminAuditActorTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments(enabled: false);
    }

    private function rowsFor(ServiceBooking $booking): \Illuminate\Support\Collection
    {
        return AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->orderBy('id')->get();
    }

    private function assertActor(AuditLog $row): void
    {
        $this->assertSame(User::class, $row->causer_type);
        $this->assertSame($this->staff->id, (int) $row->causer_id);
    }

    public function test_create_names_the_actor_and_the_booking(): void
    {
        $id = $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Walk In', 'customer_email' => 'walkin@example.test', 'start_at' => '2026-10-06T10:00:00',
        ])->assertStatus(201)->json('id');

        $rows = $this->rowsFor(ServiceBooking::findOrFail($id));
        $this->assertCount(1, $rows);
        $this->assertSame('service_booking.created', $rows[0]->action);
        $this->assertActor($rows[0]);
    }

    public function test_a_status_change_names_the_actor_and_what_changed(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$booking->id}/status", ['status' => 'in_progress'])->assertOk();

        $row = $this->rowsFor($booking)->sole();
        $this->assertSame('service_booking.updated', $row->action);
        $this->assertActor($row);
        $this->assertSame('confirmed', $row->old_values['status']);
        $this->assertSame('in_progress', $row->new_values['status']);
    }

    public function test_a_bulk_action_writes_one_row_per_booking_and_keeps_its_summary(): void
    {
        $first = $this->seedBooking();
        $second = $this->seedBooking(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$first->id, $second->id], 'action' => 'mark_no_show'])
            ->assertOk()->assertJsonPath('updated', 2);

        foreach ([$first, $second] as $booking) {
            $row = $this->rowsFor($booking)->sole();
            $this->assertSame('service_booking.bulk.mark_no_show', $row->action);
            $this->assertActor($row);
            $this->assertSame('confirmed', $row->old_values['status']);
            $this->assertSame('no_show', $row->new_values['status']);
        }

        $summary = AuditLog::where('action', 'service_booking.bulk.mark_no_show')->whereNull('subject_id')->sole();
        $this->assertActor($summary);
        $this->assertSame('Bulk mark_no_show: 2 service bookings', $summary->description);
    }

    public function test_delete_which_cancels_leaves_a_row(): void
    {
        $booking = $this->seedBooking();

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$booking->id}")->assertOk();

        $row = $this->rowsFor($booking)->sole();
        $this->assertSame('service_booking.cancelled', $row->action);
        $this->assertActor($row);
        $this->assertSame('cancelled', $booking->fresh()->status);
    }
}
