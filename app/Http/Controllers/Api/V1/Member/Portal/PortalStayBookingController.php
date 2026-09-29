<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\LoyaltyMember;
use App\Services\AvailabilityService;
use App\Services\Booking\BookingCapability;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponResolver;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\PaymentAlreadyUsed;
use App\Services\Booking\PaymentMismatch;
use App\Services\Booking\PaymentUnverifiable;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\Booking\PortalStayHooks;
use App\Services\Booking\PortalStayNotifier;
use App\Services\Booking\PricingResult;
use App\Services\Booking\StayCatalogue;
use App\Services\Booking\StayQuoteException;
use App\Services\Booking\StayQuoteService;
use App\Services\BookingEngineService;
use App\Services\GuestMemberLinkService;
use App\Services\MemberProvisioner;
use App\Services\Portal\MemberBookingQuery;
use App\Services\Portal\PortalBootstrap;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The member's own copy of the booking widget's stay sequence: rooms,
 * availability, quote, payment intent, confirm. Every action runs under
 * the member's organisation (tenant middleware), sells single rooms only —
 * never room combinations — and recomputes prices on the server.
 */
class PortalStayBookingController extends Controller
{
    public function __construct(
        private readonly StayCatalogue $catalogue,
        private readonly StayQuoteService $quotes,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
        private readonly BookingCapability $capability,
    ) {}

    public function index(Request $request): JsonResponse
    {
        if ($refusal = $this->notBookable($request)) {
            return $refusal;
        }
        $cat = $this->catalogue->build((int) app('current_organization_id'));
        $currency = $cat['rules']['currency'];

        // The member's automatic benefit on a stay, named once for the whole
        // page: a probe price is enough to learn which benefit applies.
        $automatic = null;
        if ($member = $this->quotes->pricedMember($request->user())) {
            $p = $this->pricing->quote($member, 100.0, $currency, BookingScope::Stays);
            if ($p->applied && $p->applied['source'] === 'tier_benefit') {
                $automatic = ['label' => $p->applied['label'], 'type' => $p->applied['type'], 'value' => $p->applied['value']];
            }
        }

        return response()->json($cat + ['pricing' => ['automatic' => $automatic], 'payment' => PortalBootstrap::paymentMode($currency)]);
    }

    public function availability(Request $request, AvailabilityService $availability): JsonResponse
    {
        if ($refusal = $this->notBookable($request)) {
            return $refusal;
        }
        $today = PortalBootstrap::venueToday((int) app('current_organization_id'))->toDateString();
        $data = $request->validate([
            'check_in'  => 'required|date_format:Y-m-d|after_or_equal:' . $today,
            'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'adults'    => 'nullable|integer|min:1|max:20',
            'children'  => 'nullable|integer|min:0|max:10',
        ]);
        try {
            $nights = $this->quotes->assertStayAllowed($data['check_in'], $data['check_out']);
        } catch (StayQuoteException $e) {
            return $this->refuse($e);
        }

        $found = $availability->check($data['check_in'], $data['check_out'], (int) ($data['adults'] ?? 2), (int) ($data['children'] ?? 0));
        $currency = $this->quotes->rules()['currency'];
        $member = $this->quotes->pricedMember($request->user());

        $rooms = [];
        foreach ($found['available'] ?? [] as $room) {
            $total = (float) $room['total_price'];
            $price = $member
                ? $this->pricing->quote($member, $total, $currency, BookingScope::Stays)
                : $this->pricing->quoteWithoutMember($total, $currency);
            $rooms[] = [
                'id' => (string) $room['id'], 'name' => $room['name'], 'short_description' => $room['short_description'] ?? null,
                'max_guests' => (int) $room['max_guests'], 'bedrooms' => (int) ($room['bedrooms'] ?? 0), 'bed_type' => $room['bed_type'] ?? null,
                'size' => $room['size'] ?? null, 'image' => $room['image'] ?? null, 'gallery' => $room['gallery'] ?? [], 'amenities' => $room['amenities'] ?? [],
                'price_per_night' => (float) $room['price_per_night'], 'total_price' => $total, 'member_total' => $price->total,
                'currency' => $currency, 'min_stay' => (int) ($room['min_stay'] ?? 1),
            ];
        }

        return response()->json([
            'rooms'  => $rooms,
            'nights' => $nights,
            // The engine can offer two or three rooms together; the portal
            // sells single rooms only and says so instead.
            'party_too_large' => $rooms === [] && !empty($found['combinations']),
        ]);
    }

