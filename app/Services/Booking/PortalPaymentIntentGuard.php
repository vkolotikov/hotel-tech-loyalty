<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use App\Models\ServiceBooking;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Binds a Stripe PaymentIntent to exactly one confirm(). The portal writes
 * org_id and member_id into every intent's metadata, plus service_id and
 * start_at for an appointment or portal_hold_token for a stay; this is the
 * one place that checks them (plus status and amount) before a confirm is
 * allowed to spend the intent, that never cancels an intent that isn't the
 * caller's own, and that releases a spent intent on a failed confirm so a
 * card hold never outlives the booking attempt.
 *
 * Concurrency: a confirm that is about to spend an intent takes a lock on
 * it (`AdvisoryLock::within('pi:' . $id)`, inside its own transaction —
 * see `PortalStayHooks::beforeReservation()`) and holds it for the rest of
 * that confirm. Every place THIS class might cancel an intent — the
 * mismatch branch of `check()` and all of `release()` — takes the SAME
 * lock, in its OWN transaction (`AdvisoryLock::transaction()`), around its
 * own "is this intent already carried, then cancel" decision. That is what
 * stops a failing confirm for one hold from cancelling an intent a
 * DIFFERENT confirm is that very moment spending for another: whichever
 * request reaches the lock first finishes — commits or cancels — before
 * the other is allowed to even look at `carried()`. Not `final`: a
 * subclass overriding one method is how the confirm-vs-cancel race test
 * drives a real intermediate state without a second process.
 */
class PortalPaymentIntentGuard
{
    public function __construct(private readonly StripeService $stripe)
    {
    }

    /**
     * THE rule for "this booking carries a real Stripe PaymentIntent" — one
     * there is anything online to give back, release or show as paid
     * online: a non-empty intent id that is not a mock one (`pi_mock_`),
     * and a payment method that is not the mock gateway (a stay records
     * one; service_bookings has none, so a service booking passes null).
     * `payment_status` alone is not enough: staff can mark a booking paid
     * for cash with no PaymentIntent behind it. Used by MemberBookingQuery
     * (`paid_online`), MemberCancellation and ServiceBookingRefund; the
     * capture job's SQL and BookingRefundService keep their own.
     */
    public static function isRealIntent(mixed $intentId, mixed $paymentMethod = null): bool
    {
        $pi = (string) $intentId;

        return $pi !== '' && !str_starts_with($pi, 'pi_mock_') && $paymentMethod !== 'mock';
    }

    /**
     * Retrieve the intent and return it only when every one of status, org,
     * member, service, slot and amount matches. Before throwing on a
     * mismatch, cancels the intent — but ONLY when its own metadata names
     * this organisation AND this member; another member's or
     * organisation's intent is refused and left untouched (a member must
     * never be able to cancel a stranger's payment by guessing its id). A
     * retrieval failure (Stripe threw, or returned nothing) throws
     * PaymentUnverifiable without a cancel attempt — there is nothing known
     * about the intent to cancel, and nothing says it is not payable.
     *
     * @throws PaymentMismatch
     * @throws PaymentUnverifiable
     */
    public function verify(string $piId, int $orgId, int $memberId, int $serviceId, \DateTimeInterface $startAt, float $total): mixed
    {
        return $this->check($piId, $orgId, $memberId, $total, fn (array $meta) => (int) ($meta['service_id'] ?? 0) === $serviceId
            && $this->sameInstant($meta['start_at'] ?? null, $startAt));
    }

    /**
     * The same checks for a stay: the intent must have been created for
     * this very hold. An intent made for an appointment, or for another
     * hold of the same member, is a mismatch.
     *
     * @throws PaymentMismatch
     * @throws PaymentUnverifiable
     */
    public function verifyStay(string $piId, int $orgId, int $memberId, string $holdToken, float $total): mixed
    {
        return $this->check($piId, $orgId, $memberId, $total, fn (array $meta) => ($meta['kind'] ?? null) === 'portal_stay_booking'
            && $holdToken !== '' && hash_equals($holdToken, (string) ($meta['portal_hold_token'] ?? '')));
    }

