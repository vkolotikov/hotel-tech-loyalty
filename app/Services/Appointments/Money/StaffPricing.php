<?php

namespace App\Services\Appointments\Money;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\PricingResult;
use App\Services\Portal\PortalBootstrap;
use App\Services\ServiceSchedulingService;

/**
 * The price of an appointment staff book (Part E spec §6): the slot's list
 * price, then — for a member of a venue with an active programme — the
 * portal's own member price and the member's chosen coupon. Staff and the
 * portal price through the same MemberPricing, so they cannot disagree.
 */
final class StaffPricing
{
    public function __construct(private readonly ServiceSchedulingService $scheduler, private readonly MemberPricing $pricing)
    {
    }

    public static function memberFor(Guest $client): ?LoyaltyMember
    {
        if (!$client->member_id || !PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) {
            return null;
        }

        return LoyaltyMember::whereKey($client->member_id)->first();
    }

    public function price(Guest $client, float $list, string $currency, ?CouponSelection $coupon): PricingResult
    {
        $member = self::memberFor($client);
        if ($member === null) {
            if ($coupon !== null) {
                throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
            }

            return $this->pricing->quoteWithoutMember($list, $currency);
        }

        return $this->pricing->quote($member, $list, $currency, BookingScope::Services, $coupon);
    }

    /** @throws \RuntimeException when the slot is not free (the scheduler's own message) */
    public function quote(Guest $client, Service $service, ServiceMaster $master, string $startIso, ?CouponSelection $coupon): PricingResult
    {
        $slot = $this->scheduler->reserveSlot($service, $master->id, $startIso);

        return $this->price($client, (float) $slot['price'], $service->currency ?: 'EUR', $coupon);
    }

    /** The price columns a booking row stores. */
    public function columns(PricingResult $p): array
    {
        return $this->pricing->columns($p);
    }

    /** Inside the booking transaction only. */
    public function consume(PricingResult $p, string $reference): void
    {
        $this->pricing->consume($p, $reference);
    }
}