    /**
     * Shared by quote() and nothing else: the payment intent and the
     * confirm name a hold, never a room.
     *
     * `extras.*.id`/`extras.*.quantity` reject a nested array/object with a
     * validation failure (422) instead of letting one reach the engine's
     * `(string) $item['id']` cast downstream — an array there only warns in
     * PHP, but the test harness turns that warning into an uncaught 500.
     * This can't be a class constant: a closure isn't a compile-time
     * constant expression.
     */
    private function quoteRules(): array
    {
        $scalar = fn (string $label) => function ($attribute, $value, $fail) use ($label) {
            if ($value !== null && !is_scalar($value)) {
                $fail("Each extra {$label} must be a simple value.");
            }
        };

        return [
            'unit_id' => 'required|string|max:20', 'check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'adults' => 'nullable|integer|min:1|max:20', 'children' => 'nullable|integer|min:0|max:10',
            'extras' => 'nullable|array|max:20',
            // `bail` stops at the first failed rule for the field — without
            // it, `integer` still runs (and touches the array) even after
            // the scalar closure has already failed the field.
            'extras.*.id' => ['bail', 'required_with:extras', $scalar('id')],
            'extras.*.quantity' => ['bail', 'nullable', $scalar('quantity'), 'integer', 'min:1', 'max:10'],
            'coupon' => 'nullable|array', 'coupon.member_offer_id' => 'nullable|integer', 'coupon.redemption_id' => 'nullable|integer',
        ];
    }

    /**
     * The member's itemised price for a stay, and a hold on it that only
     * this member can pay for and confirm. Every quote writes a new hold; a
     * hold reserves nothing (availability counts bookings, not holds) and
     * lapses on its own.
     */
    public function quote(Request $request): JsonResponse
    {
        // notBookableFor()'s two checks, with the member resolved once for
        // the whole request (StayQuoteService::quote() takes it as given).
        if (!$this->capability->staysBookableOnline((int) app('current_organization_id'))) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online stay bookings.'], 404);
        }
        $member = $this->provisioner->ensureForUser($request->user());
        if (!$member) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        $data = $request->validate($this->quoteRules());

        try {
            return response()->json($this->quotes->payload($this->quotes->quote($request->user(), $member, $data)));
        } catch (StayQuoteException $e) {
            return $this->refuse($e);
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
    }

