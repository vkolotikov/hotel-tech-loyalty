<?php

namespace App\Services;

use App\Models\HotelSetting;
use Illuminate\Support\Facades\Log;

/**
 * Per-tenant Stripe service. Reads keys from hotel_settings (org-scoped).
 * Lazily initialised like SmoobuClient — org context may not be bound until
 * the controller method body runs.
 */
class StripeService
{
    private ?\Stripe\StripeClient $client = null;
    private ?string $publishableKey = null;
    private ?string $secretKey = null;
    private ?string $webhookSecret = null;
    private string $currency = 'eur';
    private bool $enabled = false;
    private ?int $loadedForOrg = null;

    private function boot(): void
    {
        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0;
        if ($this->loadedForOrg === $orgId) return;

        $this->publishableKey = $this->setting($orgId, 'stripe_publishable_key', '');
        $this->secretKey      = $this->setting($orgId, 'stripe_secret_key', '');
        $this->webhookSecret  = $this->setting($orgId, 'stripe_webhook_secret', '');
        $this->currency       = $this->setting($orgId, 'stripe_currency', 'eur');
        $this->enabled        = $this->setting($orgId, 'booking_payment_enabled', 'false') === 'true'
                                && !empty($this->secretKey);

        if ($this->enabled) {
            $this->client = new \Stripe\StripeClient($this->secretKey);
        } else {
            $this->client = null;
        }

        $this->loadedForOrg = $orgId;
    }

    public function isEnabled(): bool
    {
        $this->boot();
        return $this->enabled;
    }

    public function publishableKey(): string
    {
        $this->boot();
        return $this->publishableKey ?? '';
    }

    public function currency(): string
    {
        $this->boot();
        return $this->currency;
    }

    /**
     * Create a PaymentIntent for the given amount (in the org's currency).
     *
     * @param float  $amount      Amount in major units (e.g. 150.00 EUR)
     * @param string $description Human-readable description
     * @param array  $metadata    Stripe metadata (booking ref, org, etc.)
     * @return array{client_secret: string, payment_intent_id: string}
     */
    public function createPaymentIntent(float $amount, string $description, array $metadata = []): array
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        // Stripe expects amounts in the smallest currency unit (cents)
        $amountInCents = $this->toSmallestUnit($amount);

        $intent = $this->client->paymentIntents->create([
            'amount'               => $amountInCents,
            'currency'             => strtolower($this->currency),
            'description'          => $description,
            'metadata'             => $metadata,
            'automatic_payment_methods' => ['enabled' => true],
        ]);

        return [
            'client_secret'     => $intent->client_secret,
            'payment_intent_id' => $intent->id,
        ];
    }

    /**
     * Retrieve a PaymentIntent to check its status.
     */
    public function retrievePaymentIntent(string $paymentIntentId): \Stripe\PaymentIntent
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        return $this->client->paymentIntents->retrieve($paymentIntentId);
    }

    /**
     * Verify a Stripe webhook signature.
     */
    public function constructWebhookEvent(string $payload, string $sigHeader): \Stripe\Event
    {
        $this->boot();

        if (empty($this->webhookSecret)) {
            throw new \RuntimeException('Stripe webhook secret not configured.');
        }

        return \Stripe\Webhook::constructEvent($payload, $sigHeader, $this->webhookSecret);
    }

    /**
     * Test the Stripe connection by retrieving the account balance.
     */
    public function testConnection(): array
    {
        $this->boot();

        if (!$this->client) {
            return ['ok' => false, 'error' => 'Stripe secret key not configured'];
        }

        try {
            $balance = $this->client->balance->retrieve();
            return [
                'ok'      => true,
                'message' => 'Connected to Stripe',
                'balance' => collect($balance->available)->map(fn($b) => [
                    'currency' => strtoupper($b->currency),
                    'amount'   => $b->amount / 100,
                ])->toArray(),
            ];
        } catch (\Stripe\Exception\AuthenticationException $e) {
            return ['ok' => false, 'error' => 'Invalid API key'];
        } catch (\Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Convert major-unit amount to Stripe's smallest currency unit.
     * Most currencies use cents (×100), but some (JPY, KRW) are zero-decimal.
     */
    private function toSmallestUnit(float $amount): int
    {
        $zeroDecimal = ['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf'];
        if (in_array(strtolower($this->currency), $zeroDecimal, true)) {
            return (int) round($amount);
        }
        return (int) round($amount * 100);
    }

    private function setting(int $orgId, string $key, string $default): string
    {
        try {
            return HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId ?: null)
                ->where('key', $key)
                ->value('value') ?? $default;
        } catch (\Throwable) {
            return $default;
        }
    }
}
