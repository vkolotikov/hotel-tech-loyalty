<?php

namespace App\Services\Booking;

/** Exactly one coupon the member chose: a claimed offer or a pending reward redemption. */
final readonly class CouponSelection
{
    public function __construct(public ?int $memberOfferId = null, public ?int $redemptionId = null)
    {
        if ($memberOfferId !== null && $redemptionId !== null) {
            throw new CouponException('coupon_ambiguous', 'Choose one coupon at a time.');
        }
    }

    public static function fromArray(?array $a): ?self
    {
        if (!$a) return null;
        $offer = isset($a['member_offer_id']) ? (int) $a['member_offer_id'] : null;
        $red = isset($a['redemption_id']) ? (int) $a['redemption_id'] : null;
        if ($offer === null && $red === null) return null;
        return new self($offer, $red);
    }

    public function isOffer(): bool { return $this->memberOfferId !== null; }
}
