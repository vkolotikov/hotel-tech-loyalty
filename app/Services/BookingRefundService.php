<?php

namespace App\Services;

use App\Enums\PaymentStatus;
use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\PointsTransaction;
use App\Models\RefundAttempt;
use App\Models\User;
use App\Services\Booking\GroupPayment;
use App\Services\Booking\RefundOutcomeUnknown;
use App\Services\Booking\RefundOperations;
use App\Services\Booking\RefundNotSettled;
use App\Support\SharedCache;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Single source of truth for refunding a booking.
 *
 * Three call sites converge here:
 *   1. Admin clicks "Issue refund" in the booking detail page →
 *      `applyRefund($mirror, $amount, $reason, null, issueStripe: true)`
 *   2. Stripe sends a `charge.refunded` webhook (e.g. refund issued in
 *      Stripe Dashboard, async settlement reversal) →
 *      `recordStripeRefund($mirror, $cumulative, $refund_id, $reason)`, which
 *      records what is new under the same lock (release 6)
 *   3. Stripe sends a `charge.dispute.created` webhook → flag only via
 *      `flagDisputed($mirror)`; no points/Smoobu/email side effects until
 *      the dispute is decided; a dispute lost is `recordLostDispute()`
 *      (money and points, never the booking itself — release 6).
 *
 * Side effects on a successful refund:
 *   - Mirror payment_status flipped to 'refunded' (full) or 'partially_refunded'
 *   - refunded_amount, refunded_at, last_refund_id stamped
 *   - Loyalty points awarded for the stay reversed (full refunds only)
 *   - Smoobu reservation cancelled (full refunds only, best-effort)
 *   - Refund-confirmation email sent to the guest
 *   - Audit-logged with the full outcome
 */
class BookingRefundService
{
    public function __construct(
        private StripeService $stripe,
        private SmoobuClient $smoobu,
        private LoyaltyService $loyalty,
    ) {}

    /**
     * @param BookingMirror $mirror
     * @param float|null    $amount   in major units; null = full refund
     * @param string|null   $reason   Stripe reason: duplicate / fraudulent / requested_by_customer
     * @param string|null   $stripeRefundId  pre-existing refund id (webhook path)
     * @param bool          $issueStripeRefund  false when refund already exists on Stripe
     * @param User|null     $staff    the admin issuing it (null for webhook path)
     * @param int|null      $forRoomId  a room of a multi-room stay the refund is for (the full
     *                                  admin's refund on that room's page): a partial refund goes
     *                                  to that room first (release 5)
     *
     * @return array{is_full:bool, refund_id:?string, reversed_points:int, pms_cancelled:bool, email_sent:bool}
     */
    public function applyRefund(
        BookingMirror $mirror,
        ?float $amount = null,
        ?string $reason = null,
        ?string $stripeRefundId = null,
        bool $issueStripeRefund = true,
        ?User $staff = null,
        ?int $forRoomId = null,
    ): array {
        // A room of a group (a combination) that carries no payment of its
        // own follows its lead room, which does (GroupPayment, release 5): the
        // refund — lock, attempt row, Stripe call, the whole group's records —
        // is the lead's, whichever room it was asked for on.
        $mirror = GroupPayment::payer($mirror);

        // Bind org context so downstream services (LoyaltyService, mailer
        // resolution, etc.) read from the right tenant.
        app()->instance('current_organization_id', (int) $mirror->organization_id);

        // ── One payment's refunds are written under ONE lock, `refund:{payer id}`,
        // in the store every container sees (SharedCache) — this call holds it
        // around its pre-flight read, its Stripe call and its stamp, and the
        // `charge.refunded` webhook does its compare-and-write under the same
        // lock (recordStripeRefund()), so a refund is recorded exactly once
        // whichever arrives first, with no time window (release 6). The row is
        // read again once the lock is held: what a caller loaded before may
        // be stale by then.
        try {
            return $this->underRefundLock($mirror, $this->lockWait(), fn (BookingMirror $locked) => $this->refundLocked(
                $locked, $amount, $reason, $stripeRefundId, $issueStripeRefund, $staff, $forRoomId,
            ));
        } catch (LockTimeoutException $e) {
            throw new \RuntimeException(
                "Another refund is currently being processed for this booking. Please retry in a moment."
            );
        }
    }

    /**
     * applyRefund()'s own work, with the payment's refund lock held
     * (underRefundLock()) and $mirror — the row that carries the payment —
     * read under it.
     *
     * @return array{is_full:bool, refund_id:?string, reversed_points:int, pms_cancelled:bool, email_sent:bool}
     */
    private function refundLocked(
        BookingMirror $mirror,
        ?float $amount,
        ?string $reason,
        ?string $stripeRefundId,
        bool $issueStripeRefund,
        ?User $staff,
        ?int $forRoomId,
    ): array {
        if ($issueStripeRefund) RefundOperations::assertAmount($amount, (string) ($mirror->currency ?: 'EUR'));
        // ── Pre-flight checks BEFORE writing the attempt row.
        // Audit 2026-06-01 finding C3: a RefundAttempt row is an audit
        // trail of refunds actually tried — never one for a refusal.
        // A multi-room stay (release 5: one payment, carried by its lead
        // room) is refunded in full only when every room is — a room of it
        // can be refunded on its own, the lead's included.
        $group = collect([$mirror]);
        if (!empty($mirror->booking_group_id)) {
            $group = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $mirror->organization_id)
                ->where('booking_group_id', $mirror->booking_group_id)
                ->orderBy('id')
                ->get();
            if ($group->isEmpty()) $group = collect([$mirror]);
        }
        $multi = $group->count() > 1;
        $fullyRefunded = $multi
            ? $group->every(fn (BookingMirror $m) => $m->payment_status === PaymentStatus::Refunded->value)
            : $mirror->payment_status === PaymentStatus::Refunded->value;
        if ($fullyRefunded) {
            throw new \RuntimeException('Booking is already fully refunded.');
        }
        // Audit 2026-06-01 finding D-disputed: refunding a disputed
        // charge always 400s on Stripe ("charge_disputed"). Guide
        // staff to the dispute resolution flow instead of letting
        // them eat a cryptic Stripe error.
        if ($mirror->payment_status === PaymentStatus::Disputed->value) {
            throw new \RuntimeException(
                'This booking has an open Stripe dispute. Respond via the Stripe Dashboard dispute flow at '
                . 'https://dashboard.stripe.com/disputes — do not issue a separate refund.'
            );
        }

