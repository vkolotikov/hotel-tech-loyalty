<?php

namespace App\Services\Loyalty;

use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingScope;
use App\Services\DiscountService;
use Carbon\CarbonImmutable;

/**
 * What HexaTech Loyalty's Program and Rewards forms may say (spec 2026-10-21
 * §4.5, §4.6), served by the server so the workspace never keeps a copy of a
 * list, and how two kinds of value they send are read. The lists are the
 * full admin's own, which validates against the same words.
 */
final class LoyaltyForms
{
    /** A benefit's categories and the ways it is given (BenefitAdminController's lists). */
    public const BENEFIT_CATEGORIES = ['accommodation', 'dining', 'wellness', 'transport', 'recognition', 'points', 'access', 'discount', 'other'];
    public const FULFILLMENT_MODES = ['automatic', 'staff_approved', 'pms_linked', 'voucher', 'on_request'];

    /** An offer's types (OffersAdminController's list). */
    public const OFFER_TYPES = ['discount', 'points_multiplier', 'free_night', 'upgrade', 'bonus_points', 'cashback', 'fixed_amount'];

    /** A reward's typed discount (RewardAdminController's list). */
    public const REWARD_DISCOUNT_TYPES = [DiscountService::PERCENT, DiscountService::FIXED];

    /** @return list<string> What a discount applies to: every booking, or one side of the catalogue (BookingScope). */
    public static function appliesTo(): array
    {
        return ['all', ...array_map(fn (BookingScope $scope) => $scope->value, BookingScope::cases())];
    }

    /**
     * An instant a form sent (a boost's start and end, a reward's expiry), in UTC for storage. With an offset it is
     * the instant written; without one it is the venue's wall clock (§6.6). Eloquent alone would read a bare time as
     * UTC and keep an offset's digits as if they were UTC.
     */
    public static function instant(string $value, int $orgId): CarbonImmutable
    {
        $zoned = (bool) (date_parse($value)['is_localtime'] ?? false);

        return ($zoned ? CarbonImmutable::parse($value) : CarbonImmutable::parse($value, VenueClock::zone($orgId)))->utc();
    }

    /** @return list<int>|null A stored list of ids or weekdays as integers; an empty one means "no constraint", null. */
    public static function ints(mixed $list): ?array
    {
        return is_array($list) && $list !== [] ? array_values(array_unique(array_map('intval', $list))) : null;
    }
}
