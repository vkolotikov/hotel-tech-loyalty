<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingExtra;
use App\Models\ServiceBookingSubmission;
use App\Services\Booking\BookingCapability;
use App\Services\Booking\BookingScope;
use App\Services\Booking\BookingWindowException;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\Booking\ExtraLeadTimeException;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\PaymentAlreadyUsed;
use App\Services\Booking\PaymentMismatch;
use App\Services\Booking\PaymentUnverifiable;
use App\Services\Booking\PortalBookingNotifier;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\Booking\ServiceCatalogue;
use App\Services\Booking\ServiceQuoteBuilder;
use App\Services\Booking\SlotTakenException;
use App\Services\GuestMemberLinkService;
use App\Services\MemberProvisioner;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\MemberBookingQuery;
use App\Services\Portal\PortalBootstrap;
use App\Services\ServiceSchedulingService;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The member's own copy of the widget's booking sequence: catalogue with
 * member prices, calendar, slots, quote, payment intent, confirm. Every
 * action runs under the member's organisation (tenant middleware) and
 * recomputes prices on the server.
 */
class PortalServiceBookingController extends Controller
{
    /** Shared by quote(), paymentIntent() and (Task 9) confirm() — the same booking is priced the same way at every step. */
    private const QUOTE_RULES = [
        'service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'start_at' => 'required|date',
        'party_size' => 'nullable|integer|min:1|max:10', 'extras' => 'nullable|array|max:20',
        'extras.*.id' => 'required_with:extras|integer', 'extras.*.quantity' => 'nullable|integer|min:1|max:10',
        'coupon' => 'nullable|array', 'coupon.member_offer_id' => 'nullable|integer', 'coupon.redemption_id' => 'nullable|integer',
    ];

    /**
     * The lead value that switches ServiceSchedulingService::availableSlots()'s
     * own lead filter off for any requested day: it keeps every slot whose
     * digits, read as UTC, are no earlier than now minus two days — further
     * back than any venue's UTC offset (−12:00 … +14:00) can move a slot the
     * portal would keep. availability() then filters on true instants.
     */
    private const SCHEDULER_LEAD_OFF = -2 * 24 * 60;

