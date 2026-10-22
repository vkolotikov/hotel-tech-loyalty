<?php

namespace App\Services\Loyalty;

use App\Models\Brand;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingScope;
use App\Services\DiscountService;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;

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

    /**
     * The currencies Card & app offers (release 4, R4-5): ISO 4217 codes the venues use, the ones the Appointments
     * Setup and the full admin's booking settings offer, those Stripe's minimums are known for (Deposits::MINIMUMS),
     * and a few more. Not every ISO code: a venue picks the one its prices are in.
     */
    public const CURRENCIES = [
        'EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'UAH', 'TRY', 'AED', 'SAR',
        'ILS', 'CAD', 'AUD', 'NZD', 'JPY', 'SGD', 'HKD', 'THB', 'INR', 'MXN', 'BRL', 'ZAR',
    ];

    /** @return list<string> The currencies to choose from: the list, and the venue's own when it is another code. */
    public static function currencies(string $current): array
    {
        $current = strtoupper(trim($current));

        return preg_match('/^[A-Z]{3}$/', $current) === 1 && !in_array($current, self::CURRENCIES, true)
            ? [...self::CURRENCIES, $current]
            : self::CURRENCIES;
    }

    /**
     * The brands a new reward, offer or boost may be put on (release 4 part E), for this staff member: this
     * organisation's brands that are not deleted, the default first, then in their order. A request bound to one
     * brand (a staff member assigned to one only, or a brand picked) offers that one; a staff member assigned to some
     * brands offers those (the `brand` middleware's rule); everyone else, a platform admin included, every brand.
     * `default` is the default brand when it is offered, else the first; null when the organisation has none.
     *
     * @return array{list: list<array{id: int, name: string, is_default: bool}>, default: ?int}
     */
    public static function brands(User $user, int $orgId): array
    {
        $query = Brand::withoutGlobalScopes()->where('organization_id', $orgId)->whereNull('deleted_at')
            ->orderByDesc('is_default')->orderBy('sort_order')->orderBy('name')->orderBy('id');
        $bound = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        if ($bound) {
            $query->whereKey((int) $bound);
        } elseif ($user->user_type === 'staff' && !$user->isPlatformAdmin()) {
            $assigned = $user->brands()->pluck('brands.id')->map(fn ($id) => (int) $id)->all();
            if ($assigned !== []) {
                $query->whereIn('id', $assigned);
            }
        }

        $list = $query->get(['id', 'name', 'is_default'])
            ->map(fn (Brand $b) => ['id' => (int) $b->id, 'name' => (string) $b->name, 'is_default' => (bool) $b->is_default])
            ->values()->all();
        $default = null;
        foreach ($list as $brand) {
            if ($brand['is_default']) {
                $default = $brand['id'];
                break;
            }
        }

        return ['list' => $list, 'default' => $default ?? ($list[0]['id'] ?? null)];
    }

    /**
     * The rule for the brand a new row names, sent as `brand` (an id; not `brand_id`, which every workspace call
     * carries in its address as `all` and Laravel would read as the field): one of brands()' list. Absent or null,
     * the model's own hook picks the brand as before (the request's brand, else the organisation's default).
     *
     * @return list<mixed>
     */
    public static function brandRule(User $user, int $orgId): array
    {
        return ['sometimes', 'nullable', 'integer', Rule::in(array_column(self::brands($user, $orgId)['list'], 'id'))];
    }

    /**
     * Validated fields with the chosen `brand` as the `brand_id` column; without a choice the column is left out.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function withBrand(array $data): array
    {
        $brand = $data['brand'] ?? null;
        unset($data['brand']);
        if ($brand !== null) {
            $data['brand_id'] = (int) $brand;
        }

        return $data;
    }
}
