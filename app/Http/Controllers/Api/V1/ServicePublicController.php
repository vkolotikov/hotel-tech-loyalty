<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingExtra;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceExtra;
use App\Models\Organization;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Money\DepositRefused;
use App\Services\Appointments\Money\Deposits;
use App\Services\Booking\ExtraLeadTimeException;
use App\Services\Booking\PaymentAlreadyUsed;
use App\Services\Booking\ServiceCatalogue;
use App\Services\Booking\ServiceQuoteBuilder;
use App\Services\Booking\VenueNotice;
use App\Services\ServiceSchedulingService;
use App\Services\StripeService;
use Illuminate\Database\UniqueConstraintViolationException;
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

        $cat = app(ServiceCatalogue::class)->build($orgId);

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

        // Mock mode short-circuits payment_enabled for services the same
        // way it does for rooms — widget skips Stripe Elements entirely,
        // confirm() stamps payment_method='mock'.
        $stripe        = app(StripeService::class);
        $mockMode      = $this->getStringSetting($orgId, 'booking_mock_mode', 'false') === 'true';
        $paymentEnabled = $stripe->isEnabled() && !$mockMode;

        return response()->json(array_merge(
            [
                'categories' => $cat['categories'],
                'services'   => $cat['services'],
                'masters'    => $cat['masters'],
                'extras'     => $cat['extras'],
            ],
            $cat['rules'],
            [
                'require_deposit'     => $this->getStringSetting($orgId, 'services_require_deposit', 'false') === 'true',
                'deposit_percent'     => (int) $this->getStringSetting($orgId, 'services_deposit_percent', '100'),
                'style'      => $style,
                'payment_enabled'        => $paymentEnabled,
                'stripe_publishable_key' => $paymentEnabled ? $stripe->publishableKey() : null,
                'mock_mode'              => $mockMode,
            ],
        ));
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

        // The notice counts from the venue's own now (the scheduler's filter
        // would compare wall-clock digits with the UTC now; see VenueNotice).
        $slots = VenueNotice::filter(
            $scheduler->availableSlots($service, $data['date'], $data['master_id'] ?? null, $stepMinutes, VenueNotice::SCHEDULER_LEAD_OFF),
            (int) $orgId,
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
    public function quote(Request $request): JsonResponse
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
            $q = app(ServiceQuoteBuilder::class)->build(
                $service,
                $data['service_master_id'] ?? null,
                $data['start_at'],
                (int) ($data['party_size'] ?? 1),
                $data['extras'] ?? [],
            );
        } catch (ExtraLeadTimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }

        $deposit = Deposits::termsFor((float) $q['list_total'], (string) $q['currency']);

        return response()->json([
            'service' => [
                'id'    => $service->id,
                'name'  => $service->name,
                'price' => $q['service_price'],
            ],
            'master' => [
                'id'   => $q['master']->id,
                'name' => $q['master']->name,
            ],
            'start_at'         => $q['start']->toIso8601String(),
            'end_at'           => $q['end']->toIso8601String(),
            'duration_minutes' => $q['duration_minutes'],
            'service_price'    => $q['service_price'],
            'extras'           => $q['extras'],
            'extras_total'     => $q['extras_total'],
            'total_amount'     => $q['list_total'],
            'currency'         => $q['currency'],
        // Part H: what the booking page asks for now, at a venue that takes deposits.
        ] + ($deposit !== null ? ['deposit' => $deposit] : []));
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
            // Part H: the deposit step sends the client's details first, so a mistyped email is answered before a card
            // is held — with confirm()'s own rules.
            'customer_name'     => 'sometimes|required|string|max:200',
            'customer_email'    => 'sometimes|required|email|max:255',
            'customer_phone'    => 'sometimes|nullable|string|max:40',
            'customer_notes'    => 'sometimes|nullable|string|max:2000',
        ]);

        // Mock mode short-circuit — return a fake intent so a stale widget
        // still completes. config() returns payment_enabled=false in mock
        // mode so the widget normally won't call this endpoint.
        $mockMode = HotelSetting::getValue('booking_mock_mode');
        if ($mockMode === true || $mockMode === 'true') {
            return response()->json([
                'client_secret'     => 'mock_secret_' . bin2hex(random_bytes(8)),
                'payment_intent_id' => 'pi_mock_' . bin2hex(random_bytes(12)),
                'mock'              => true,
            ]);
        }

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
            // computeTotal() now re-derives the total through
            // ServiceQuoteBuilder, which re-validates extra lead times —
            // ExtraLeadTimeException extends RuntimeException, so it is
            // caught here too and answered as the same 409 a slot
            // conflict already gets. Distinguishing it as a 422 is
            // quote()'s job this phase, not payment-intent's.
            $total = $this->computeTotal($service, $reservation, $data);
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }

        $orgId = app('current_organization_id');

        // Part H: at a venue that takes deposits the intent is for the deposit only — the server's figure, held on
        // the card (manual capture, no redirect methods) until confirm() saves the booking and charges it.
        $deposit = Deposits::termsFor((float) $total, (string) ($service->currency ?: 'EUR'));
        if ($deposit !== null) {
            try {
                $intent = $stripe->createPaymentIntent(
                    $deposit['amount'],
                    "Deposit: {$service->name}",
                    [
                        'org_id'     => (string) $orgId,
                        'service_id' => (string) $service->id,
                        'start_at'   => $reservation['start']->toIso8601String(),
                        'kind'       => Deposits::KIND,
                        'source'     => Deposits::SOURCE,
                    ],
                    ['allow_redirects' => 'never'],
                );

                return response()->json($intent + ['deposit' => $deposit]);
            } catch (\Throwable $e) {
                return response()->json(['error' => 'Failed to create payment: ' . $e->getMessage()], 500);
            }
        }

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
            // Attribution (template fidelity phase 6.7). The widget has read
            // `?source=` and posted it since the mobile app's WebView needed
            // 'mobile_app', but this rule was missing, so validate() dropped
            // the field and every booking below was stamped 'widget' -- and
            // the owner had no way to answer "is the landing page actually
            // producing bookings?". A landing page sends 'landing'.
            'source'            => self::SOURCE_RULES,
        ]);

        $source = self::bookingSource($data);

        $orgId = app('current_organization_id');
        $idempotency = $request->header('Idempotency-Key');

        // Idempotent replay
        if ($idempotency) {
            // Portal success rows live in the same table (source
            // 'member_portal') and are keyed by the authenticated member's
            // own idempotency key — an unauthenticated widget caller must
            // never be able to fish one back out by guessing/reusing that
            // key, so this replay is refused anything but a widget's own
            // row (no source, or a source that isn't the portal's).
            $existing = ServiceBookingSubmission::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('idempotency_key', $idempotency)
                ->where('outcome', 'success')
                ->where(fn ($q) => $q->whereNull('source')->orWhere('source', '!=', 'member_portal'))
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

        // Mock mode — any service booking confirmed while booking_mock_mode
        // is on gets stamped as paid via the mock channel so it surfaces
        // clearly in admin reports as "not a real charge". Mirrors the
        // pattern used in BookingPublicController::confirm().
        $mockMode = HotelSetting::getValue('booking_mock_mode');
        $isMockBooking = ($mockMode === true || $mockMode === 'true');

        // If a payment_intent_id is provided, verify it
        $intent = null; // Part H: kept for the deposit check in the lock
        $paymentStatus = 'unpaid';
        if ($isMockBooking) {
            $paymentStatus = 'paid';
        } elseif (!empty($data['payment_intent_id'])) {
            // Mock prefix in case a stale frontend hit /payment-intent while
            // mock mode was on — trust the prefix, skip Stripe verification.
            if (str_starts_with($data['payment_intent_id'], 'pi_mock_')) {
                $paymentStatus = 'paid';
                $isMockBooking = true;
            } else {
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
        }

        // Serialize slot claims per master (or per service when master is "any")
        // using a PG advisory xact lock. Two concurrent confirms for the same
        // master would otherwise both pass reserveSlot's SELECT-only check and
        // both insert overlapping bookings.
        $lockKey = !empty($data['service_master_id'])
            ? "svcm:{$data['service_master_id']}"
            : "svc:{$service->id}";

        try {
            $booking = DB::transaction(function () use ($data, $service, $scheduler, $orgId, $paymentStatus, $lockKey, $source, $intent) {
                \App\Support\AdvisoryLock::within($lockKey);

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
                    $extraModels = ServiceExtra::whereIn('id', $extraIds)->where('is_active', true)->get()->keyBy('id');

                    // Same lead-time guard as quote() — if a guest skipped
                    // quote (or quote was issued earlier than the lead
                    // window now permits) we still refuse to book.
                    $startTs = VenueNotice::instant($reservation['start'], (int) app('current_organization_id'))->getTimestamp();
                    $hoursUntilStart = max(0, (int) (($startTs - time()) / 3600));
                    foreach ($data['extras'] as $line) {
                        $extra = $extraModels->get($line['id']);
                        if (!$extra) continue;
                        $required = (int) ($extra->lead_time_hours ?? 0);
                        if ($required > 0 && $hoursUntilStart < $required) {
                            throw new \RuntimeException(
                                "\"{$extra->name}\" requires at least {$required}h notice before the service starts."
                            );
                        }
                    }

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

                // One payment pays for one booking: a payment a booking of
                // this organisation already carries is refused before the
                // insert, a mock id (`pi_mock_`) as much as a real one.
                $paymentIntentId = (string) ($data['payment_intent_id'] ?? '');
                if ($paymentIntentId !== ''
                    && ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $paymentIntentId)->exists()) {
                    throw new PaymentAlreadyUsed();
                }

                // Part H: a venue that takes deposits needs this booking's own deposit, held on the card, before the
                // booking is saved — worked out here from the price in the lock, never taken from the page. Only the
                // venue's real test mode skips it (termsFor() knows it); a made-up `pi_mock_` id does not.
                $deposit = Deposits::termsFor(round($servicePrice + $extrasTotal, 2), (string) ($service->currency ?: 'EUR'));
                if ($deposit !== null) {
                    Deposits::assertPays($intent, $deposit, (int) $orgId, (int) $service->id, $reservation['start']);
                } elseif ($intent !== null && (Deposits::metadataOf($intent)['kind'] ?? null) === Deposits::KIND) {
                    // A deposit pays only a booking that takes one: switched off or repriced since the card form, it must
                    // not pass for the whole price.
                    throw new DepositRefused('deposit_mismatch', 'The deposit does not match this booking. Your card was not charged; please try again.');
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
                    'source'            => $source,
                    'customer_notes'    => $data['customer_notes'] ?? null,
                ] + ($deposit !== null ? ['meta' => ['deposit' => ['amount' => $deposit['amount'], 'percent' => $deposit['percent'], 'cancel_hours' => $deposit['cancel_hours']]]] : []));

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
        } catch (DepositRefused $e) {
            if ($e->reason === 'deposit_mismatch') {
                $this->releaseDeposit($intent, $orgId);
            }
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->reason);
            return response()->json(['error' => $e->getMessage(), 'code' => $e->reason], 422);
        } catch (PaymentAlreadyUsed) {
            return $this->paymentAlreadyUsed($orgId, $idempotency, $data);
        } catch (UniqueConstraintViolationException $e) {
            // Two confirms naming the same payment at the same moment both pass
            // the check above; the unique index on service_bookings
            // (organization_id, stripe_payment_intent_id) refuses the second
            // insert. Only that rule is answered in plain words; any other
            // unique violation (a key or a booking_reference) keeps the answer
            // every RuntimeException gets below.
            if ($this->paymentRuleBroken($e, $orgId, $data)) {
                return $this->paymentAlreadyUsed($orgId, $idempotency, $data);
            }
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            // reserveSlot threw — the requested slot was taken by a concurrent
            // confirm while we were waiting for the advisory lock. A deposit held
            // for it goes back at once (Part H).
            $released = $this->releaseDeposit($intent, $orgId);
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => $e->getMessage() . ($released ? ' Your card was not charged.' : '')] + ($released ? ['code' => 'slot_taken'] : []), 409);
        } catch (\Throwable $e) {
            $this->releaseDeposit($intent, $orgId);
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => 'Failed to create booking: ' . $e->getMessage()], 500);
        }

        $this->logSubmission($orgId, $idempotency, $data, $booking->id, 'success');

        // Manual-capture commit. The PI created in /services/payment-intent
        // landed in `requires_capture` after stripe.confirmPayment() on
        // the widget. ServiceBooking row is now persisted; capture the
        // held funds. Capture failure does NOT fail the request — the
        // booking is real, the guest's auth is still held, and a future
        // cron / admin action can finish the capture within ~7 days.
        $captureFlag = $this->capturePaymentIntentIfNeeded(
            $data['payment_intent_id'] ?? null,
            $booking,
            $isMockBooking,
        );

        // Part H: the deposit's ledger row moved the label; what is emailed and answered is the booking as it is now.
        if (Deposits::of($booking) !== null) {
            $booking->refresh();
        }

        // ── Transactional emails ───────────────────────────────────────────
        // 1) Service confirmation goes to every booking, no questions asked.
        // 2) Membership-welcome only fires when the guest has no `welcomed_at`
        //    stamp on their LoyaltyMember row — same rule the room-booking
        //    flow uses, so a returning guest never gets a duplicate
        //    "set your password" email after every transaction.
        // Mock-mode bookings skip emails — the Settings UI hint promises
        // "no charges or emails" so staff can dry-run the flow without
        // spamming real inboxes. Guest auto-enrol still runs since it's
        // local-only and useful for testing membership flows.
        if ($isMockBooking) {
            \Illuminate\Support\Facades\Log::info('Mock mode — skipping service booking emails', [
                'org_id' => $orgId,
                'email'  => $booking->customer_email,
            ]);
        } else {
            $this->sendServiceBookingEmails($booking->load(['service', 'master', 'extras']), $orgId);
        }

        $payload = [
            'booking_reference' => $booking->booking_reference,
            'booking'           => $booking->load(['service', 'master', 'extras']),
        ];
        if ($captureFlag !== null) {
            $payload['payment_capture_pending'] = $captureFlag;
        }
        if (($deposit = Deposits::forClient($booking)) !== null) {
            $payload['deposit'] = $deposit;
        }

        return response()->json($payload, 201);
    }

    /**
     * A payment that already pays for a booking of this organisation: 409 in
     * one plain sentence, logged as a failed submission. Nothing is
     * cancelled, refunded or captured — the payment belongs to the booking
     * that carries it.
     */
    private function paymentAlreadyUsed(?int $orgId, ?string $idempotency, array $data): JsonResponse
    {
        $this->logSubmission($orgId, $idempotency, $data, null, 'failed', 'payment already used');

        return response()->json(['error' => 'This payment has already been used for a booking.'], 409);
    }

    /**
     * Whether a unique violation raised by the booking insert is the
     * one-payment rule: the framework names the violated columns (from
     * PostgreSQL's key detail, from sqlite's constraint message) and they
     * include the payment column, or — read after the rollback — a booking of
     * this organisation now carries the request's payment.
     */
    private function paymentRuleBroken(UniqueConstraintViolationException $e, ?int $orgId, array $data): bool
    {
        $paymentIntentId = (string) ($data['payment_intent_id'] ?? '');
        if ($paymentIntentId === '') {
            return false;
        }

        return in_array('stripe_payment_intent_id', $e->columns, true)
            || ServiceBooking::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $paymentIntentId)
                ->exists();
    }

    /**
     * Part H: a deposit held for a booking that was not saved goes back at
     * once (the orphan release would do it within the hour). Only this
     * venue's own deposit intent, only while it is still just held, and
     * never one a booking already carries.
     */
    private function releaseDeposit(mixed $intent, ?int $orgId): bool
    {
        if ($intent === null || !$orgId) {
            return false;
        }
        $meta = Deposits::metadataOf($intent);
        $id = (string) ($intent->id ?? '');
        if ($id === '' || ($meta['kind'] ?? null) !== Deposits::KIND || (int) ($meta['org_id'] ?? 0) !== $orgId
            || (string) ($intent->status ?? '') !== 'requires_capture'
            || ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $id)->exists()) {
            return false;
        }
        try {
            app(StripeService::class)->cancelPaymentIntent($id, 'abandoned');

            return true;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('service_deposit.release_failed', ['pi' => $id, 'error' => $e->getMessage()]);

            return false;
        }
    }

    /**
     * Capture a manual-capture PaymentIntent right after the
     * ServiceBooking row is committed. Mirrors the helper in
     * BookingPublicController; tolerates every plausible failure mode
     * (mock PI, no Stripe, retrieve failure, already succeeded, capture
     * itself throwing). Returns true if capture is pending (retry cron
     * will handle), false if captured cleanly, null if no capture
     * relevant.
     */
    private function capturePaymentIntentIfNeeded(?string $intentId, ServiceBooking $booking, bool $isMock): ?bool
    {
        if ($isMock) {
            return null;
        }
        if ($intentId && str_starts_with($intentId, 'pi_mock_')) {
            return null;
        }
        if (!$intentId) {
            return null;
        }

        $stripe = app(StripeService::class);
        if (!$stripe->isEnabled()) {
            return null;
        }

        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;

        try {
            $intent = $stripe->retrievePaymentIntent($intentId);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Service booking capture — retrieve failed; will let cron retry', [
                'pi_id' => $intentId,
                'error' => $e->getMessage(),
            ]);
            return true;
        }

        $status = $intent->status ?? null;

        if ($status === 'succeeded') {
            // Legacy auto-capture PI — already captured. Flip the
            // booking to paid if it's still authorized.
            try {
                if (Deposits::of($booking) !== null) {
                    app(AppointmentMoney::class)->recordDeposit($booking);
                } elseif (in_array($booking->payment_status, ['authorized', 'pending', null, ''], true)) {
                    $booking->update(['payment_status' => 'paid']);
                }
            } catch (\Throwable) {}
            return false;
        }

        if ($status !== 'requires_capture') {
            try {
                \App\Models\AuditLog::create([
                    'organization_id' => $orgId,
                    'action'          => 'service_booking.capture.skipped_status',
                    'subject_type'    => 'stripe_payment',
                    'subject_id'      => null,
                    'new_values'      => [
                        'payment_intent_id' => $intentId,
                        'status'            => $status,
                        'service_booking_id' => $booking->id,
                    ],
                    'description'     => "Service-booking capture skipped for PI {$intentId} — status was {$status}, expected requires_capture",
                ]);
            } catch (\Throwable) {}
            return true;
        }

        try {
            $stripe->capturePaymentIntent($intentId);
            try {
                if (Deposits::of($booking) !== null) {
                    // Part H: a deposit is part of the price — a ledger payment, never the whole booking marked paid.
                    app(AppointmentMoney::class)->recordDeposit($booking);
                } else {
                    $booking->update(['payment_status' => 'paid']);
                }
            } catch (\Throwable) {}
            return false;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Service booking capture failed — cron will retry', [
                'pi_id' => $intentId,
                'org_id' => $orgId,
                'service_booking_id' => $booking->id,
                'error' => $e->getMessage(),
            ]);
            try {
                \App\Models\AuditLog::create([
                    'organization_id' => $orgId,
                    'action'          => 'service_booking.capture.failed',
                    'subject_type'    => 'stripe_payment',
                    'subject_id'      => null,
                    'new_values'      => [
                        'payment_intent_id'  => $intentId,
                        'service_booking_id' => $booking->id,
                        'error'              => mb_substr($e->getMessage(), 0, 480),
                    ],
                    'description'     => "Manual capture failed for service-booking PI {$intentId} — cron will retry",
                ]);
            } catch (\Throwable) {}
            return true;
        }
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
            ->where('key', 'services_cancellation_policy')
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
                ->queue(new \App\Mail\ServiceBookingConfirmationMail(
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
                    // Phase 8.x — flow org's industry through so the
                    // subject + Blade flex per industry (Appointment
                    // for beauty/medical, Reservation for restaurant).
                    industry: $booking->organization_id
                        ? \App\Models\Organization::withoutGlobalScopes()
                            ->find($booking->organization_id)?->resolved_industry
                        : null,
                    depositAmount: Deposits::of($booking)['amount'] ?? null,
                    depositRefundUntil: Deposits::untilText($booking),
                ));
        } catch (\Throwable $e) {
            \Log::warning('Service booking confirmation email failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }

        // 1b) Admin notification — broadcast the service booking to the
        //     hotel's admin team so no appointment slips through.
        try {
            $extrasArr = $booking->extras->map(fn ($x) => [
                'name'     => $x->name,
                'quantity' => (int) $x->quantity,
                'total'    => (float) $x->line_total,
            ])->toArray();

            app(\App\Services\AdminNotificationService::class)->send(
                $orgId,
                new \App\Mail\AdminBookingNotificationMail(
                    kind:             'service',
                    hotelName:        $hotelName,
                    bookingReference: $booking->booking_reference ?? '—',
                    guestName:        $guestName,
                    guestEmail:       $email,
                    guestPhone:       $booking->customer_phone,
                    unitName:         null,
                    checkIn:          null,
                    checkOut:         null,
                    nights:           null,
                    adults:           null,
                    children:         null,
                    serviceName:      $booking->service?->name ?? 'Service',
                    masterName:       $booking->master?->name,
                    startAt:          $booking->start_at?->toIso8601String(),
                    durationMinutes:  (int) $booking->duration_minutes,
                    partySize:        (int) $booking->party_size,
                    baseTotal:        (float) $booking->service_price,
                    extrasTotal:      (float) $booking->extras_total,
                    grossTotal:       (float) $booking->total_amount,
                    currency:         $booking->currency ?? 'EUR',
                    extras:           $extrasArr,
                    specialRequests:  $booking->notes ?? null,
                    paymentStatus:    $booking->payment_status ?? null,
                ),
            );
        } catch (\Throwable $e) {
            \Log::warning('Admin service-booking notification failed', [
                'org_id' => $orgId, 'error' => $e->getMessage(),
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
                    ->queue(new \App\Mail\BookingMembershipMail(
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

    /** @throws \RuntimeException|ExtraLeadTimeException */
    private function computeTotal(Service $service, array $reservation, array $data): float
    {
        return app(ServiceQuoteBuilder::class)->build(
            $service,
            $reservation['master']->id,
            $reservation['start']->toIso8601String(),
            (int) ($data['party_size'] ?? 1),
            $data['extras'] ?? [],
        )['list_total'];
    }

    private function logSubmission(?int $orgId, ?string $idempotency, array $data, ?int $bookingId, string $outcome, ?string $error = null): void
    {
        if (!$orgId) return;
        try {
            ServiceBookingSubmission::withoutGlobalScopes()->create([
                'organization_id'    => $orgId,
                'idempotency_key'    => $idempotency,
                'source'             => self::bookingSource($data),
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

    /**
     * What a booking's `source` may look like on the wire.
     *
     * A FORMAT rule rather than an allowlist, on purpose. `source` is a
     * hidden attribution tag no guest ever types; the values that exist
     * today are 'widget' (the embed), 'mobile_app' (the member app's
     * WebView) and 'landing' (a landing page, template fidelity phase 6),
     * and a partner who embeds the widget with a tag of their own is
     * producing attribution data, not an error. What the rule refuses is
     * what would actually hurt: a value the 30-character column cannot hold
     * (a Postgres error on the confirm, i.e. a lost booking) or characters
     * that are not a tag. Lower-cased on the way in so 'Landing' and
     * 'landing' are one row in a report.
     */
    public const SOURCE_RULES = ['nullable', 'string', 'max:30', 'regex:/^[A-Za-z0-9_-]+$/'];

    public const DEFAULT_SOURCE = 'widget';

    /** The validated `source`, normalised, or the default when none was sent. */
    public static function bookingSource(array $data): string
    {
        $source = strtolower(trim((string) ($data['source'] ?? '')));

        return $source === '' ? self::DEFAULT_SOURCE : $source;
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
