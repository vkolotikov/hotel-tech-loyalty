<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;

/**
 * What a caller of BookingEngineService::confirm() may do inside the
 * engine's own transaction, under the room lock.
 *
 * beforeReservation() runs after the hold, the inventory and the live
 * availability have been re-checked and BEFORE the reservation is sent to
 * the PMS: anything that can still refuse the booking (a payment already
 * spent, a coupon just used, a price that moved) belongs here, where a
 * refusal costs nothing. Throw to refuse; the exception reaches the caller
 * and the transaction rolls back.
 *
 * afterMirror() runs after the mirror and its line items are written and
 * before the transaction commits: writes that must exist exactly when the
 * booking does. It must not throw for anything it could have checked in
 * beforeReservation() — by now the PMS holds a reservation.
 */
interface StayConfirmHooks
{
    public function beforeReservation(array $payload): void;

    public function afterMirror(BookingMirror $mirror, array $payload): void;
}