    /**
     * A Stripe PaymentIntent for what the hold costs this member today,
     * carrying the organisation, the member and the hold in its metadata so
     * confirm() can check all three before trusting it.
     */
    public function paymentIntent(Request $request, StripeService $stripe): JsonResponse
    {
        if ($refusal = $this->notBookableFor($request)) {
            return $refusal;
        }
        $data = $request->validate(['hold_token' => 'required|string|max:64']);
        $member = $this->provisioner->ensureForUser($request->user());

        $ready = $this->readyHold($request, $member, $data['hold_token']);
        if ($ready instanceof JsonResponse) {
            return $ready;
        }
        [$hold, $pricing] = $ready;

        if (PortalBootstrap::paymentMode($pricing->currency)['mode'] !== 'online') {
            return response()->json(['error' => 'pay_at_venue', 'message' => 'This venue takes payment at the venue.'], 409);
        }
        if ($pricing->total <= 0) {
            return response()->json(['error' => 'nothing_to_pay', 'message' => 'There is nothing to pay online for this booking.'], 409);
        }

        $p = $hold->payload_json;
        try {
            $pi = $stripe->createPaymentIntent($pricing->total, "Stay: {$p['unit_name']} ({$p['check_in']} — {$p['check_out']})", [
                'kind'              => 'portal_stay_booking',
                'org_id'            => (int) app('current_organization_id'),
                'member_id'         => (int) $member->id,
                // Not `hold_token`: that key belongs to the public widget's
                // intents (StripeService derives an idempotency key from it and
                // the webhook's orphan recovery writes a "Website" booking).
                'portal_hold_token' => $hold->hold_token,
                'total'             => number_format($pricing->total, 2, '.', ''),
            ], ['allow_redirects' => 'never']);
        } catch (\Throwable $e) {
            Log::warning('portal.stay_payment_intent_failed', ['org' => app('current_organization_id'), 'error' => $e->getMessage()]);
            return response()->json(['error' => 'payment_unavailable', 'message' => 'Online payment is unavailable right now. Please try again in a moment.'], 503);
        }

        // Entering a card takes longer than a quote lasts.
        $hold->forceFill(['expires_at' => now()->addMinutes(15)])->save();

        return response()->json([
            'client_secret'     => $pi['client_secret'],
            'payment_intent_id' => $pi['payment_intent_id'],
            'amount'            => $pricing->total,
            'currency'          => $pricing->currency,
        ]);
    }

