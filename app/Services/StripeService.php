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

        $params = [
            'amount'               => $amountInCents,
            'currency'             => strtolower($this->currency),
            'description'          => $description,
            // Truncate string metadata values to Stripe's documented
            // 500-char limit so an admin-set unit_name with a verbose
            // description can't 400 the create call. Keys are already
            // short (<40 chars) — see callers.
            'metadata'             => collect($metadata)
                ->map(fn ($v) => is_string($v) ? mb_substr($v, 0, 500) : $v)
                ->all(),
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
        ];

        // Stripe Idempotency-Key on PI creation. If callers passed a
        // hold_token in metadata (typical booking flow), derive a stable
        // key from it so a network retry between widget and Stripe can't
        // create a second PI for the same hold. 24h TTL on Stripe's side.
        $reqOpts = [];
        $holdToken = $metadata['hold_token'] ?? null;
        if (is_string($holdToken) && $holdToken !== '') {
            $reqOpts['idempotency_key'] = 'pi_create:' . substr(hash('sha256', $holdToken . ':' . $amountInCents), 0, 56);
        }

        $intent = $this->client->paymentIntents->create($params, $reqOpts ?: null);

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

        // Deterministic idempotency key per PI — safe-retryable. Stripe's
        // capture endpoint is server-side idempotent on the PI but we add
        // the header anyway to harden against SDK-level retries creating
        // distinct request ids.
        return $this->client->paymentIntents->capture($paymentIntentId, [], [
            'idempotency_key' => 'pi_capture:' . $paymentIntentId,
        ]);
    }

    /**
     * Cancel a held PaymentIntent — used by the /confirm rescue path
     * when a booking fails after the auth was reserved but before we
     * captured. Routes credential loading through this service so the
     * BookingPublicController no longer needs to instantiate StripeClient
     * directly (see AUDIT-2026-06-13.md architecture finding).
     *
     * `$cancellationReason` is optional and one of Stripe's documented
     * values (`duplicate`, `fraudulent`, `requested_by_customer`,
     * `abandoned`). Default `abandoned` for our auto-cancel rescues.
     */
    public function cancelPaymentIntent(string $paymentIntentId, string $cancellationReason = 'abandoned'): \Stripe\PaymentIntent
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        return $this->client->paymentIntents->cancel(
            $paymentIntentId,
            ['cancellation_reason' => $cancellationReason],
            ['idempotency_key' => 'pi_cancel:' . $paymentIntentId]
        );
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
    public function refund(
        string $paymentIntentId,
        ?float $amount = null,
        ?string $reason = null,
        ?string $idempotencyKey = null
    ): \Stripe\Refund {
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

        // Stripe Idempotency-Key (audit 2026-06-01 finding A1).
        // If the caller passed a deterministic key, use it. Otherwise
        // derive one from (intent + amount) so a transient retry inside
        // the SDK can't create a duplicate Refund object. The intent-only
        // form is the right key for full refunds; partial refunds need
        // the amount baked in so two distinct partials don't collide.
        $reqOpts = [];
        if ($idempotencyKey === null) {
            $idempotencyKey = 'refund:' . $paymentIntentId
                . ':' . ($amount !== null ? (string) $this->toSmallestUnit($amount) : 'full');
        }
        $reqOpts['idempotency_key'] = $idempotencyKey;

        return $this->client->refunds->create($payload, $reqOpts);
    }

    /**
     * Detect Stripe restricted-key permission failures. Restricted keys
     * (`rk_live_*` / `rk_test_*`) carry a scoped permission grant — refund,
     * dispute, customer.read, etc. When a call hits a scope the key lacks,
     * Stripe returns either a PermissionException OR an InvalidRequestException
     * whose message reads `"The provided key 'rk_live_…' does not have …
     * access to refunds"` or similar.
     *
     * Returns the inferred scope name (e.g. `refunds:write`) when the
     * exception matches the restricted-key error pattern, or null otherwise.
     * Callers should turn a non-null return value into the actionable
     * "open dashboard → enable scope → save" message so ops can self-heal
     * in 30 seconds rather than spelunk Stripe support docs.
     */
    public static function isRestrictedKeyPermissionError(\Throwable $e): ?string
    {
        $msg = $e->getMessage();

        // Stripe-code based detection. Most stable per Stripe's docs
        // (https://docs.stripe.com/keys/restricted-api-keys). The text
        // patterns below are fallbacks for when getStripeCode() isn't set.
        $stripeCode = method_exists($e, 'getStripeCode') ? (string) $e->getStripeCode() : '';
        $httpStatus = method_exists($e, 'getHttpStatus') ? (int) $e->getHttpStatus() : 0;
        $codeMatches = in_array($stripeCode, ['insufficient_permissions', 'permission_denied'], true)
            || ($httpStatus === 403 && $e instanceof \Stripe\Exception\ApiErrorException);

        $matches = $codeMatches
            || $e instanceof \Stripe\Exception\PermissionException
            || (
                $e instanceof \Stripe\Exception\InvalidRequestException
                && (
                    preg_match('/provided key.*does not have.*access/i', $msg)
                    || preg_match('/You do not have permission/i', $msg)
                )
            );

        if (!$matches) {
            return null;
        }

        // Try to pull the resource Stripe complained about out of the
        // message so the caller can map it to a Stripe Dashboard scope id
        // (Stripe's `core_resource:write` taxonomy). Common shapes:
        //   "...does not have access to refunds"
        //   "...does not have the required permissions for this operation. Required: refunds_write"
        //   "...You do not have permission to perform this request on 'refunds'."
        $resource = null;
        if (preg_match('/access to (\w+)/i', $msg, $m)) {
            $resource = strtolower($m[1]);
        } elseif (preg_match('/Required:\s*(\w+)_(read|write)/i', $msg, $m)) {
            return strtolower($m[1]) . ':' . strtolower($m[2]);
        } elseif (preg_match('/on\s+[\'"]([\w_]+)[\'"]/i', $msg, $m)) {
            $resource = strtolower($m[1]);
        }

        // Default to `:write` when the exception class doesn't disambiguate
        // — read-permission failures are vanishingly rare (every read scope
        // is on by default when you mint a restricted key).
        return $resource ? "{$resource}:write" : 'unknown:write';
    }

    /**
     * Build the canonical "fix it in 30 sec" message every Stripe caller
     * should emit when isRestrictedKeyPermissionError() returns non-null.
     * Op-friendly: links straight to the Dashboard page that fixes the
     * problem PLUS the PI's payment row so staff can issue the refund
     * manually from there while the key is still missing the scope.
     */
    public static function restrictedKeyMessage(string $operation, string $scope, ?string $paymentIntentId = null): string
    {
        $msg = "Your restricted Stripe key doesn't have permission for {$operation}. "
            . "Fix in 30 sec: open https://dashboard.stripe.com/apikeys → edit your key → "
            . "enable {$scope} → save.";

        if ($paymentIntentId) {
            $msg .= " Or refund this PI manually at https://dashboard.stripe.com/payments/{$paymentIntentId}.";
        }

        return $msg;
    }

    /**
     * Detect Stripe authentication failures (revoked / rotated key).
     * Distinct from isRestrictedKeyPermissionError — that one is "key is
     * valid but lacks scope". This one is "key is no longer valid at all".
     *
     * Returns true when the exception indicates an auth failure (revoked,
     * rotated, malformed key) — caller should turn that into a "re-paste
     * your Stripe key from https://dashboard.stripe.com/apikeys" message.
     */
    public static function isAuthenticationError(\Throwable $e): bool
    {
        if ($e instanceof \Stripe\Exception\AuthenticationException) {
            return true;
        }
        $stripeCode = method_exists($e, 'getStripeCode') ? (string) $e->getStripeCode() : '';
        $httpStatus = method_exists($e, 'getHttpStatus') ? (int) $e->getHttpStatus() : 0;
        return $httpStatus === 401 && $e instanceof \Stripe\Exception\ApiErrorException
            && !in_array($stripeCode, ['insufficient_permissions', 'permission_denied'], true);
    }

    public static function authenticationErrorMessage(): string
    {
        return 'Your Stripe key was revoked, rotated, or is malformed. '
            . 'Open Settings → Integrations → Stripe and re-paste your secret key from '
            . 'https://dashboard.stripe.com/apikeys.';
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
