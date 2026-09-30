<?php

namespace App\Services\Booking;

/**
 * The supplied PaymentIntent already pays for another ServiceBooking in this
 * organisation. Thrown by PortalPaymentIntentGuard::assertUnused(), by the
 * member portal's service confirm when the database's unique index on the
 * payment reference refuses its insert, and by the public services confirm's
 * own check before its insert (which answers it in its own words). Extends
 * PaymentMismatch so the portal controller's existing
 * `catch (PaymentMismatch)` branches keep answering 409 `payment_mismatch`
 * unchanged; the controller matches this type specifically so it never
 * releases (cancels) a card hold that a real, already-confirmed booking is
 * relying on.
 */
class PaymentAlreadyUsed extends PaymentMismatch
{
}