    /**
     * Book the stay the hold describes. The engine does the booking — the
     * room lock, the re-checks, the PMS, the mirror, the mails — exactly as
     * it does for the public widget; this method decides whether it may
     * (the hold is this member's, the price still stands, the payment is
     * for this hold) and what happens to the payment when it does not.
     *
     * A hold is booked once: a second confirm of the same hold answers the
     * booking it became.
     */
    public function confirm(Request $request, BookingEngineService $engine, GuestMemberLinkService $guests, PortalPaymentIntentGuard $guard, CouponResolver $coupons): JsonResponse
    {
        $data = $request->validate([
            'hold_token'        => 'required|string|max:64',
            'payment_intent_id' => 'nullable|string|max:255',
            'special_requests'  => 'nullable|string|max:2000',
        ]);
        $orgId = (int) app('current_organization_id');
        $user = $request->user();
        $piId = $data['payment_intent_id'] ?? null;

        $member = $this->provisioner->ensureForUser($user);
        if (!$member) {
            // No member id — nothing can be verified as owned, so nothing is released.
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        $memberId = (int) $member->id;

        $hold = $this->quotes->ownHold($member, $data['hold_token']);
        if ($hold && ($booked = $this->bookingOf($hold, $orgId))) {
            // Never through fail(): this booking carries whatever paid for
            // it. A DIFFERENT intent this request supplies (the member's
            // client retried and minted a second PaymentIntent after a slow
            // first response) is not this booking's own and must not sit
            // there authorised forever.
            $this->releaseIfNotOwn($booked, $piId, $orgId, $memberId, $guard);
            return response()->json(['booking' => MemberBookingQuery::stayDto($booked), 'replayed' => true]);
        }

        // Capability can change after the quote (the venue switches stays
        // off) — checked here, after the replay branch so an already-booked
        // hold always answers its booking, and before any hold/payment work.
        if ($refusal = $this->notBookableFor($request)) {
            return $this->fail($refusal, $piId, $orgId, $memberId, $guard);
        }

        $ready = $this->readyHold($request, $member, $data['hold_token']);
        if ($ready instanceof JsonResponse) {
            // hold_not_found releases nothing: the hold is not this member's,
            // so nothing says the payment is either. The rest release.
            return $ready->getStatusCode() === 404 ? $ready : $this->fail($ready, $piId, $orgId, $memberId, $guard);
        }
        [$hold, $pricing] = $ready;

        $online = PortalBootstrap::paymentMode($pricing->currency)['mode'] === 'online' && $pricing->total > 0;
        if ($online && !$piId) {
            return response()->json(['error' => 'payment_required', 'message' => 'Please complete the payment first.'], 422);
        }
        if (!$online && $piId) {
            return $this->fail(response()->json(['error' => 'payment_mismatch', 'message' => 'This venue takes payment at the venue.'], 409), $piId, $orgId, $memberId, $guard);
        }
        $pi = null;
        if ($piId) {
            try {
                $pi = $guard->verifyStay($piId, $orgId, $memberId, $hold->hold_token, $pricing->total);
            } catch (PaymentUnverifiable) {
                // Stripe could not be asked: nothing is known about the intent, so nothing is released.
                return $this->paymentCheckFailed($orgId, $memberId, $hold, $piId, 'verify');
            } catch (PaymentMismatch) {
                // verifyStay() already cancelled an owned, mismatched intent; fail() would cancel it twice.
                return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment does not match this booking. Please pay again.'], 409);
            }

            // BookingEngineService::confirm() has its own replay branch that
            // answers by org+payment_intent_id ALONE, before it ever loads
            // the hold and before any hook runs (see its own comment) — so
            // an intent a DIFFERENT booking in this org already carries
            // would otherwise be treated as a successful replay of THIS
            // confirm rather than the refusal it must be. Checked again,
            // authoritatively, under the room lock in
            // PortalStayHooks::beforeReservation(); this pre-check only
            // keeps the engine from ever reaching that swallowing branch.
            try {
                $guard->assertUnused($piId, $orgId);
            } catch (PaymentAlreadyUsed) {
                // Not necessarily a genuine conflict: a concurrent confirm
                // of THIS SAME hold (the member's client double-submitted a
                // retry) may have won the race between verifyStay() and
                // here — carried() would then find ITS OWN mirror. Answer
                // that as the replay it is, not a mismatch.
                if (($booked = $this->bookingOf($hold->fresh(), $orgId)) && $booked->stripe_payment_intent_id === $piId) {
                    return response()->json(['booking' => MemberBookingQuery::stayDto($booked), 'replayed' => true]);
                }
                return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches this booking. Please pay again.'], 409);
            }
        }

        [$first, $last] = $this->names((string) $user->name);

        try {
            $guestId = $guests->ensureGuestForMember($member)->id;
        } catch (\Throwable $e) {
            // Not a booking refusal of any kind — letting it fall into the
            // engine's try/catch below and through confirmError()'s generic
            // RuntimeException branch would misreport it as room_unavailable.
            Log::error('portal.stay_confirm_guest_link_failed', ['org' => $orgId, 'member' => $memberId, 'error' => $e->getMessage()]);
            return $this->fail(response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500), $piId, $orgId, $memberId, $guard);
        }

        $hooks = new PortalStayHooks($guard, $this->pricing, $coupons, $pricing, $orgId, (int) $hold->id, $hold->hold_token, $piId);

        try {
            $engine->confirm([
                'hold_token'        => $hold->hold_token,
                'guest'             => ['first_name' => $first, 'last_name' => $last, 'email' => $user->email, 'phone' => $user->phone],
                'guest_id'          => $guestId,
                'special_requests'  => $data['special_requests'] ?? null,
                'payment_intent_id' => $piId,
                'payment_method'    => $online ? 'stripe' : 'pay_at_venue',
                'payment_status'    => $online ? ($this->intentStatus($pi) === 'succeeded' ? 'paid' : 'authorized') : 'open',
            ], null, $request->header('X-Request-Id'), $request->ip(), $hooks);
        } catch (PaymentAlreadyUsed) {
            // The intent already pays for a booking: it is never released here.
            return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches this booking. Please pay again.'], 409);
        } catch (PaymentUnverifiable) {
            // PortalStayHooks::beforeReservation()'s assertStillPayable()
            // could not read the intent under the pi: lock. The engine's
            // transaction rolled back (no mirror, coupon unconsumed, Smoobu
            // never asked, the hold still active); nothing is released.
            return $this->paymentCheckFailed($orgId, $memberId, $hold, $piId, 'recheck');
        } catch (PaymentMismatch) {
            // Thrown by PortalStayHooks::beforeReservation()'s
            // assertStillPayable(): between this request's own verifyStay()
            // and the moment it took the pi: lock, a DIFFERENT request's
            // failed confirm cancelled this exact intent (or it otherwise
            // stopped being payable) — see PortalPaymentIntentGuard's own
            // docblock. It is already dead or already spoken for; never
            // released here, whichever it is. The engine's transaction
            // rolled back with it: the coupon is unconsumed, no mirror
            // exists, and Smoobu was never called (the hook runs before the
            // reservation).
            return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches this booking. Please pay again.'], 409);
        } catch (\Throwable $e) {
            $hold = $hold->fresh();
            if ($booked = $this->bookingOf($hold, $orgId)) {
                // Either this request's own engine call committed this
                // mirror and something failed strictly AFTER that (the
                // engine's own success log or its confirmation mail), or a
                // DIFFERENT confirm of this same hold won the race under the
                // engine's room lock and this request simply lost — see
                // isLostRace() for how those are told apart. Either way a
                // second, differing intent this request supplied is not
                // this booking's own and is released.
                $this->releaseIfNotOwn($booked, $piId, $orgId, $memberId, $guard);

                if ($this->isLostRace($e)) {
                    // Nothing here created the mirror, so nothing here runs
                    // the notifier again or logs this as a failure after
                    // ITS OWN commit — there wasn't one.
                    return response()->json(['booking' => MemberBookingQuery::stayDto($booked), 'replayed' => true]);
                }

                Log::error('portal.stay_confirm_failed_after_commit', ['org' => $orgId, 'mirror' => $booked->id, 'exception' => get_class($e), 'error' => $e->getMessage()]);
                return $this->booked($booked, $online);
            }
            return $this->fail($this->confirmError($e, $orgId, $piId), $piId, $orgId, $memberId, $guard);
        }

        $booked = $this->bookingOf($hold->fresh(), $orgId);
        if (!$booked) {
            // Nothing proves there is no booking, so nothing is released; an
            // audit row names the hold and the intent so an operator can find
            // both (the sweeper releases the intent later only if no booking
            // ever carries it).
            Log::error('portal.stay_confirm_lost', ['org' => $orgId, 'hold' => $hold->id, 'payment_intent' => $piId]);
            try {
                AuditLog::create([
                    'organization_id' => $orgId,
                    'action'          => 'portal.stay_confirm_lost',
                    'subject_type'    => 'booking_hold',
                    'subject_id'      => (int) $hold->id,
                    'new_values'      => ['hold_id' => (int) $hold->id, 'payment_intent' => $piId, 'member_id' => $memberId],
                    'description'     => "A member's stay confirm returned without a booking for hold #{$hold->id}" . ($piId ? " (payment {$piId})" : '') . ' — check Smoobu and Stripe before the member tries again',
                ]);
            } catch (\Throwable $e) {
                Log::warning('portal.stay_confirm_lost_audit_failed', ['hold' => $hold->id, 'error' => $e->getMessage()]);
            }
            return response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please contact the venue before trying again.'], 500);
        }

        return $this->booked($booked, $online);
    }

