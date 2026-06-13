<?php

namespace App\Services;

use App\Enums\PaymentStatus;
use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\PointsTransaction;
use App\Models\RefundAttempt;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Single source of truth for refunding a booking.
 *
 * Three call sites converge here:
 *   1. Admin clicks "Issue refund" in the booking detail page →
 *      `applyRefund($mirror, $amount, $reason, null, issueStripe: true)`
 *   2. Stripe sends a `charge.refunded` webhook (e.g. refund issued in
 *      Stripe Dashboard, chargeback won, async settlement reversal) →
 *      `applyRefund($mirror, $amount, 'webhook', $refund_id, issueStripe: false)`
 *   3. Stripe sends a `charge.dispute.created` webhook → flag only via
 *      `flagDisputed($mirror)`; no points/Smoobu/email side effects until
 *      the dispute is decided.
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
    ): array {
        // Bind org context so downstream services (LoyaltyService, mailer
        // resolution, etc.) read from the right tenant.
        app()->instance('current_organization_id', (int) $mirror->organization_id);

        // ── Lock per-mirror so an admin refund + a concurrent
        // `charge.refunded` webhook can't both enter applyRefund() at
        // the same time. The webhook's own idempotency gate
        // (refund_attempts < 60s freshness check + last_refund_id)
        // catches the case where the webhook arrives AFTER the lock
        // is released; this lock catches the case where it arrives
        // WHILE the admin is still inside the body.
        $lock = Cache::lock("refund:{$mirror->id}", 30);
        try {
            // 10s blocking acquire — long enough to wait out a sister
            // request that's mid-Stripe-call, short enough to fail
            // fast if something is truly stuck.
            $lock->block(10);
        } catch (LockTimeoutException $e) {
            throw new \RuntimeException(
                "Another refund is currently being processed for this booking. Please retry in a moment."
            );
        }

        try {
            // ── Pre-flight checks BEFORE writing the attempt row.
            // Audit 2026-06-01 finding C3: writing the RefundAttempt
            // before these throws left orphan rows that then false-
            // positive the 60s webhook freshness gate.
            if ($mirror->payment_status === PaymentStatus::Refunded->value) {
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

            // ── Step 1a: write a PENDING marker BEFORE calling Stripe.
            // This is what the racing `charge.refunded` webhook reads
            // (via the 60-second freshness lookup in
            // BookingPublicController::handleChargeRefunded) to decide
            // "the admin flow is mid-flight, skip me."
            //
            // The intent id is the natural correlation key — for mock
            // refunds we synthesise one so the schema stays uniform.
            $attemptIntentId = $mirror->stripe_payment_intent_id
                ?: ('mock_pi_' . $mirror->id);

            $attempt = RefundAttempt::create([
                'organization_id'   => (int) $mirror->organization_id,
                'mirror_id'         => $mirror->id,
                'payment_intent_id' => $attemptIntentId,
                'requested_at'      => now(),
            ]);

            // ── Step 1b: actually issue the Stripe refund (or trust the
            // pre-existing id when called from the webhook path).
            try {
                if ($issueStripeRefund) {
                    if ($mirror->payment_method === 'mock') {
                        // No Stripe call for mock bookings — just flip status below.
                        $stripeRefundId = 'mock_refund_' . bin2hex(random_bytes(8));
                    } elseif ($mirror->payment_method === 'stripe' && $mirror->stripe_payment_intent_id) {
                        $refund = $this->stripe->refund(
                            $mirror->stripe_payment_intent_id,
                            $amount,
                            $reason,
                        );
                        $stripeRefundId = $refund->id;
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
                throw $e;
            }

            // ── Step 2: compute is_full + new refunded total.
            $priceTotal = (float) ($mirror->price_total ?? 0);
            $thisRefund = (float) ($amount ?? $priceTotal);
            $alreadyRefunded = (float) ($mirror->refunded_amount ?? 0);
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

            // ── Step 3: persist refund state on each mirror IMMEDIATELY
            // (before the side-effect block). Two reasons:
            //   1. The racing `charge.refunded` webhook's *secondary*
            //      idempotency gate is `last_refund_id` — stamping it
            //      here closes the window between "attempt row written"
            //      and "the long Smoobu + email tail finishes."
            //   2. If Smoobu or email throws on the tail, we still want
            //      Stripe's source-of-truth refund state mirrored
            //      locally — staff can see the refund happened.
            foreach ($siblings as $sibling) {
                $sibCumulative = $sibling->id === $mirror->id
                    ? $cumulative
                    : (float) ($sibling->refunded_amount ?? 0) + (float) ($sibling->price_total ?? 0);
                $sibling->update([
                    'payment_status'  => $isFull ? PaymentStatus::Refunded->value : PaymentStatus::PartiallyRefunded->value,
                    'refunded_amount' => $sibling->id === $mirror->id ? $cumulative : $sibling->price_total,
                    'refunded_at'     => $isFull ? now() : $sibling->refunded_at,
                    'last_refund_id'  => $stripeRefundId,
                ]);
            }

            // Stamp the refund id on the attempt row so post-hoc audit
            // ties attempt → refund cleanly.
            $attempt->update(['refund_id' => $stripeRefundId]);

            // ── Step 4: reverse loyalty points (full refunds only — partial
            // refunds don't mathematically map to "which" points to reverse).
            // Across all sibling mirrors for combo bookings.
            $reversedPoints = 0;
            if ($isFull) {
                foreach ($siblings as $sibling) {
                    $reversedPoints += $this->reverseLoyaltyPoints($sibling, $staff);
                }
            }

            // ── Step 5: cancel the Smoobu reservation per sibling
            // (best-effort, full only). Each mirror in a combo has its
            // own Smoobu reservation_id — must cancel each individually.
            $pmsCancelled = false;
            $pmsCancelFailures = [];
            if ($isFull) {
                foreach ($siblings as $sibling) {
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
            $emailSent = $this->sendRefundEmail($mirror, $thisRefund, $isFull);

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

            // Mark the attempt complete so the 60-second freshness
            // window starts ticking down. (The webhook still treats
            // any row younger than 60s as "in flight" regardless —
            // completed_at is informational + helps audit, not the
            // gate itself.)
            $attempt->update(['completed_at' => now()]);

            return [
                'is_full'         => $isFull,
                'refund_id'       => $stripeRefundId,
                'reversed_points' => $reversedPoints,
                'pms_cancelled'   => $pmsCancelled,
                'email_sent'      => $emailSent,
            ];
        } finally {
            // Always release — even if a downstream throw bubbles up,
            // we don't want the next legitimate refund attempt to wait
            // 30s for the TTL to expire.
            optional($lock)->release();
        }
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

        $mirror->update(['payment_status' => PaymentStatus::Disputed->value]);

        AuditLog::record('booking_disputed', $mirror,
            ['dispute_reason' => $disputeReason],
            ['payment_status' => PaymentStatus::Disputed->value],
            null,
            "Stripe dispute opened on booking #{$mirror->id}" . ($disputeReason ? " · reason: {$disputeReason}" : ''),
        );
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

    private function sendRefundEmail(BookingMirror $mirror, float $amount, bool $isFull): bool
    {
        $email = $mirror->guest_email;
        if (!$email) return false;

        try {
            // queue() — BookingRefundMail implements ShouldQueue. The
            // refund itself is already complete; the email is a
            // notification that can ride the queue with retries.
            Mail::to($email)->queue(new BookingRefundMail($mirror, $amount, $isFull));
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
