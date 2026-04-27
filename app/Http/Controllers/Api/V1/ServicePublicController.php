<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingExtra;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceCategory;
use App\Models\ServiceExtra;
use App\Models\ServiceMaster;
use App\Models\Organization;
use App\Services\ServiceSchedulingService;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Public services-reservation widget API — no auth required.
 * Organization is resolved from the widget's org token (same scheme as BookingPublicController).
 */
class ServicePublicController extends Controller
{
    /** GET /v1/services/config — returns categories, services, masters, extras, style. */
    public function config(Request $request): JsonResponse
    {
        $this->bindOrg($request);
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if (!$orgId) {
            return response()->json(['error' => 'Organization not found'], 404);
        }

        $categories = ServiceCategory::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'slug', 'description', 'icon', 'image', 'color']);

        $services = Service::withoutGlobalScopes()
            ->with(['masters' => fn($q) => $q->where('service_masters.is_active', true)])
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn($s) => [
                'id'                   => $s->id,
                'category_id'          => $s->category_id,
                'name'                 => $s->name,
                'description'          => $s->description,
                'short_description'    => $s->short_description,
                'duration_minutes'     => $s->duration_minutes,
                'buffer_after_minutes' => $s->buffer_after_minutes,
                'price'                => (float) $s->price,
                'currency'             => $s->currency,
                'image'                => $s->image,
                'gallery'              => $s->gallery ?? [],
                'tags'                 => $s->tags ?? [],
                'master_ids'           => $s->masters->pluck('id')->all(),
            ])
            ->values();

        $masters = ServiceMaster::withoutGlobalScopes()
            ->with(['services:id'])
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn($m) => [
                'id'          => $m->id,
                'name'        => $m->name,
                'title'       => $m->title,
                'bio'         => $m->bio,
                'avatar'      => $m->avatar,
                'specialties' => $m->specialties ?? [],
                'service_ids' => $m->services->pluck('id')->all(),
            ])
            ->values();

        $extras = ServiceExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'name', 'description', 'price', 'price_type', 'duration_minutes', 'image', 'icon', 'category', 'currency']);

        $brandPrimary = $this->getStringSetting($orgId, 'primary_color', '#2d6a4f');
        $brandLogo    = $this->getStringSetting($orgId, 'company_logo', '');

        $style = [
            'theme'         => $this->getStringSetting($orgId, 'services_widget_theme', 'light'),
            'primary_color' => $this->getStringSetting($orgId, 'services_widget_color', '') ?: $brandPrimary,
            'border_radius' => (int) $this->getStringSetting($orgId, 'services_widget_radius', '12'),
            'font_family'   => $this->getStringSetting($orgId, 'services_widget_font', ''),
            'button_style'  => $this->getStringSetting($orgId, 'services_widget_button_style', 'filled'),
            'bg_color'      => $this->getStringSetting($orgId, 'services_widget_bg_color', ''),
            'text_color'    => $this->getStringSetting($orgId, 'services_widget_text_color', ''),
            'custom_css'    => $this->getStringSetting($orgId, 'services_widget_custom_css', ''),
            'show_name'     => $this->getStringSetting($orgId, 'services_widget_show_name', 'false') === 'true',
            'property_name' => $this->getStringSetting($orgId, 'services_widget_property_name', ''),
            'show_logo'     => $this->getStringSetting($orgId, 'services_widget_show_logo', 'false') === 'true',
            'logo_url'      => $this->getStringSetting($orgId, 'services_widget_logo_url', '') ?: $brandLogo,
        ];

        $stripe = app(StripeService::class);
        $paymentEnabled = $stripe->isEnabled();

        return response()->json([
            'categories' => $categories,
            'services'   => $services,
            'masters'    => $masters,
            'extras'     => $extras,
            'currency'   => $this->getStringSetting($orgId, 'services_currency', 'EUR'),
            'lead_minutes' => (int) $this->getStringSetting($orgId, 'services_lead_minutes', '60'),
            'slot_step'    => (int) $this->getStringSetting($orgId, 'services_slot_step', '15'),
            'max_advance_days' => (int) $this->getStringSetting($orgId, 'services_max_advance_days', '60'),
            'allow_master_choice' => $this->getStringSetting($orgId, 'services_allow_master_choice', 'true') === 'true',
            'require_deposit'     => $this->getStringSetting($orgId, 'services_require_deposit', 'false') === 'true',
            'deposit_percent'     => (int) $this->getStringSetting($orgId, 'services_deposit_percent', '100'),
            'cancellation_policy' => $this->getStringSetting($orgId, 'services_cancellation_policy', ''),
            'style'      => $style,
            'payment_enabled'        => $paymentEnabled,
            'stripe_publishable_key' => $paymentEnabled ? $stripe->publishableKey() : null,
        ]);
    }

    /** GET /v1/services/availability?service_id=&master_id=&date=YYYY-MM-DD */
    public function availability(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $this->bindOrg($request);

        $data = $request->validate([
            'service_id' => 'required|integer',
            'master_id'  => 'nullable|integer',
            'date'       => 'required|date|after_or_equal:today',
        ]);

        $service = Service::findOrFail($data['service_id']);
        $orgId = app('current_organization_id');
        $leadMinutes = (int) $this->getStringSetting($orgId, 'services_lead_minutes', '60');
        $stepMinutes = (int) $this->getStringSetting($orgId, 'services_slot_step', '15');

        $slots = $scheduler->availableSlots(
            $service,
            $data['date'],
            $data['master_id'] ?? null,
            $stepMinutes,
            $leadMinutes,
        );

        return response()->json(['slots' => $slots]);
    }

    /** GET /v1/services/calendar?service_id=&master_id=&start=&end= */
    public function calendar(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $this->bindOrg($request);

        $data = $request->validate([
            'service_id' => 'required|integer',
            'master_id'  => 'nullable|integer',
            'start'      => 'required|date',
            'end'        => 'required|date|after:start',
        ]);

        $service = Service::findOrFail($data['service_id']);
        $dates = $scheduler->availableDates($service, $data['start'], $data['end'], $data['master_id'] ?? null);

        return response()->json(['available_dates' => $dates]);
    }

    /** POST /v1/services/quote — returns price breakdown without reserving. */
    public function quote(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $this->bindOrg($request);

        $data = $request->validate([
            'service_id'        => 'required|integer',
            'service_master_id' => 'nullable|integer',
            'start_at'          => 'required|date',
            'party_size'        => 'nullable|integer|min:1|max:50',
            'extras'            => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|integer',
            'extras.*.quantity' => 'nullable|integer|min:1|max:50',
        ]);

        $service = Service::findOrFail($data['service_id']);

        try {
            $reservation = $scheduler->reserveSlot(
                $service,
                $data['service_master_id'] ?? null,
                $data['start_at'],
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }

        $partySize = (int) ($data['party_size'] ?? 1);
        $servicePrice = (float) $reservation['price'];

        $extrasBreakdown = [];
        $extrasTotal = 0;
        if (!empty($data['extras'])) {
            $extraIds = collect($data['extras'])->pluck('id')->all();
            $extras = ServiceExtra::whereIn('id', $extraIds)->get()->keyBy('id');
            foreach ($data['extras'] as $line) {
                $extra = $extras->get($line['id']);
                if (!$extra) continue;
                $qty = (int) ($line['quantity'] ?? 1);
                $multiplier = $extra->price_type === 'per_person' ? $partySize * $qty : $qty;
                $lineTotal = round((float) $extra->price * $multiplier, 2);
                $extrasTotal += $lineTotal;
                $extrasBreakdown[] = [
                    'id'         => $extra->id,
                    'name'       => $extra->name,
                    'unit_price' => (float) $extra->price,
                    'quantity'   => $qty,
                    'line_total' => $lineTotal,
                ];
            }
        }

        return response()->json([
            'service' => [
                'id'    => $service->id,
                'name'  => $service->name,
                'price' => $servicePrice,
            ],
            'master' => [
                'id'   => $reservation['master']->id,
                'name' => $reservation['master']->name,
            ],
            'start_at'         => $reservation['start']->toIso8601String(),
            'end_at'           => $reservation['end']->toIso8601String(),
            'duration_minutes' => $reservation['duration_minutes'],
            'service_price'    => $servicePrice,
            'extras'           => $extrasBreakdown,
            'extras_total'     => round($extrasTotal, 2),
            'total_amount'     => round($servicePrice + $extrasTotal, 2),
            'currency'         => $service->currency ?: 'EUR',
        ]);
    }

    /** POST /v1/services/payment-intent */
    public function paymentIntent(Request $request, ServiceSchedulingService $scheduler, StripeService $stripe): JsonResponse
    {
        $this->bindOrg($request);

        $data = $request->validate([
            'service_id'        => 'required|integer',
            'service_master_id' => 'nullable|integer',
            'start_at'          => 'required|date',
            'party_size'        => 'nullable|integer|min:1|max:50',
            'extras'            => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|integer',
            'extras.*.quantity' => 'nullable|integer|min:1|max:50',
        ]);

        if (!$stripe->isEnabled()) {
            return response()->json(['error' => 'Online payment is not enabled.'], 400);
        }

        $service = Service::findOrFail($data['service_id']);

        try {
            $reservation = $scheduler->reserveSlot(
                $service,
                $data['service_master_id'] ?? null,
                $data['start_at'],
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }

        $total = $this->computeTotal($service, $reservation, $data);
        $orgId = app('current_organization_id');

        try {
            $intent = $stripe->createPaymentIntent(
                $total,
                "Service booking: {$service->name}",
                [
                    'org_id'     => (string) $orgId,
                    'service_id' => (string) $service->id,
                    'start_at'   => $reservation['start']->toIso8601String(),
                    'kind'       => 'service_booking',
                ],
            );
            return response()->json($intent);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Failed to create payment: ' . $e->getMessage()], 500);
        }
    }

    /** POST /v1/services/confirm — create the booking. */
    public function confirm(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $this->bindOrg($request);

        $data = $request->validate([
            'service_id'        => 'required|integer',
            'service_master_id' => 'nullable|integer',
            'start_at'          => 'required|date',
            'party_size'        => 'nullable|integer|min:1|max:50',
            'customer_name'     => 'required|string|max:200',
            'customer_email'    => 'required|email|max:255',
            'customer_phone'    => 'nullable|string|max:40',
            'customer_notes'    => 'nullable|string|max:2000',
            'extras'            => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|integer',
            'extras.*.quantity' => 'nullable|integer|min:1|max:50',
            'payment_intent_id' => 'nullable|string|max:255',
        ]);

        $orgId = app('current_organization_id');
        $idempotency = $request->header('Idempotency-Key');

        // Idempotent replay
        if ($idempotency) {
            $existing = ServiceBookingSubmission::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('idempotency_key', $idempotency)
                ->where('outcome', 'success')
                ->first();
            if ($existing && $existing->service_booking_id) {
                $booking = ServiceBooking::find($existing->service_booking_id);
                if ($booking) {
                    return response()->json([
                        'booking_reference' => $booking->booking_reference,
                        'booking'           => $booking->load(['service', 'master', 'extras']),
                        'replayed'          => true,
                    ]);
                }
            }
        }

        $service = Service::findOrFail($data['service_id']);

        // If a payment_intent_id is provided, verify it
        $paymentStatus = 'unpaid';
        if (!empty($data['payment_intent_id'])) {
            $stripe = app(StripeService::class);
            if ($stripe->isEnabled()) {
                try {
                    $intent = $stripe->retrievePaymentIntent($data['payment_intent_id']);
                    if (!in_array($intent->status, ['succeeded', 'requires_capture'])) {
                        return response()->json(['error' => 'Payment has not been completed.'], 400);
                    }
                    $paymentStatus = $intent->status === 'succeeded' ? 'paid' : 'authorized';
                } catch (\Throwable $e) {
                    return response()->json(['error' => 'Unable to verify payment: ' . $e->getMessage()], 400);
                }
            }
        }

        // Serialize slot claims per master (or per service when master is "any")
        // using a PG advisory xact lock. Two concurrent confirms for the same
        // master would otherwise both pass reserveSlot's SELECT-only check and
        // both insert overlapping bookings.
        $lockKey = !empty($data['service_master_id'])
            ? "svcm:{$data['service_master_id']}"
            : "svc:{$service->id}";

        try {
            $booking = DB::transaction(function () use ($data, $service, $scheduler, $orgId, $paymentStatus, $lockKey) {
                DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$lockKey]);

                // Re-run the conflict check inside the lock — definitive source of truth.
                $reservation = $scheduler->reserveSlot(
                    $service,
                    $data['service_master_id'] ?? null,
                    $data['start_at'],
                );

                $partySize = (int) ($data['party_size'] ?? 1);
                $servicePrice = (float) $reservation['price'];

                $extrasTotal = 0;
                $extraRows = [];
                if (!empty($data['extras'])) {
                    $extraIds = collect($data['extras'])->pluck('id')->all();
                    $extraModels = ServiceExtra::whereIn('id', $extraIds)->get()->keyBy('id');
                    foreach ($data['extras'] as $line) {
                        $extra = $extraModels->get($line['id']);
                        if (!$extra) continue;
                        $qty = (int) ($line['quantity'] ?? 1);
                        $multiplier = $extra->price_type === 'per_person' ? $partySize * $qty : $qty;
                        $lineTotal = round((float) $extra->price * $multiplier, 2);
                        $extrasTotal += $lineTotal;
                        $extraRows[] = [
                            'extra' => $extra,
                            'quantity' => $qty,
                            'line_total' => $lineTotal,
                        ];
                    }
                }

                $booking = ServiceBooking::create([
                    'organization_id'   => $orgId,
                    'service_id'        => $service->id,
                    'service_master_id' => $reservation['master']->id,
                    'customer_name'     => $data['customer_name'],
                    'customer_email'    => strtolower(trim($data['customer_email'])),
                    'customer_phone'    => $data['customer_phone'] ?? null,
                    'party_size'        => $partySize,
                    'start_at'          => $reservation['start'],
                    'end_at'            => $reservation['end'],
                    'duration_minutes'  => $reservation['duration_minutes'],
                    'service_price'     => $servicePrice,
                    'extras_total'      => $extrasTotal,
                    'total_amount'      => round($servicePrice + $extrasTotal, 2),
                    'currency'          => $service->currency ?: 'EUR',
                    'status'            => 'confirmed',
                    'payment_status'    => $paymentStatus,
                    'stripe_payment_intent_id' => $data['payment_intent_id'] ?? null,
                    'source'            => 'widget',
                    'customer_notes'    => $data['customer_notes'] ?? null,
                ]);

                foreach ($extraRows as $row) {
                    ServiceBookingExtra::create([
                        'organization_id'    => $orgId,
                        'service_booking_id' => $booking->id,
                        'service_extra_id'   => $row['extra']->id,
                        'name'               => $row['extra']->name,
                        'unit_price'         => $row['extra']->price,
                        'quantity'           => $row['quantity'],
                        'line_total'         => $row['line_total'],
                    ]);
                }

                return $booking;
            });
        } catch (\RuntimeException $e) {
            // reserveSlot threw — the requested slot was taken by a concurrent
            // confirm while we were waiting for the advisory lock.
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => 'Failed to create booking: ' . $e->getMessage()], 500);
        }

        $this->logSubmission($orgId, $idempotency, $data, $booking->id, 'success');

        // ── Transactional emails ───────────────────────────────────────────
        // 1) Service confirmation goes to every booking, no questions asked.
        // 2) Membership-welcome only fires when the guest has no `welcomed_at`
        //    stamp on their LoyaltyMember row — same rule the room-booking
        //    flow uses, so a returning guest never gets a duplicate
        //    "set your password" email after every transaction.
        $this->sendServiceBookingEmails($booking->load(['service', 'master', 'extras']), $orgId);

        return response()->json([
            'booking_reference' => $booking->booking_reference,
            'booking'           => $booking->load(['service', 'master', 'extras']),
        ], 201);
    }

    /**
     * Send confirmation + (conditional) membership welcome after a service
     * booking is committed. Every send is wrapped in its own try/catch so
     * a transient SMTP failure can't 500 a successful booking.
     */
    private function sendServiceBookingEmails(\App\Models\ServiceBooking $booking, int $orgId): void
    {
        $email = strtolower(trim($booking->customer_email));
        if ($email === '') return;

        $guestName = $booking->customer_name ?: 'Guest';
        $org = \App\Models\Organization::find($orgId);
        $hotelName = $org->name ?? 'Our Hotel';
        $supportEmail = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'support_email')
            ->value('value') ?: 'support@hotel-tech.ai';
        $cancellationPolicy = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'service_cancellation_policy')
            ->value('value') ?: null;

        // Auto-enrol the guest as a Bronze member so subsequent flows can
        // recognise them and so the membership-welcome rule has a record
        // to stamp. Mirrors what the room-booking flow does on every
        // submission.
        try {
            $guest = \App\Models\Guest::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('email', $email)
                ->first();
            if (!$guest) {
                $nameParts = explode(' ', $guestName, 2);
                $guest = \App\Models\Guest::create([
                    'organization_id' => $orgId,
                    'first_name'      => $nameParts[0] ?? '',
                    'last_name'       => $nameParts[1] ?? '',
                    'full_name'       => $guestName,
                    'email'           => $email,
                    'phone'           => $booking->customer_phone,
                    'guest_type'      => 'Individual',
                    'lead_source'     => 'Service Widget',
                    'last_activity_at'=> now(),
                ]);
                // Guest::created event hook will auto-enrol the member.
            }
        } catch (\Throwable $e) {
            \Log::warning('Service booking guest auto-enrol failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }

        // 1) Confirmation email
        try {
            $extrasBreakdown = $booking->extras->map(fn($x) => [
                'name'       => $x->name,
                'quantity'   => (int) $x->quantity,
                'line_total' => (float) $x->line_total,
            ])->toArray();

            \Illuminate\Support\Facades\Mail::to($email)
                ->send(new \App\Mail\ServiceBookingConfirmationMail(
                    guestName: $guestName,
                    hotelName: $hotelName,
                    bookingReference: $booking->booking_reference ?? '—',
                    serviceName: $booking->service?->name ?? 'Service',
                    masterName: $booking->master?->name,
                    startAt: $booking->start_at?->toIso8601String() ?? '',
                    durationMinutes: (int) $booking->duration_minutes,
                    partySize: (int) $booking->party_size,
                    servicePrice: (float) $booking->service_price,
                    extrasTotal: (float) $booking->extras_total,
                    grossTotal: (float) $booking->total_amount,
                    currency: $booking->currency ?? 'EUR',
                    extras: $extrasBreakdown,
                    cancellationPolicy: $cancellationPolicy,
                    supportEmail: $supportEmail,
                ));
        } catch (\Throwable $e) {
            \Log::warning('Service booking confirmation email failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }

        // 2) Membership welcome — only on first contact (welcomed_at null).
        try {
            $member = \App\Models\LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereHas('user', fn($q) => $q->where('email', $email))
                ->with(['user', 'tier'])
                ->first();

            if ($member && $member->welcomed_at === null) {
                $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

                \App\Models\EmailVerificationCode::create([
                    'email'      => $email,
                    'code'       => $code,
                    'expires_at' => now()->addHours(48),
                ]);

                \Illuminate\Support\Facades\Mail::to($email)
                    ->send(new \App\Mail\BookingMembershipMail(
                        guestName: $guestName,
                        hotelName: $hotelName,
                        memberNumber: $member->member_number,
                        tierName: $member->tier?->name ?? 'Bronze',
                        email: $email,
                        code: $code,
                        supportEmail: $supportEmail,
                    ));

                $member->forceFill(['welcomed_at' => now()])->save();
            }
        } catch (\Throwable $e) {
            \Log::warning('Service booking membership email failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function computeTotal(Service $service, array $reservation, array $data): float
    {
        $partySize = (int) ($data['party_size'] ?? 1);
        $total = (float) $reservation['price'];

        if (!empty($data['extras'])) {
            $extraIds = collect($data['extras'])->pluck('id')->all();
            $extras = ServiceExtra::whereIn('id', $extraIds)->get()->keyBy('id');
            foreach ($data['extras'] as $line) {
                $extra = $extras->get($line['id']);
                if (!$extra) continue;
                $qty = (int) ($line['quantity'] ?? 1);
                $multiplier = $extra->price_type === 'per_person' ? $partySize * $qty : $qty;
                $total += round((float) $extra->price * $multiplier, 2);
            }
        }

        return round($total, 2);
    }

    private function logSubmission(?int $orgId, ?string $idempotency, array $data, ?int $bookingId, string $outcome, ?string $error = null): void
    {
        if (!$orgId) return;
        try {
            ServiceBookingSubmission::withoutGlobalScopes()->create([
                'organization_id'    => $orgId,
                'idempotency_key'    => $idempotency,
                'source'             => 'widget',
                'outcome'            => $outcome,
                'service_booking_id' => $bookingId,
                'customer_email'     => $data['customer_email'] ?? null,
                'customer_name'      => $data['customer_name'] ?? null,
                'request_payload'    => $data,
                'error_message'      => $error,
            ]);
        } catch (\Throwable) {
            // swallow — submission log must never block the booking
        }
    }

    private function bindOrg(Request $request): void
    {
        if (app()->bound('current_organization_id')) {
            return;
        }

        $token = $request->input('org') ?? $request->header('X-Org-Token');
        if (!$token) return;

        $org = Organization::where('widget_token', $token)->first();
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
}
