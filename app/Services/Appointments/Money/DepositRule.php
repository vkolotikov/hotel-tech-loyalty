<?php

namespace App\Services\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Appointments\AppointmentRefused;

/**
 * What a staff cancellation does to a booking-page deposit (Part H §6.1),
 * one rule for every path: the workspace's Cancel, and the full admin's
 * status change, delete and bulk cancel.
 *  - Cancelled at or before the deadline: the deposit goes back to the card
 *    now, whoever cancels. A deposit still only held is released by the
 *    capture job.
 *  - Cancelled later: the venue keeps it. A manager may still give it back
 *    with Part E's refund.
 * A no-show is not a cancellation: its deposit is kept and nothing runs.
 */
final class DepositRule
{
    /** The statuses a cancellation can come from. */
    public const OPEN = ['pending', 'confirmed', 'in_progress'];

    public function __construct(private readonly AppointmentMoney $money)
    {
    }

    /** The booking carries a deposit and is still open, so a cancellation decides what happens to it. */
    public static function applies(ServiceBooking $b): bool
    {
        return Deposits::of($b) !== null && in_array((string) $b->status, self::OPEN, true);
    }

    /**
     * Inside the caller's transaction, the booking row locked, before the
     * cancellation is saved. A refund Stripe refuses throws, so nothing is
     * cancelled. With online payments switched off at the venue the card
     * cannot be refunded here at all: the cancellation goes ahead and the
     * deposit is left to refund (the money block shows it; a manager gives
     * it back another way) — staff are never stuck.
     *
     * @return 'none'|'kept'|'released'|'refunded'|'to_refund'
     */
    public function onCancel(ServiceBooking $b, User $actor, ?\DateTimeInterface $now = null): string
    {
        if (!self::applies($b)) {
            return 'none';
        }
        if (!Deposits::inTime($b, $now ?? now())) {
            return 'kept';
        }
        $back = AppointmentMoney::summary($b)['refundable_online'];
        if ($back <= 0) {
            return 'released';
        }
        try {
            $this->money->refundInLock($b, $back, 'online_card', 'Deposit: cancelled in time', $actor);
        } catch (AppointmentRefused $e) {
            if ($e->errorCode === 'refund_unavailable') {
                return 'to_refund';
            }
            if ($e->errorCode === 'refund_failed') {
                throw new AppointmentRefused('deposit_refund_failed', 'The deposit could not be refunded just now. Try again.', 422);
            }
            throw $e;
        }

        return 'refunded';
    }
}
