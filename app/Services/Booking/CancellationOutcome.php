<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use App\Models\ServiceBooking;

/** What a member's cancellation did: to the booking, the money, the coupon, the points and the PMS. */
final readonly class CancellationOutcome
{
    /**
     * @param 'service'|'stay' $kind
     * @param 'none'|'released'|'refunded' $money  nothing was taken online; a hold on the card was let go; a payment was refunded
     * @param int $pointsReversed  the points of this booking's awards that stand reversed once the
     *        cancellation is written — what its own reversal step reversed plus, for a refunded stay,
     *        what BookingRefundService::applyRefund() reversed while returning this booking's money
     *        (in this call, or in the earlier attempt a retry is finishing). Counted the same way on
     *        every path, by MemberCancellation::reversedPoints().
     * @param bool $memberMailed  the refund's own mail already told the member (a refunded stay)
     * @param ?bool $pmsCancelled  stays only: true when the reservation is cancelled in the PMS, false
     *        when the PMS refused or could not be reached (the venue must cancel it by hand), null
     *        when there was nothing to cancel there (an appointment, a local-only or mock stay).
     *        For the venue's mail; not part of toArray().
     */
    public function __construct(
        public string $kind,
        public ServiceBooking|BookingMirror $booking,
        public string $money,
        public float $amount,
        public string $currency,
        public bool $couponReleased,
        public int $pointsReversed,
        public bool $memberMailed = false,
        public ?bool $pmsCancelled = null,
    ) {}

    /** A copy carrying the PMS result, known only after the cancellation has been committed. */
    public function withPms(?bool $pmsCancelled): self
    {
        return new self($this->kind, $this->booking, $this->money, $this->amount, $this->currency, $this->couponReleased, $this->pointsReversed, $this->memberMailed, $pmsCancelled);
    }

    public function toArray(): array
    {
        return [
            'outcome'         => $this->money,
            'amount'          => $this->amount,
            'currency'        => $this->currency,
            'coupon_released' => $this->couponReleased,
            'points_reversed' => $this->pointsReversed,
        ];
    }
}