        // ── Step 1a: write a PENDING marker BEFORE calling Stripe — the
        // audit trail of what was tried (committed on its own, so a failure
        // after Stripe was called still leaves a record). Release 6: the
        // racing `charge.refunded` webhook no longer reads it — it waits for
        // this call's refund lock instead (recordStripeRefund()).
        //
        // The intent id is the natural correlation key — for mock
        // refunds we synthesise one so the schema stays uniform.
        $attemptIntentId = $mirror->stripe_payment_intent_id
            ?: ('mock_pi_' . $mirror->id);

        // `refund_attempts_replay_unique` (mirror, intent, requested_at — whole
        // seconds) refuses two attempts of one payment in the same second.
        // Release 6: two recordings a second apart are legitimate now (the
        // webhook's, then an admin's — serialised by the refund lock held
        // here), so a second one that second is stamped a second later.
        $requestedAt = now()->startOfSecond();
        $lastRequested = RefundAttempt::query()
            ->where('mirror_id', $mirror->id)
            ->where('payment_intent_id', $attemptIntentId)
            ->max('requested_at');
        if ($lastRequested !== null && $requestedAt->lessThanOrEqualTo(\Illuminate\Support\Carbon::parse($lastRequested))) {
            $requestedAt = \Illuminate\Support\Carbon::parse($lastRequested)->addSecond();
        }

        $attempt = RefundAttempt::create([
            'organization_id'   => (int) $mirror->organization_id,
            'mirror_id'         => $mirror->id,
            'payment_intent_id' => $attemptIntentId,
            'requested_at'      => $requestedAt,
        ]);

        // ── Step 1b: actually issue the Stripe refund (or trust the
        // pre-existing id when called from the webhook path).
        $replayed = false;
        try {
            if ($issueStripeRefund) {
                if ($mirror->payment_method === 'mock') {
                    // No Stripe call for mock bookings — just flip status below.
                    $stripeRefundId = 'mock_refund_' . bin2hex(random_bytes(8));
                } elseif ($mirror->payment_method === 'stripe' && $mirror->stripe_payment_intent_id) {
                    // Under the refund lock: the short Stripe timeout
                    // (StripeService::underLock()), so the lock always
                    // outlives the call. A refund Stripe made but did not
                    // answer in time is recorded by its own webhook; a retry
                    // of the same amount gets the same refund back (the
                    // idempotency key, `Idempotent-Replayed`) and records
                    // nothing twice (below).
                    $refund = app(RefundOperations::class)->request($this->stripe, (int) $mirror->organization_id,
                        (string) $mirror->stripe_payment_intent_id, $amount, (string) ($mirror->currency ?: 'EUR'),
                        'stay', $forRoomId ?? (int) $mirror->id, (float) $group->sum(fn ($m) => (float) $m->refunded_amount - (float) $m->dispute_lost_amount), $reason);
                    $stripeRefundId = $refund->id;
                    $replayed = StripeService::wasReplayed($refund);
                } else {
                    throw new \RuntimeException(
                        'No Stripe payment attached. Refund manually via your PMS or accounting tool.'
                    );
                }
            }
        } catch (\Throwable $e) {
            // Restricted-key footgun (rk_live_* missing refunds:write):
            // upgrade the cryptic Stripe error into an actionable
            // "open dashboard → enable scope → save" message so the
            // admin issuing the refund can self-heal in 30 seconds.
            // Falls back to the original error for every other failure
            // mode (auth, network, etc.).
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            if ($scope) {
                $actionable = StripeService::restrictedKeyMessage(
                    'refunds',
                    $scope,
                    $mirror->stripe_payment_intent_id,
                );
                $attempt->update([
                    'error'        => substr($actionable, 0, 2000),
                    'completed_at' => now(),
                ]);
                throw new \RuntimeException($actionable, 0, $e);
            }

            // Record the failure on the attempt row so an operator
            // can audit what was tried. Then re-throw — caller
            // (controller / webhook) handles the error response.
            $attempt->update([
                'error'        => substr($e->getMessage(), 0, 2000),
                'completed_at' => now(),
            ]);
            // Stripe did not answer in time (the short timeout under the
            // lock): the refund may have been made. Staff are told so — a
            // retry of the same amount gets that refund back and records it
            // once; another amount would be a second refund.
            if ($e instanceof \Stripe\Exception\ApiConnectionException) {
                throw new RefundOutcomeUnknown(RefundOutcomeUnknown::MESSAGE, 0, $e);
            }
            throw $e;
        }