    /** @param callable(array): bool $isForThisBooking */
    private function check(string $piId, int $orgId, int $memberId, float $total, callable $isForThisBooking): mixed
    {
        $pi = $this->retrieveForCheck($piId);

        $meta = $this->metadata($pi);
        $owned = (int) ($meta['org_id'] ?? 0) === $orgId && (int) ($meta['member_id'] ?? 0) === $memberId;

        $ok = $owned
            && in_array($this->status($pi), ['succeeded', 'requires_capture'], true)
            && $isForThisBooking($meta)
            && $this->amountMatches($pi, $total);

        if ($ok) {
            return $pi;
        }

        // $pi is already in hand here — cancel through the same object
        // rather than release()'s own (necessarily fresh) retrieval. But
        // never cancel an intent a real booking already relies on — a
        // member could otherwise void the payment for a booking they
        // already hold by resubmitting its intent id for a different slot.
        // "Carried, then cancel" is one step under the pi: lock (see the
        // class docblock) so this can never race a confirm that is, right
        // now, spending the same intent under that same lock.
        if ($owned) {
            AdvisoryLock::transaction('pi:' . $piId, function () use ($piId, $orgId) {
                if (!$this->carried($piId, $orgId)) {
                    $this->cancel($piId, 'abandoned');
                }
            });
        }
        throw new PaymentMismatch();
    }

    /**
     * Whether the intent's `amount` (Stripe minor units) is exactly $total
     * (major units), converted by StripeService::toSmallestUnit() — the same
     * conversion that created the intent, so a zero-decimal currency (5400
     * yen = amount 5400) matches too. Uses the intent's own currency when it
     * carries one, else the organisation's Stripe currency.
     */
    public function amountMatches(mixed $pi, float $total): bool
    {
        $currency = is_array($pi) ? ($pi['currency'] ?? null) : ($pi->currency ?? null);
        $currency = is_string($currency) && $currency !== '' ? $currency : null;

        return $this->amount($pi) === $this->stripe->toSmallestUnit($total, $currency);
    }

    /**
     * Inside the advisory lock, before the booking row is created: refuse
     * an intent this organisation has already spent on another booking.
     * One PaymentIntent authorises exactly one booking.
     *
     * @throws PaymentAlreadyUsed
     */
    public function assertUnused(string $piId, int $orgId): void
    {
        if ($this->carried($piId, $orgId)) {
            throw new PaymentAlreadyUsed();
        }
    }

    /**
     * Inside the advisory lock, right before the coupon is consumed and the
     * PMS is asked: this request's own `verifyStay()`/`verify()` ran BEFORE
     * the lock was taken, so between that check and this one a DIFFERENT
     * request's failed confirm could have cancelled this very intent (see
     * `release()`'s own docblock) — or it could simply have stopped being
     * payable for any other reason. Retrieves it fresh and refuses unless
     * it is still `requires_capture` or `succeeded`. A retrieve that fails
     * (Stripe threw, or returned nothing) is PaymentUnverifiable, not a
     * mismatch: nothing is known about the intent.
     *
     * @throws PaymentMismatch
     * @throws PaymentUnverifiable
     */
    public function assertStillPayable(string $piId): void
    {
        $pi = $this->retrieveForCheck($piId);

        if (!in_array($this->status($pi), ['succeeded', 'requires_capture'], true)) {
            throw new PaymentMismatch();
        }
    }

    /**
     * The retrieve behind verify(), verifyStay() and assertStillPayable():
     * the intent, or PaymentUnverifiable when it could not be read.
     *
     * @throws PaymentUnverifiable
     */
    private function retrieveForCheck(string $piId): mixed
    {
        try {
            $pi = $this->stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            // Stripe answered that there is no such intent: trying again can
            // never work — a mismatch ("pay again"), never cancelled here
            // (nothing is known about an owner).
            if (self::isMissingIntent($e)) {
                throw new PaymentMismatch($e->getMessage(), 0, $e);
            }
            throw new PaymentUnverifiable($e->getMessage(), 0, $e);
        }
        if (!is_object($pi) && !is_array($pi)) {
            throw new PaymentUnverifiable('Stripe returned no payment intent.');
        }

        return $pi;
    }

