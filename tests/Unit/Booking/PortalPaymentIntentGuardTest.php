<?php

namespace Tests\Unit\Booking;

use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\StripeService;
use Carbon\CarbonImmutable;
use Mockery;
use Stripe\PaymentIntent;
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
}
