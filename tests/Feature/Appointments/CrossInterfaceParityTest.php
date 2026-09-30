<?php

namespace Tests\Feature\Appointments;

use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * One core, two experiences: what the workspace writes, the full admin
 * reads, and the other way round — the same rows, no copy, no sync.
 */
class CrossInterfaceParityTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function bookInWorkspace(int $clientId, string $start = '2026-10-06T10:00'): int
    {
        return $this->asStaff()->postJson($this->api('bookings'), [
            'client_id' => $clientId, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => $start,
        ], ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(201)->json('booking.id');
    }

    private function fullAdminList(): array
    {
        return $this->asStaff()->getJson('/api/v1/admin/service-bookings')->assertOk()->json('data');
    }

    public function test_a_workspace_booking_appears_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedMemberClient()->id);

        $row = collect($this->fullAdminList())->firstWhere('id', $id);
        $this->assertNotNull($row, 'the full admin list does not show the workspace booking');
        $this->assertSame('Ada Member', $row['customer_name']);
        $this->assertSame('confirmed', $row['status']);
        $this->assertSame($this->member->member_number, $row['member']['member_number']);

        $calendar = $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings');
        $this->assertContains($id, array_column($calendar, 'id'));

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()
            ->assertJsonPath('customer_email', 'ada@example.test')
            ->assertJsonPath('member.id', $this->member->id);
    }

    public function test_a_phone_only_client_booking_renders_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $reference = ServiceBooking::findOrFail($id)->booking_reference;

        $row = collect($this->fullAdminList())->firstWhere('id', $id);
        $this->assertSame('', $row['customer_email']);
        $this->assertNull($row['member']);

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()->assertJsonPath('customer_email', '');
        $this->assertContains($id, array_column(
            $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings'), 'id',
        ));

        $csv = $this->asStaff()->postJson('/api/v1/admin/service-bookings/export', ['ids' => [$id]])->assertOk()->streamedContent();
        $this->assertStringContainsString($reference, $csv);
        $this->assertStringContainsString('Sophie Williams', $csv);
    }

    public function test_a_full_admin_change_shows_in_the_workspace_with_its_actor(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $before = $this->asStaff()->getJson($this->api("bookings/{$id}"))->json('booking.revision');

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$id}/status", ['status' => 'in_progress'])->assertOk();

        $after = $this->asStaff()->getJson($this->api("bookings/{$id}"))->assertOk()
            ->assertJsonPath('booking.status', 'in_progress')
            ->assertJsonPath('booking.history.0.action', 'service_booking.updated')
            ->assertJsonPath('booking.history.0.actor', 'Staff')
            ->json('booking.revision');
        $this->assertNotSame($before, $after);

        $this->asStaff()->getJson($this->api('calendar') . '?from=2026-10-06&to=2026-10-06')->assertOk()
            ->assertJsonPath('appointments.0.status', 'in_progress');
    }

    public function test_a_full_admin_booking_shows_in_the_workspace_without_a_client_link(): void
    {
        $id = $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Old Way', 'customer_email' => 'old@example.test', 'start_at' => '2026-10-06T13:00:00',
        ])->assertStatus(201)->json('id');

        $this->asStaff()->getJson($this->api('calendar') . '?from=2026-10-06&to=2026-10-06')->assertOk()
            ->assertJsonPath('appointments.0.id', $id)
            ->assertJsonPath('appointments.0.start', '2026-10-06T13:00')
            ->assertJsonPath('appointments.0.client', ['id' => null, 'name' => 'Old Way', 'is_member' => false]);
    }

    public function test_a_workspace_move_and_cancel_show_in_the_full_admin(): void
    {
        $id = $this->bookInWorkspace($this->seedClient()->id);
        $revision = fn () => $this->asStaff()->getJson($this->api("bookings/{$id}"))->json('booking.revision');

        $this->asStaff()->patchJson($this->api("bookings/{$id}"), ['start' => '2026-10-06T15:00', 'master_id' => $this->master->id, 'revision' => $revision()])->assertOk();
        $this->assertStringStartsWith('2026-10-06T15:00:00', $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$id}")->assertOk()->json('start_at'));

        $this->asStaff()->postJson($this->api("bookings/{$id}/actions"), ['action' => 'cancel', 'revision' => $revision(), 'reason' => 'Client rang'])->assertOk();
        $this->assertSame('cancelled', collect($this->fullAdminList())->firstWhere('id', $id)['status']);
        $this->assertNotContains($id, array_column(
            $this->asStaff()->getJson('/api/v1/admin/service-bookings/calendar?month=2026-10')->assertOk()->json('bookings'), 'id',
        ));
    }

    public function test_the_two_interfaces_refuse_the_same_slot(): void
    {
        $this->bookInWorkspace($this->seedClient()->id); // 10:00–10:45

        $this->asStaff()->postJson('/api/v1/admin/service-bookings', [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Late', 'customer_email' => 'late@example.test', 'start_at' => '2026-10-06T10:30:00',
        ])->assertStatus(409);
        $this->assertSame(1, ServiceBooking::count());
    }
}