    /**
     * The payment could not be checked right now (PaymentUnverifiable): a
     * retryable 503 with nothing released, nothing cancelled, nothing
     * written and the hold left as it is — the next confirm with the same
     * intent can still succeed.
     */
    private function paymentCheckFailed(int $orgId, int $memberId, BookingHold $hold, string $piId, string $stage): JsonResponse
    {
        Log::warning('portal.stay_confirm_refused', ['org' => $orgId, 'member' => $memberId, 'hold' => $hold->id, 'payment_intent' => $piId, 'stage' => $stage, 'reason' => PaymentUnverifiable::CODE]);

        return response()->json(['error' => PaymentUnverifiable::CODE, 'message' => PaymentUnverifiable::MESSAGE], 503);
    }

    /**
     * A second, differing PaymentIntent for a hold that is already booked
     * (a retry after a slow response, or the loser of a same-hold race
     * discovering the winner's booking) is not that booking's own and would
     * otherwise sit there authorised forever. release() already refuses to
     * touch the booking's own intent (carried()) or one naming another
     * member/organisation, so this is always safe to call.
     */
    private function releaseIfNotOwn(BookingMirror $booked, ?string $piId, int $orgId, int $memberId, PortalPaymentIntentGuard $guard): void
    {
        if ($piId !== null && $piId !== $booked->stripe_payment_intent_id) {
            $guard->release($piId, $orgId, $memberId);
        }
    }

