<?php

namespace App\Services\Booking;

use App\Models\LoyaltyMember;
use App\Services\DiscountService;

/**
 * The member price of a booking: the engine's scoped quote in the booking's
 * own currency, the columns a booking row stores, and the coupon write that
 * happens inside the confirm transaction.
 */
final class MemberPricing
{
    public function __construct(private readonly DiscountService $discounts, private readonly CouponResolver $coupons) {}

    public function quote(LoyaltyMember $member, float $listAmount, string $currency, BookingScope $scope, ?CouponSelection $coupon = null): PricingResult
    {
        $q = $this->discounts->quoteForBooking($member, round($listAmount, 2), $scope, $coupon);
        return new PricingResult($q['amount'], $q['discount'], $q['total'], $q['applied'], $q['coupon'], strtoupper($currency));
    }

    /** Zero discount — a venue without loyalty, or a member with no tier. */
    public function quoteWithoutMember(float $listAmount, string $currency): PricingResult
    {
        $list = round($listAmount, 2);
        return new PricingResult($list, 0.0, $list, null, null, strtoupper($currency));
    }

    public function columns(PricingResult $p): array
    {
        return [
            'list_amount'        => $p->list,
            'discount_amount'    => $p->discount,
            'discount_source'    => $p->applied['source'] ?? null,
            'discount_source_id' => $p->applied['source_id'] ?? null,
            'discount_label'     => isset($p->applied['label']) ? mb_substr($p->applied['label'], 0, 120) : null,
            'total_amount'       => $p->total,
        ];
    }

    /** Inside the booking transaction only. An outbid coupon is left untouched. */
    public function consume(PricingResult $p, string $reference): void
    {
        if ($p->couponConsumable()) {
            $this->coupons->consume($p->applied, $reference);
        }
    }
}
