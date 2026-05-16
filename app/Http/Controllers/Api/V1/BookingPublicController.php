<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Services\AvailabilityService;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public booking widget API — no auth required.
 * Organization is resolved from the widget's org token.
 */
class BookingPublicController extends Controller
{
    /** GET /v1/booking/config — returns units, extras, policies for the widget. */
    public function config(Request $request): JsonResponse
    {
        $this->bindOrg($request);

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Load rooms from DB table (primary) with legacy JSON fallback
        $dbRooms = \App\Models\BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $units = $dbRooms->map(fn($r) => [
            'id' => $r->pms_id ?: (string) $r->id,
            'name' => $r->name,
            'description' => $r->description,
            'short_description' => $r->short_description,
            'max_guests' => $r->max_guests,
            'bedrooms' => $r->bedrooms,
            'bed_type' => $r->bed_type,
            'size' => $r->size,
            'image' => $r->image,
            'gallery' => $r->gallery ?? [],
            'amenities' => $r->amenities ?? [],
            'tags' => $r->tags ?? [],
            'base_price' => (float) $r->base_price,
        ])->values()->toArray();

        // Legacy fallback: check JSON settings (no auto-sync — PMS sync must
        // be triggered explicitly from admin to prevent cross-tenant data leak
        // when a global Smoobu API key falls back for orgs without their own).
        if (empty($units)) {
            $units = $this->getJsonSetting($orgId, 'booking_units', []);
        }

        // Load extras from DB table (primary) with legacy JSON fallback
        $dbExtras = \App\Models\BookingExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $extras = $dbExtras->isNotEmpty()
            ? $dbExtras->map(fn($e) => [
                'id' => (string) $e->id, 'name' => $e->name, 'description' => $e->description,
                'price' => (float) $e->price, 'price_type' => $e->price_type,
                // `lead_time_hours` lets the widget hide extras that
                // can't be prepared in time for the chosen check-in
                // date. The server enforces the same on the quote/
                // confirm path so a manipulated request can't sneak
                // an under-prepared extra through.
                'lead_time_hours' => (int) ($e->lead_time_hours ?? 0),
                'image' => $e->image, 'icon' => $e->icon, 'category' => $e->category,
            ])->values()->toArray()
            : $this->getJsonSetting($orgId, 'booking_extras', []);

        $policies = $this->getJsonSetting($orgId, 'booking_policies', []);

        $currency  = $this->getStringSetting($orgId, 'booking_currency', 'EUR');
        $minNights = (int) $this->getStringSetting($orgId, 'booking_min_nights', '1');
        $maxNights = (int) $this->getStringSetting($orgId, 'booking_max_nights', '30');

        // Resolve branding: booking-specific overrides → appearance (admin branding) → hardcoded fallback
        $brandPrimary = $this->getStringSetting($orgId, 'primary_color', '#2d6a4f');
        $brandLogo    = $this->getStringSetting($orgId, 'company_logo', '');

        $style = [
            'theme'         => $this->getStringSetting($orgId, 'booking_widget_theme', 'light'),
            'primary_color' => $this->getStringSetting($orgId, 'booking_widget_color', '') ?: $brandPrimary,
            'border_radius' => (int) $this->getStringSetting($orgId, 'booking_widget_radius', '12'),
            'font_family'   => $this->getStringSetting($orgId, 'booking_widget_font', ''),
            'button_style'  => $this->getStringSetting($orgId, 'booking_widget_button_style', 'filled'),
            'bg_color'      => $this->getStringSetting($orgId, 'booking_widget_bg_color', ''),
            'text_color'    => $this->getStringSetting($orgId, 'booking_widget_text_color', ''),
            'custom_css'    => $this->getStringSetting($orgId, 'booking_widget_custom_css', ''),
            'show_name'     => $this->getStringSetting($orgId, 'booking_widget_show_name', 'false') === 'true',
            'property_name' => $this->getStringSetting($orgId, 'booking_widget_property_name', ''),
            'show_logo'     => $this->getStringSetting($orgId, 'booking_widget_show_logo', 'false') === 'true',
            'logo_url'      => $this->getStringSetting($orgId, 'booking_widget_logo_url', '') ?: $brandLogo,
        ];

        // Payment: expose whether Stripe payment is enabled + publishable key.
        // Mock mode short-circuits: when on, the widget skips Stripe entirely
        // and the backend stamps the booking as paid without a real charge.
        $stripe        = app(StripeService::class);
        $mockMode      = $this->getStringSetting($orgId, 'booking_mock_mode', 'false') === 'true';

        // Currency-mismatch guard. If the widget quotes in EUR but Stripe
        // is configured for USD, the PaymentIntent would charge $X instead
        // of €X — guest sees one currency, gets billed another, chargeback
        // city. Disable payment when they disagree and surface the
        // mismatch so the admin sees a clear cause in their Network tab.
        $stripeCurrency  = strtolower((string) $stripe->currency());
        $widgetCurrency  = strtolower((string) $currency);
        $currencyMismatch = $stripe->isEnabled()
            && $stripeCurrency !== ''
            && $stripeCurrency !== $widgetCurrency;

        $paymentEnabled = $stripe->isEnabled() && !$mockMode && !$currencyMismatch;

        if ($currencyMismatch) {
            \Illuminate\Support\Facades\Log::warning('Booking widget currency mismatch — online payment disabled', [
                'org_id'           => $orgId,
                'widget_currency'  => $widgetCurrency,
                'stripe_currency'  => $stripeCurrency,
            ]);
        }

        return response()->json([
            'units'      => $units,
            'extras'     => $extras,
            'policies'   => $policies,
            'currency'   => $currency,
            'min_nights' => $minNights,
            'max_nights' => $maxNights,
            'style'      => $style,
            'payment_enabled'      => $paymentEnabled,
            'stripe_publishable_key' => $paymentEnabled ? $stripe->publishableKey() : null,
            'mock_mode'            => $mockMode,
            'currency_mismatch'    => $currencyMismatch,
        ]);
    }