        // A refund Stripe handed back rather than made now — the same
        // payment and amount within its 24 hours (the idempotency key,
        // `Idempotent-Replayed`), or a refund id this payment already
        // recorded: an earlier attempt that Stripe made but answered too late
        // (the short timeout), or an earlier refund of the same amount. No
        // money moved now. It is recorded only as far as nothing here has
        // recorded it yet — Stripe's own refunded total, read under this
        // lock, against what the rooms hold (its webhook may have recorded it
        // without the refund's id) — and staff are told no new refund was made.
        $known = $issueStripeRefund && $stripeRefundId !== null && $this->alreadyRecorded($mirror, $stripeRefundId, (int) $attempt->id);
        if ($known || $replayed) {
            $unrecorded = $known ? 0.0 : $this->unrecordedAtStripe($mirror);
            if ($unrecorded === null || $unrecorded <= 0.004) {
                $attempt->update(['refund_id' => $stripeRefundId, 'completed_at' => now()]);
                Log::info('Refund handed back by Stripe — no new refund was made', [
                    'mirror_id' => $mirror->id, 'refund_id' => $stripeRefundId, 'recorded_later' => $unrecorded === null,
                ]);

                return [
                    'is_full'         => $multi ? $group->every(fn (BookingMirror $m) => $m->payment_status === PaymentStatus::Refunded->value) : $mirror->payment_status === PaymentStatus::Refunded->value,
                    'refund_id'       => $stripeRefundId,
                    'reversed_points' => 0,
                    'pms_cancelled'   => false,
                    'email_sent'      => false,
                    // Nothing new was refunded; null: Stripe's total could not be
                    // read, so the refund's own webhook records it if it is new.
                    'no_new_refund'   => true,
                    'recorded_later'  => $unrecorded === null,
                ];
            }
            // Made earlier and not recorded here yet: recorded now, never more
            // than was asked for (the webhook records anything beyond it).
            $amount = $amount === null ? $unrecorded : min((float) $amount, $unrecorded);
        }

        // ── Step 2: compute is_full + new refunded total.
        $priceTotal = (float) ($mirror->price_total ?? 0);
        $alreadyRefunded = (float) ($mirror->refunded_amount ?? 0);
        // A full refund (no amount) gives back what is left — Stripe refunds the
        // rest of the charge — so a stay partly refunded before is recorded at
        // its total, never above it (release 6: the row is read under the lock,
        // so what was refunded before is known here). Unchanged when nothing was.
        $thisRefund = (float) ($amount ?? max(0.0, round($priceTotal - $alreadyRefunded, 2)));
        $cumulative = round($alreadyRefunded + $thisRefund, 2);
        // Floating-point safety: 1¢ tolerance for "is this the full amount?"
        $isFull = $amount === null || $cumulative >= ($priceTotal - 0.01);

