<?php

namespace Tests\Feature\Booking;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Booking\CancellationException;
use App\Services\Booking\ServiceBookingRefund;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceBookingRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function booking(array $attrs = []): ServiceBooking
    {
        return (new ServiceBooking())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'booking_reference' => 'SVC-TEST0001', 'status' => 'confirmed',
            'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_1', 'total_amount' => 54, 'currency' => 'EUR',
        ], $attrs));
    }

    private function stripe(?string $status, bool $enabled = true): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        if ($status !== null) {
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1', ['latest_charge'])->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => $status, 'amount' => 5400, 'currency' => 'eur']));
        }
        return $stripe;
    }

    public function test_a_booking_without_an_online_payment_has_nothing_to_give_back(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldNotReceive('retrievePaymentIntent');

        foreach ([['payment_status' => 'unpaid', 'stripe_payment_intent_id' => null], ['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_abc']] as $attrs) {
            $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking($attrs));
            $this->assertSame(['money' => 'none', 'amount' => 0.0, 'columns' => []], $r);
        }
    }

    public function test_an_uncaptured_hold_is_cancelled_not_refunded(): void
    {
        $stripe = $this->stripe('requires_capture');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => 'canceled']));
        $stripe->shouldNotReceive('refund');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking());

        $this->assertSame('released', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame(['payment_status' => 'cancelled'], $r['columns']);
    }

    public function test_a_captured_payment_is_refunded_in_full(): void
    {
        $stripe = $this->stripe('succeeded');
        $stripe->shouldReceive('refund')->once()->with('pi_1', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded', 'amount' => 5400]));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->travelTo('2026-10-01 09:00:00');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

        $this->assertSame('refunded', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame('refunded', $r['columns']['payment_status']);
        $this->assertSame(54.0, $r['columns']['refunded_amount']);
        $this->assertSame('re_1', $r['columns']['last_refund_id']);
        $this->assertSame('2026-10-01 09:00:00', $r['columns']['refunded_at']->format('Y-m-d H:i:s'));
    }

    public function test_a_hold_stripe_already_let_go_is_recorded_without_another_call(): void
    {
        $stripe = $this->stripe('canceled');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldNotReceive('refund');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking());

        $this->assertSame('released', $r['money']);
        $this->assertSame(['payment_status' => 'cancelled'], $r['columns']);
    }

    public function test_an_unfinished_payment_is_cancelled(): void
    {
        $stripe = $this->stripe('requires_payment_method');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => 'canceled']));

        $this->assertSame('released', (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'pending']))['money']);
    }

    public function test_a_stripe_failure_is_reported_and_nothing_is_claimed(): void
    {
        $down = Mockery::mock(StripeService::class);
        $down->shouldReceive('isEnabled')->andReturn(true);
        $down->shouldReceive('retrievePaymentIntent')->andThrow(new \RuntimeException('stripe down'));

        $refusing = $this->stripe('succeeded');
        $refusing->shouldReceive('refund')->andThrow(new \RuntimeException('charge already refunded'));

        foreach ([$down, $refusing] as $stripe) {
            try {
                (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));
                $this->fail('a failed refund must throw');
            } catch (CancellationException $e) {
                $this->assertSame('refund_failed', $e->errorCode);
                $this->assertSame(502, $e->status);
            }
        }
    }

    public function test_payments_switched_off_since_the_booking_cannot_return_money(): void
    {
        try {
            (new ServiceBookingRefund($this->stripe(null, false)))->giveBack($this->booking(['payment_status' => 'paid']));
            $this->fail('no Stripe, no refund');
        } catch (CancellationException $e) {
            $this->assertSame('refund_unavailable', $e->errorCode);
            $this->assertSame(409, $e->status);
        }
    }

    /** A charge Stripe already fully refunded (e.g. from the dashboard) is not a failure to retry forever. */
    public function test_a_charge_already_fully_refunded_is_recorded_without_calling_refund(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1', ['latest_charge'])->andReturn(PaymentIntent::constructFrom([
            'id' => 'pi_1', 'status' => 'succeeded',
            'latest_charge' => ['id' => 'ch_1', 'amount' => 5400, 'amount_refunded' => 5400, 'refunded' => true],
        ]));
        $stripe->shouldNotReceive('refund');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

        $this->assertSame('refunded', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame('refunded', $r['columns']['payment_status']);
        $this->assertSame(54.0, $r['columns']['refunded_amount']);
        $this->assertNull($r['columns']['last_refund_id']);
    }

    /** The same "nothing left to refund" fact, learned from refund()'s own error instead of a pre-expanded charge. */
    public function test_a_refund_call_that_finds_the_charge_already_refunded_is_recorded_as_refunded(): void
    {
        $stripe = $this->stripe('succeeded');
        $stripe->shouldReceive('refund')->once()->with('pi_1', null, 'requested_by_customer')->andThrow(
            \Stripe\Exception\InvalidRequestException::factory('The charge ch_1 has already been refunded.', 400, null, null, null, 'charge_already_refunded')
        );

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

        $this->assertSame('refunded', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame('refunded', $r['columns']['payment_status']);
        $this->assertNull($r['columns']['last_refund_id']);
    }

    /** The Refund object's own amount is recorded when Stripe reports one different from the booking's total (e.g. a partial refund already issued, or a rounding difference). */
    public function test_the_refund_objects_own_amount_is_recorded_when_it_differs_from_the_booking_total(): void
    {
        $stripe = $this->stripe('succeeded');
        $stripe->shouldReceive('refund')->once()->with('pi_1', null, 'requested_by_customer')->andReturn(
            Refund::constructFrom(['id' => 're_partial', 'status' => 'succeeded', 'amount' => 4000])
        );

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid', 'total_amount' => 54]));

        $this->assertSame('refunded', $r['money']);
        $this->assertSame(40.0, $r['amount']);
        $this->assertSame(40.0, $r['columns']['refunded_amount']);
        $this->assertSame('re_partial', $r['columns']['last_refund_id']);
    }

    /** The cancel call itself can fail on an uncaptured hold. */
    public function test_the_cancel_call_failing_on_an_uncaptured_hold_is_reported_as_a_failure(): void
    {
        $stripe = $this->stripe('requires_capture');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'requested_by_customer')->andThrow(new \RuntimeException('stripe down'));
        $stripe->shouldNotReceive('refund');

        try {
            (new ServiceBookingRefund($stripe))->giveBack($this->booking());
            $this->fail('a failed release must throw');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }
    }

    /** An expanded retrieve Stripe refuses (permission / invalid request) is asked once more without the expand; the pre-check is skipped. */
    public function test_an_expand_stripe_refuses_is_retried_once_without_it(): void
    {
        foreach ([
            \Stripe\Exception\PermissionException::factory('The provided key does not have access to charges', 403),
            \Stripe\Exception\InvalidRequestException::factory('This property cannot be expanded (latest_charge).', 400),
        ] as $refusal) {
            $stripe = Mockery::mock(StripeService::class);
            $stripe->shouldReceive('isEnabled')->andReturn(true);
            $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_1', ['latest_charge'])->andThrow($refusal);
            $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_1')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => 'succeeded']));
            $stripe->shouldReceive('refund')->once()->with('pi_1', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded', 'amount' => 5400]));

            $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

            $this->assertSame('refunded', $r['money']);
            $this->assertSame(54.0, $r['amount']);
        }
    }

    /** A network failure is not retried — it stays a refund_failed. */
    public function test_a_network_failure_on_the_expanded_retrieve_is_not_retried(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_1', ['latest_charge'])->andThrow(\Stripe\Exception\ApiConnectionException::factory('Could not connect to Stripe'));
        $stripe->shouldNotReceive('refund');

        try {
            (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));
            $this->fail('a network failure must throw');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
        }
    }

    /** The amount recorded from an already-refunded charge is never more than was captured. */
    public function test_an_already_refunded_amount_is_capped_at_the_captured_amount(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1', ['latest_charge'])->andReturn(PaymentIntent::constructFrom([
            'id' => 'pi_1', 'status' => 'succeeded',
            'latest_charge' => ['id' => 'ch_1', 'amount' => 5400, 'amount_captured' => 4000, 'amount_refunded' => 5400, 'refunded' => true],
        ]));
        $stripe->shouldNotReceive('refund');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

        $this->assertSame(40.0, $r['amount']);
        $this->assertSame(40.0, $r['columns']['refunded_amount']);
    }

    /** An intent Stripe is still processing cannot be cancelled either. */
    public function test_an_intent_still_processing_that_cannot_be_cancelled_is_reported_as_a_failure(): void
    {
        $stripe = $this->stripe('processing');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'requested_by_customer')->andThrow(new \RuntimeException('cannot cancel a processing intent'));
        $stripe->shouldNotReceive('refund');

        try {
            (new ServiceBookingRefund($stripe))->giveBack($this->booking());
            $this->fail('a failed release must throw');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }
    }
}
