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
            // Authorize-then-capture flow. The PI lands in
            // `requires_capture` after stripe.confirmPayment() succeeds on
            // the widget; the booking flow calls capturePaymentIntent()
            // after the BookingMirror is persisted + DB transaction
            // committed. If anything fails between authorisation and
            // capture, the rescue helper cancels the PI and the bank
            // releases the hold within a few days (Stripe's hold window
            // for cards is ~7 days). Customer's statement shows a
            // pending hold, not a captured charge.
            'capture_method'       => 'manual',
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
     * Capture an authorised PaymentIntent (manual-capture flow).
     *
     * Caller MUST verify the PI is in `requires_capture` before invoking
     * — Stripe's capture API throws on any other status. The booking
     * confirm path checks the cached PI status after retrieval and only
     * captures when the status is right.
     *
     * On success the PI flips to `succeeded`. On Stripe outage / bank
     * decline the caller should NOT roll back the BookingMirror — the
     * booking is real, we'll retry the capture via cron within the 7-day
     * authorisation window.
     */
    public function capturePaymentIntent(string $paymentIntentId): \Stripe\PaymentIntent
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        return $this->client->paymentIntents->capture($paymentIntentId);
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

    /**
     * Refund a payment. Defaults to a full refund. Pass $amount in major
     * units (e.g. 50.00) for a partial. Returns the Stripe Refund object
     * so the caller can persist refund_id / status / reason.
     */
    public function refund(string $paymentIntentId, ?float $amount = null, ?string $reason = null): \Stripe\Refund
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        $payload = ['payment_intent' => $paymentIntentId];
        if ($amount !== null) {
            $payload['amount'] = $this->toSmallestUnit($amount);
        }
        // Stripe accepts: 'duplicate', 'fraudulent', 'requested_by_customer'.
        // Anything else gets ignored, but we'd rather not 400 — only attach
        // when the caller passed a recognised value.
        if ($reason && in_array($reason, ['duplicate', 'fraudulent', 'requested_by_customer'], true)) {
            $payload['reason'] = $reason;
        }

        return $this->client->refunds->create($payload);
    }

    /**
     * Load a setting via Eloquent so the model's getValueAttribute accessor
     * runs and decrypts ENCRYPTED_KEYS transparently. Using ->value('value')
     * would skip the accessor and return ciphertext for stripe_* keys.
     */
    private function setting(int $orgId, string $key, string $default): string
    {
        try {
            $row = HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId ?: null)
                ->where('key', $key)
                ->first();
            return $row && $row->value !== null && $row->value !== '' ? $row->value : $default;
        } catch (\Throwable) {
            return $default;
        }
    }
}
