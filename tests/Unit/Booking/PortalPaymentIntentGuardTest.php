<?php

namespace Tests\Unit\Booking;

use App\Services\Booking\PaymentMismatch;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\StripeService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Final review, Minor 3: the guard compared the intent's amount with
 * `round($total * 100)`, which is wrong for a zero-decimal currency — a
 * 5400 yen booking is an intent of amount 5400, not 540000 — so every
 * matching yen intent was refused as a mismatch. It now uses
 * StripeService::toSmallestUnit(), the same conversion that created the
 * intent. The match path touches no database.
 */
class PortalPaymentIntentGuardTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        // carried() now also queries ServiceBooking (for a mismatched stay
        // intent that must still check it isn't a spent appointment intent),
        // so the schema needs service_bookings alongside booking_mirror.
        $this->setUpCapturePendingSchema();
    }

    private function guardFor(PaymentIntent $pi, string $stripeCurrency): PortalPaymentIntentGuard
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('currency')->andReturn($stripeCurrency);
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $stripe->shouldReceive('retrievePaymentIntent')->with($pi->id)->andReturn($pi);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        return new PortalPaymentIntentGuard($stripe);
    }

    private function intent(int $amount, string $currency, CarbonImmutable $start): PaymentIntent
    {
        return PaymentIntent::constructFrom([
            'id' => 'pi_yen', 'status' => 'requires_capture', 'amount' => $amount, 'currency' => $currency,
            'metadata' => ['org_id' => '7', 'member_id' => '9', 'service_id' => '11', 'start_at' => $start->toIso8601String()],
        ]);
    }

    public function test_a_zero_decimal_intent_matches_its_total(): void
    {
        $start = CarbonImmutable::parse('2026-10-05T09:00:00Z');
        $pi = $this->intent(5400, 'jpy', $start);

        $this->assertSame($pi, $this->guardFor($pi, 'jpy')->verify('pi_yen', 7, 9, 11, $start, 5400.0));
    }

    public function test_a_two_decimal_intent_still_matches_in_cents(): void
    {
        $start = CarbonImmutable::parse('2026-10-05T09:00:00Z');
        $pi = $this->intent(5400, 'eur', $start);

        $this->assertSame($pi, $this->guardFor($pi, 'eur')->verify('pi_yen', 7, 9, 11, $start, 54.0));
    }

    private function stayIntent(array $top = [], array $meta = []): \Stripe\PaymentIntent
    {
        return \Stripe\PaymentIntent::constructFrom(array_merge(['id' => 'pi_stay', 'status' => 'requires_capture', 'amount' => 18000, 'currency' => 'eur'], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => '7', 'member_id' => '41', 'portal_hold_token' => 'HOLD-A'], $meta),
        ]));
    }

    private function stripeReturning(\Stripe\PaymentIntent $pi): \Mockery\MockInterface
    {
        $stripe = \Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn($pi);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        return $stripe;
    }

    public function test_a_stay_intent_is_accepted_only_for_its_own_hold_member_org_and_amount(): void
    {
        $stripe = $this->stripeReturning($this->stayIntent());
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $guard = new PortalPaymentIntentGuard($stripe);

        $this->assertSame('pi_stay', $guard->verifyStay('pi_stay', 7, 41, 'HOLD-A', 180.0)->id);
    }

    public function test_a_stay_intent_for_another_hold_or_amount_is_cancelled_and_refused(): void
    {
        foreach ([['HOLD-B', 180.0], ['HOLD-A', 200.0]] as [$hold, $total]) {
            $stripe = $this->stripeReturning($this->stayIntent());
            $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');
            try {
                (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', 7, 41, $hold, $total);
                $this->fail('a mismatch must throw');
            } catch (PaymentMismatch) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_a_strangers_stay_intent_is_refused_and_left_alone(): void
    {
        foreach ([[8, 41], [7, 42]] as [$org, $member]) {
            $stripe = $this->stripeReturning($this->stayIntent());
            $stripe->shouldNotReceive('cancelPaymentIntent');
            try {
                (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', $org, $member, 'HOLD-A', 180.0);
                $this->fail('a stranger\'s intent must throw');
            } catch (PaymentMismatch) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_a_service_intent_cannot_pay_for_a_stay(): void
    {
        $stripe = $this->stripeReturning($this->stayIntent([], ['kind' => 'portal_service_booking', 'portal_hold_token' => null, 'service_id' => '3']));
        $stripe->shouldReceive('cancelPaymentIntent')->once();
        $this->expectException(PaymentMismatch::class);
        (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', 7, 41, 'HOLD-A', 180.0);
    }

    public function test_an_intent_a_stay_carries_is_never_released_and_cannot_be_spent_again(): void
    {
        \Illuminate\Support\Facades\DB::table('booking_mirror')->insert(['organization_id' => 7, 'reservation_id' => 'R-9', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        $stripe = \Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $guard = new PortalPaymentIntentGuard($stripe);

        $guard->release('pi_stay', 7, 41);
        $this->expectException(\App\Services\Booking\PaymentAlreadyUsed::class);
        $guard->assertUnused('pi_stay', 7);
    }

    public function test_assert_still_payable_accepts_requires_capture_and_succeeded(): void
    {
        foreach (['requires_capture', 'succeeded'] as $status) {
            $stripe = Mockery::mock(StripeService::class);
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_x')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_x', 'status' => $status]));
            $stripe->shouldNotReceive('cancelPaymentIntent');

            (new PortalPaymentIntentGuard($stripe))->assertStillPayable('pi_x');
            $this->addToAssertionCount(1);
        }
    }

    public function test_assert_still_payable_refuses_canceled_and_requires_payment_method(): void
    {
        foreach (['canceled', 'requires_payment_method'] as $status) {
            $stripe = Mockery::mock(StripeService::class);
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_x')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_x', 'status' => $status]));
            $stripe->shouldNotReceive('cancelPaymentIntent');

            try {
                (new PortalPaymentIntentGuard($stripe))->assertStillPayable('pi_x');
                $this->fail("status '{$status}' must be refused");
            } catch (PaymentMismatch) {
                $this->addToAssertionCount(1);
            }
        }
    }

    /** Stripe's "no such payment intent" (resource_missing / 404) is a mismatch — trying again can never work — and cancels nothing. */
    public function test_a_missing_intent_is_a_mismatch_not_unverifiable(): void
    {
        $start = CarbonImmutable::parse('2026-10-05T09:00:00Z');
        $calls = [
            'verify'             => fn (PortalPaymentIntentGuard $g) => $g->verify('pi_gone', 7, 9, 11, $start, 54.0),
            'verifyStay'         => fn (PortalPaymentIntentGuard $g) => $g->verifyStay('pi_gone', 7, 41, 'HOLD-A', 180.0),
            'assertStillPayable' => fn (PortalPaymentIntentGuard $g) => $g->assertStillPayable('pi_gone'),
        ];
        foreach ($calls as $name => $call) {
            $stripe = Mockery::mock(StripeService::class);
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_gone')->andThrow(
                \Stripe\Exception\InvalidRequestException::factory("No such payment_intent: 'pi_gone'", 404, null, null, null, 'resource_missing')
            );
            $stripe->shouldNotReceive('cancelPaymentIntent');
            try {
                $call(new PortalPaymentIntentGuard($stripe));
                $this->fail("{$name}: a missing intent must throw");
            } catch (PaymentMismatch $e) {
                $this->assertNotInstanceOf(\App\Services\Booking\PaymentUnverifiable::class, $e, $name);
            }
        }
    }

    /**
     * A retrieve that FAILS is not a mismatch. All three checks throw
     * PaymentUnverifiable (not a PaymentMismatch) and cancel nothing.
     */
    public function test_a_failed_retrieve_is_unverifiable_not_a_mismatch_and_cancels_nothing(): void
    {
        $start = CarbonImmutable::parse('2026-10-05T09:00:00Z');
        $calls = [
            'verify'             => fn (PortalPaymentIntentGuard $g) => $g->verify('pi_x', 7, 9, 11, $start, 54.0),
            'verifyStay'         => fn (PortalPaymentIntentGuard $g) => $g->verifyStay('pi_x', 7, 41, 'HOLD-A', 180.0),
            'assertStillPayable' => fn (PortalPaymentIntentGuard $g) => $g->assertStillPayable('pi_x'),
        ];
        foreach ($calls as $name => $call) {
            $stripe = Mockery::mock(StripeService::class);
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_x')->andThrow(new \RuntimeException('stripe down'));
            $stripe->shouldNotReceive('cancelPaymentIntent');
            try {
                $call(new PortalPaymentIntentGuard($stripe));
                $this->fail("{$name}: a failed retrieve must throw");
            } catch (\App\Services\Booking\PaymentUnverifiable $e) {
                $this->assertNotInstanceOf(PaymentMismatch::class, $e, $name);
            }
        }
    }
}
