<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use Illuminate\Support\Collection;

/**
 * Works out what a member actually gets off a bill, and why.
 *
 * Before this the loyalty programme could describe a discount but never
 * apply one. `tier_benefits.value` was free-form prose whose only consumer
 * printed it on the scan screen; the enforceable `earn_rate` was dead
 * because `calculateEarnedPoints()` had no call sites; and `special_offers`
 * never compared `usage_limit` to `times_used`, so a "first 100 guests"
 * promo would happily read 4,812/100.
 *
 * Two deliberate rules, so the number staff read out is defensible:
 *
 *  - **Best one wins, they don't stack.** A Gold member with a 10% tier
 *    benefit who also claimed a 15% offer gets 15%, not 25%. Stacking
 *    percentages is how a promotion turns into an accident, and it makes
 *    the result depend on the order rules happen to be evaluated in.
 *  - **Every quote is itemised.** `applied` says which rule won and
 *    `considered` lists what else was in play, so a manager can answer
 *    "why did this guest get 15%?" without reading code.
 */
class DiscountService
{
    public const PERCENT   = 'percent_discount';
    public const FIXED     = 'fixed_amount';
    public const MULTIPLIER = 'points_multiplier';
    public const FREE_ITEM = 'free_item';
    public const TEXT      = 'text';

    /** The value types an admin may assign. */
    public const VALUE_TYPES = [
        self::PERCENT, self::FIXED, self::MULTIPLIER, self::FREE_ITEM, self::TEXT,
    ];

    /**
     * Active, typed benefits attached to this member's tier.
     *
     * `property_id` on a tier benefit means "only at this property"; a null
     * one applies everywhere.
     */
    public function benefitsFor(LoyaltyMember $member, ?int $propertyId = null): Collection
    {
        if (!$member->tier_id) {
            return collect();
        }

        return TierBenefit::where('tier_id', $member->tier_id)
            ->where('is_active', true)
            ->when(
                $propertyId,
                fn ($q) => $q->where(fn ($w) => $w->whereNull('property_id')->orWhere('property_id', $propertyId)),
                fn ($q) => $q->whereNull('property_id')
            )
            ->with(['benefit' => fn ($q) => $q->where('is_active', true)])
            ->get()
            ->filter(fn ($tb) => $tb->benefit !== null)
            ->values();
    }

    /**
     * Quote a bill.
     *
     * Returns the money in whole currency units plus the reasoning, so the
     * caller can show a breakdown rather than a bare number.
     */
    public function quote(LoyaltyMember $member, float $amount, ?int $propertyId = null): array
    {
        $amount = max(0.0, round($amount, 2));
        $candidates = [];

        foreach ($this->benefitsFor($member, $propertyId) as $tb) {
            $value = (float) ($tb->value_amount ?? 0);
            if ($value <= 0) {
                continue;
            }

            if ($tb->value_type === self::PERCENT) {
                $candidates[] = [
                    'source'   => 'tier_benefit',
                    'label'    => $tb->benefit->name,
                    'type'     => self::PERCENT,
                    'value'    => $value,
                    'discount' => round($amount * min($value, 100) / 100, 2),
                ];
            } elseif ($tb->value_type === self::FIXED) {
                $candidates[] = [
                    'source'   => 'tier_benefit',
                    'label'    => $tb->benefit->name,
                    'type'     => self::FIXED,
                    'value'    => $value,
                    // Never discount more than the bill.
                    'discount' => round(min($value, $amount), 2),
                ];
            }
        }

        foreach ($this->claimedOffers($member) as $claim) {
            $offer = $claim->offer;
            if (!$offer) {
                continue;
            }

            $value = (float) $offer->value;
            if ($value <= 0) {
                continue;
            }

            // SpecialOffer.type is free-form across installs; treat the
            // two money-shaped ones as discounts and ignore the rest.
            $type = strtolower((string) $offer->type);
            if (str_contains($type, 'percent') || $type === 'discount') {
                $candidates[] = [
                    'source'         => 'offer',
                    'label'          => $offer->title,
                    'type'           => self::PERCENT,
                    'value'          => $value,
                    'discount'       => round($amount * min($value, 100) / 100, 2),
                    'member_offer_id' => $claim->id,
                ];
            } elseif (str_contains($type, 'amount') || str_contains($type, 'fixed')) {
                $candidates[] = [
                    'source'         => 'offer',
                    'label'          => $offer->title,
                    'type'           => self::FIXED,
                    'value'          => $value,
                    'discount'       => round(min($value, $amount), 2),
                    'member_offer_id' => $claim->id,
                ];
            }
        }

        // Best single rule wins — see the class docblock.
        usort($candidates, fn ($a, $b) => $b['discount'] <=> $a['discount']);
        $best = $candidates[0] ?? null;

        $discount = $best ? min($best['discount'], $amount) : 0.0;

        return [
            'amount'     => $amount,
            'discount'   => round($discount, 2),
            'total'      => round($amount - $discount, 2),
            'applied'    => $best,
            // Everything else that was eligible but lost, for the "why?"
            'considered' => array_slice($candidates, 1),
            'currency'   => config('app.currency', 'EUR'),
        ];
    }

    /**
     * How much faster this member earns points.
     *
     * Composes multiplicatively with EarnRateEvent (handled separately in
     * LoyaltyService) because the two mean different things: a tier
     * multiplier is a standing privilege, an event is a promotion.
     */
    public function pointsMultiplierFor(LoyaltyMember $member, ?int $propertyId = null): float
    {
        $best = 1.0;

        foreach ($this->benefitsFor($member, $propertyId) as $tb) {
            if ($tb->value_type !== self::MULTIPLIER) {
                continue;
            }
            $value = (float) ($tb->value_amount ?? 0);
            if ($value > $best) {
                $best = $value;
            }
        }

        return $best;
    }

    /**
     * Offers the member has claimed and not yet used, still inside their
     * window.
     */
    private function claimedOffers(LoyaltyMember $member): Collection
    {
        return MemberOffer::where('member_id', $member->id)
            ->whereNull('used_at')
            ->where('status', '!=', 'expired')
            ->with(['offer' => fn ($q) => $q->where('is_active', true)])
            ->get()
            ->filter(function ($claim) {
                $offer = $claim->offer;
                if (!$offer) {
                    return false;
                }
                // Date window, inclusive of the last day.
                if ($offer->start_date && $offer->start_date->isFuture()) {
                    return false;
                }
                if ($offer->end_date && $offer->end_date->endOfDay()->isPast()) {
                    return false;
                }
                if ($claim->expires_at && $claim->expires_at->isPast()) {
                    return false;
                }
                return true;
            })
            ->values();
    }

    /**
     * Is this offer still claimable at all?
     *
     * `usage_limit` was never compared to `times_used` anywhere, so a
     * capped promotion had no cap.
     */
    public function offerHasCapacity(SpecialOffer $offer): bool
    {
        if ($offer->usage_limit === null) {
            return true;
        }

        return (int) $offer->times_used < (int) $offer->usage_limit;
    }
}
