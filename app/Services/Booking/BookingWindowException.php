<?php

namespace App\Services\Booking;

/**
 * A requested start time falls outside what the calendar would ever offer:
 * inside the lead-time window, in the past, or beyond the booking's
 * advance-booking horizon. Carries the same error code the response body
 * uses, like CouponException.
 */
class BookingWindowException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
