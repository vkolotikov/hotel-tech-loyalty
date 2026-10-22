<?php

namespace App\Services\Booking;

/**
 * Stripe did not answer a refund in time (the short timeout of a call under the refund lock,
 * StripeService::underLock()), so whether it was made is not known (release 6). Nothing was recorded; if Stripe made
 * it, its `charge.refunded` webhook records it. A retry of the SAME amount is safe — Stripe hands the same refund back
 * (the idempotency key is the payment and the amount) and it is recorded once — a different amount would be a second
 * refund.
 */
class RefundOutcomeUnknown extends \RuntimeException
{
    public const CODE = 'refund_outcome_unknown';

    public const MESSAGE = 'Stripe did not answer in time, so this refund may or may not have been made. It shows on this booking once Stripe confirms it. If you try again, use exactly the same amount: Stripe then returns the same refund instead of making a second one. A different amount would be a second refund.';
}