        // Combo-aware sibling discovery (audit 2026-06-01 finding 10).
        // For combo bookings (multi-room single-PI), refund a single
        // mirror via ->first() would leave N-1 siblings still paid
        // with active Smoobu reservations. Walk all mirrors sharing
        // the same booking_group_id (when set) — apply side effects
        // to each, but only ONE Stripe refund + ONE email.
        $siblings = collect([$mirror]);
        if (!empty($mirror->booking_group_id)) {
            $siblings = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $mirror->organization_id)
                ->where('booking_group_id', $mirror->booking_group_id)
                ->whereNotIn('payment_status', [PaymentStatus::Refunded->value, PaymentStatus::Cancelled->value])
                ->get();
            if ($siblings->isEmpty()) $siblings = collect([$mirror]);
        }

        // A multi-room stay's one payment is the sum of its rooms
        // (release 5): the refund is judged against the whole payment,
        // never against the lead room's own share. A full refund records
        // each room's own total. A partial one is recorded room by room
        // (GroupPayment::allocateRefund(), to the cent): first the room it
        // was made for, then the cancelled rooms, the rest in proportion —
        // a room that gets nothing keeps its status. One room keeps its
        // arithmetic exactly as it was.
        $after = [];
        if ($multi) {
            $groupTotal = round((float) $group->sum(fn (BookingMirror $m) => (float) ($m->price_total ?? 0)), 2);
            $alreadyRefunded = round((float) $group->sum(fn (BookingMirror $m) => (float) ($m->refunded_amount ?? 0)), 2);
            $thisRefund = $amount !== null ? (float) $amount : max(0.0, round($groupTotal - $alreadyRefunded, 2));
            $cumulative = round($alreadyRefunded + $thisRefund, 2);
            $isFull = $amount === null || $cumulative >= ($groupTotal - 0.01);
            $after = $isFull
                ? $group->mapWithKeys(fn (BookingMirror $m) => [$m->id => round((float) ($m->price_total ?? 0), 2)])->all()
                : GroupPayment::allocateRefund($group->map(fn (BookingMirror $m) => [
                    'id'        => (int) $m->id,
                    // A room whose card hold was released was never paid for: nothing of it to give back.
                    'total'     => $m->payment_status === PaymentStatus::Cancelled->value ? (float) ($m->refunded_amount ?? 0) : (float) ($m->price_total ?? 0),
                    'refunded'  => (float) ($m->refunded_amount ?? 0),
                    'cancelled' => (string) $m->internal_status === 'cancelled' || (string) $m->booking_state === 'cancelled' || $m->cancelled_at !== null,
                ])->values()->all(), $thisRefund, $forRoomId);
        }

        // ── Step 3: persist refund state on each mirror IMMEDIATELY
        // (before the side-effect block). Two reasons:
        //   1. The racing `charge.refunded` webhook's *secondary*
        //      idempotency gate is `last_refund_id` — stamping it
        //      here closes the window between "attempt row written"
        //      and "the long Smoobu + email tail finishes."
        //   2. If Smoobu or email throws on the tail, we still want
        //      Stripe's source-of-truth refund state mirrored
        //      locally — staff can see the refund happened.
        // The rooms this refund leaves refunded in full: they alone lose
        // their points and their PMS reservation (a multi-room stay).
        $fullNow = collect();
        // The rooms this refund gave money back to (the mail names them).
        $refundedRooms = collect();
        DB::transaction(function () use ($siblings, $multi, $isFull, $mirror, $cumulative, $stripeRefundId, $after, $fullNow, $refundedRooms, $staff) {
            foreach ($siblings as $sibling) {
                if (!$multi) {
                    $sibling->update([
                        'payment_status'  => $isFull ? PaymentStatus::Refunded->value : PaymentStatus::PartiallyRefunded->value,
                        'refunded_amount' => $sibling->id === $mirror->id ? $cumulative : $sibling->price_total,
                        'refunded_at'     => $isFull ? now() : $sibling->refunded_at,
                        'last_refund_id'  => $stripeRefundId,
                    ]);
                    if ($isFull) app(\App\Services\Loyalty\Visits\VisitEffects::class)->reverse((int) $sibling->organization_id, 'booking_mirror', (int) $sibling->id, $staff);
                    continue;
                }
                $before = round((float) ($sibling->refunded_amount ?? 0), 2);
                $now = round((float) ($after[$sibling->id] ?? $before), 2);
                $total = round((float) ($sibling->price_total ?? 0), 2);
                // The payment's latest refund is stamped on every room: the
                // lead's copy is the charge.refunded webhook's own dedupe key.
                $changes = ['last_refund_id' => $stripeRefundId];
                if ($isFull || ($total > 0 && $now >= $total - 0.01)) {
                    $changes += ['payment_status' => PaymentStatus::Refunded->value, 'refunded_amount' => $isFull ? $total : $now, 'refunded_at' => now()];
                    $fullNow->push($sibling);
                } elseif ($now > 0.004) {
                    $changes += ['payment_status' => PaymentStatus::PartiallyRefunded->value, 'refunded_amount' => $now];
                }
                if ($isFull || $now > $before + 0.004) {
                    $refundedRooms->push($sibling);
                }
                $sibling->update($changes);
                if (($changes['payment_status'] ?? null) === PaymentStatus::Refunded->value) {
                    app(\App\Services\Loyalty\Visits\VisitEffects::class)->reverse((int) $sibling->organization_id, 'booking_mirror', (int) $sibling->id, $staff);
                }
            }
        });

        // Stamp the refund id on the attempt row so post-hoc audit
        // ties attempt → refund cleanly.
        $attempt->update(['refund_id' => $stripeRefundId]);

        // ── Step 4: reverse loyalty points (full refunds only — partial
        // refunds don't mathematically map to "which" points to reverse).
        // Across all sibling mirrors for combo bookings.
        $reversedPoints = 0;
        if ($multi) {
            foreach ($fullNow as $sibling) {
                $reversedPoints += $this->reverseLoyaltyPoints($sibling, $staff);
            }
        } elseif ($isFull) {
            foreach ($siblings as $sibling) {
                $reversedPoints += $this->reverseLoyaltyPoints($sibling, $staff);
            }
        }

        // ── Step 5: cancel the Smoobu reservation per sibling
        // (best-effort, full only). Each mirror in a combo has its
        // own Smoobu reservation_id — must cancel each individually.
        $pmsCancelled = false;
        $pmsCancelFailures = [];
        // A multi-room stay: only the rooms now refunded in full — a
        // refund of one room's share never cancels the other rooms.
        if ($multi || $isFull) {
            foreach ($multi ? $fullNow : $siblings as $sibling) {
                if ($this->shouldCancelPms($sibling)) {
                    if ($this->cancelPmsReservation($sibling)) {
                        $pmsCancelled = true;
                    } else {
                        $pmsCancelFailures[] = $sibling->reservation_id;
                    }
                }
            }
        }

        // ── Step 6: email the guest. Only ONE email per refund event
        // even for combo bookings (single combined PI = single refund).
        $emailSent = $this->sendRefundEmail($mirror, $thisRefund, $isFull, $multi ? ($isFull ? $group : $refundedRooms) : null);

        // ── Step 6b: if any sibling Smoobu cancellation failed,
        // write a SEPARATE audit row so the operator can see the
        // orphan Smoobu reservations needing manual cleanup.
        // Audit 2026-06-01 finding D1: previously these failures
        // only emitted Log::error which nobody read.
        if (!empty($pmsCancelFailures)) {
            try {
                // 4th arg ($oldValues) MUST be an array — passing
                // null TypeErrors on PHP 8+ and the outer catch then
                // silently ate the audit row, leaving zero forensic
                // signal for the orphaned Smoobu reservation that
                // staff needed to clean up manually. Surfaced by
                // BookingRefundServiceTest's smoobu-cancel-failure
                // test (2026-06-14).
                AuditLog::record('booking.refund.pms_cancel_failed', $mirror,
                    [
                        'failed_smoobu_ids' => $pmsCancelFailures,
                        'booking_group_id'  => $mirror->booking_group_id,
                    ],
                    [],
                    $staff,
                    'Refund succeeded but ' . count($pmsCancelFailures)
                        . ' Smoobu reservation(s) could not be cancelled — '
                        . 'cancel manually in Smoobu admin: '
                        . implode(', ', $pmsCancelFailures),
                );
            } catch (\Throwable) {}
        }

        // ── Step 7: audit-log the outcome.
        AuditLog::record('booking_refunded', $mirror,
            [
                'amount'           => $amount,
                'cumulative'       => $cumulative,
                'is_full'          => $isFull,
                'reason'           => $reason,
                'refund_id'        => $stripeRefundId,
                'reversed_points'  => $reversedPoints,
                'pms_cancelled'    => $pmsCancelled,
                'pms_cancel_failures' => $pmsCancelFailures,
                'sibling_count'    => $siblings->count(),
                'email_sent'       => $emailSent,
            ] + ($multi ? ['rooms_refunded' => $after, 'for_room_id' => $forRoomId] : []) + [
                'source'           => $staff ? 'admin' : 'webhook',
            ],
            ['payment_status' => $mirror->payment_status],
            $staff,
            "Refund " . ($isFull ? '(full)' : "(partial — €" . number_format($thisRefund, 2) . ")")
                . " for booking #{$mirror->id}"
                . ($siblings->count() > 1 ? " + " . ($siblings->count() - 1) . ' combo sibling(s)' : '')
                . " · points reversed: {$reversedPoints}"
                . " · PMS cancelled: " . ($pmsCancelled ? 'yes' : 'no')
                . " · email: " . ($emailSent ? 'sent' : 'skipped'),
        );

        // Mark the attempt complete (informational, for the audit trail).
        $attempt->update(['completed_at' => now()]);
        if ($stripeRefundId && $mirror->stripe_payment_intent_id) {
            RefundOperations::applied((int) $mirror->organization_id, $stripeRefundId);
        }

        return [
            'is_full'         => $isFull,
            'refund_id'       => $stripeRefundId,
            'reversed_points' => $reversedPoints,
            'pms_cancelled'   => $pmsCancelled,
            'email_sent'      => $emailSent,
        ];
    }

    /**
     * A refund made at Stripe — the dashboard, a settlement reversal, or our own
     * refund's event — as the `charge.refunded` webhook reports it: $refundedTotal
     * is the charge's cumulative `amount_refunded`, in major units. Under the
     * payment's refund lock (the one applyRefund() holds around its Stripe call
     * and its stamp), what the payment's rooms already hold is read and only the
     * difference is recorded, through applyRefund()'s own work with no Stripe
     * call. Equal is a redelivery or our own refund's event, lower an older event
     * arriving late: nothing is recorded, the stored amount never moves backwards.
     * What a lost dispute took is in `refunded_amount` but not in Stripe's figure:
     * it is kept apart (`dispute_lost_amount`) and left out of the compare.
     * Release 6: this replaces the 60-second `RefundAttempt` freshness skip — a
     * webhook that arrives while a refund is mid-flight waits for its lock and
     * then finds it recorded; two dashboard refunds seconds apart are both
     * recorded.
     *
     * @return array|null applyRefund()'s outcome, or null when there was nothing new
     *
     * @throws LockTimeoutException the lock was held longer than the webhook waits: the caller has Stripe deliver again
     * @throws \RuntimeException applyRefund()'s own refusals (a disputed payment, …)
     */
    public function recordStripeRefund(BookingMirror $mirror, float $refundedTotal, ?string $refundId, ?string $reason): ?array
    {
        $payer = GroupPayment::payer($mirror);
        app()->instance('current_organization_id', (int) $payer->organization_id);

        return $this->underRefundLock($payer, $this->lockWait(), function (BookingMirror $locked) use ($refundedTotal, $refundId, $reason) {
            // Refunds only: Stripe's `amount_refunded` leaves out what a lost
            // dispute took, so the rooms' `dispute_lost_amount` is left out too.
            $recorded = $this->recordedRefunds($locked);
            $new = round($refundedTotal - $recorded, 2);
            if ($new <= 0.004) {
                Log::info('Stripe charge.refunded webhook — nothing new to record', [
                    'mirror_id' => $locked->id,
                    'refunded'  => round($refundedTotal, 2),
                    'recorded'  => $recorded,
                ]);
                return null;
            }

            return $this->refundLocked($locked, $new, $reason, $refundId ?? $locked->last_refund_id, false, null, null);
        });
    }

    /** Read current provider state under the same lock as desk refunds; failed refunds can move the total down. */
    public function reconcileProviderRefunds(BookingMirror $mirror, callable $read): void
    {
        $payer = GroupPayment::payer($mirror);
        app()->instance('current_organization_id', (int) $payer->organization_id);
        $this->underRefundLock($payer, $this->lockWait(), function (BookingMirror $locked) use ($read) {
            [$total, $last] = $read();
            $recorded = $this->recordedRefunds($locked);
            if ($total > $recorded + 0.004) {
                $new = round($total - $recorded, 2);
                $target = RefundOperations::targetRoom((int) $locked->organization_id, (string) ($last?->metadata?->refund_operation ?? ''));
                // At most one app operation can remain unresolved per payment. Preserve its selected room on settlement.
                if ($target && $last) {
                    $own = min($new, StripeService::fromSmallestUnit((int) $last->amount, $locked->currency));
                    $this->refundLocked($locked, $own, $last->reason, $last->id, false, null, $target);
                    $new = round($new - $own, 2);
                    $locked = $locked->fresh();
                }
                if ($new > 0.004) $this->refundLocked($locked, $new, $last?->reason, $last?->id, false, null, null);
            } elseif ($total < $recorded - 0.004) {
                DB::transaction(function () use ($locked, $total, $last, $recorded) {
                    $rooms = GroupPayment::rows((int) $locked->organization_id, (string) $locked->stripe_payment_intent_id);
                    $remove = round($recorded - $total, 2);
                    foreach ($rooms->sortByDesc('id') as $room) {
                        $lost = (float) ($room->dispute_lost_amount ?? 0);
                        $deduct = min($remove, max(0.0, (float) $room->refunded_amount - $lost));
                        $gone = round((float) $room->refunded_amount - $deduct, 2);
                        $room->update(['refunded_amount' => $gone, 'refunded_at' => $gone > 0 ? $room->refunded_at : null,
                            'last_refund_id' => $last?->id, 'payment_status' => $gone <= 0 ? 'paid' : ($gone >= (float) $room->price_total - 0.004 ? 'refunded' : 'partially_refunded')]);
                        $remove = round($remove - $deduct, 2);
                    }
                    // A provider failure does not resurrect a cancelled reservation or re-award its points.
                    AuditLog::record('booking.refund.reconciled', $locked, ['refunded_amount' => $total], ['refunded_amount' => $recorded], null, 'Refund status reconciled with Stripe');
                });
            }
        });
    }

    /**
     * Release 6, item 1 — a dispute the venue lost (`charge.dispute.closed`,
     * status `lost`): the bank took the money back, so it is recorded as gone
     * back on every room of the payment (the lead and the rooms that follow it,
     * GroupPayment), each its own share — `refunded` when the whole payment is
     * gone (`partially_refunded` for a dispute of part of it), `last_refund_id`
     * `dispute_{id}` — and the points of every room now refunded in full are
     * reversed, as a refund reverses them. Unlike a refund, nothing is cancelled
     * at the PMS, `booking_state` is not touched and no mail is sent: whether the
     * guest still stays is the venue's decision. Each room gets an audit row
     * `booking_dispute_lost` (the dispute id and reason, the amount). What the
     * dispute took is also kept apart on each room (`dispute_lost_amount`): Stripe's
     * refunded total leaves it out, and so does the `charge.refunded` compare
     * (recordedRefunds()). Under the payment's refund lock, every room in one
     * transaction — all of it is recorded or none, so a failure leaves nothing for
     * a redelivery to skip; a redelivered event changes nothing.
     *
     * @param float|null $amount the dispute's amount in major units; null = everything not yet recorded as returned
     * @return array{lost: float, is_full: bool, reversed_points: int}|null null when this dispute is already recorded
     *
     * @throws LockTimeoutException
     */
    public function recordLostDispute(BookingMirror $mirror, ?float $amount, string $disputeId, ?string $disputeReason = null): ?array
    {
        $payer = GroupPayment::payer($mirror);
        app()->instance('current_organization_id', (int) $payer->organization_id);
        $marker = 'dispute_' . $disputeId;

        return $this->underRefundLock($payer, $this->lockWait(), fn (BookingMirror $lead) => DB::transaction(function () use ($lead, $amount, $marker, $disputeId, $disputeReason) {
            $rooms = collect([$lead])->concat(GroupPayment::followers($lead))->sortBy('id')->values();
            if ($rooms->contains(fn (BookingMirror $m) => (string) $m->last_refund_id === $marker)) {
                return null;
            }
            $multi = $rooms->count() > 1;
            $total = round((float) $rooms->sum(fn (BookingMirror $m) => (float) ($m->price_total ?? 0)), 2);
            $recorded = round((float) $rooms->sum(fn (BookingMirror $m) => (float) ($m->refunded_amount ?? 0)), 2);
            $left = max(0.0, round($total - $recorded, 2));
            $lost = $amount === null ? $left : max(0.0, min($left, round($amount, 2)));
            $full = $lost >= $left - 0.01;

            $after = $multi
                ? GroupPayment::allocateRefund($rooms->map(fn (BookingMirror $m) => [
                    'id'        => (int) $m->id,
                    'total'     => (float) ($m->price_total ?? 0),
                    'refunded'  => (float) ($m->refunded_amount ?? 0),
                    'cancelled' => (string) $m->internal_status === 'cancelled' || (string) $m->booking_state === 'cancelled' || $m->cancelled_at !== null,
                ])->values()->all(), $lost)
                : [(int) $lead->id => round($recorded + $lost, 2)];

            $reversed = 0;
            foreach ($rooms as $room) {
                $roomTotal = round((float) ($room->price_total ?? 0), 2);
                $before = round((float) ($room->refunded_amount ?? 0), 2);
                $now = round((float) ($after[$room->id] ?? $before), 2);
                $roomFull = $full || ($roomTotal > 0 && $now >= $roomTotal - 0.01);
                $prior = $room->payment_status;
                $changes = ['last_refund_id' => $marker];
                if ($roomFull) {
                    $changes += ['payment_status' => PaymentStatus::Refunded->value, 'refunded_amount' => $roomTotal, 'refunded_at' => now()];
                } elseif ($now > 0.004) {
                    $changes += ['payment_status' => PaymentStatus::PartiallyRefunded->value, 'refunded_amount' => $now];
                }
                $roomLost = round(((float) ($changes['refunded_amount'] ?? $before)) - $before, 2);
                if ($roomLost > 0.004) {
                    $changes['dispute_lost_amount'] = round((float) ($room->dispute_lost_amount ?? 0) + $roomLost, 2);
                }
                $room->update($changes);
                $roomPoints = $roomFull ? $this->reverseLoyaltyPoints($room, null) : 0;
                $reversed += $roomPoints;

                AuditLog::record('booking_dispute_lost', $room,
                    [
                        'dispute_id'      => $disputeId,
                        'dispute_reason'  => $disputeReason,
                        'lost'            => $roomLost,
                        'refunded_amount' => (float) ($changes['refunded_amount'] ?? $before),
                        'reversed_points' => $roomPoints,
                    ] + ($multi ? ['booking_group_id' => $room->booking_group_id, 'payment_carried_by' => $lead->id, 'payment_lost' => $lost] : []),
                    ['payment_status' => $prior],
                    null,
                    "Stripe dispute lost on booking #{$room->id}" . ($disputeReason ? " · reason: {$disputeReason}" : '')
                        . ' — the money is recorded as returned to the guest; the booking was left as it is (staff decide)',
                );
            }

            return ['lost' => $lost, 'is_full' => $full, 'reversed_points' => $reversed];
        }));
    }

    /** How long a refund waits for the payment's refund lock (seconds). */
    public const LOCK_WAIT_SECONDS = 10;

    /** How long the lock lives when its holder never lets go — longer than a Stripe call under a lock (StripeService::LOCKED_*). */
    public const LOCK_SECONDS = 30;

    /** How long a refund or a Stripe webhook waits for a payment's refund lock (`services.stripe.refund_lock_wait`, default LOCK_WAIT_SECONDS). */
    private function lockWait(): int
    {
        return max(0, (int) config('services.stripe.refund_lock_wait', self::LOCK_WAIT_SECONDS));
    }

    /**
     * $work with the payment's refund lock held — `refund:{the row that
     * carries the payment}`, in the store every container sees (SharedCache:
     * the database in production, where the default cache is each container's
     * own files) — given that row read again under the lock.
     *
     * @throws LockTimeoutException
     */
    private function underRefundLock(BookingMirror $payer, int $waitSeconds, callable $work): mixed
    {
        $lock = SharedCache::store()->lock("refund:{$payer->id}", self::LOCK_SECONDS);
        $lock->block($waitSeconds);
        try {
            $locked = BookingMirror::withoutGlobalScopes()->whereKey($payer->id)->first() ?? $payer;

            return $work($locked);
        } finally {
            // Always released — the next refund never waits out the TTL.
            $lock->release();
        }
    }

    /** Whether this payment already recorded the refund Stripe just answered with (by id): on any of its rooms, or on an earlier completed attempt. */
    private function alreadyRecorded(BookingMirror $payer, string $refundId, int $currentAttemptId): bool
    {
        $pi = (string) $payer->stripe_payment_intent_id;
        $rooms = $pi !== '' ? GroupPayment::rows((int) $payer->organization_id, $pi) : collect([$payer]);
        if ($rooms->contains(fn (BookingMirror $m) => (string) $m->last_refund_id === $refundId)) {
            return true;
        }

        return RefundAttempt::query()
            ->where('mirror_id', $payer->id)
            ->where('refund_id', $refundId)
            ->whereNull('error')
            ->whereKeyNot($currentAttemptId)
            ->exists();
    }

    /**
     * What this payment's rooms record as refunded — every room of a multi-room
     * stay (GroupPayment) — with what lost disputes took left out
     * (`dispute_lost_amount`): the figure Stripe's `amount_refunded`, which
     * counts refunds only, is compared with.
     */
    private function recordedRefunds(BookingMirror $payer): float
    {
        $pi = (string) $payer->stripe_payment_intent_id;
        $rooms = $pi !== '' ? GroupPayment::rows((int) $payer->organization_id, $pi) : collect([$payer]);

        return round((float) $rooms->sum(fn (BookingMirror $m) => (float) ($m->refunded_amount ?? 0) - (float) ($m->dispute_lost_amount ?? 0)), 2);
    }

    /**
     * What Stripe has refunded on this payment's charge beyond what its rooms
     * record (recordedRefunds()), in major units — read now, under the refund
     * lock, with the short timeout. Null when it cannot be read: a refund that
     * is new is then recorded by its own `charge.refunded` webhook, which makes
     * the same compare.
     */
    private function unrecordedAtStripe(BookingMirror $payer): ?float
    {
        $pi = (string) $payer->stripe_payment_intent_id;
        if ($pi === '') {
            return null;
        }
        try {
            $intent = StripeService::underLock(fn () => $this->stripe->retrievePaymentIntent($pi, ['latest_charge']));
        } catch (\Throwable $e) {
            Log::warning('Refund handed back by Stripe — its charge could not be read to see whether the refund is recorded', [
                'mirror_id' => $payer->id,
                'error'     => $e->getMessage(),
            ]);
            return null;
        }
        $charge = $intent->latest_charge ?? null;
        if (!is_object($charge) || !isset($charge->amount_refunded)) {
            return null;
        }
        $refunded = StripeService::fromSmallestUnit((int) $charge->amount_refunded, (string) ($charge->currency ?? ''));

        return max(0.0, round($refunded - $this->recordedRefunds($payer), 2));
    }

    /**
     * Flag a booking as disputed without refunding. Used by the
     * `charge.dispute.created` webhook — Stripe is starting a dispute,
     * funds are held but not yet reversed. Staff should investigate
     * before issuing a real refund.
     */
    public function flagDisputed(BookingMirror $mirror, ?string $disputeReason = null): void
    {
        app()->instance('current_organization_id', (int) $mirror->organization_id);

        // The dispute is on the one payment: every room it paid for is
        // disputed — a group's lead and the rooms that follow it
        // (GroupPayment, release 5); one room is a group of one.
        $mirror = GroupPayment::payer($mirror);
        $rooms = collect([$mirror])->concat(GroupPayment::followers($mirror));

        foreach ($rooms as $room) {
            $room->update(['payment_status' => PaymentStatus::Disputed->value]);

            AuditLog::record('booking_disputed', $room,
                ['dispute_reason' => $disputeReason] + ($rooms->count() > 1 ? ['booking_group_id' => $room->booking_group_id, 'payment_carried_by' => $mirror->id] : []),
                ['payment_status' => PaymentStatus::Disputed->value],
                null,
                "Stripe dispute opened on booking #{$room->id}" . ($disputeReason ? " · reason: {$disputeReason}" : ''),
            );
        }
    }

    // ─── Step helpers ──────────────────────────────────────────────────

    /**
     * Reverse every loyalty PointsTransaction that referenced this booking
     * mirror. Returns the total points reversed (positive number).
     *
     * We look for points awarded via `reference_type='booking_mirror'` +
     * `reference_id={mirror.id}`. Each transaction's reverseTransaction()
     * writes an idempotent `rev_{id}` reversal so a re-run is a no-op.
     */
    private function reverseLoyaltyPoints(BookingMirror $mirror, ?User $staff): int
    {
        $txs = PointsTransaction::withoutGlobalScopes()
            ->where('organization_id', $mirror->organization_id)
            ->where('reference_type', 'booking_mirror')
            ->where('reference_id', $mirror->id)
            ->where('points', '>', 0)
            ->where('is_reversed', false)
            ->get();

        $total = 0;
        foreach ($txs as $tx) {
            try {
                $this->loyalty->reverseTransaction(
                    $tx,
                    "Booking #{$mirror->id} refunded",
                    $staff,
                );
                $total += (int) $tx->points;
            } catch (\Throwable $e) {
                Log::warning('Loyalty reversal failed during refund', [
                    'mirror_id'       => $mirror->id,
                    'transaction_id'  => $tx->id,
                    'error'           => $e->getMessage(),
                ]);
            }
        }
        // The durable reversal can recover points as well if this worker stopped before the inline loop finished.
        app(\App\Services\Loyalty\Visits\VisitRecorder::class)->reversed((int) $mirror->organization_id, 'booking_mirror', (int) $mirror->id, $staff);
        return $total;
    }

    private function shouldCancelPms(BookingMirror $mirror): bool
    {
        // Don't try to cancel local-only mirrors (Smoobu never knew about
        // them) or rows with no reservation_id.
        if (!$mirror->reservation_id) return false;
        if (str_starts_with($mirror->reservation_id, 'LOCAL-')) return false;
        // Skip mock bookings — nothing exists on Smoobu's side.
        if ($mirror->payment_method === 'mock') return false;
        return true;
    }

    /**
     * Best-effort cancellation. Smoobu rejects DELETE for channel-managed
     * reservations (Airbnb, Booking.com etc.) — log a warning so staff can
     * cancel manually in those cases, but never propagate the error to
     * the refund flow itself.
     */
    private function cancelPmsReservation(BookingMirror $mirror): bool
    {
        try {
            $this->smoobu->cancelReservation((string) $mirror->reservation_id);
            $mirror->update(['booking_state' => 'cancelled']);
            return true;
        } catch (\Throwable $e) {
            Log::warning('PMS cancellation failed after refund — manual action required', [
                'mirror_id'      => $mirror->id,
                'reservation_id' => $mirror->reservation_id,
                'error'          => $e->getMessage(),
            ]);
            // Surface in audit log so staff see it on the booking detail.
            AuditLog::record('booking.pms.cancel_failed', $mirror,
                ['reservation_id' => $mirror->reservation_id, 'error' => $e->getMessage()],
                [], null,
                "PMS cancellation failed for refunded booking #{$mirror->id} — cancel manually in Smoobu",
            );
            return false;
        }
    }

    /**
     * One mail per refund. For a multi-room stay (one payment, several rooms)
     * $group is the rooms this refund gave money back to — all of them for a
     * full refund — and the mail names them and their references; $amount is
     * what the one payment gave back.
     *
     * @param Collection<int, BookingMirror>|null $group
     */
    private function sendRefundEmail(BookingMirror $mirror, float $amount, bool $isFull, ?Collection $group = null): bool
    {
        $email = $mirror->guest_email;
        if (!$email) return false;

        try {
            // queue() — BookingRefundMail implements ShouldQueue. The
            // refund itself is already complete; the email is a
            // notification that can ride the queue with retries.
            $mail = new BookingRefundMail($mirror, $amount, $isFull);
            if ($group !== null && $group->isNotEmpty()) {
                $rooms = $group->sortBy('id')->values();
                $mail->unitName = $rooms->map(fn (BookingMirror $m) => $m->apartment_name ?: 'Room')->implode(' + ');
                $mail->bookingReference = $rooms->map(fn (BookingMirror $m) => $m->booking_reference ?: ('#' . $m->id))->implode(', ');
            }
            Mail::to($email)->queue($mail);
            return true;
        } catch (\Throwable $e) {
            Log::warning('Refund confirmation email failed', [
                'mirror_id' => $mirror->id,
                'email'     => $email,
                'error'     => $e->getMessage(),
            ]);
            return false;
        }
    }
}