    /**
     * Best-effort cancel for a confirm attempt that took (or already held)
     * a payment but did not end in a booking — called on every failing
     * exit once a PaymentIntent has been supplied, whether or not it was
     * ever verified. Only cancels when the intent's own metadata names
     * this organisation and this member, AND no booking in this
     * organisation already carries it — an intent a real booking relies on
     * is never touched here, however this method was reached. A failure
     * (retrieval or cancel) is logged, never swallowed.
     *
     * "Carried, then cancel" runs as one step under the `pi:` lock (see the
     * class docblock) — the same lock a confirm about to spend this exact
     * intent takes before it consumes the coupon and asks the PMS. Whoever
     * gets there first wins outright: if this release() is first, the
     * other confirm's hook (waiting on the lock) retrieves a cancelled
     * intent and refuses on its own account
     * (`PortalPaymentIntentGuard::assertStillPayable()`); if the other
     * confirm is first, this call waits until it commits and then finds
     * the intent carried, so it never cancels it.
     */
    public function release(?string $piId, int $orgId, int $memberId): void
    {
        if ($piId === null || $piId === '') {
            return;
        }

        AdvisoryLock::transaction('pi:' . $piId, function () use ($piId, $orgId, $memberId) {
            if ($this->carried($piId, $orgId)) {
                return;
            }

            try {
                $pi = $this->stripe->retrievePaymentIntent($piId);
            } catch (\Throwable $e) {
                Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
                return;
            }

            $meta = $this->metadata($pi);
            if ((int) ($meta['org_id'] ?? 0) !== $orgId || (int) ($meta['member_id'] ?? 0) !== $memberId) {
                return;
            }

            $this->cancel($piId, 'abandoned');
        });
    }

    /**
     * The two portal-made kinds (metadata `kind`) — the only PaymentIntents
     * releaseOrphan() and the sweeper's own cheap pre-filter
     * (bookings:release-orphan-portal-holds) will ever touch. The public
     * widget's intents (no `kind`, or `hold_token` alone) and any other
     * integration's are never in this list.
     */
    public const PORTAL_KINDS = ['portal_service_booking', 'portal_stay_booking'];

    /**
     * The sweeper's own release: a card the portal authorised for a
     * booking that was never written, found from Stripe's own PaymentIntent
     * list rather than from a member's failed confirm — so, unlike
     * release(), there is no member to compare ownership against.
     *
     * Unlike release() (which trusts a fresh retrieve only for ownership,
     * since the caller's own verify()/verifyStay() already established
     * eligibility moments earlier under the SAME request), the sweeper's
     * caller last looked at Stripe's own list — possibly seconds or minutes
     * before this runs, across a batch of many intents. So this method is
     * the FULL, authoritative recheck, not just "carried, then cancel":
     * carried (DB, no lock needed yet) → retrieve fresh under the `pi:`
     * lock → kind, org, status and age (from the AUTHORISATION time, not
     * the intent's `created`) all re-verified against that fresh read →
     * only then cancel. The caller's own pre-filter (kind/org/status/age
     * from the list result) stays a cheap, non-authoritative first pass;
     * every condition that decides whether money moves is re-proven here,
     * under the lock, against data Stripe gives up right before the cancel
     * call — closing the gap a stale list read would otherwise leave open
     * for a member who authorises long after the sweeper first saw the
     * intent.
     *
     * $olderThanEpoch is the same cutoff (`now - --minutes`) the caller's
     * pre-filter used; a fresh authorisation newer than it is never
     * eligible however old the intent's `created` is (a member who leaves
     * the pay step open for an hour, then pays, must not have their card
     * hold cancelled out from under them).
     *
     * Returns whether the intent was actually cancelled (false when it
     * turned out to be carried, no longer matches, or the cancel call
     * itself failed — logged, never thrown).
     */
    public function releaseOrphan(string $piId, int $orgId, int $olderThanEpoch): bool
    {
        return (bool) AdvisoryLock::transaction('pi:' . $piId, function () use ($piId, $orgId, $olderThanEpoch) {
            if ($this->carried($piId, $orgId)) {
                return false;
            }

            try {
                $pi = $this->stripe->retrievePaymentIntent($piId, ['latest_charge']);
            } catch (\Throwable $e) {
                Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
                return false;
            }

            $meta = $this->metadata($pi);
            if (!in_array($meta['kind'] ?? null, self::PORTAL_KINDS, true)) {
                return false;
            }
            if ((int) ($meta['org_id'] ?? 0) !== $orgId) {
                return false;
            }
            if ($this->status($pi) !== 'requires_capture') {
                return false;
            }
            $authorizedAt = $this->authorizedAt($pi);
            if ($authorizedAt === null || $authorizedAt > $olderThanEpoch) {
                return false;
            }

            try {
                $this->stripe->cancelPaymentIntent($piId, 'abandoned');
            } catch (\Throwable $e) {
                Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
                return false;
            }

            return true;
        });
    }

