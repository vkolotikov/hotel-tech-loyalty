<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\BookingRefundService;
use App\Services\LoyaltyService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * A member cancels their own booking. The order is the point: under a lock
 * on the booking, the policy is checked, then the money is returned, and
 * only then is the booking cancelled and its coupon given back. A payment
 * that cannot be returned leaves the booking standing.
 *
 * Whose booking it is, is the caller's to establish (MemberBookingQuery);
 * this class is told which organisation it must belong to.
 *
 * The booking row is locked (`lockForUpdate`) for the whole transaction, so
 * two concurrent cancels of the same booking cannot both refund: the second
 * blocks until the first commits, then re-reads a booking that is already
 * `cancelled` and is refused by the policy check. When the booking carries
 * a real (non-mock) PaymentIntent, the read-Stripe-write sequence also runs
 * under `AdvisoryLock::within('pi:' . $intentId)` — the same key
 * `PortalPaymentIntentGuard` and the portal's own confirm path take around
 * their PaymentIntent decisions — so this cancellation cannot interleave
 * with a confirm on the same intent (one waits for the other's transaction
 * to commit before it reads the intent's status). Both locks are held for
 * the same DB transaction this method opens, so they are released together
 * at commit or rollback. On sqlite (the test suite) `within()` is a no-op;
 * the booking row lock alone still serialises within the process, which is
 * all a single-process test can exercise.
 *
 * The capture cron (`CapturePendingPaymentIntents`) takes this same `pi:`
 * lock too (row lock first, `pi:` second, the same order this class uses),
 * and writes `payment_status` only conditionally on the status it just
 * read — so a cancellation cannot interleave with the cron on the same
 * intent.
 *
 * `cancelStay()` is wrapped in a non-blocking app lock (`Cache::lock`) so a
 * second concurrent cancel of the same stay fails fast with 409 instead of
 * queueing behind a Stripe/PMS round trip. Unlike `cancelService()`, it
 * does NOT run start to finish inside one database transaction — an
 * already-captured payment is refunded through
 * `BookingRefundService::applyRefund()` (the same call the staff refund
 * path makes), which takes its own `refund:` lock, commits a
 * `RefundAttempt` row before it ever calls Stripe, and updates the mirror,
 * the PMS and the member's mailbox itself. Wrapping that call inside our
 * own transaction would let a later failure (our own `save()`, an audit
 * insert, the commit) roll back a refund Stripe has already issued and
 * Smoobu has already cancelled — the webhook would then see no committed
 * record of it and run it all again. So `cancelStay()` instead runs in
 * three parts: a short transaction that locks the row (`lockForUpdate`,
 * `pi:` second, same order as `cancelService()`) and decides what Stripe
 * says the payment is now — for anything except an already-captured
 * payment it also writes and commits the cancellation there, with the PMS
 * cancelled only after that commit (best effort); for a captured payment
 * it commits nothing and instead calls `applyRefund()` completely outside
 * any transaction, exactly the way the staff path and the `charge.refunded`
 * webhook call it; then a second short transaction writes the cancellation
 * columns (never the money columns `applyRefund()` already wrote) and
 * releases the coupon. A failure between the refund and that last write is
 * healed by the member simply cancelling again — the policy check
 * recognises a stay whose money is already back in full and picks up at
 * the last step, with no second Stripe call.
 */
final class MemberCancellation
{
    public const REASON = 'member_portal';

    /** Audit action written (and committed) right before cancelStay() asks for a captured stay's refund — see stayDecision(). */
    public const STARTED = 'booking.member_cancel_started';

    public function __construct(
        private readonly ServiceBookingRefund $serviceRefund,
        private readonly CouponRelease $coupons,
        private readonly LoyaltyService $loyalty,
        private readonly StripeService $stripe,
        private readonly BookingRefundService $stayRefund,
        private readonly SmoobuClient $smoobu,
    ) {}

    /**
     * $orgId is a programming input, not a member-facing one (the caller —
     * MemberBookingQuery's owner check — has already established whose
     * booking this is); a mismatch against the ambient tenant is a bug in
     * that caller, not something a member did, so it throws a plain
     * \LogicException rather than a CancellationException with a portal
     * error code. When no tenant is bound at all, one is bound for the
     * duration (the way BookingPointsService::underBookingOrg() does) so
     * StripeService and every tenant-scoped model read the right
     * organisation's settings throughout the cancellation, and unbound
     * again afterwards — cancelService() must leave the ambient tenant
     * exactly as it found it.
     *
     * @throws CancellationException
     */
    public function cancelService(int $orgId, int $bookingId): CancellationOutcome
    {
        $ambient = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if ($ambient !== null && (int) $ambient !== $orgId) {
            throw new \LogicException("MemberCancellation::cancelService() was called for organisation {$orgId} while the ambient tenant is bound to {$ambient}.");
        }
        if ($ambient === null) {
            app()->instance('current_organization_id', $orgId);
        }

        try {
            return DB::transaction(function () use ($orgId, $bookingId) {
                $b = ServiceBooking::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->whereKey($bookingId)
                    ->lockForUpdate()
                    ->first();
                if (!$b) {
                    throw new CancellationException('not_found', 'We could not find that booking.', 404);
                }

                $decision = self::serviceDecision($b);
                $this->assertAllowed($decision['policy']);
                if ($decision['converge']) {
                    // The money is already back in full and the booking was
                    // never cancelled (serviceDecision()); no Stripe call.
                    $money = ['money' => 'refunded', 'amount' => round((float) $b->refunded_amount, 2), 'columns' => []];
                } else {

                    $pi = (string) $b->stripe_payment_intent_id;
                    if (PortalPaymentIntentGuard::isRealIntent($pi)) {
                        // Everything from here to the booking's save() — reading what
                        // Stripe now says about the intent, acting on it, writing the
                        // outcome — runs under this lock, so a confirm or the capture
                        // cron holding the same key cannot interleave with it (see the
                        // class docblock).
                        AdvisoryLock::within('pi:' . $pi);
                    }

                    $money = $this->serviceRefund->giveBack($b);
                }

                $b->forceFill([
                    'status'              => 'cancelled',
                    'cancelled_at'        => now(),
                    'cancellation_reason' => self::REASON,
                ] + $money['columns'])->save();
                if ($money['money'] === 'refunded') {
                    app(AppointmentMoney::class)->recordOutsideCardRefund($b, $b->last_refund_id, 'Refunded in the member portal');
                }

                return new CancellationOutcome(
                    kind: 'service',
                    booking: $b,
                    money: $money['money'],
                    amount: $money['amount'],
                    currency: strtoupper((string) ($b->currency ?: 'EUR')),
                    couponReleased: $this->coupons->release($b->discount_source, $b->discount_source_id ? (int) $b->discount_source_id : null, (string) $b->booking_reference),
                    pointsReversed: $this->reverseAndCount('service_booking', (int) $b->id, "Appointment {$b->booking_reference} cancelled"),
                );
            });
        } finally {
            if ($ambient === null) {
                app()->forgetInstance('current_organization_id');
            }
        }
    }

    /**
     * Same guard as cancelService(): $orgId is a programming input the
     * caller (MemberBookingQuery's owner check) already validated
     * ownership for, so a mismatch against the ambient tenant is a bug in
     * the caller, not something a member did. Binds the tenant for the
     * duration when none is bound yet, so StripeService and every
     * tenant-scoped read see the right organisation through every phase of
     * the cancellation; the caller restores it (`forgetInstance`) when this
     * returns null, in its own `finally`.
     */
    private function bindStayTenant(int $orgId): ?int
    {
        $ambient = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if ($ambient !== null && (int) $ambient !== $orgId) {
            throw new \LogicException("MemberCancellation::cancelStay() was called for organisation {$orgId} while the ambient tenant is bound to {$ambient}.");
        }
        if ($ambient === null) {
            app()->instance('current_organization_id', $orgId);
        }

        return $ambient;
    }

    /**
     * A non-blocking app lock answers a second, concurrent cancel of the
     * same stay with 409 straight away instead of making it queue behind
     * the external round trip a captured payment's refund can take.
     *
     * This does NOT run start to finish inside one transaction — see the
     * class docblock for why. Phase 1 (below) is a single short
     * transaction: it locks the mirror row (`lockForUpdate`) and re-reads
     * it, checks the policy against that fresh read, and — for a real
     * (non-mock) PaymentIntent — takes `AdvisoryLock::within('pi:' .
     * $intentId)` before asking Stripe anything, the same row-then-`pi:`
     * order `cancelService()` uses. For every payment state except an
     * already-captured one, phase 1 also writes and commits the
     * cancellation itself (the PMS cancellation for those runs after that
     * commit, best effort, outside any lock — see cancelAtPmsAfterCommit()).
     * For a captured payment, phase 1 commits nothing but its own read and
     * defers to refundCapturedStay() (phase 2, `applyRefund()` — no
     * transaction, no row lock, exactly how the staff path and the
     * `charge.refunded` webhook call it) and finishRefundedStay() (phase
     * 3, a second short transaction that writes only the cancellation
     * columns, never the money columns phase 2 already wrote).
     *
     * @throws CancellationException
     */
    public function cancelStay(int $orgId, int $mirrorId): CancellationOutcome
    {
        $ambient = $this->bindStayTenant($orgId);

        try {
            $lock = Cache::lock("portal-cancel:stay:{$mirrorId}", 60);
            if (!$lock->get()) {
                throw new CancellationException('cancel_in_progress', 'This booking is being cancelled. Please check it again in a moment.', 409);
            }

            try {
                $phase1 = DB::transaction(function () use ($orgId, $mirrorId) {
                    $m = BookingMirror::withoutGlobalScopes()
                        ->where('organization_id', $orgId)
                        ->whereKey($mirrorId)
                        ->lockForUpdate()
                        ->first();
                    if (!$m) {
                        throw new CancellationException('not_found', 'We could not find that booking.', 404);
                    }
                    // cancelled_at set, convergence, or the plain policy — one
                    // rule, shared with the booking DTO (stayDecision()).
                    $decision = self::stayDecision($m);
                    $this->assertAllowed($decision['policy']);
                    if ($decision['converge']) {
                        // Money already back in full: straight to phase 3, no Stripe call.
                        return ['mode' => 'converge', 'mirrorId' => $m->id, 'amount' => round((float) $m->refunded_amount, 2)];
                    }

                    $pi = (string) $m->stripe_payment_intent_id;
                    $hasRealIntent = PortalPaymentIntentGuard::isRealIntent($pi, $m->payment_method);

                    if (!$hasRealIntent) {
                        return ['mode' => 'finished', 'mirrorId' => $m->id, 'outcome' => $this->writeStayCancellation($m, 'none', 0.0, [], false)];
                    }

                    // Everything from here to the end of this transaction —
                    // reading what Stripe now says about the intent, acting
                    // on it (cancelling a hold), writing the outcome for
                    // every path except an already-captured payment — runs
                    // under this lock, so a confirm or the capture cron
                    // holding the same key cannot interleave with it. A
                    // captured payment's own refund (phase 2, below) is
                    // deliberately NOT covered by this lock — it runs
                    // outside this transaction entirely.
                    AdvisoryLock::within('pi:' . $pi);

                    if (!$this->stripe->isEnabled()) {
                        throw new CancellationException('refund_unavailable', 'Online payments are switched off at this venue, so the payment cannot be returned here. Please contact the venue.', 409);
                    }

                    try {
                        $status = (string) ($this->stripe->retrievePaymentIntent($pi)->status ?? '');
                    } catch (\Throwable $e) {
                        Log::error('portal.stay_refund_failed', ['org' => $m->organization_id, 'mirror' => $m->id, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
                        throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
                    }

                    if ($status === 'succeeded') {
                        // Defer to phase 2 — nothing is written here.
                        return ['mode' => 'refund', 'mirrorId' => $m->id, 'pi' => $pi];
                    }

                    if ($status !== 'canceled') {
                        try {
                            $this->stripe->cancelPaymentIntent($pi, 'requested_by_customer');
                        } catch (\Throwable $e) {
                            Log::error('portal.stay_refund_failed', ['org' => $m->organization_id, 'mirror' => $m->id, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
                            throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
                        }
                    }

                    $amount = round((float) $m->price_total, 2);
                    return ['mode' => 'finished', 'mirrorId' => $m->id, 'outcome' => $this->writeStayCancellation($m, 'released', $amount, ['payment_status' => 'cancelled'], false)];
                });

                if ($phase1['mode'] === 'finished') {
                    return $phase1['outcome']->withPms($this->cancelAtPmsAfterCommit($phase1['mirrorId']));
                }

                if ($phase1['mode'] === 'converge') {
                    return $this->finishRefundedStay($orgId, $phase1['mirrorId'], $phase1['amount'], false, null);
                }

                // mode === 'refund': phase 2, then phase 3.
                return $this->refundCapturedStay($orgId, $phase1['mirrorId'], $phase1['pi']);
            } finally {
                $lock->release();
            }
        } finally {
            if ($ambient === null) {
                app()->forgetInstance('current_organization_id');
            }
        }
    }

    /**
     * The booking's money is already back in full: `refunded`, with a
     * recorded refunded amount of at least the booking's total (1-cent
     * tolerance). Partially refunded, disputed, or a `refunded` status with
     * less recorded than the total is not.
     */
    private static function isRefundedInFull(string $paymentStatus, mixed $refunded, mixed $total): bool
    {
        return $paymentStatus === 'refunded'
            && $refunded !== null
            && (float) $refunded > 0
            && (float) $refunded >= (float) $total - 0.01;
    }

    /**
     * May the member cancel this booking, as the cancel endpoint will judge
     * it — the booking DTO's `can_cancel` / `cancel_deadline`
     * (MemberBookingQuery). The same decision cancelService()/cancelStay()
     * make, so a booking they would finish (converge) is offered after a
     * reload too.
     *
     * @return array{can_cancel: bool, deadline: ?\Carbon\CarbonImmutable, reason: ?string}
     */
    public static function policyFor(ServiceBooking|BookingMirror $b): array
    {
        return ($b instanceof ServiceBooking ? self::serviceDecision($b) : self::stayDecision($b))['policy'];
    }

    /**
     * An appointment refunded in full (our own earlier attempt's refund,
     * recorded by the charge.refunded webhook, or a dashboard refund) is
     * finished as a `refunded` cancellation when the booking itself still
     * stands — the policy judges status and deadline on a copy whose money
     * looks untouched, so a booking staff already cancelled stays
     * `already_cancelled`. A service cancellation refunds inside the same
     * transaction that writes it, so a refund of ours without the
     * cancellation can only show here through the webhook, on a booking that
     * is still not cancelled.
     *
     * @return array{policy: array, converge: bool}
     */
    private static function serviceDecision(ServiceBooking $b): array
    {
        if (self::isRefundedInFull((string) $b->payment_status, $b->refunded_amount, $b->total_amount)) {
            $probe = clone $b;
            $probe->payment_status = 'paid';

            return ['policy' => CancellationPolicy::forService($probe), 'converge' => true];
        }

        return ['policy' => CancellationPolicy::forService($b), 'converge' => false];
    }

    /**
     * A stay: `cancelled_at` set (only a member's cancellation sets it) is
     * already cancelled. Refunded in full with `cancelled_at` null converges —
     * decided on `cancelled_at`, not on the statuses, because our own
     * refund's PMS cancellation and the sync then mark it cancelled within
     * seconds — EXCEPT when the statuses already say cancelled and no
     * cancellation of the member's ever started a refund (no STARTED marker):
     * a stay staff cancelled and refunded is not the member's to stamp. A
     * refund recorded on a stay that still stands (dashboard, webhook)
     * converges like an appointment's. Otherwise the plain policy.
     *
     * @return array{policy: array, converge: bool}
     */
    private static function stayDecision(BookingMirror $m): array
    {
        $already = ['can_cancel' => false, 'deadline' => null, 'reason' => CancellationPolicy::ALREADY_CANCELLED];
        if ($m->cancelled_at !== null) {
            return ['policy' => $already, 'converge' => false];
        }
        if (!self::isRefundedInFull((string) $m->payment_status, $m->refunded_amount, $m->price_total)) {
            return ['policy' => CancellationPolicy::forStay($m), 'converge' => false];
        }

        $statusesCancelled = (string) $m->internal_status === 'cancelled' || (string) $m->booking_state === 'cancelled';
        if ($statusesCancelled && !self::memberStarted($m)) {
            return ['policy' => $already, 'converge' => false];
        }
        $probe = clone $m;
        $probe->payment_status = 'open';
        if ((string) $probe->booking_state === 'cancelled') {
            $probe->booking_state = 'confirmed';
        }
        if ((string) $probe->internal_status === 'cancelled') {
            $probe->internal_status = 'confirmed';
        }

        return ['policy' => CancellationPolicy::forStay($probe), 'converge' => true];
    }

    /** Whether a cancellation of the member's ever started refunding this stay (the STARTED marker). */
    private static function memberStarted(BookingMirror $m): bool
    {
        return AuditLog::withoutGlobalScopes()
            ->where('organization_id', (int) $m->organization_id)
            ->where('action', self::STARTED)
            ->where('subject_type', 'booking_mirror')
            ->where('subject_id', $m->id)
            ->exists();
    }

    /**
     * Phase 2: refund an already-captured payment exactly the way the
     * staff refund path and the `charge.refunded` webhook do — no
     * transaction, no row lock, BookingRefundService::applyRefund() takes
     * its own `refund:` lock and commits its own `RefundAttempt` row
     * before it calls Stripe, so a failure anywhere after that call
     * leaves a real record behind rather than losing it to a rollback.
     *
     * @throws CancellationException
     */
    private function refundCapturedStay(int $orgId, int $mirrorId, string $pi): CancellationOutcome
    {
        $m = $this->readStay($orgId, $mirrorId);

        // Phase 1 committed and let go of its locks before this read, so the
        // row may have moved in the gap. Money already back in full (the
        // charge.refunded webhook, say) is finished like a retry would be;
        // anything else that is no longer "paid, nothing refunded" — a staff
        // partial refund, a dispute — is not ours to refund on top of.
        if (self::isRefundedInFull((string) $m->payment_status, $m->refunded_amount, $m->price_total)) {
            // The same rule as phase 1 (a stay staff cancelled and refunded
            // in the gap is not the member's to stamp).
            $this->assertAllowed(self::stayDecision($m)['policy']);
            return $this->finishRefundedStay($orgId, $mirrorId, round((float) $m->refunded_amount, 2), false, null);
        }
        if ((string) $m->payment_status !== 'paid' || (float) $m->refunded_amount > 0) {
            throw new CancellationException('not_cancellable', 'This booking cannot be cancelled here. Please contact the venue.', 422);
        }

        // Our marker, committed before any money moves: a retry that finds
        // this stay refunded in full with its statuses already cancelled (the
        // refund's own PMS cancellation, then the sync) knows the refund was
        // this cancellation's own and may finish it (stayDecision()). Written
        // outside any transaction; if it cannot be written, nothing has moved.
        AuditLog::create([
            'organization_id' => (int) $m->organization_id,
            'action'          => self::STARTED,
            'subject_type'    => 'booking_mirror',
            'subject_id'      => $m->id,
            'new_values'      => ['payment_intent' => $pi],
            'description'     => "The member started cancelling stay #{$m->id}; its payment is being refunded",
        ]);

        try {
            $done = $this->stayRefund->applyRefund($m, null, 'requested_by_customer', null, true, null);
        } catch (\Throwable $e) {
            if (!$this->isChargeAlreadyRefunded($e)) {
                Log::error('portal.stay_refund_failed', ['org' => $orgId, 'mirror' => $mirrorId, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
                throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
            }

            // The charge left Stripe already — from the dashboard, or from an
            // earlier attempt whose own write failed and is only now being
            // retried. Read the row again: if that refund is already recorded
            // in full (the webhook got there), go straight to phase 3 — a
            // second applyRefund() would refuse an already-refunded row.
            // Otherwise record it without asking Stripe again.
            $m = $this->readStay($orgId, $mirrorId);
            if (self::isRefundedInFull((string) $m->payment_status, $m->refunded_amount, $m->price_total)) {
                return $this->finishRefundedStay($orgId, $mirrorId, round((float) $m->refunded_amount, 2), false, null);
            }
            try {
                $done = $this->stayRefund->applyRefund($m, null, 'requested_by_customer', null, false, null);
            } catch (\Throwable $inner) {
                Log::error('portal.stay_refund_failed', ['org' => $orgId, 'mirror' => $mirrorId, 'payment_intent' => $pi, 'error' => $inner->getMessage()]);
                throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
            }
        }

        $pms = !empty($done['pms_cancelled']) ? true : ($this->pmsCancellable($m) ? false : null);

        return $this->finishRefundedStay($orgId, $mirrorId, round((float) $m->price_total, 2), (bool) $done['email_sent'], $pms);
    }

    private function readStay(int $orgId, int $mirrorId): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($mirrorId)->firstOrFail();
    }

    /**
     * Phase 3: the money is already back (via applyRefund() just now, or a
     * previous attempt's committed refund — the convergence case). A
     * second short transaction locks the row again, writes only the
     * cancellation columns — never payment_status / refunded_amount /
     * refunded_at / last_refund_id, which whichever path got here already
     * wrote — releases the coupon and reverses whatever points are still
     * unreversed. A failure here (the coupon release, a model event) rolls
     * this transaction back and is NOT swallowed: it must reach the
     * caller as an error, because the alternative — recording the
     * cancellation as done while the coupon stays spent — is worse than
     * asking the member to cancel again, which the convergence check above
     * makes safe to do.
     */
    private function finishRefundedStay(int $orgId, int $mirrorId, float $amount, bool $memberMailed, ?bool $pms): CancellationOutcome
    {
        return DB::transaction(function () use ($orgId, $mirrorId, $amount, $memberMailed, $pms) {
            $m = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($mirrorId)
                ->lockForUpdate()
                ->firstOrFail();

            // Re-checked under this row lock: a concurrent cancel on another
            // app instance (the cancel_in_progress cache lock is per instance
            // on a local cache store) may have finished it since phase 1 —
            // no second audit row, no second coupon release, no second mail.
            if ($m->cancelled_at !== null) {
                throw new CancellationException('already_cancelled', 'This booking is already cancelled.', 409);
            }

            // Read before this call writes the cancellation: whether the PMS
            // reservation is already cancelled (applyRefund() cancels it and
            // stamps booking_state; the PMS sync writes internal_status).
            $pms ??= $this->pmsStateOf($m);

            $m->forceFill([
                'internal_status'     => 'cancelled',
                'booking_state'       => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_reason' => self::REASON,
            ])->save();

            $couponReleased = $this->releaseStayCoupon($m);
            // BookingRefundService::applyRefund() (phase 2, or the earlier
            // attempt a retry is finishing) already reversed this stay's
            // points; reverseAndCount() reverses whatever is still unreversed
            // and reports the total, the same count as every other path.
            $pointsReversed = $this->reverseAndCount('booking_mirror', (int) $m->id, 'Stay ' . $this->stayReference($m) . ' cancelled');
            $this->auditMemberCancelled($m, 'refunded', $amount);

            return new CancellationOutcome(
                kind: 'stay',
                booking: $m,
                money: 'refunded',
                amount: $amount,
                currency: strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
                couponReleased: $couponReleased,
                pointsReversed: $pointsReversed,
                memberMailed: $memberMailed,
                pmsCancelled: $pms,
            );
        });
    }

    /** Writes the cancellation, the coupon release and the points reversal for every path except an already-captured payment — used inside phase 1's own transaction, so it never touches Stripe or the PMS itself. */
    private function writeStayCancellation(BookingMirror $m, string $money, float $amount, array $columns, bool $memberMailed): CancellationOutcome
    {
        $m->forceFill([
            'internal_status'     => 'cancelled',
            'booking_state'       => 'cancelled',
            'cancelled_at'        => now(),
            'cancellation_reason' => self::REASON,
        ] + $columns)->save();

        $couponReleased = $this->releaseStayCoupon($m);
        $pointsReversed = $this->reverseAndCount('booking_mirror', (int) $m->id, 'Stay ' . $this->stayReference($m) . ' cancelled');
        $this->auditMemberCancelled($m, $money, $amount);

        return new CancellationOutcome(
            kind: 'stay',
            booking: $m,
            money: $money,
            amount: $amount,
            currency: strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
            couponReleased: $couponReleased,
            pointsReversed: $pointsReversed,
            memberMailed: $memberMailed,
        );
    }

    /** Stripe's own code for "there is nothing left on this charge to refund" — checked by code, never by the exception's message text. Mirrors ServiceBookingRefund::isChargeAlreadyRefunded(); not shared, since duplicating this one check avoids coupling the two refund paths together. */
    private function isChargeAlreadyRefunded(\Throwable $e): bool
    {
        return method_exists($e, 'getStripeCode') && (string) $e->getStripeCode() === 'charge_already_refunded';
    }

    /**
     * Best effort, and deliberately outside any transaction and after
     * phase 1 has already committed the cancellation: a PMS that refuses
     * is the venue's to clear up, never the member's failure, and must
     * never roll back a cancellation the member has already been told
     * succeeded. Returns true when the PMS cancelled it, false when it
     * refused or could not be reached, null when there was nothing to
     * cancel there (CancellationOutcome::$pmsCancelled).
     */
    private function cancelAtPmsAfterCommit(int $mirrorId): ?bool
    {
        $m = BookingMirror::withoutGlobalScopes()->find($mirrorId);
        if (!$m || !$this->pmsCancellable($m)) {
            return null;
        }
        $id = (string) $m->reservation_id;
        try {
            $this->smoobu->cancelReservation($id);

            return true;
        } catch (\Throwable $e) {
            Log::warning('portal.stay_pms_cancel_failed', ['mirror' => $m->id, 'reservation' => $id, 'error' => $e->getMessage()]);
            try {
                AuditLog::create([
                    'organization_id' => (int) $m->organization_id,
                    'action'          => 'booking.pms.cancel_failed',
                    'subject_type'    => 'booking_mirror',
                    'subject_id'      => $m->id,
                    'new_values'      => ['reservation_id' => $id, 'error' => mb_substr($e->getMessage(), 0, 500), 'source' => self::REASON],
                    'description'     => "The member cancelled stay #{$m->id} but the PMS refused the cancellation — cancel reservation {$id} in Smoobu",
                ]);
            } catch (\Throwable) {
                // best effort
            }

            return false;
        }
    }

    /** Whether the stay has a reservation in the PMS to cancel: not local-only (never reached Smoobu), not a mock booking — the rule BookingRefundService applies too. */
    private function pmsCancellable(BookingMirror $m): bool
    {
        $id = (string) $m->reservation_id;

        return $id !== '' && !str_starts_with($id, 'LOCAL-') && $m->payment_method !== 'mock';
    }

    /**
     * For a stay whose refund ran in an earlier call (so this call has no PMS
     * result of its own): true when the row already says the reservation is
     * cancelled (applyRefund() stamps booking_state after a PMS cancel; the
     * PMS sync writes internal_status), false when it is still open there,
     * null when there is nothing to cancel in the PMS.
     */
    private function pmsStateOf(BookingMirror $m): ?bool
    {
        if (!$this->pmsCancellable($m)) {
            return null;
        }

        return (string) $m->booking_state === 'cancelled' || (string) $m->internal_status === 'cancelled';
    }

    private function stayReference(BookingMirror $m): string
    {
        return (string) ($m->booking_reference ?: $m->reservation_id);
    }

    /**
     * By the reference the portal gives a stay's coupon (`BM:{mirror id}`,
     * PortalStayHooks::couponReference(), which no sync rewrites), and —
     * for a stay booked before that reference existed — by the legacy one,
     * the booking reference. CouponRelease only ever touches a row that
     * still carries the reference it is given.
     */
    private function releaseStayCoupon(BookingMirror $m): bool
    {
        $source = $m->discount_source;
        $sourceId = $m->discount_source_id ? (int) $m->discount_source_id : null;

        return $this->coupons->release($source, $sourceId, PortalStayHooks::couponReference((int) $m->id))
            || $this->coupons->release($source, $sourceId, $this->stayReference($m));
    }

    /**
     * One audit row per successful member cancellation, wrapped in its own
     * nested transaction (a SAVEPOINT under the transaction that writes the
     * cancellation, on drivers that support one) so a failing insert here
     * cannot poison — and so cannot abort, on PostgreSQL — the surrounding
     * transaction that must still commit the cancellation itself. Best
     * effort, like the PMS-failure audit above: swallowed, logged, never
     * the cancellation's own failure.
     */
    private function auditMemberCancelled(BookingMirror $m, string $money, float $amount): void
    {
        try {
            DB::transaction(function () use ($m, $money, $amount) {
                AuditLog::create([
                    'organization_id' => (int) $m->organization_id,
                    'action'          => 'booking.member_cancelled',
                    'subject_type'    => 'booking_mirror',
                    'subject_id'      => $m->id,
                    'new_values'      => ['money' => $money, 'amount' => $amount, 'reference' => (string) ($m->booking_reference ?: $m->reservation_id)],
                    'description'     => "Member cancelled stay #{$m->id} ({$money}" . ($amount > 0 ? ', ' . number_format($amount, 2) : '') . ')',
                ]);
            });
        } catch (\Throwable $e) {
            Log::warning('portal.stay_cancel_audit_failed', ['mirror' => $m->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * THE one place `pointsReversed` is counted, for every path of both
     * kinds: reverse whatever of this booking's awards is still unreversed
     * (reversePoints()), then report every point of its awards that now
     * stands reversed. A cancellation can only start while the booking's
     * money is untouched, so what is reversed by then was reversed by this
     * cancellation — including, for a refunded stay, what
     * BookingRefundService::applyRefund() reversed while returning its money
     * (this call's, or the earlier attempt a retry finishes). A reversal
     * that failed is not counted.
     */
    private function reverseAndCount(string $referenceType, int $referenceId, string $reason): int
    {
        $this->reversePoints($referenceType, $referenceId, $reason);

        return $this->reversedPoints($referenceType, $referenceId);
    }

    private function reversedPoints(string $referenceType, int $referenceId): int
    {
        return (int) PointsTransaction::withoutGlobalScopes()
            ->where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->where('points', '>', 0)
            ->where('is_reversed', true)
            ->sum('points');
    }

    /** @throws CancellationException */
    private function assertAllowed(array $policy): void
    {
        if ($policy['can_cancel']) {
            return;
        }
        throw match ($policy['reason']) {
            CancellationPolicy::ALREADY_CANCELLED => new CancellationException('already_cancelled', 'This booking is already cancelled.', 409),
            CancellationPolicy::OUTSIDE_POLICY    => new CancellationException('outside_policy', 'Free cancellation has ended for this booking. Please contact the venue.', 422),
            default                               => new CancellationException('not_cancellable', 'This booking cannot be cancelled here. Please contact the venue.', 422),
        };
    }

    /**
     * Reverses every point the ledger awarded for this booking that is not
     * reversed yet (both kinds; reverseAndCount() does the counting). A
     * reversal that fails is logged, never the cancellation's failure — and
     * each runs in its own nested transaction (a SAVEPOINT under the
     * cancellation's), because on PostgreSQL a failed statement swallowed
     * here would otherwise abort the surrounding transaction and turn its
     * commit into a silent rollback of the cancellation itself.
     */
    private function reversePoints(string $referenceType, int $referenceId, string $reason): void
    {
        $rows = PointsTransaction::withoutGlobalScopes()
            ->where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->where('points', '>', 0)
            ->where('is_reversed', false)
            ->get();
        foreach ($rows as $tx) {
            try {
                DB::transaction(fn () => $this->loyalty->reverseTransaction($tx, $reason));
            } catch (\Throwable $e) {
                Log::warning('portal.cancel_points_reversal_failed', ['transaction' => $tx->id, 'error' => $e->getMessage()]);
            }
        }
    }
}
