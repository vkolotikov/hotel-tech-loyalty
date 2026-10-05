<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CancelWithRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function cancel($b, array $extra = [], $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())->postJson($this->api("bookings/{$b->id}/actions"), [
            'action' => 'cancel', 'revision' => AppointmentPresenter::revision($b->fresh()), 'reason' => 'Client ill',
        ] + $extra);
    }

    public function test_a_manager_cancels_and_refunds_the_card_and_the_cash_in_one_step(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_both', 'total_amount' => 60]);
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel($b, ['refunds' => [['via' => 'online_card', 'amount' => 60]]])->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.money.to_refund', 0)
            ->assertJsonPath('booking.payment.raw', 'refunded')
            ->assertJsonPath('booking.money.movements.0.note', 'Client ill');
    }

    public function test_a_failed_card_refund_leaves_the_appointment_standing(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_fail']);
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('declined'));

        $this->cancel($b, ['refunds' => [['via' => 'online_card', 'amount' => 60]]])->assertStatus(409)->assertJsonPath('error', 'refund_failed');

        $this->assertSame(['confirmed', 'paid'], [$b->fresh()->status, $b->fresh()->payment_status]);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_every_refund_line_is_checked_before_the_card_is_refunded(): void
    {
        // The card line is right, the cash line is more than came in at the desk: nothing goes to Stripe.
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_two', 'total_amount' => 60]);
        $this->stripe->shouldNotReceive('refund');

        $this->cancel($b, ['refunds' => [['via' => 'online_card', 'amount' => 60], ['via' => 'cash', 'amount' => 10]]])
            ->assertStatus(422)->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 0);

        $this->assertSame(['confirmed', 'paid'], [$b->fresh()->status, $b->fresh()->payment_status]);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_staff_cancel_without_refunding_and_see_what_is_left_to_refund(): void
    {
        $b = $this->seedBooking();
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 45, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->cancel($b, ['refunds' => [['via' => 'cash', 'amount' => 45]]], $staff)->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->cancel($b, [], $staff)->assertOk()->assertJsonPath('booking.money.to_refund', 45);
    }

    public function test_a_zero_line_is_ignored_and_refunds_are_for_cancel_only(): void
    {
        $b = $this->seedBooking();
        $this->cancel($b, ['refunds' => [['via' => 'cash', 'amount' => 0]]])->assertOk()->assertJsonPath('booking.status', 'cancelled');

        $other = $this->seedBooking(['status' => 'pending', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->asStaff()->postJson($this->api("bookings/{$other->id}/actions"), [
            'action' => 'confirm', 'revision' => AppointmentPresenter::revision($other->fresh()), 'refunds' => [['via' => 'cash', 'amount' => 5]],
        ])->assertStatus(422);
    }
}