    /**
     * A lock-free read of whether a booking of this organisation already
     * carries this PaymentIntent. For read-only reporting ONLY
     * (`--dry-run`): nothing is decided or acted on from the answer, so it
     * may freely race a confirm or a real release. releaseOrphan() and
     * release() take their OWN fresh read of this under the `pi:` lock
     * before ever touching Stripe — this is not a substitute for that.
     */
    public function isCarried(string $piId, int $orgId): bool
    {
        return $this->carried($piId, $orgId);
    }

    /** True when a booking of this organisation — an appointment or a stay — already carries this PaymentIntent: the one condition under which it must never be cancelled. */
    private function carried(string $piId, int $orgId): bool
    {
        return ServiceBooking::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->exists()
            || BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->exists();
    }

    private function cancel(string $piId, string $reason): void
    {
        try {
            $this->stripe->cancelPaymentIntent($piId, $reason);
        } catch (\Throwable $e) {
            Log::warning('portal.payment_intent_release_failed', ['payment_intent' => $piId, 'error' => $e->getMessage()]);
        }
    }

    /** Stripe's own "no such payment intent": code `resource_missing`, or HTTP 404. */
    private static function isMissingIntent(\Throwable $e): bool
    {
        $code = method_exists($e, 'getStripeCode') ? (string) $e->getStripeCode() : '';
        $http = method_exists($e, 'getHttpStatus') ? (int) $e->getHttpStatus() : 0;

        return $e instanceof \Stripe\Exception\ApiErrorException && ($code === 'resource_missing' || $http === 404);
    }

    /** Stripe's metadata values are strings; compares as timestamps, never as strings. */
    private function sameInstant(mixed $raw, \DateTimeInterface $expected): bool
    {
        if (!is_string($raw) || $raw === '') {
            return false;
        }
        try {
            return CarbonImmutable::parse($raw)->getTimestamp() === $expected->getTimestamp();
        } catch (\Throwable) {
            return false;
        }
    }

    /** retrievePaymentIntent() returns a Stripe\PaymentIntent; these three tolerate an array too (test doubles). */
    private function status(mixed $pi): string
    {
        return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? '');
    }

    private function amount(mixed $pi): int
    {
        return is_array($pi) ? (int) ($pi['amount'] ?? 0) : (int) ($pi->amount ?? 0);
    }

    private function metadata(mixed $pi): array
    {
        $m = is_array($pi) ? ($pi['metadata'] ?? []) : ($pi->metadata ?? []);
        return is_array($m) ? $m : (method_exists($m, 'toArray') ? $m->toArray() : (array) $m);
    }

    /**
     * When the card was actually authorised, not when the PaymentIntent
     * object was created — a member can leave the pay step open long after
     * creating the intent, then authorise. Reads the expanded
     * `latest_charge`'s own `created` (the charge exists only once an
     * authorisation attempt succeeded).
     *
     * Fails CLOSED for a still-open (`requires_capture`) intent: if
     * `latest_charge` isn't an expanded object — a bare id string (the
     * caller didn't ask Stripe to expand it, or something upstream
     * stripped it), or nothing at all — returns null rather than guessing
     * from the intent's own `created`, which defeats the whole point of
     * judging age from the authorisation the moment nothing proves what
     * that authorisation time actually was. releaseOrphan()
     * treats null the same as "too recent": never release it.
     *
     * The `created` fallback applies only to an intent that is NOT
     * `requires_capture` — a status releaseOrphan() has already refused
     * before it ever calls this, so in effect a missing expanded charge
     * means "never released", full stop.
     */
    private function authorizedAt(mixed $pi): ?int
    {
        $charge = is_array($pi) ? ($pi['latest_charge'] ?? null) : ($pi->latest_charge ?? null);
        if (is_object($charge) && isset($charge->created)) {
            return (int) $charge->created;
        }
        if (is_array($charge) && isset($charge['created'])) {
            return (int) $charge['created'];
        }

        if ($this->status($pi) === 'requires_capture') {
            return null;
        }

        return (int) (is_array($pi) ? ($pi['created'] ?? 0) : ($pi->created ?? 0));
    }
}