    public function __construct(
        private readonly ServiceCatalogue $catalogue,
        private readonly ServiceSchedulingService $scheduler,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
        private readonly BookingCapability $capability,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $orgId = (int) app('current_organization_id');
        if (!$this->capability->appointmentsBookable($orgId)) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online appointments.'], 404);
        }
        // Portal booking needs a membership row (quote, payment-intent and
        // confirm refuse without one) — the same rule as the bootstrap's
        // capabilities.services, so the catalogue is never offered to a user
        // who could not finish a booking from it.
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'not_bookable', 'message' => 'Online booking needs a membership at this venue.'], 404);
        }
        $cat = $this->catalogue->build($orgId);
        $member = $this->loyaltyMember($request);
        $automatic = null;
        foreach ($cat['services'] as &$svc) {
            $p = $member
                ? $this->pricing->quote($member, (float) $svc['price'], $svc['currency'] ?: $cat['rules']['currency'], BookingScope::Services)
                : $this->pricing->quoteWithoutMember((float) $svc['price'], $svc['currency'] ?: $cat['rules']['currency']);
            $svc['member_price'] = $p->total;
            if ($automatic === null && $p->applied && $p->applied['source'] === 'tier_benefit') {
                $automatic = ['label' => $p->applied['label'], 'type' => $p->applied['type'], 'value' => $p->applied['value']];
            }
        }
        unset($svc);
        // ServiceCatalogue::build() selects ServiceExtra's raw columns, and
        // ServiceExtra::$casts['price'] is 'decimal:2' — Eloquent's decimal
        // cast serializes to a STRING ("12.00"), unlike Service::$price
        // above (re-cast to float on every $svc) and every quote-line price
        // (re-cast in ServiceQuoteBuilder). The public widget's own
        // ServicePublicController::config() reads this same catalogue and is
        // left alone: it has sent the string form since before this branch,
        // and changing it now would be an unrelated, unreviewed behaviour
        // change to a payload nothing here owns. Only the portal's own
        // response is normalised.
        foreach ($cat['extras'] as &$extra) {
            $extra['price'] = (float) $extra['price'];
            $extra['duration_minutes'] = $extra['duration_minutes'] !== null ? (int) $extra['duration_minutes'] : null;
            $extra['lead_time_hours'] = $extra['lead_time_hours'] !== null ? (int) $extra['lead_time_hours'] : null;
        }
        unset($extra);
        // No JSON_PRESERVE_ZERO_FRACTION here: the test asserts round member
        // prices (e.g. 60, 54) as bare JSON integers via assertJsonPath's
        // strict assertSame, which a preserved ".0" would fail.
        return response()->json($cat + ['pricing' => ['automatic' => $automatic]]);
    }

    public function calendar(Request $request): JsonResponse
    {
        $data = $request->validate(['service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'start' => 'required|date', 'end' => 'required|date|after_or_equal:start']);
        $service = $this->service((int) $data['service_id']);
        if ($service instanceof JsonResponse) return $service;
        // Plain Y-m-d strings (they compare in order): the window's days are
        // the venue's calendar days, whatever the application's time zone.
        $today = $this->venueToday()->toDateString();
        $last = $this->venueToday()->addDays($this->maxAdvanceDays())->toDateString();
        $start = max(CarbonImmutable::parse($data['start'])->toDateString(), $today);
        $end = min(CarbonImmutable::parse($data['end'])->toDateString(), $last);
        if ($end < $start) return response()->json(['available_dates' => []]);
        return response()->json(['available_dates' => $this->scheduler->availableDates($service, $start, $end, $data['master_id'] ?? null)]);
    }

    public function availability(Request $request): JsonResponse
    {
        $today = $this->venueToday();
        $data = $request->validate(['service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'date' => 'required|date|after_or_equal:' . $today->toDateString()]);
        $service = $this->service((int) $data['service_id']);
        if ($service instanceof JsonResponse) return $service;
        if (CarbonImmutable::parse($data['date'])->toDateString() > $today->addDays($this->maxAdvanceDays())->toDateString()) {
            return response()->json(['error' => 'too_far_ahead', 'message' => 'That date is beyond the booking window.'], 422);
        }
        // The scheduler's own lead filter compares the slot's wall-clock digits
        // with the true "now" (it reads them as UTC). It is shared with the
        // widget and stays as it is; the portal switches it off through its own
        // parameter and applies the lead time to true instants below.
        $slots = $this->scheduler->availableSlots($service, $data['date'], $data['master_id'] ?? null, (int) HotelSetting::getValue('services_slot_step', 15), self::SCHEDULER_LEAD_OFF);
        $zone = AppointmentClock::zoneFor((int) app('current_organization_id'));
        $earliest = CarbonImmutable::now()->addMinutes((int) HotelSetting::getValue('services_lead_minutes', 60));
        $last = $today->addDays($this->maxAdvanceDays())->endOfDay();

        $offered = [];
        foreach ($slots as $slot) {
            if (!AppointmentClock::existsLocally($slot['start'], $zone)) {
                continue; // the hour a daylight-saving change skips never happens at the venue
            }
            $start = AppointmentClock::toInstant($slot['start'], $zone);
            // Inclusive at now + lead, like the scheduler's own rule and buildQuote()'s too_soon.
            if ($start->lessThan($earliest) || $start->greaterThan($last)) {
                continue;
            }
            // Only start/end change: time_label, duration_minutes, masters stay the scheduler's.
            $slot['start'] = AppointmentClock::iso($slot['start'], $zone);
            $slot['end'] = AppointmentClock::iso($slot['end'], $zone);
            $offered[] = $slot;
        }

        return response()->json(['slots' => $offered]);
    }

    /**
     * The member's itemised price for a service booking: the server's own
     * list price (never the client's), the member discount or chosen
     * coupon, whether this venue can take payment online for it right now,
     * and the cancellation policy to show alongside the total.
     */
    public function quote(Request $request, ServiceQuoteBuilder $builder): JsonResponse
    {
        $data = $this->storedStart($request->validate(self::QUOTE_RULES));
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        try {
            // No JSON_PRESERVE_ZERO_FRACTION here either — see index()'s
            // comment on the same point; the test's assertJsonPath cases
            // compare amounts against bare integers such as 60 and 54.
            return response()->json($this->quotePayload($this->buildQuote($request, $data, $builder)));
        } catch (\Throwable $e) {
            return $this->quoteError($e);
        }
    }

    /**
     * A Stripe PaymentIntent for the same discounted total the quote would
     * report, carrying the organisation and the member in its metadata so
     * confirm() (Task 9) can check both before trusting the PI.
     */
    public function paymentIntent(Request $request, ServiceQuoteBuilder $builder, StripeService $stripe): JsonResponse
    {
        $data = $this->storedStart($request->validate(self::QUOTE_RULES));
        $member = $this->provisioner->ensureForUser($request->user());
        if (!$member) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }

        try {
            $b = $this->buildQuote($request, $data, $builder);
        } catch (\Throwable $e) {
            return $this->quoteError($e);
        }

        if ($b['payment']['mode'] !== 'online') {
            return response()->json(['error' => 'pay_at_venue', 'message' => 'This venue takes payment at the venue.'], 409);
        }

        $total = $b['pricing']->total;
        if ($total <= 0) {
            return response()->json(['error' => 'nothing_to_pay', 'message' => 'There is nothing to pay online for this booking.'], 409);
        }

        try {
            $pi = $stripe->createPaymentIntent($total, "Service booking: {$b['service']->name}", [
                'kind'       => 'portal_service_booking',
                'org_id'     => (int) app('current_organization_id'),
                'member_id'  => (int) $member->id,
                'service_id' => (int) $b['service']->id,
                'start_at'   => $b['q']['start']->toIso8601String(),
                'total'      => number_format($total, 2, '.', ''),
            ], ['allow_redirects' => 'never']);
        } catch (\Throwable $e) {
            Log::warning('portal.payment_intent_failed', ['org' => app('current_organization_id'), 'error' => $e->getMessage()]);
            return response()->json(['error' => 'payment_unavailable', 'message' => 'Online payment is unavailable right now. Please try again in a moment.'], 503);
        }

        // No JSON_PRESERVE_ZERO_FRACTION here either — see index()'s comment
        // on the same point; the test's assertJsonPath cases compare amounts
        // against bare integers such as 54.
        return response()->json([
            'client_secret'      => $pi['client_secret'],
            'payment_intent_id'  => $pi['payment_intent_id'],
            'amount'             => $total,
            'currency'           => $b['pricing']->currency,
        ]);
    }

    /**
     * The server-recomputed price behind both quote() and paymentIntent():
     * the scheduler's own slot/price/extras, then the member's discount or
     * chosen coupon on top, then whether this venue can take payment
     * online for the resulting currency right now.
     *
     * @throws SlotTakenException      the scheduler's own slot is taken, or the start does not exist on the venue's clock
     * @throws BookingWindowException  the time is too soon or too far ahead
     * @throws ExtraLeadTimeException  an extra's lead time cannot be met
     * @throws CouponException         the chosen coupon does not resolve
     */
    private function buildQuote(Request $request, array $data, ServiceQuoteBuilder $builder): array
    {
        $service = $this->service((int) $data['service_id']);
        if ($service instanceof JsonResponse) {
            throw new ModelNotFoundException();
        }

        // The scheduler's own reserveSlot() does not enforce the lead time
        // or the advance-booking horizon (only availability() does, for the
        // calendar's own sake) — a request built by hand could otherwise
        // get a 200 quote, and a live PaymentIntent, for a slot the
        // calendar would never offer. $data['start_at'] is the stored form
        // (wall-clock digits, see storedStart()); both checks run on the true
        // instant those digits name on the venue's clock.
        $zone = AppointmentClock::zoneFor((int) app('current_organization_id'));
        // A start the venue's clock never shows (the hour a daylight-saving
        // change skips) is refused like a slot that is not available — the
        // code the portal already handles (back to When, time cleared) —
        // before anything is priced, reserved or paid for. availability()
        // never offers one; only a hand-built request can ask for it.
        if (!AppointmentClock::existsLocally($data['start_at'], $zone)) {
            throw new SlotTakenException('That time does not exist on the venue\'s clock.');
        }
        $start = AppointmentClock::toInstant($data['start_at'], $zone);
        $leadMinutes = (int) HotelSetting::getValue('services_lead_minutes', 60);
        if ($start->lessThan(CarbonImmutable::now()->addMinutes($leadMinutes))) {
            throw new BookingWindowException('too_soon', 'That time is too soon to book online.');
        }
        // "Now" is an instant; the window's last day ends at midnight in the
        // VENUE's time zone.
        if ($start->greaterThan($this->venueToday()->addDays($this->maxAdvanceDays())->endOfDay())) {
            throw new BookingWindowException('too_far_ahead', 'That date is beyond the booking window.');
        }

        $q = $builder->build($service, $data['master_id'] ?? null, $data['start_at'], (int) ($data['party_size'] ?? 1), $data['extras'] ?? []);
        $member = $this->loyaltyMember($request);
        $pricing = $member
            ? $this->pricing->quote($member, $q['list_total'], $q['currency'], BookingScope::Services, CouponSelection::fromArray($data['coupon'] ?? null))
            : $this->pricing->quoteWithoutMember($q['list_total'], $q['currency']);
        if (!$member && !empty($data['coupon'])) {
            throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
        }

        return [
            'service' => $service,
            'q'       => $q,
            'pricing' => $pricing,
            'payment' => PortalBootstrap::paymentMode($q['currency']),
            'policy'  => [
                'cancellation_policy' => HotelSetting::getValue('services_cancellation_policy') ?: null,
                'cancel_hours'        => (int) HotelSetting::getValue('services_cancel_hours', 24),
            ],
        ];
    }

    private function quotePayload(array $b): array
    {
        $q = $b['q'];
        $zone = AppointmentClock::zoneFor((int) app('current_organization_id'));

        return [
            'service' => ['id' => $b['service']->id, 'name' => $b['service']->name, 'duration_minutes' => $q['duration_minutes']],
            'master'  => $q['master'] ? ['id' => $q['master']->id, 'name' => $q['master']->name] : null,
            'start_at' => AppointmentClock::iso($q['start'], $zone),
            'end_at'   => AppointmentClock::iso($q['end'], $zone),
            'duration_minutes' => $q['duration_minutes'],
            'lines' => ['service_price' => $q['service_price'], 'extras' => $q['extras'], 'extras_total' => $q['extras_total']],
        ] + $b['pricing']->toArray() + ['payment' => $b['payment'], 'policy' => $b['policy']];
    }

    /**
     * Write the member's service booking under a per-slot advisory lock:
     * the price is recomputed one more time inside the lock (the slot may
     * have just been taken, or the discount picture may have shifted since
     * the pre-lock quote), any supplied PaymentIntent is checked against
     * that recomputed total, the booking + extras + coupon consumption are
     * written together, and the whole call is idempotent on the caller's
     * `Idempotency-Key` header.
     */
    public function confirm(Request $request, ServiceQuoteBuilder $builder, GuestMemberLinkService $guests, PortalPaymentIntentGuard $guard): JsonResponse
    {
        // The stored form of the start BEFORE the hash below: a retry in either
        // form (the venue-offset string or an old tab's `+00:00`) hashes the
        // same, since the `+00:00` form is left as-is — so a key computed
        // under the old, unnormalised format still replays.
        $data = $this->storedStart($request->validate(self::QUOTE_RULES + ['payment_intent_id' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:2000']));
        $key = trim((string) $request->header('Idempotency-Key'));
        if (strlen($key) < 8 || strlen($key) > 80) {
            return response()->json(['error' => 'idempotency_key_required', 'message' => 'Send an Idempotency-Key header of 8 to 80 characters.'], 422);
        }
        $orgId = (int) app('current_organization_id');
        $user = $request->user();
        $hash = hash('sha256', json_encode($this->canonical($data)));
        // Read once, before anything that can fail — every error exit below that has learned this needs it
        // to release the member's own hold (see fail()).
        $piId = $data['payment_intent_id'] ?? null;

        $replay = $this->replay($orgId, $key, $user->email, $hash);
        if ($replay) {
            return $replay;
        }

        $member = $this->provisioner->ensureForUser($user);
        if (!$member) {
            // No member id yet — nothing can be verified as owned, so there is nothing safe to release.
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        $memberId = (int) $member->id;

        try {
            $pre = $this->buildQuote($request, $data, $builder);
        } catch (CouponException | ExtraLeadTimeException | BookingWindowException | SlotTakenException | ModelNotFoundException $e) {
            // The usual race: the pre-lock quote is where a taken slot, a window that just closed, or a
            // coupon that just stopped applying is normally caught — well before the advisory lock below,
            // and well before writeBooking()'s own catches. A card can already be authorised by this
            // point, and the client (steps.ts's afterConfirmError) treats every one of these codes as
            // "the hold is released" — so it must actually be released here, not only in the lock.
            return $this->fail($this->quoteError($e), $piId, $orgId, $memberId, $guard);
        } catch (\Throwable $e) {
            // Symmetric with the in-lock catch-all further down (fix round 3, minor A): calling
            // quoteError() here for anything it doesn't recognise would rethrow (see its own default
            // case) before fail() ever ran, releasing nothing for a database error or the like — the SAME
            // class of failure inside the lock already releases and answers confirm_failed. This answers
            // and releases the same way, rather than propagating to Laravel's default handler with an
            // authorised card still on hold.
            Log::error('portal.confirm_failed', ['org' => $orgId, 'exception' => get_class($e), 'error' => $e->getMessage(), 'payment_intent' => $piId]);
            return $this->fail(response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500), $piId, $orgId, $memberId, $guard);
        }
        $online = $pre['payment']['mode'] === 'online' && $pre['pricing']->total > 0;
        if ($online && !$piId) {
            // Can't have an intent by definition — nothing to release.
            return response()->json(['error' => 'payment_required', 'message' => 'Please complete the payment first.'], 422);
        }
        if (!$online && $piId) {
            // A card was already authorised for a booking that no longer
            // needs (or never needed) online payment — release the hold
            // rather than storing it 'unpaid' where the capture cron would
            // never look at it again.
            return $this->fail(response()->json(['error' => 'payment_mismatch', 'message' => 'This venue takes payment at the venue.'], 409), $piId, $orgId, $memberId, $guard);
        }
        $pi = null;
        if ($piId) {
            try {
                $pi = $guard->verify($piId, $orgId, $memberId, (int) $pre['service']->id, $pre['q']['start'], $pre['pricing']->total);
            } catch (PaymentUnverifiable) {
                // Stripe could not be asked: nothing is known about the intent, so nothing is released.
                return $this->paymentCheckFailed($orgId, $key, $data, $user);
            } catch (PaymentMismatch) {
                // verify() itself already cancels an owned-but-mismatched intent before throwing (see its
                // own doc comment) — routing this through fail() would release() a SECOND time and, since
                // release() re-retrieves and re-checks ownership independently of what verify() just did,
                // double-cancel it.
                return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment does not match this booking. Please pay again.'], 409);
            }
        }

        $masterId = $data['master_id'] ?? null;
        $lockKey = $masterId ? "svcm:{$masterId}" : "svc:{$data['service_id']}";
        try {
            $booking = $this->lockedWrite($lockKey, $piId, $orgId, fn () => $this->writeBooking(
                $request, $data, $builder, $member, $guests, $guard, $pi, $piId, $online, $user, $orgId, $key, $hash,
            ));
        } catch (PaymentAlreadyUsed) {
            // The intent already pays for a real booking in this org — it
            // must never be released here, so this branch does not go
            // through fail(): PortalPaymentIntentGuard::release()'s own
            // carried() check would no-op it anyway, but that guarantee
            // must not depend only on the guard being called correctly.
            $this->logFailure($orgId, $key, $data, $user, 'payment_mismatch');
            return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches the price. Please pay again.'], 409);
        } catch (PaymentUnverifiable) {
            // writeBooking()'s re-check under the pi: lock could not read the
            // intent. Its transaction rolled back — no booking, no coupon
            // consumed — and nothing is released.
            return $this->paymentCheckFailed($orgId, $key, $data, $user);
        } catch (PaymentMismatch) {
            $this->logFailure($orgId, $key, $data, $user, 'payment_mismatch');
            return $this->fail(response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches the price. Please pay again.'], 409), $piId, $orgId, $memberId, $guard);
        } catch (CouponException | ExtraLeadTimeException | BookingWindowException | SlotTakenException | ModelNotFoundException $e) {
            $this->logFailure($orgId, $key, $data, $user, $e->getMessage());
            return $this->fail($this->quoteError($e), $piId, $orgId, $memberId, $guard);
        } catch (\Throwable $e) {
            Log::error('portal.confirm_failed', ['org' => $orgId, 'exception' => get_class($e), 'error' => $e->getMessage(), 'payment_intent' => $piId]);
            $this->logFailure($orgId, $key, $data, $user, $e->getMessage());
            return $this->fail(response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500), $piId, $orgId, $memberId, $guard);
        }
        if ($booking instanceof JsonResponse) {
            return $booking; // replayed inside the lock (see writeBooking())
        }

        $this->afterConfirm($booking->fresh(['service', 'master', 'extras']), $online);
        return response()->json(['booking' => MemberBookingQuery::serviceDto($booking->fresh(['service', 'master'])), 'replayed' => false], 201);
    }

    /**
     * Every error exit of confirm() that already knows a payment_intent_id runs its response through
     * here, so the release happens in one place rather than being sprinkled through every catch block.
     * `PortalPaymentIntentGuard::release()` already refuses to cancel an intent a booking carries, or one
     * whose metadata doesn't name this org/member — so this is always safe to call, including with a
     * $piId that turns out not to be owned by $memberId. A null $piId (nothing to release) or a null
     * $memberId (nothing to verify ownership against — see the `no_membership` exit above) is a no-op.
     * The replay path and the success path never call this.
     */
    private function fail(JsonResponse $response, ?string $piId, int $orgId, ?int $memberId, PortalPaymentIntentGuard $guard): JsonResponse
    {
        if ($memberId !== null) {
            $guard->release($piId, $orgId, $memberId);
        }
        return $response;
    }

    /**
     * The payment could not be checked right now (PaymentUnverifiable): a
     * retryable 503 with a failure row, nothing released, nothing cancelled,
     * no booking written — the next confirm with the same intent (and key)
     * can still succeed, since only a `success` row replays.
     */
    private function paymentCheckFailed(int $orgId, string $key, array $data, $user): JsonResponse
    {
        $this->logFailure($orgId, $key, $data, $user, PaymentUnverifiable::CODE);

        return response()->json(['error' => PaymentUnverifiable::CODE, 'message' => PaymentUnverifiable::MESSAGE], 503);
    }

    /**
     * A prior successful submission under this key replays its stored
     * booking; the same key on a differently-shaped request is refused
     * outright. Returns null when there is no prior success to replay.
     */
    private function replay(int $orgId, string $key, string $email, string $hash): ?JsonResponse
    {
        $prior = ServiceBookingSubmission::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('idempotency_key', $key)
            ->where('customer_email', $email)
            ->where('outcome', 'success')
            ->where('source', 'member_portal')
            ->latest('id')
            ->first();
        if (!$prior) {
            return null;
        }
        if (($prior->request_payload['_hash'] ?? null) !== $hash) {
            return response()->json(['error' => 'idempotency_conflict', 'message' => 'This key was already used for a different booking.'], 409);
        }
        $booking = ServiceBooking::withoutGlobalScopes()->find($prior->service_booking_id);
        return response()->json(['booking' => $booking ? MemberBookingQuery::serviceDto($booking) : null, 'replayed' => true]);
    }

    /**
     * writeBooking() under the slot lock (AdvisoryLock::transaction()). The
     * database holds the rule assertUnused() checks — a payment intent on at
     * most one service booking of an organisation (unique index
     * service_bookings_org_pi_unique) — and the public services confirm takes
     * no `pi:` lock, so a public booking can take this payment after
     * assertUnused() looked; the insert then violates the index. The
     * transaction has rolled back by the time the violation reaches here:
     * when a service booking of this organisation now carries the payment, it
     * is PaymentAlreadyUsed (409 payment_mismatch, never released). Any other
     * unique violation goes on unchanged to confirm()'s own catch.
     */
    private function lockedWrite(string $lockKey, ?string $piId, int $orgId, callable $write): ServiceBooking|JsonResponse
    {
        try {
            return AdvisoryLock::transaction($lockKey, $write);
        } catch (UniqueConstraintViolationException $e) {
            if ($piId !== null && $piId !== '' && ServiceBooking::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->exists()) {
                throw new PaymentAlreadyUsed('The payment already pays for a booking.', 0, $e);
            }
            throw $e;
        }
    }

    /**
     * The write itself, run inside AdvisoryLock::transaction(): recompute
     * the quote one more time (the definitive check), reject a stale
     * PaymentIntent, then persist the booking, its extras, the coupon
     * consumption and the success submission row together.
     */
    private function writeBooking(Request $request, array $data, ServiceQuoteBuilder $builder, LoyaltyMember $member, GuestMemberLinkService $guests, PortalPaymentIntentGuard $guard, mixed $pi, ?string $piId, bool $online, $user, int $orgId, string $key, string $hash): ServiceBooking|JsonResponse
    {
        // The replay lookup again, now that this request holds the lock: a
        // second request with the same key and body ran its pre-lock lookup
        // before the first committed, then waited here. It must answer with
        // the first request's booking (`replayed: true`), not try the slot
        // that booking now occupies and answer slot_taken. Returned as-is —
        // never through fail(): that booking carries any intent this key paid.
        if ($replay = $this->replay($orgId, $key, $user->email, $hash)) {
            return $replay;
        }

        $b = $this->buildQuote($request, $data, $builder);
        if ($piId) {
            // One PaymentIntent pays for exactly one booking — definitive
            // check, inside the lock, right before the row is written. The
            // slot lock alone does not serialise two confirms with the same
            // intent when one names a master (`svcm:`) and the other does not
            // (`svc:`), so lock the intent itself first: the second confirm
            // then waits until the first booking is committed and seen here.
            AdvisoryLock::within('pi:' . $piId);
            $guard->assertUnused($piId, $orgId);
            // A failed retrieve here is not proof the intent is dead, only
            // that this code cannot currently confirm it is still payable.
            // This request's own verify() ran BEFORE the lock above was
            // taken. Between that check and here, a
            // different request's failed confirm — or the orphan-hold
            // sweeper (bookings:release-orphan-portal-holds) — could have
            // cancelled this exact intent; or the fresh retrieve could
            // simply fail (a Stripe hiccup, say). Re-check it fresh, now
            // that nothing else can touch it until this transaction ends.
            // What this code actually does: refuses WITHOUT releasing —
            // caught locally and answered directly, like replay() above,
            // rather than left to throw and fall into the amountMatches()
            // mismatch below and its own throw new PaymentMismatch(), whose
            // catch in confirm() calls fail() and DOES release. Releasing
            // an intent this code cannot confirm the state of is not this
            // method's job; an intent no booking ever carries is the
            // sweeper's own job. A retrieve that fails outright is
            // PaymentUnverifiable instead (not caught here): it leaves this
            // transaction, which rolls back, and confirm() answers 503
            // payment_check_failed, again without releasing.
            try {
                $guard->assertStillPayable($piId);
            } catch (PaymentMismatch) {
                $this->logFailure($orgId, $key, $data, $user, 'payment_not_payable');
                return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches the price. Please pay again.'], 409);
            }
        }
        if ($pi && !$guard->amountMatches($pi, $b['pricing']->total)) {
            throw new PaymentMismatch();
        }
        $q = $b['q'];
        $requireStaff = filter_var(HotelSetting::getValue('services_require_staff_confirmation', false), FILTER_VALIDATE_BOOLEAN);

        $booking = ServiceBooking::create([
            'organization_id'          => $orgId,
            'service_id'               => $b['service']->id,
            'service_master_id'        => $q['master']?->id,
            'guest_id'                 => $guests->ensureGuestForMember($member)->id,
            'member_id'                => $member->id,
            'customer_name'            => $user->name,
            'customer_email'           => $user->email,
            'customer_phone'           => $user->phone,
            'party_size'               => (int) ($data['party_size'] ?? 1),
            'start_at'                 => $q['start'],
            'end_at'                   => $q['end'],
            'duration_minutes'         => $q['duration_minutes'],
            'service_price'            => $q['service_price'],
            'extras_total'             => $q['extras_total'],
            // The pricing result's currency, not the quote's own raw
            // $service->currency: ServiceQuoteBuilder::build() returns the
            // service's currency as stored (widget parity), while
            // MemberPricing upper-cases it — the booking row always stores
            // the upper-cased form regardless of how the service row was
            // saved.
            'currency'                 => $b['pricing']->currency,
            'status'                   => $requireStaff ? 'pending' : 'confirmed',
            'payment_status'           => $online ? ($this->intentStatus($pi) === 'succeeded' ? 'paid' : 'authorized') : 'unpaid',
            'stripe_payment_intent_id' => $piId,
            'source'                   => 'member_portal',
            'customer_notes'           => $data['notes'] ?? null,
        ] + $this->pricing->columns($b['pricing']));

        foreach ($q['extras'] as $line) {
            ServiceBookingExtra::create([
                'service_booking_id' => $booking->id,
                'service_extra_id'   => $line['id'],
                'name'                => $line['name'],
                'unit_price'          => $line['unit_price'],
                'quantity'            => $line['quantity'],
                'line_total'          => $line['line_total'],
            ]);
        }

        $this->pricing->consume($b['pricing'], $booking->booking_reference);

        $dto = MemberBookingQuery::serviceDto($booking->fresh(['service', 'master']));
        ServiceBookingSubmission::create([
            'organization_id'    => $orgId,
            'idempotency_key'    => $key,
            'source'             => 'member_portal',
            'outcome'            => 'success',
            'service_booking_id' => $booking->id,
            'customer_email'     => $user->email,
            'customer_name'      => $user->name,
            'request_payload'    => $data + ['_hash' => $hash],
            'response_payload'   => $dto,
        ]);

        return $booking;
    }

    /** Side effects after commit: confirmation mail, venue notification, realtime event, audit row — see PortalBookingNotifier. */
    protected function afterConfirm(ServiceBooking $booking, bool $online): void
    {
        app(PortalBookingNotifier::class)->notify($booking, $online);
    }

    /**
     * The client's start in the stored form, right after validation: the
     * portal sends back the venue-offset string availability() gave it (an
     * older tab still sends the `+00:00` form); from here on every
     * consumer — the quote builder, reserveSlot(), the PaymentIntent's
     * metadata, the guard's sameInstant(), ServiceBooking::create() — gets
     * exactly the string the public widget would send for the same slot.
     */
    private function storedStart(array $data): array
    {
        $data['start_at'] = AppointmentClock::fromClient((string) $data['start_at']);

        return $data;
    }

    /** The validated body, key-sorted recursively, for a stable idempotency hash. */
    private function canonical(array $data): array
    {
        ksort($data);
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $data[$k] = $this->canonical($v);
            }
        }
        return $data;
    }

    /** retrievePaymentIntent() returns a Stripe\PaymentIntent; tolerates an array too (test doubles). Only status is read here — PortalPaymentIntentGuard owns verification and metadata. */
    private function intentStatus(mixed $pi): string
    {
        return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? '');
    }

    /** Same shape as ServicePublicController::logSubmission() — a failed submission is logged, never thrown, so it can't mask the real error. */
    private function logFailure(int $orgId, string $key, array $data, $user, string $error): void
    {
        // Its own (nested) transaction: called from inside writeBooking()'s
        // lock transaction too (payment_not_payable), where a failed insert
        // swallowed below would otherwise abort the enclosing PostgreSQL
        // transaction. Nested, it is a savepoint that rolls back alone.
        try {
            DB::transaction(fn () => ServiceBookingSubmission::create([
                'organization_id' => $orgId,
                'idempotency_key' => $key,
                'source'          => 'member_portal',
                'outcome'         => 'failed',
                'customer_email'  => $user->email,
                'customer_name'   => $user->name,
                'request_payload' => $data,
                // varchar(255) on PostgreSQL: a longer message would make this
                // insert itself fail (and the catch below would hide that).
                'error_message'   => mb_substr($error, 0, 255),
            ]));
        } catch (\Throwable) {
            // submission log must never block the error response
        }
    }

    private function quoteError(\Throwable $e): JsonResponse
    {
        return match (true) {
            $e instanceof CouponException => response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422),
            $e instanceof BookingWindowException => response()->json(['error' => $e->errorCode, 'message' => $e->getMessage()], 422),
            $e instanceof ExtraLeadTimeException => response()->json(['error' => 'extra_lead_time', 'message' => $e->getMessage()], 422),
            $e instanceof ModelNotFoundException => response()->json(['error' => 'not_found', 'message' => 'We could not find that service.'], 404),
            $e instanceof SlotTakenException => response()->json(['error' => 'slot_taken', 'message' => 'That time was just taken. Please pick another.'], 409),
            // Anything else — a database error during scheduling, extras
            // lookup or pricing, say — is not a taken slot and must not be
            // reported as one; it propagates to Laravel's default handler.
            default => throw $e,
        };
    }

    private function loyaltyMember(Request $request): ?LoyaltyMember
    {
        if (!PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) return null;
        $m = $this->provisioner->ensureForUser($request->user());
        return $m && $m->tier_id ? $m : null;
    }

    private function service(int $id): Service|JsonResponse
    {
        try {
            return Service::withoutGlobalScopes()->where('organization_id', app('current_organization_id'))->where('is_active', true)->findOrFail($id);
        } catch (ModelNotFoundException) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that service.'], 404);
        }
    }

    /**
     * Midnight today in the venue's own time zone (`PortalBootstrap::timezone()`,
     * the `venue.timezone` the portal already shows times in): the booking
     * window counts the venue's calendar days, not the application's.
     */
    private function venueToday(): CarbonImmutable
    {
        return PortalBootstrap::venueToday((int) app('current_organization_id'));
    }

    private function maxAdvanceDays(): int
    {
        return max(1, (int) HotelSetting::getValue('services_max_advance_days', 60));
    }
}
