<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\AuditLog;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentActions;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TakePaymentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function pay($booking, array $body, $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())
            ->postJson($this->api("bookings/{$booking->id}/payments"), $body + ['revision' => AppointmentPresenter::revision($booking->fresh())]);
    }

    public function test_any_staff_member_records_a_payment_and_the_appointment_says_what_is_left(): void
    {
        $b = $this->seedBooking();
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->pay($b, ['amount' => 20, 'method' => 'cash'], $staff)->assertOk()
            ->assertJsonPath('booking.money.paid_desk', 20)
            ->assertJsonPath('booking.money.owed', 40)
            ->assertJsonPath('booking.money.movements.0.method', 'cash')
            ->assertJsonPath('booking.money.movements.0.by', $staff->name)
            ->assertJsonPath('booking.payment.raw', 'unpaid');

        $this->pay($b, ['amount' => 40, 'method' => 'card_desk'])->assertOk()
            ->assertJsonPath('booking.money.owed', 0)
            ->assertJsonPath('booking.money.can_take', false)
            ->assertJsonPath('booking.payment.raw', 'paid');

        $this->assertSame(2, AuditLog::where('action', 'service_booking.payment_taken')->count());
    }

    public function test_no_more_than_is_owed_and_no_payment_while_a_card_is_held(): void
    {
        $b = $this->seedBooking();
        $this->pay($b, ['amount' => 61, 'method' => 'cash'])->assertStatus(422)
            ->assertJsonPath('error', 'amount_too_large')->assertJsonPath('max', 60);

        $held = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held2', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->pay($held, ['amount' => 10, 'method' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
    }

    public function test_a_desk_payment_after_the_card_hold_was_released_is_desk_money_only(): void
    {
        // The hold was released at Stripe but the appointment stands: the client pays at the desk.
        $b = $this->seedBooking(['payment_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_released1']);

        $this->pay($b, ['amount' => 60, 'method' => 'cash'])->assertOk()
            ->assertJsonPath('booking.payment.raw', 'paid')
            ->assertJsonPath('booking.payment.state', 'marked_paid')
            ->assertJsonPath('booking.money.paid_online', 0)
            ->assertJsonPath('booking.money.paid_desk', 60)
            ->assertJsonPath('booking.money.paid_in', 60)
            ->assertJsonPath('booking.money.refundable_online', 0)
            ->assertJsonPath('booking.money.refundable_desk', 60);

        // Cancelling it speaks of no card payment, and Takings counts no online money for it.
        $cancel = collect($this->asStaff()->getJson($this->api("bookings/{$b->id}"))->json('booking.actions'))->firstWhere('key', 'cancel');
        $this->assertSame('none', $cancel['consequences']['payment']);
        $this->asStaff()->getJson($this->api('takings?date=' . substr((string) $b->start_at, 0, 10)))->assertOk()->assertJsonPath('online', []);
    }

    public function test_a_card_hold_past_the_capture_window_does_not_block_the_desk(): void
    {
        // Nothing charges or releases a hold this old (AppointmentActions::HOLD_SWEEP_DAYS): the desk takes the money.
        $b = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_lapsed1']);
        $b->forceFill(['created_at' => now()->subDays(AppointmentActions::HOLD_SWEEP_DAYS + 1)])->saveQuietly();

        $this->pay($b, ['amount' => 60, 'method' => 'card_desk'])->assertOk()
            ->assertJsonPath('booking.money.held_online', 0)
            ->assertJsonPath('booking.money.paid_online', 0)
            ->assertJsonPath('booking.money.paid_desk', 60)
            ->assertJsonPath('booking.money.owed', 0)
            ->assertJsonPath('booking.payment.raw', 'paid');
    }

    public function test_other_needs_a_note_and_the_method_and_amount_are_checked(): void
    {
        $b = $this->seedBooking();
        $this->pay($b, ['amount' => 10, 'method' => 'other'])->assertStatus(422)->assertJsonPath('error', 'note_required');
        $this->pay($b, ['amount' => 10, 'method' => 'bitcoin'])->assertStatus(422);
        $this->pay($b, ['amount' => 0, 'method' => 'cash'])->assertStatus(422);
        $this->pay($b, ['amount' => 10, 'method' => 'other', 'note' => 'Gift voucher 1234'])->assertOk()
            ->assertJsonPath('booking.money.movements.0.note', 'Gift voucher 1234');
    }

    public function test_a_double_click_records_once(): void
    {
        $b = $this->seedBooking();
        $revision = AppointmentPresenter::revision($b->fresh());

        $this->asStaff()->postJson($this->api("bookings/{$b->id}/payments"), ['amount' => 20, 'method' => 'cash', 'revision' => $revision])->assertOk();
        $this->travel(1)->seconds();
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/payments"), ['amount' => 20, 'method' => 'cash', 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'stale');

        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_cancelled_or_no_show_appointments_take_nothing(): void
    {
        foreach (['cancelled', 'no_show'] as $i => $status) {
            $b = $this->seedBooking(['status' => $status, 'start_at' => sprintf('2026-10-06 %02d:00:00', 11 + $i), 'end_at' => sprintf('2026-10-06 %02d:45:00', 11 + $i)]);
            $this->pay($b, ['amount' => 10, 'method' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
        }
    }

    public function test_mark_paid_at_venue_is_gone_and_the_bootstrap_says_who_may_manage(): void
    {
        $b = $this->seedBooking();
        $actions = collect($this->asStaff()->getJson($this->api("bookings/{$b->id}"))->json('booking.actions'))->pluck('key')->all();
        $this->assertNotContains('mark_paid_at_venue', $actions);
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/actions"), ['action' => 'mark_paid_at_venue', 'revision' => AppointmentPresenter::revision($b->fresh())])
            ->assertStatus(422)->assertJsonPath('error', 'not_allowed');

        $this->asStaff()->getJson($this->api('bootstrap'))->assertJsonPath('staff.can_manage', true);
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')->getJson($this->api('bootstrap'))->assertJsonPath('staff.can_manage', false);
    }
}
