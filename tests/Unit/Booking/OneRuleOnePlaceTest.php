<?php

namespace Tests\Unit\Booking;

use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\StripeService;
use PHPUnit\Framework\TestCase;

/**
 * One rule, one place — the "real payment intent" rule and the
 * smallest-unit conversion both ways.
 */
class OneRuleOnePlaceTest extends TestCase
{
    public function test_a_real_intent_is_a_non_empty_non_mock_id_with_a_non_mock_method(): void
    {
        $this->assertTrue(PortalPaymentIntentGuard::isRealIntent('pi_123'));
        $this->assertTrue(PortalPaymentIntentGuard::isRealIntent('pi_123', 'stripe'));
        $this->assertFalse(PortalPaymentIntentGuard::isRealIntent(null));
        $this->assertFalse(PortalPaymentIntentGuard::isRealIntent(''));
        $this->assertFalse(PortalPaymentIntentGuard::isRealIntent('pi_mock_abc'));
        $this->assertFalse(PortalPaymentIntentGuard::isRealIntent('pi_123', 'mock'));
    }

    public function test_from_smallest_unit_is_the_inverse_of_to_smallest_unit(): void
    {
        $stripe = new StripeService();
        foreach ([['eur', 54.0, 5400], ['EUR', 180.5, 18050], ['jpy', 5400.0, 5400], ['krw', 12000.0, 12000]] as [$currency, $major, $minor]) {
            $this->assertSame($minor, $stripe->toSmallestUnit($major, $currency), $currency);
            $this->assertSame($major, StripeService::fromSmallestUnit($minor, $currency), $currency);
        }
    }
}
