<?php

namespace App\Services\Booking;

use App\Models\ServiceBooking;
use App\Services\StripeService;
use Illuminate\Support\Facades\Log;

/**
 * Returns the money of a service booking that is being cancelled: lets go
 * of a card that is only held, refunds a payment that was taken. Decides
 * by what Stripe says the payment is now, not by what the row last heard.
 *
 * Returns the columns the booking should store; writes nothing itself, so
 * the caller can store them together with the cancellation. Safe to call
 * again after a failure further on: a hold already let go is recorded as
 * such, and Stripe answers a repeated full refund of the same payment with
 * the first one (StripeService::refund()'s idempotency key).
 */
final class ServiceBookingRefund
{
    public function __construct(private readonly StripeService $stripe) {}

    /**
     * The caller must already hold the booking's row lock (`lockForUpdate`)
     * and, when the booking carries a real PaymentIntent, the `pi:`
     * advisory lock — this method takes neither itself. It only reads
     * Stripe and reports what happened; the caller decides when to open
     * the transaction those locks live in and when to write the result.
     *
     * @return array{money: 'none'|'released'|'refunded', amount: float, columns: array}
     *
     * @throws CancellationException
     */
    public function giveBack(ServiceBooking $b): array
    {
        $pi = (string) $b->stripe_payment_intent_id;
        if (!PortalPaymentIntentGuard::isRealIntent($pi)) {
            return ['money' => 'none', 'amount' => 0.0, 'columns' => []];
        }
        if (!$this->stripe->isEnabled()) {
            throw new CancellationException('refund_unavailable', 'Online payments are switched off at this venue, so the payment cannot be returned here. Please contact the venue.', 409);
        }

        $amount = round((float) $b->total_amount, 2);
        try {
            // With its latest charge expanded, so alreadyRefunded() can see a
            // refund made from the dashboard before asking Stripe for another.
            // A key that may not read charges (permission) or a request
            // Stripe refuses to expand (invalid request) is asked once more
            // without the expand, and the pre-check is simply skipped — the
            // charge_already_refunded catch below still protects. A network
            // failure is not retried: it stays a refund_failed.
            try {
                $intent = $this->stripe->retrievePaymentIntent($pi, ['latest_charge']);
            } catch (\Stripe\Exception\PermissionException | \Stripe\Exception\InvalidRequestException) {
                $intent = $this->stripe->retrievePaymentIntent($pi);
            }
            $status = (string) ($intent->status ?? '');

            if ($status === 'canceled') {
                return ['money' => 'released', 'amount' => $amount, 'columns' => ['payment_status' => 'cancelled']];
            }
            if ($status === 'succeeded') {
                if ($already = $this->alreadyRefunded($intent, $b, $amount)) {
                    return $already;
                }

                try {
                    $refund = $this->stripe->refund($pi, null, 'requested_by_customer');
                } catch (\Throwable $e) {
                    if ($this->isChargeAlreadyRefunded($e)) {
                        // A refund made from the Stripe dashboard, or one
                        // that went through on an earlier attempt whose DB
                        // write failed and is only now being retried: the
                        // charge is refunded either way, so there is
                        // nothing left to give back — record it as such
                        // rather than fail a cancellation the money has
                        // already left.
                        return $this->refunded($amount, null);
                    }
                    throw $e;
                }

                $refundedAmount = isset($refund->amount)
                    ? StripeService::fromSmallestUnit((int) $refund->amount, (string) $b->currency)
                    : $amount;

                return $this->refunded($refundedAmount, (string) ($refund->id ?? ''));
            }

            // requires_capture (a held card) and every unfinished state.
            $this->stripe->cancelPaymentIntent($pi, 'requested_by_customer');

            return ['money' => 'released', 'amount' => $amount, 'columns' => ['payment_status' => 'cancelled']];
        } catch (CancellationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('portal.service_refund_failed', ['org' => $b->organization_id, 'booking' => $b->id, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
            throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
        }
    }

    /**
     * Reads what the retrieved intent already says about its charge —
     * giveBack() asks Stripe to expand `latest_charge`, so it arrives as an
     * object. Returns null when there is nothing to read (no charge, or a
     * bare id) — the normal `refund()` call is then the one that finds out
     * from Stripe, and `isChargeAlreadyRefunded()` catches a "the charge is
     * already refunded" answer from *that* call.
     */
    private function alreadyRefunded(\Stripe\PaymentIntent $intent, ServiceBooking $b, float $fallback): ?array
    {
        $charge = $intent->latest_charge ?? null;
        if (!is_object($charge)) {
            return null;
        }

        $chargeAmount = isset($charge->amount) ? (int) $charge->amount : null;
        $refundedAmount = isset($charge->amount_refunded) ? (int) $charge->amount_refunded : null;
        $fullyRefunded = ($charge->refunded ?? false) === true
            || ($chargeAmount !== null && $chargeAmount > 0 && $refundedAmount !== null && $refundedAmount >= $chargeAmount);
        if (!$fullyRefunded) {
            return null;
        }

        // Never more than was actually taken: capped at the captured amount
        // when Stripe reports one.
        $capturedAmount = isset($charge->amount_captured) ? (int) $charge->amount_captured : null;
        if ($refundedAmount !== null && $capturedAmount !== null && $capturedAmount > 0) {
            $refundedAmount = min($refundedAmount, $capturedAmount);
        }
        $amount = $refundedAmount !== null ? StripeService::fromSmallestUnit($refundedAmount, (string) $b->currency) : $fallback;

        return $this->refunded($amount, null);
    }

    /** @return array{money: 'refunded', amount: float, columns: array} */
    private function refunded(float $amount, ?string $refundId): array
    {
        return ['money' => 'refunded', 'amount' => $amount, 'columns' => [
            'payment_status'  => 'refunded',
            'refunded_amount' => $amount,
            'refunded_at'     => now(),
            'last_refund_id'  => $refundId,
        ]];
    }

    /** Stripe's own code for "there is nothing left on this charge to refund" — checked by code, never by the exception's message text. */
    private function isChargeAlreadyRefunded(\Throwable $e): bool
    {
        return method_exists($e, 'getStripeCode') && (string) $e->getStripeCode() === 'charge_already_refunded';
    }
}
