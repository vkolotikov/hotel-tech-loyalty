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

        // Payment: expose whether Stripe payment is enabled + publishable key
        $stripe = app(StripeService::class);
        $paymentEnabled = $stripe->isEnabled();

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

        if (!$stripe->isEnabled()) {
            return response()->json(['error' => 'Online payment is not enabled.'], 400);
        }

        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;
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

        $payload = $hold->payload_json;
        $amount = (float) ($payload['gross_total'] ?? 0);
        $unitName = $payload['unit_name'] ?? 'Room';
        $checkIn = $payload['check_in'] ?? '';
        $checkOut = $payload['check_out'] ?? '';

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
        ]);

        // If a payment_intent_id is provided, verify it succeeded before confirming
        if (!empty($validated['payment_intent_id'])) {
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
        $cacheKey = "booking:calendar:v2:{$orgId}:{$validated['start']}:{$validated['end']}";

        $result = \Illuminate\Support\Facades\Cache::remember($cacheKey, 300, function () use ($validated, $availability) {
            return $availability->calendarPrices($validated['start'], $validated['end']);
        });

        return response()->json([
            'prices'       => $result['prices']       ?? [],
            'availability' => $result['availability'] ?? [],
        ]);
    }

    /** POST /v1/booking/webhooks/stripe — Stripe payment webhook receiver. */
    public function stripeWebhook(Request $request): JsonResponse
    {
        $payload = $request->getContent();
        $sigHeader = $request->header('Stripe-Signature', '');

        // Try to verify with any configured webhook secret across all orgs.
        // Stripe sends webhooks without org context, so we check org_id from
        // the PaymentIntent metadata to find the right org's secret.
        $event = null;
        $rawPayload = json_decode($payload, true);
        $orgId = $rawPayload['data']['object']['metadata']['org_id'] ?? null;

        if ($orgId) {
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
        } else {
            // No org context — log and acknowledge (use Log since AuditLog requires org)
            \Illuminate\Support\Facades\Log::info('Stripe webhook without org context', [
                'event_type' => $rawPayload['type'] ?? 'unknown',
            ]);
            return response()->json(['received' => true]);
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
            }

            \App\Models\AuditLog::create([
                'action'       => 'booking.payment.succeeded',
                'subject_type' => 'stripe_payment',
                'subject_id'   => $intent->id,
                'details'      => json_encode([
                    'amount'     => $intent->amount,
                    'currency'   => $intent->currency,
                    'hold_token' => $holdToken,
                ]),
            ]);
        } elseif ($event->type === 'payment_intent.payment_failed') {
            $intent = $event->data->object;

            \App\Models\AuditLog::create([
                'action'       => 'booking.payment.failed',
                'subject_type' => 'stripe_payment',
                'subject_id'   => $intent->id,
                'details'      => json_encode([
                    'amount'        => $intent->amount,
                    'currency'      => $intent->currency,
                    'failure_code'  => $intent->last_payment_error?->code ?? null,
                    'hold_token'    => $intent->metadata->hold_token ?? null,
                ]),
            ]);
        }

        return response()->json(['received' => true]);
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
        $secret = config('services.smoobu.webhook_secret');
        if (!$secret || !hash_equals($secret, (string) $request->header('X-Webhook-Secret', ''))) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = $request->all();
        $action  = $payload['action'] ?? null;
        $data    = $payload['data'] ?? $payload;
        $reservationId = $data['id'] ?? $data['reservation_id'] ?? null;

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
            'subject_id'      => $reservationId,
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