    /** GET /v1/booking/availability — check available units. */
    public function availability(Request $request, AvailabilityService $availability): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'check_in'  => 'required|date|after_or_equal:today',
            'check_out' => 'required|date|after:check_in',
            'adults'    => 'nullable|integer|min:1|max:20',
            'children'  => 'nullable|integer|min:0|max:10',
        ]);

        $results = $availability->check(
            $validated['check_in'],
            $validated['check_out'],
            $validated['adults'] ?? 2,
            $validated['children'] ?? 0,
        );

        return response()->json(['available' => $results]);
    }

    /** GET /v1/booking/unit/{unitId}/rates — rates for a specific unit. */
    public function unitRates(Request $request, string $unitId, AvailabilityService $availability): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'check_in'  => 'required|date',
            'check_out' => 'required|date|after:check_in',
            'adults'    => 'nullable|integer|min:1',
        ]);

        $rates = $availability->unitRates($unitId, $validated['check_in'], $validated['check_out'], $validated['adults'] ?? 2);

        return response()->json($rates ?: ['available' => false]);
    }

    /** POST /v1/booking/quote — create a price hold. */
    public function quote(Request $request, BookingEngineService $booking): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'unit_id'   => 'required|string',
            'check_in'  => 'required|date|after_or_equal:today',
            'check_out' => 'required|date|after:check_in',
            'adults'    => 'nullable|integer|min:1',
            'children'  => 'nullable|integer|min:0',
            'extras'    => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|string',
            'extras.*.quantity' => 'nullable|integer|min:1',
        ]);

        try {
            $quote = $booking->quote($validated);
            return response()->json($quote);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }
    }

    /** POST /v1/booking/payment-intent — create a Stripe PaymentIntent from a hold token. */
    public function paymentIntent(Request $request, StripeService $stripe): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'hold_token' => 'required|string',
        ]);

        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;

        // Mock mode short-circuit. The widget should never reach this
        // endpoint when mock_mode=true (config() returns payment_enabled=false),
        // but if it does — e.g. from a stale frontend — we return a clearly
        // fake intent id so confirm() can recognise it and auto-mark paid.
        if (HotelSetting::getValue('booking_mock_mode') === true || HotelSetting::getValue('booking_mock_mode') === 'true') {
            return response()->json([
                'client_secret'     => 'mock_secret_' . bin2hex(random_bytes(8)),
                'payment_intent_id' => 'pi_mock_' . bin2hex(random_bytes(12)),
                'mock'              => true,
            ]);
        }

        if (!$stripe->isEnabled()) {
            return response()->json(['error' => 'Online payment is not enabled.'], 400);
        }

        // Defense in depth — config() already disables payment_enabled
        // when currencies don't match, but if a stale widget still calls
        // this endpoint we refuse rather than create a mis-currency intent.
        $widgetCurrency = strtolower((string) HotelSetting::getValue('booking_currency', 'EUR'));
        $stripeCurrency = strtolower((string) $stripe->currency());
        if ($stripeCurrency && $stripeCurrency !== $widgetCurrency) {
            return response()->json([
                'error' => 'Payment configuration error: widget currency does not match Stripe currency.',
            ], 400);
        }

        // Detect test/live key mismatch — by far the most common cause
        // of \"We could not retrieve data from the specified Element\".
        // Stripe Elements load with the publishable key on the client
        // side, but PaymentIntents are created with the secret key. If
        // pk is test and sk is live (or vice versa) the iframe loads
        // but can't read the intent — the user sees an empty card form
        // and a confusing IntegrationError. Catch this server-side and
        // return a clear, actionable error.
        $pubKey = (string) $stripe->publishableKey();
        $pubMode = str_starts_with($pubKey, 'pk_live_') ? 'live'
                 : (str_starts_with($pubKey, 'pk_test_') ? 'test' : null);
        // Peek at the secret key without exposing it — just the prefix.
        $secretRow = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'stripe_secret_key')
            ->first();
        $secKey = (string) ($secretRow?->value ?? '');
        $secMode = str_starts_with($secKey, 'sk_live_') ? 'live'
                 : (str_starts_with($secKey, 'sk_test_') ? 'test' : null);
        if ($pubMode && $secMode && $pubMode !== $secMode) {
            return response()->json([
                'error' => "Stripe keys mismatch — your publishable key is in {$pubMode} mode but the secret key is in {$secMode} mode. Open Settings → Integrations and ensure both keys come from the same Stripe account / mode.",
            ], 400);
        }

        if (!$orgId) {
            return response()->json(['error' => 'Organization context required.'], 400);
        }
        $hold = \App\Models\BookingHold::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('hold_token', $validated['hold_token'])
            ->first();

        if (!$hold || !$hold->isActive()) {
            return response()->json(['error' => 'Hold expired or not found. Please start over.'], 400);
        }

        // Extend the hold so a guest sitting on the Stripe Elements payment
        // screen doesn't lose their cart at the 10-min mark.
        $hold->update(['expires_at' => now()->addMinutes(15)]);

        $payload = $hold->payload_json;
        $amount = (float) ($payload['gross_total'] ?? 0);
        $unitName = $payload['unit_name'] ?? 'Room';
        $checkIn = $payload['check_in'] ?? '';
        $checkOut = $payload['check_out'] ?? '';

        // Client can force a fresh intent by passing force_new=true.
        // Used by the widget when the Stripe Element fails to mount on
        // the cached client_secret — bypasses the cache so we don't get
        // stuck on a problematic intent.
        $forceNew = (bool) $request->boolean('force_new', false);

        // Reuse the cached PaymentIntent when it still matches the
        // current amount AND is still in a reusable status. Without
        // the status guard, an intent that's already succeeded or in a
        // terminal state would be returned again — Stripe Elements
        // can't initialise on a finalised intent and the front-end
        // throws "Element not mounted / ready not emitted" the moment
        // confirmPayment fires.
        //
        // Reusable statuses (Stripe docs):
        //   - requires_payment_method (fresh, no method yet)
        //   - requires_confirmation
        //   - requires_action (3DS step incomplete)
        // Terminal / non-reusable:
        //   - processing, succeeded, canceled
        $cachedId      = $payload['stripe_payment_intent_id'] ?? null;
        $cachedSecret  = $payload['stripe_client_secret'] ?? null;
        $cachedAmount  = isset($payload['stripe_amount_cents']) ? (int) $payload['stripe_amount_cents'] : null;
        $currentCents  = (int) round($amount * 100);
        if (!$forceNew && $cachedId && $cachedSecret && $cachedAmount === $currentCents) {
            try {
                $existing = $stripe->retrievePaymentIntent($cachedId);
                $reusable = in_array(
                    $existing->status,
                    ['requires_payment_method', 'requires_confirmation', 'requires_action'],
                    true,
                );
                if ($reusable) {
                    return response()->json([
                        'client_secret'     => $cachedSecret,
                        'payment_intent_id' => $cachedId,
                        'reused'            => true,
                    ]);
                }
                // Terminal status — fall through to create a fresh intent.
                \Illuminate\Support\Facades\Log::info('Cached PaymentIntent not reusable, creating fresh', [
                    'hold_token' => $validated['hold_token'],
                    'old_id'     => $cachedId,
                    'status'     => $existing->status,
                ]);
            } catch (\Throwable $e) {
                // Stripe lookup failed (network / deleted / wrong key) —
                // safer to create a new intent than gamble on a stale one.
                \Illuminate\Support\Facades\Log::warning('Stripe retrieve failed during cache check; creating fresh', [
                    'hold_token' => $validated['hold_token'],
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        try {
            $intent = $stripe->createPaymentIntent(
                $amount,
                "Booking: {$unitName} ({$checkIn} — {$checkOut})",
                [
                    'hold_token' => $validated['hold_token'],
                    'org_id'     => (string) ($orgId ?? ''),
                    'unit_name'  => $unitName,
                    'check_in'   => $checkIn,
                    'check_out'  => $checkOut,
                ],
            );

            // Cache on the hold so subsequent retries return without
            // creating a new Stripe intent.
            $payload['stripe_payment_intent_id'] = $intent['payment_intent_id'] ?? null;
            $payload['stripe_client_secret']     = $intent['client_secret'] ?? null;
            $payload['stripe_amount_cents']      = $currentCents;
            $hold->update(['payload_json' => $payload]);

            return response()->json($intent);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Failed to create payment: ' . $e->getMessage()], 500);
        }
    }

    /** POST /v1/booking/confirm — confirm booking from hold token. */
    public function confirm(Request $request, BookingEngineService $booking): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'hold_token'           => 'required|string',
            'guest.first_name'     => 'required|string|max:100',
            'guest.last_name'      => 'required|string|max:100',
            'guest.email'          => 'required|email',
            'guest.phone'          => 'nullable|string|max:40',
            'payment_method'       => 'nullable|string|max:40',
            'payment_intent_id'    => 'nullable|string|max:255',
            'special_requests'     => 'nullable|string|max:2000',
        ]);

        // Mock mode: any booking confirmed while booking_mock_mode=true gets
        // stamped as paid via the mock channel so it shows up clearly in
        // admin reports as "not a real charge". config() returns
        // payment_enabled=false when mock mode is on so the widget skips
        // Stripe Elements; we stamp here too in case a payment_intent_id
        // does come through (defensive against stale frontends).
        $mockMode = HotelSetting::getValue('booking_mock_mode');
        if ($mockMode === true || $mockMode === 'true') {
            $validated['payment_method'] = 'mock';
            $validated['payment_status'] = 'paid';
            // Fall through to booking creation — skip Stripe verification entirely.
        } elseif (!empty($validated['payment_intent_id'])) {
            // Mock-mode short-circuit. paymentIntent() returns ids prefixed
            // with `pi_mock_` when booking_mock_mode is on; we trust them
            // without contacting Stripe and stamp the booking as paid via
            // the mock channel so admins can spot it later.
            if (str_starts_with($validated['payment_intent_id'], 'pi_mock_')) {
                $validated['payment_method'] = 'mock';
                $validated['payment_status'] = 'paid';
            } else {
                $stripe = app(StripeService::class);
                if ($stripe->isEnabled()) {
                    try {
                        $intent = $stripe->retrievePaymentIntent($validated['payment_intent_id']);
                        if (!in_array($intent->status, ['succeeded', 'requires_capture'])) {
                            return response()->json([
                                'error' => 'Payment has not been completed. Status: ' . $intent->status,
                            ], 400);
                        }
                        // Verify the payment intent belongs to this booking (hold_token in metadata)
                        if (($intent->metadata->hold_token ?? '') !== $validated['hold_token']) {
                            return response()->json([
                                'error' => 'Payment does not match this booking.',
                            ], 400);
                        }
                        // Attach payment method info to the booking data
                        $validated['payment_method'] = 'stripe';
                        $validated['payment_status'] = $intent->status === 'succeeded' ? 'paid' : 'authorized';
                    } catch (\Throwable $e) {
                        return response()->json([
                            'error' => 'Unable to verify payment: ' . $e->getMessage(),
                        ], 400);
                    }
                }
            }
        }

        try {
            $result = $booking->confirm(
                $validated,
                $request->header('Idempotency-Key'),
                $request->header('X-Request-Id'),
                $request->ip(),
            );
            return response()->json($result, 201);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        }
    }

    /** GET /v1/booking/calendar-prices — cheapest per-night price for each day in range. */
    public function calendarPrices(Request $request, AvailabilityService $availability): JsonResponse
    {
        $this->bindOrg($request);

        $validated = $request->validate([
            'start' => 'required|date',
            'end'   => 'required|date|after:start',
        ]);

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        // v2 prefix: response shape changed from array<date,price> to
        // ['prices' => …, 'availability' => …]. Bumping busts pre-shape cache.
        $freshKey = "booking:calendar:v2:{$orgId}:{$validated['start']}:{$validated['end']}";
        // Stale-while-revalidate: keep a longer-lived backup copy keyed
        // separately so a Smoobu outage doesn't blank the widget calendar.
        // Stale TTL of 24h is intentional — even day-old prices are more
        // useful than an empty calendar that breaks the booking funnel.
        $staleKey = "booking:calendar:v2:stale:{$orgId}:{$validated['start']}:{$validated['end']}";

        $cache = \Illuminate\Support\Facades\Cache::store();
        $result = $cache->get($freshKey);
        $isStale = false;

        if ($result === null) {
            try {
                $result = $availability->calendarPrices($validated['start'], $validated['end']);
                // Write both: fresh (5 min) AND stale backup (24h).
                $cache->put($freshKey, $result, 300);
                $cache->put($staleKey, $result, 86400);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('calendarPrices live fetch failed — serving stale if available', [
                    'org_id' => $orgId,
                    'error'  => $e->getMessage(),
                ]);
                $result = $cache->get($staleKey);
                $isStale = true;
            }
        }

        if (!$result) {
            return response()->json(['prices' => [], 'availability' => [], 'stale' => false]);
        }

        return response()->json([
            'prices'       => $result['prices']       ?? [],
            'availability' => $result['availability'] ?? [],
            // Surfaced so the widget can show a discreet "prices may be
            // out of date" notice if the backend is in stale-fallback mode.
            'stale'        => $isStale,
        ]);
    }

    /** POST /v1/booking/webhooks/stripe — Stripe payment webhook receiver. */
    public function stripeWebhook(Request $request): JsonResponse
    {
        $payload = $request->getContent();
        $sigHeader = $request->header('Stripe-Signature', '');

        $rawPayload = json_decode($payload, true);
        $orgId = $this->resolveStripeWebhookOrg($rawPayload);

        if (!$orgId) {
            // No org context — log and acknowledge (use Log since AuditLog requires org)
            \Illuminate\Support\Facades\Log::info('Stripe webhook without org context', [
                'event_type' => $rawPayload['type'] ?? 'unknown',
            ]);
            return response()->json(['received' => true]);
        }

        // Bind the org so StripeService can load the correct keys
        app()->instance('current_organization_id', (int) $orgId);
        $stripe = app(StripeService::class);

        try {
            // Signature verification proves the payload is authentic from Stripe,
            // so the org_id in metadata is trustworthy after this succeeds.
            $event = $stripe->constructWebhookEvent($payload, $sigHeader);
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            return response()->json(['error' => 'Invalid signature'], 400);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Webhook error: ' . $e->getMessage()], 400);
        }

        // Handle relevant events
        if ($event->type === 'payment_intent.succeeded') {
            $intent = $event->data->object;
            $holdToken = $intent->metadata->hold_token ?? null;
            $orgId = $intent->metadata->org_id ?? null;

            // Find the BookingMirror by stripe_payment_intent_id, scoped to the org
            $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
                ->where('organization_id', (int) $orgId)
                ->where('stripe_payment_intent_id', $intent->id)
                ->first();

            if ($mirror && $mirror->payment_status !== 'paid') {
                $mirror->update([
                    'payment_status' => 'paid',
                    'payment_method' => 'stripe',
                    'price_paid'     => $intent->amount / 100,
                ]);
            } elseif (!$mirror && $holdToken && $orgId) {
                // ORPHAN RECOVERY: Stripe charged the guest but our
                // /confirm endpoint never ran (process killed mid-
                // commit, network drop after Stripe but before DB
                // write, etc.). Without recovery, the guest is out of
                // money and has no booking. The metadata we stamped
                // when creating the intent carries enough to
                // reconstruct a mirror row + email the guest.
                try {
                    $hold = \App\Models\BookingHold::withoutGlobalScopes()
                        ->where('organization_id', (int) $orgId)
                        ->where('hold_token', $holdToken)
                        ->first();

                    if ($hold) {
                        // Bind tenant context so any downstream writes
                        // (mirror create, audit log, email send) land
                        // in the right org.
                        app()->instance('current_organization_id', (int) $orgId);

                        $payload = $hold->payload_json ?? [];
                        \App\Models\BookingMirror::create([
                            'organization_id'   => (int) $orgId,
                            'reservation_id'    => 'ORPHAN-' . substr($intent->id, -10),
                            'booking_reference' => 'PI-' . substr($intent->id, -8),
                            'booking_type'      => 'reservation',
                            'booking_state'     => 'confirmed',
                            'apartment_id'      => $payload['unit_id'] ?? null,
                            'apartment_name'    => $payload['unit_name'] ?? ($intent->metadata->unit_name ?? 'Room'),
                            'channel_name'      => 'Website',
                            'guest_name'        => trim(($payload['guest']['first_name'] ?? '') . ' ' . ($payload['guest']['last_name'] ?? '')) ?: ($intent->charges?->data[0]?->billing_details?->name ?? null),
                            'guest_email'       => $payload['guest']['email'] ?? ($intent->charges?->data[0]?->billing_details?->email ?? null),
                            'guest_phone'       => $payload['guest']['phone'] ?? null,
                            'adults'            => $payload['adults'] ?? null,
                            'children'          => $payload['children'] ?? null,
                            'arrival_date'      => $payload['check_in'] ?? ($intent->metadata->check_in ?? null),
                            'departure_date'    => $payload['check_out'] ?? ($intent->metadata->check_out ?? null),
                            'price_total'       => $intent->amount / 100,
                            'price_paid'        => $intent->amount / 100,
                            'payment_status'    => 'paid',
                            'payment_method'    => 'stripe',
                            'stripe_payment_intent_id' => $intent->id,
                            // pending_pms_sync flags it for the retry
                            // cron — Smoobu wasn't called yet.
                            'internal_status'   => 'pending_pms_sync',
                            'synced_at'         => null,
                        ]);

                        \Illuminate\Support\Facades\Log::warning('Stripe orphan recovered — mirror created from PI metadata', [
                            'org_id'     => $orgId,
                            'pi_id'      => $intent->id,
                            'hold_token' => $holdToken,
                        ]);
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::error('Stripe orphan-recovery failed', [
                        'pi_id' => $intent->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            // NOTE: audit_logs.subject_id is unsignedBigInteger — Stripe
            // PI ids ('pi_…') don't fit. Stash the external id in
            // new_values + description, leave subject_id NULL.
            \App\Models\AuditLog::create([
                'action'       => 'booking.payment.succeeded',
                'subject_type' => 'stripe_payment',
                'subject_id'   => null,
                'new_values'   => [
                    'payment_intent_id' => $intent->id,
                    'amount'            => $intent->amount,
                    'currency'          => $intent->currency,
                    'hold_token'        => $holdToken,
                ],
                'description'  => "Stripe PI {$intent->id} succeeded (hold_token={$holdToken})",
            ]);
        } elseif ($event->type === 'payment_intent.payment_failed') {
            $intent = $event->data->object;

            \App\Models\AuditLog::create([
                'action'       => 'booking.payment.failed',
                'subject_type' => 'stripe_payment',
                'subject_id'   => null,
                'new_values'   => [
                    'payment_intent_id' => $intent->id,
                    'amount'             => $intent->amount,
                    'currency'           => $intent->currency,
                    'failure_code'       => $intent->last_payment_error?->code ?? null,
                    'hold_token'         => $intent->metadata->hold_token ?? null,
                ],
                'description'  => "Stripe PI {$intent->id} failed",
            ]);
        } elseif ($event->type === 'charge.refunded') {
            // Refund issued — sync our state. Fires for refunds initiated from
            // the Stripe Dashboard, async settlement reversals, and our own
            // admin refunds (idempotency check below dedupes our own actions).
            $this->handleChargeRefunded($event->data->object);
        } elseif ($event->type === 'charge.dispute.created') {
            // Chargeback opened. Stripe holds the funds pending review. We
            // flag the booking so staff see it — do NOT auto-refund yet,
            // since most disputes are won (i.e. funds released back to us).
            $this->handleChargeDisputeCreated($event->data->object);
        } elseif ($event->type === 'charge.dispute.closed') {
            // Dispute decided. If lost (status='lost'), funds were debited
            // → treat as refunded. If won, restore payment_status to 'paid'.
            $this->handleChargeDisputeClosed($event->data->object);
        }

        return response()->json(['received' => true]);
    }

    /**
     * Resolve the org for a Stripe webhook before signature verification.
     *
     * Path 1 (preferred): metadata.org_id — propagated from PaymentIntent
     * metadata onto Charge events. Works for payment_intent.* and
     * charge.* including charge.refunded.
     *
     * Path 2 (dispute events): Disputes don't carry user metadata, but
     * their payload includes a `payment_intent` field. Look up the
     * BookingMirror by that PI id (cross-tenant scope-less query) and
     * grab its organization_id. Safe because signature verification
     * still happens with the resolved org's secret afterwards — an
     * attacker spoofing a PI id can't make their forged payload
     * verify.
     */
    private function resolveStripeWebhookOrg(?array $rawPayload): ?int
    {
        if (!$rawPayload) return null;
        $metaOrgId = $rawPayload['data']['object']['metadata']['org_id'] ?? null;
        if ($metaOrgId) return (int) $metaOrgId;

        $paymentIntentId = $rawPayload['data']['object']['payment_intent'] ?? null;
        if ($paymentIntentId) {
            $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
                ->where('stripe_payment_intent_id', $paymentIntentId)
                ->first(['organization_id']);
            return $mirror ? (int) $mirror->organization_id : null;
        }

        return null;
    }

    private function handleChargeRefunded(\Stripe\Charge $charge): void
    {
        $paymentIntentId = $charge->payment_intent;
        if (!$paymentIntentId) return;

        $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
            ->where('stripe_payment_intent_id', $paymentIntentId)
            ->first();
        if (!$mirror) return;

        // Find the most recent refund on the charge.
        $refunds = $charge->refunds->data ?? [];
        if (empty($refunds)) return;
        $latest = end($refunds);
        $refundId = is_object($latest) ? $latest->id : ($latest['id'] ?? null);
        $refundAmt = is_object($latest)
            ? $latest->amount / 100
            : (($latest['amount'] ?? 0) / 100);

        // Idempotency: if we already processed this exact refund id
        // (admin-initiated path persists last_refund_id before the webhook
        // can arrive), skip to avoid double-reversing loyalty points or
        // re-sending the email.
        if ($mirror->last_refund_id === $refundId) {
            \Illuminate\Support\Facades\Log::info('Stripe charge.refunded webhook — already processed', [
                'mirror_id' => $mirror->id,
                'refund_id' => $refundId,
            ]);
            return;
        }

        try {
            app(\App\Services\BookingRefundService::class)->applyRefund(
                $mirror,
                $refundAmt,
                $latest->reason ?? ($latest['reason'] ?? 'webhook'),
                $refundId,
                false, // refund already exists on Stripe — don't issue a second one
                null,
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('charge.refunded webhook applyRefund failed', [
                'mirror_id' => $mirror->id,
                'error'     => $e->getMessage(),
            ]);
        }
    }

    private function handleChargeDisputeCreated(\Stripe\Dispute $dispute): void
    {
        $paymentIntentId = $dispute->payment_intent;
        if (!$paymentIntentId) return;

        $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
            ->where('stripe_payment_intent_id', $paymentIntentId)
            ->first();
        if (!$mirror) return;

        try {
            app(\App\Services\BookingRefundService::class)->flagDisputed(
                $mirror,
                $dispute->reason ?? null,
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('charge.dispute.created webhook failed', [
                'mirror_id' => $mirror->id,
                'error'     => $e->getMessage(),
            ]);
        }
    }

    private function handleChargeDisputeClosed(\Stripe\Dispute $dispute): void
    {
        $paymentIntentId = $dispute->payment_intent;
        if (!$paymentIntentId) return;

        $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
            ->where('stripe_payment_intent_id', $paymentIntentId)
            ->first();
        if (!$mirror) return;

        $status = $dispute->status ?? '';

        if ($status === 'lost') {
            // Dispute lost — funds permanently debited. Treat as a full
            // refund (with all the side effects: points reversal, Smoobu
            // cancel, refund email).
            try {
                app(\App\Services\BookingRefundService::class)->applyRefund(
                    $mirror,
                    null,
                    'fraudulent',
                    'dispute_' . $dispute->id,
                    false,
                    null,
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Dispute-lost refund failed', [
                    'mirror_id' => $mirror->id,
                    'error'     => $e->getMessage(),
                ]);
            }
        } elseif (in_array($status, ['won', 'warning_closed'], true)) {
            // Funds reinstated — restore status only if we'd marked it disputed.
            if ($mirror->payment_status === 'disputed') {
                $mirror->update(['payment_status' => 'paid']);
                \App\Models\AuditLog::record('booking_dispute_won', $mirror,
                    ['dispute_id' => $dispute->id, 'status' => $status],
                    ['payment_status' => 'paid'],
                    null,
                    "Stripe dispute resolved in our favour on booking #{$mirror->id}",
                );
            }
        }
    }

    /**
     * POST /v1/booking/webhooks/smoobu — Smoobu webhook receiver.
     *
     * Routes the webhook to the right tenant. Smoobu's webhook is
     * unauthenticated and shared across all customers, so we have
     * to figure out WHICH org / brand the reservation belongs to
     * before upserting. Three resolution paths, in order:
     *
     *   1. Existing mirror — if we already have this reservation_id
     *      in `booking_mirrors`, use its org_id + brand_id. Fast
     *      path for updates / cancellations.
     *
     *   2. Probe each configured Smoobu account — bind the
     *      target's credentials, call getReservation. The account
     *      that returns the reservation owns it.
     *
     *   3. Final fallback — the legacy "first org with a key wins"
     *      behaviour. Only fires when both paths above miss; logged
     *      so we can spot mis-routing if it ever happens.
     *
     * Pre-fix the handler always picked path 3, which silently
     * routed brand B's webhooks to brand A in any multi-brand or
     * multi-tenant deployment — causing exactly the "sync only
     * catches part of bookings" symptom the bulk cron now also
     * fixes.
     */
    public function webhook(Request $request, SmoobuClient $smoobu, BookingEngineService $service): JsonResponse
    {
        // ──────────────────────────────────────────────────────────────
        // Step 1: signature verification.
        //
        // Smoobu lets each org configure their own webhook URL. We
        // require the org to include `?org={widget_token}` in that URL
        // so we can look up THEIR booking_smoobu_webhook_secret from
        // hotel_settings and verify against it. This is per-tenant and
        // beats the previous global env-only secret.
        //
        // Legacy fallback: if no `?org=` query param is present we
        // still accept the env secret so deployments mid-migration
        // keep working. The fallback path is logged so customers
        // know to update their Smoobu webhook URL.
        // ──────────────────────────────────────────────────────────────
        $providedSecret = (string) $request->header('X-Webhook-Secret', '');
        $orgToken = $request->query('org');
        $resolvedOrgId = null;
        $expectedSecret = null;

        if ($orgToken) {
            $org = \App\Models\Organization::where('widget_token', $orgToken)->first(['id']);
            if (!$org) {
                return response()->json(['error' => 'Unknown org token'], 401);
            }
            $resolvedOrgId = (int) $org->id;
            app()->instance('current_organization_id', $resolvedOrgId);
            $expectedSecret = HotelSetting::getValue('booking_smoobu_webhook_secret') ?: null;
        } else {
            \Illuminate\Support\Facades\Log::warning('Smoobu webhook called without ?org= token — falling back to env secret. Customer should update their Smoobu webhook URL.');
            $expectedSecret = config('services.smoobu.webhook_secret');
        }

        if (!$expectedSecret || !hash_equals((string) $expectedSecret, $providedSecret)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = $request->all();
        $action  = $payload['action'] ?? null;
        $data    = $payload['data'] ?? $payload;
        $reservationId = $data['id'] ?? $data['reservation_id'] ?? null;

        // ──────────────────────────────────────────────────────────────
        // Step 2: replay protection.
        //
        // Smoobu doesn't include a per-delivery event ID, so we hash the
        // canonicalised body and insert into smoobu_webhook_events with
        // a unique index on body_hash. Duplicate → 23505 → caught here
        // → return 200 no-op. Smoobu stops retrying.
        // ──────────────────────────────────────────────────────────────
        $bodyHash = \App\Models\SmoobuWebhookEvent::hashBody($payload);
        try {
            \App\Models\SmoobuWebhookEvent::create([
                'organization_id' => $resolvedOrgId,
                'body_hash'       => $bodyHash,
                'action'          => $action ? mb_substr((string) $action, 0, 60) : null,
                'reservation_id'  => $reservationId ? mb_substr((string) $reservationId, 0, 60) : null,
                'received_at'     => now(),
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // 23505 = unique violation. Same body already processed.
            if ($e->getCode() === '23505' || str_contains($e->getMessage(), 'smoobu_webhook_events_body_hash_unique')) {
                \Illuminate\Support\Facades\Log::info('Smoobu webhook replay ignored', [
                    'body_hash'      => $bodyHash,
                    'action'         => $action,
                    'reservation_id' => $reservationId,
                ]);
                return response()->json(['ok' => true, 'note' => 'duplicate event ignored']);
            }
            throw $e;
        }

        // Build the list of (org_id, brand_id) candidates with a
        // configured Smoobu key. Same shape as the cron's
        // syncTargets so a brand-scoped Smoobu account is reachable.
        $candidates = $this->smoobuTargets();
        if (empty($candidates)) {
            \Illuminate\Support\Facades\Log::warning('Smoobu webhook received but no org/brand has API key configured', ['action' => $action]);
            return response()->json(['ok' => true, 'note' => 'no smoobu target configured']);
        }

        // Path 1: existing mirror lookup. If we already know this
        // reservation, route to its owner. Bypass scopes so we can
        // see across tenants.
        $resolved = null;
        if ($reservationId) {
            $existing = \App\Models\BookingMirror::withoutGlobalScopes()
                ->where('reservation_id', (string) $reservationId)
                ->first(['organization_id']);
            if ($existing) {
                foreach ($candidates as $c) {
                    if ($c['org_id'] === (int) $existing->organization_id) {
                        $resolved = $c;
                        break;
                    }
                }
            }
        }

        // Path 2: probe each candidate account by calling
        // getReservation. The one that returns a non-empty body
        // owns the reservation. Skipped if we already found it via
        // path 1 or there's only one candidate (saves an API call
        // in the common single-tenant case).
        if (!$resolved && $reservationId && count($candidates) > 1) {
            foreach ($candidates as $c) {
                app()->instance('current_organization_id', $c['org_id']);
                if (!empty($c['brand_id'])) {
                    app()->instance('current_brand_id', $c['brand_id']);
                } else {
                    app()->forgetInstance('current_brand_id');
                }
                try {
                    $probe = $smoobu->getReservation((string) $reservationId);
                    if (!empty($probe['id'])) {
                        $resolved = $c;
                        break;
                    }
                } catch (\Throwable) {
                    // 404 / auth fail = wrong account, keep going.
                    continue;
                }
            }
        }

        // Path 3: single-candidate fast path or legacy fallback.
        if (!$resolved) {
            $resolved = $candidates[0];
            if (count($candidates) > 1) {
                \Illuminate\Support\Facades\Log::warning('Smoobu webhook fell back to first candidate — reservation not found in any configured account', [
                    'action'         => $action,
                    'reservation_id' => $reservationId,
                    'candidates'     => count($candidates),
                ]);
            }
        }

        $orgId = $resolved['org_id'];
        app()->instance('current_organization_id', $orgId);
        if (!empty($resolved['brand_id'])) {
            app()->instance('current_brand_id', $resolved['brand_id']);
        } else {
            app()->forgetInstance('current_brand_id');
        }

        \App\Models\AuditLog::create([
            'organization_id' => $orgId,
            'action'          => 'booking.webhook.received',
            'subject_type'    => 'booking_mirror',
            'subject_id'      => null, // Smoobu reservation_id is a string; stash in new_values
            'new_values'      => ['reservation_id' => $reservationId, 'action' => $action],
            'description'     => "Webhook: {$action}" . ($reservationId ? " · res #{$reservationId}" : ''),
            'ip_address'      => $request->ip(),
        ]);

        if (!$reservationId) {
            return response()->json(['ok' => true, 'note' => 'no reservation id in payload']);
        }

        try {
            // Re-fetch the full reservation from Smoobu API. The webhook
            // payload shape isn't versioned and missing fields would
            // partially update the mirror; the GET is canonical.
            $full = $smoobu->getReservation((string) $reservationId);
            if (!empty($full['id'])) {
                $service->upsertBookingFromData($full);
            } elseif (!empty($data['id'])) {
                // Fall back to webhook payload if the GET returned empty
                // (rare — happens on cancellations Smoobu may purge).
                $service->upsertBookingFromData($data);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Smoobu webhook upsert failed', [
                'reservation_id' => $reservationId,
                'action'         => $action,
                'error'          => $e->getMessage(),
            ]);
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }

        return response()->json(['ok' => true, 'reservation_id' => $reservationId, 'action' => $action]);
    }

    /**
     * Enumerate every (org_id, brand_id) pair that has a Smoobu API key
     * configured. Mirrors SyncSmoobuBookings::syncTargets() so the
     * webhook handler can probe across multi-brand portfolios.
     *
     * @return array<int, array{org_id:int, brand_id:?int}>
     */
    private function smoobuTargets(): array
    {
        $targets = [];

        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_smoobu_api_key')
            ->whereNotNull('value')
            ->where('value', '!=', '')
            ->pluck('organization_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
        foreach ($orgIds as $orgId) {
            $targets[] = ['org_id' => (int) $orgId, 'brand_id' => null];
        }

        try {
            $brands = \App\Models\Brand::withoutGlobalScopes()
                ->whereNotNull('pms_smoobu_api_key')
                ->where('pms_smoobu_api_key', '!=', '')
                ->get(['id', 'organization_id']);
            foreach ($brands as $brand) {
                $targets[] = [
                    'org_id'   => (int) $brand->organization_id,
                    'brand_id' => (int) $brand->id,
                ];
            }
        } catch (\Throwable) {
            // Brands table missing in legacy installs — ignore.
        }

        return $targets;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function bindOrg(Request $request): void
    {
        if (app()->bound('current_organization_id')) {
            return;
        }

        $token = $request->input('org') ?? $request->header('X-Org-Token');
        if (!$token) return;

        $org = \App\Models\Organization::where('widget_token', $token)->first();
        if ($org) {
            app()->instance('current_organization_id', $org->id);
        }
    }

    private function getStringSetting(?int $orgId, string $key, string $default = ''): string
    {
        if (!$orgId) return $default;

        $value = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->value('value');

        return $value !== null ? (string) $value : $default;
    }

    private function getJsonSetting(?int $orgId, string $key, $default = [])
    {
        if (!$orgId) return $default;

        $value = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->value('value');

        if ($value) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) return $decoded;
        }

        return $default;
    }
}
