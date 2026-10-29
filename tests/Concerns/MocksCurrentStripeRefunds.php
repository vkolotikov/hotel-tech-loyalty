<?php

namespace Tests\Concerns;

use Stripe\Refund;

/** Provider state is independent of event delivery: late events never replace this fixture unless explicitly requested. */
trait MocksCurrentStripeRefunds
{
    private array $currentProviderRefunds = [];

    protected function mockCurrentRefunds($stripe): void
    {
        $stripe->shouldReceive('refundsForPaymentIntent')->andReturnUsing(function (string $pi) {
            if (!array_key_exists($pi, $this->currentProviderRefunds)) {
                throw new \RuntimeException('Missing current-provider refund fixture for '.$pi);
            }
            return $this->currentProviderRefunds[$pi];
        });
    }

    protected function providerRefunds(string $pi, array $refunds, string $currency = 'eur'): void
    {
        $this->currentProviderRefunds[$pi] = array_map(fn (array $refund) => Refund::constructFrom($refund + [
            'object' => 'refund', 'payment_intent' => $pi, 'currency' => $currency, 'status' => 'succeeded', 'created' => time(), 'metadata' => [],
        ]), $refunds);
    }
}
