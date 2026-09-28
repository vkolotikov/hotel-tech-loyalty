<?php

namespace App\Services\Booking;

/**
 * Thrown by PortalPaymentIntentGuard::assertUnused() when the supplied
 * PaymentIntent already pays for another ServiceBooking in this
 * organisation. Extends PaymentMismatch so the controller's existing
 * `catch (PaymentMismatch)` branches keep answering 409 `payment_mismatch`
 * unchanged; the controller matches this type specifically so it never
 * releases (cancels) a card hold that a real, already-confirmed booking is
 * relying on.
 */
class PaymentAlreadyUsed extends PaymentMismatch
{
}
