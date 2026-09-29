<?php

namespace App\Services\Booking;

/**
 * Thrown by PortalPaymentIntentGuard::verify(), verifyStay() and
 * assertStillPayable() when the PaymentIntent could not be READ at all — the
 * Stripe retrieve threw, or returned nothing. Nothing is known about the
 * intent, so nothing about it may be decided: the authorisation is very
 * likely intact, it is never released or cancelled on this, no booking is
 * written, and the member is asked to confirm once more (503
 * `payment_check_failed`).
 *
 * Deliberately NOT a PaymentMismatch: every `catch (PaymentMismatch)` in the
 * portal answers "pay again", and some of them release the intent. A
 * retrieved intent whose status, amount or owner is wrong is still a
 * PaymentMismatch, and so is Stripe's own "no such payment intent"
 * (`resource_missing` / HTTP 404): trying again could never work.
 */
class PaymentUnverifiable extends \RuntimeException
{
    public const CODE = 'payment_check_failed';

    public const MESSAGE = 'We could not check your payment just now. No new payment was made. Please try to confirm once more.';
}
