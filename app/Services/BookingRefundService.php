<?php

namespace App\Services;

use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\PointsTransaction;
use App\Models\User;
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

        if ($mirror->payment_status === 'refunded') {
            throw new \RuntimeException('Booking is already fully refunded.');
        }

        // ── Step 1: actually issue the Stripe refund (or trust the
        // pre-existing id when called from the webhook path).
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

        // ── Step 2: compute is_full + new refunded total.
        $priceTotal = (float) ($mirror->price_total ?? 0);
        $thisRefund = (float) ($amount ?? $priceTotal);
        $alreadyRefunded = (float) ($mirror->refunded_amount ?? 0);
        $cumulative = round($alreadyRefunded + $thisRefund, 2);
        // Floating-point safety: 1¢ tolerance for "is this the full amount?"
        $isFull = $amount === null || $cumulative >= ($priceTotal - 0.01);

        // ── Step 3: persist refund state on the mirror.
        $mirror->update([
            'payment_status'  => $isFull ? 'refunded' : 'partially_refunded',
            'refunded_amount' => $cumulative,
            'refunded_at'     => $isFull ? now() : $mirror->refunded_at,
            'last_refund_id'  => $stripeRefundId,
        ]);

        // ── Step 4: reverse loyalty points (full refunds only — partial
        // refunds don't mathematically map to "which" points to reverse).
        $reversedPoints = 0;
        if ($isFull) {
            $reversedPoints = $this->reverseLoyaltyPoints($mirror, $staff);
        }

        // ── Step 5: cancel the Smoobu reservation (best-effort, full only).
        $pmsCancelled = false;
        if ($isFull && $this->shouldCancelPms($mirror)) {
            $pmsCancelled = $this->cancelPmsReservation($mirror);
        }

        // ── Step 6: email the guest.
        $emailSent = $this->sendRefundEmail($mirror, $thisRefund, $isFull);

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
                'email_sent'       => $emailSent,
                'source'           => $staff ? 'admin' : 'webhook',
            ],
            ['payment_status' => $mirror->payment_status],
            $staff,
            "Refund " . ($isFull ? '(full)' : "(partial — €" . number_format($thisRefund, 2) . ")")
                . " for booking #{$mirror->id}"
                . " · points reversed: {$reversedPoints}"
                . " · PMS cancelled: " . ($pmsCancelled ? 'yes' : 'no')
                . " · email: " . ($emailSent ? 'sent' : 'skipped'),
        );

        return [
            'is_full'         => $isFull,
            'refund_id'       => $stripeRefundId,
            'reversed_points' => $reversedPoints,
            'pms_cancelled'   => $pmsCancelled,
            'email_sent'      => $emailSent,
        ];
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

        $mirror->update(['payment_status' => 'disputed']);

        AuditLog::record('booking_disputed', $mirror,
            ['dispute_reason' => $disputeReason],
            ['payment_status' => 'disputed'],
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
            Mail::to($email)->send(new BookingRefundMail($mirror, $amount, $isFull));
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
