<?php

namespace App\Services\Booking;

/** Money is reserved for a refund, but has not yet been returned to the payer. */
final class RefundNotSettled extends \RuntimeException
{
    public function __construct(public readonly string $errorCode = 'refund_pending', ?\Throwable $previous = null)
    {
        parent::__construct(match ($errorCode) {
            'invalid_amount' => 'Enter a positive amount valid for this currency. Currencies without decimal units require a whole number.',
            'refund_failed' => 'The refund was declined. No refund was completed. Please check the payment and try again.',
            'refund_outcome_unknown' => 'The refund result is not known yet. Check its status or retry the same amount; do not return the money another way.',
            default => 'The refund is still processing. The booking remains active until the money is returned. Please check again shortly.',
        }, 0, $previous);
    }

    public function httpStatus(): int
    {
        return $this->errorCode === 'invalid_amount' ? 422 : 409;
    }
}