    /**
     * True when $e is the engine's own "the hold I re-checked under the
     * room lock was already consumed" refusal — the exact message
     * BookingEngineService::confirm() throws both for a hold that was never
     * active and for one a DIFFERENT confirm consumed between this
     * request's pre-lock checks and the engine's own re-check under the
     * lock. When a mirror now exists for this hold (the caller's own
     * bookingOf() check), that message means "another request already
     * booked it" — this request's own engine call never got far enough to
     * write anything, so it is the RACE'S LOSER, not the winner reporting a
     * post-commit failure.
     */
    private function isLostRace(\Throwable $e): bool
    {
        return $e instanceof \RuntimeException && str_contains($e->getMessage(), 'Hold expired');
    }

    private function booked(BookingMirror $mirror, bool $online): JsonResponse
    {
        app(PortalStayNotifier::class)->notify($mirror, $online);

        return response()->json(['booking' => MemberBookingQuery::stayDto($mirror), 'replayed' => false], 201);
    }

    /** The stay a consumed hold became, read without the Smoobu scope (the member's own booking, whatever the switch says). */
    private function bookingOf(?BookingHold $hold, int $orgId): ?BookingMirror
    {
        $id = (int) ($hold?->payload_json['mirror_id'] ?? 0);
        if (!$hold || $hold->status !== 'consumed' || $id === 0) {
            return null;
        }

        return BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($id)->first();
    }

    /**
     * Every error exit of confirm() that knows a payment_intent_id runs its
     * response through here. PortalPaymentIntentGuard::release() refuses to
     * cancel an intent a booking carries or one whose metadata does not name
     * this organisation and member, so this is always safe to call.
     */
    private function fail(JsonResponse $response, ?string $piId, int $orgId, int $memberId, PortalPaymentIntentGuard $guard): JsonResponse
    {
        $guard->release($piId, $orgId, $memberId);

        return $response;
    }

