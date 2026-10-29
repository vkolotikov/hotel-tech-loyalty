<?php

namespace Tests\Audit;

use App\Services\Appointments\AppointmentPresenter;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** Read-only audit evidence: tests assert the currently observed defects, not desired behavior. */
class AuditRefundStatusTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function submit($booking, float $amount)
    {
        return $this->asStaff()->postJson($this->api("bookings/{$booking->id}/refunds"), [
            'amount' => $amount, 'via' => 'online_card', 'reason' => 'Audit fixture',
            'revision' => AppointmentPresenter::revision($booking->fresh()),
        ]);
    }

    public function test_a_failed_stripe_refund_object_is_incorrectly_recorded_as_refunded(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_audit_failed']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom([
            'id' => 're_audit_failed', 'status' => 'failed', 'amount' => 6000, 'failure_reason' => 'declined',
        ]));
        $this->app->instance(StripeService::class, $stripe);

        $this->submit($booking, 60)->assertOk()
            ->assertJsonPath('booking.money.refunded_online', 60)
            ->assertJsonPath('booking.payment.raw', 'refunded');
        $this->assertSame(60.0, (float) $booking->fresh()->refunded_amount);
    }

    public function test_a_pending_stripe_refund_object_is_incorrectly_recorded_as_refunded(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_audit_pending']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom([
            'id' => 're_audit_pending', 'status' => 'pending', 'amount' => 6000, 'pending_reason' => 'insufficient_funds',
        ]));
        $this->app->instance(StripeService::class, $stripe);

        $this->submit($booking, 60)->assertOk()
            ->assertJsonPath('booking.money.refunded_online', 60)
            ->assertJsonPath('booking.payment.raw', 'refunded');
        $this->assertSame(60.0, (float) $booking->fresh()->refunded_amount);
    }

    public function test_changed_amount_retry_after_unknown_refund_outcome_uses_a_new_key(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_audit_timeout']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $keys = [];
        $stripe->shouldReceive('refund')->twice()->andReturnUsing(function ($pi, $amount, $reason, $key) use (&$keys) {
            $keys[] = $key;
            if (count($keys) === 1) {
                // The provider created a EUR 25 refund, but its response was lost.
                throw new \RuntimeException('Read timed out after Stripe accepted the refund');
            }
            return Refund::constructFrom(['id' => 're_audit_second', 'status' => 'succeeded', 'amount' => 3000]);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->submit($booking, 25)->assertStatus(409)->assertJsonPath('error', 'refund_failed');
        $this->submit($booking, 30)->assertOk()->assertJsonPath('booking.money.refunded_online', 30);
        $this->assertNotSame($keys[0], $keys[1]);
        // Stripe can now have refunded EUR 55, while the app reports only EUR 30 until a webhook arrives.
    }

    public function test_member_cancellation_refund_helper_also_calls_pending_refund_completed(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_audit_cancel']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->andReturn(\Stripe\PaymentIntent::constructFrom([
            'id' => 'pi_audit_cancel', 'status' => 'succeeded', 'latest_charge' => null,
        ]));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom([
            'id' => 're_audit_cancel', 'status' => 'pending', 'amount' => 6000, 'pending_reason' => 'insufficient_funds',
        ]));
        $outcome = (new \App\Services\Booking\ServiceBookingRefund($stripe))->giveBack($booking);
        $this->assertSame('refunded', $outcome['money']);
        $this->assertSame('refunded', $outcome['columns']['payment_status']);
        $this->assertSame(60.0, $outcome['columns']['refunded_amount']);
    }
}
