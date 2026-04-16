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

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $holdQuery = \App\Models\BookingHold::where('hold_token', $validated['hold_token']);
        if ($orgId) {
            $holdQuery->where('organization_id', $orgId);
        }
        $hold = $holdQuery->first();

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
        $cacheKey = "booking:calendar:{$orgId}:{$validated['start']}:{$validated['end']}";

        $prices = \Illuminate\Support\Facades\Cache::remember($cacheKey, 300, function () use ($validated, $availability) {
            return $availability->calendarPrices($validated['start'], $validated['end']);
        });

        return response()->json(['prices' => $prices]);
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
                $event = $stripe->constructWebhookEvent($payload, $sigHeader);
            } catch (\Stripe\Exception\SignatureVerificationException $e) {
                return response()->json(['error' => 'Invalid signature'], 400);
            } catch (\Throwable $e) {
                return response()->json(['error' => 'Webhook error: ' . $e->getMessage()], 400);
            }
        } else {
            // No org context — log and acknowledge
            \App\Models\AuditLog::create([
                'action'       => 'booking.payment.webhook_no_org',
                'subject_type' => 'stripe_payment',
                'details'      => json_encode(['event_type' => $rawPayload['type'] ?? 'unknown']),
            ]);
            return response()->json(['received' => true]);
        }

        // Handle relevant events
        if ($event->type === 'payment_intent.succeeded') {
            $intent = $event->data->object;
            $holdToken = $intent->metadata->hold_token ?? null;
            $orgId = $intent->metadata->org_id ?? null;

            // Find the BookingMirror by stripe_payment_intent_id (set during confirm)
            $mirror = \App\Models\BookingMirror::withoutGlobalScopes()
                ->where('stripe_payment_intent_id', $intent->id)
                ->first();

            if ($mirror) {
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

    /** POST /v1/booking/webhooks/smoobu — Smoobu webhook receiver. */
    public function webhook(Request $request): JsonResponse
    {
        $secret = config('services.smoobu.webhook_secret');
        if (!$secret || !hash_equals($secret, (string) $request->header('X-Webhook-Secret', ''))) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        \App\Models\AuditLog::create([
            'action'      => 'booking.webhook.received',
            'subject_type'=> 'booking_mirror',
            'details'     => json_encode($request->all()),
            'ip_address'  => $request->ip(),
        ]);

        return response()->json(['ok' => true]);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function bindOrg(Request $request): void
    {
        if (app()->bound('current_organization_id')) {
            return;
        }

        // Widget passes org via opaque widget_token (preferred) or legacy org_id
        $token = $request->input('org') ?? $request->header('X-Org-Token');
        $orgId = $request->input('org_id') ?? $request->header('X-Org-Id');

        $org = null;
        if ($token) {
            $org = \App\Models\Organization::where('widget_token', $token)->first();
        } elseif ($orgId) {
            // Legacy fallback — will be deprecated
            $org = \App\Models\Organization::find((int) $orgId);
        }

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
