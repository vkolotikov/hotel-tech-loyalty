<?php

namespace App\Services\Booking;

/**
 * Thrown inside the confirm() advisory-lock transaction when the price
 * recomputed under the lock no longer matches the amount a supplied
 * PaymentIntent was authorised for. The controller turns this into a 409
 * `payment_mismatch` after cancelling the PaymentIntent (best effort).
 *
 * Not `final`: PaymentAlreadyUsed extends it so the controller's existing
 * `catch (PaymentMismatch)` branches keep working unchanged for that case
 * too, while still being distinguishable where it matters (never cancel a
 * PaymentIntent that already pays for a real booking).
 */
class PaymentMismatch extends \RuntimeException
{
}