    private function confirmError(\Throwable $e, int $orgId, ?string $piId): JsonResponse
    {
        if ($e instanceof CouponException) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
        if ($e instanceof HttpException && $e->getStatusCode() === 503) {
            return response()->json(['error' => 'pms_unavailable', 'message' => 'We could not reach the booking system. Please try again in a moment.'], 503);
        }
        // The engine's live-recheck (BookingEngineService::confirm()) only
        // wraps a transient Smoobu failure as its own SmoobuUnavailable/503
        // when the exception isn't a \RuntimeException — but SmoobuClient's
        // own connection-error wrapper throws \RuntimeException too (see its
        // "Smoobu API connection error" catch), so a live cURL/network
        // failure reaches here as a bare RuntimeException indistinguishable
        // by type from the engine's own "room not available" refusals.
        // Classify by message with the engine's own transient-error rule
        // (the same one that already decides createReservation() failures)
        // rather than mis-reporting an infrastructure blip as a taken room.
        if ($e instanceof \RuntimeException && !($e instanceof \Illuminate\Database\QueryException) && BookingEngineService::isTransientSmoobuError($e->getMessage())) {
            return response()->json(['error' => 'pms_unavailable', 'message' => 'We could not reach the booking system. Please try again in a moment.'], 503);
        }
        if ($e instanceof \RuntimeException && str_contains($e->getMessage(), 'Hold expired')) {
            return response()->json(['error' => 'hold_expired', 'message' => 'This took a little too long. Please check the price again.'], 409);
        }
        if ($e instanceof \RuntimeException && str_contains($e->getMessage(), 'PMS configuration')) {
            Log::error('portal.stay_confirm_pms_configuration', ['org' => $orgId, 'error' => $e->getMessage()]);
            return response()->json(['error' => 'pms_unavailable', 'message' => 'We could not complete the booking. Please contact the venue.'], 503);
        }
        if ($e instanceof \RuntimeException && !($e instanceof \Illuminate\Database\QueryException)) {
            // The engine's own refusals: the room was taken here or on another channel.
            return response()->json(['error' => 'room_unavailable', 'message' => 'That room was just booked. Please choose another.'], 409);
        }

        Log::error('portal.stay_confirm_failed', ['org' => $orgId, 'exception' => get_class($e), 'error' => $e->getMessage(), 'payment_intent' => $piId]);
        return response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500);
    }

    /** "Ada King Lovelace" → ["Ada", "King Lovelace"]; one word → [word, word] (the engine and the PMS both want a last name). */
    private function names(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2) ?: [];
        $first = $parts[0] ?? 'Member';

        return [$first !== '' ? $first : 'Member', $parts[1] ?? ($first !== '' ? $first : 'Member')];
    }

    /** retrievePaymentIntent() returns a Stripe\PaymentIntent; tolerates an array too (test doubles). */
    private function intentStatus(mixed $pi): string
    {
        return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? '');
    }

    /**
     * This member's hold, still active, at a price that still stands — or
     * the answer that says why not. Used by paymentIntent() and confirm().
     *
     * @return array{0: BookingHold, 1: PricingResult}|JsonResponse
     */
    private function readyHold(Request $request, LoyaltyMember $member, string $token): array|JsonResponse
    {
        $hold = $this->quotes->ownHold($member, $token);
        if (!$hold) {
            return response()->json(['error' => 'hold_not_found', 'message' => 'We could not find that booking. Please start again.'], 404);
        }
        if (!$hold->isActive()) {
            return response()->json(['error' => 'hold_expired', 'message' => 'This took a little too long. Please check the price again.'], 409);
        }
        try {
            $pricing = $this->quotes->reprice($request->user(), $hold->payload_json);
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
        if (abs($pricing->total - (float) $hold->payload_json['gross_total']) > 0.004) {
            return response()->json(['error' => 'price_changed', 'message' => 'The price has changed. Please check it again.'], 409);
        }

        return [$hold, $pricing];
    }

    /** Stays need rooms, a PMS to write to, and a membership row — the bootstrap's `capabilities.stays`. */
    private function notBookable(Request $request): ?JsonResponse
    {
        if (!$this->capability->staysBookableOnline((int) app('current_organization_id'))) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online stay bookings.'], 404);
        }
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'not_bookable', 'message' => 'Online booking needs a membership at this venue.'], 404);
        }

        return null;
    }

    /** As notBookable(), but a missing membership is the write paths' own code. */
    private function notBookableFor(Request $request): ?JsonResponse
    {
        if (!$this->capability->staysBookableOnline((int) app('current_organization_id'))) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online stay bookings.'], 404);
        }
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }

        return null;
    }

    private function refuse(StayQuoteException $e): JsonResponse
    {
        return response()->json(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->status);
    }
}
