<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class FullAdminMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_drawer_reads_the_same_money(): void
    {
        $b = $this->seedBooking();
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 20, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$b->id}")->assertOk()
            ->assertJsonPath('money.paid_desk', 20)
            ->assertJsonPath('money.owed', 40)
            ->assertJsonPath('money.movements.0.method', 'cash');
    }

    public function test_nobody_labels_a_booking_paid_without_money_behind_it(): void
    {
        $b = $this->seedBooking();

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['payment_status' => 'paid'])->assertStatus(422);
        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$b->id], 'action' => 'mark_paid'])->assertStatus(422);

        $this->assertSame('unpaid', $b->fresh()->payment_status);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['status' => 'in_progress'])->assertOk();
    }
}
