<?php

namespace App\Services\Loyalty\Access;

use App\Models\LoyaltyMember;
use App\Models\TierBenefit;

/**
 * What a member's tier gives, as the scan at a place or an event shows it beside the verdict (release 8, spec
 * 2026-10-25 §1): the tier's benefits that are on, each with its benefit that is on, as the member's page lists them
 * (MemberController::show) — `{ name, value, category }`, in the order they were given to the tier. Reads only.
 */
final class MemberBenefits
{
    /** @return list<array{name: string, value: ?string, category: ?string}> */
    public static function of(LoyaltyMember $member): array
    {
        if ($member->tier_id === null) {
            return [];
        }

        return TierBenefit::withoutGlobalScopes()
            ->where('organization_id', $member->organization_id)
            ->where('tier_id', $member->tier_id)->where('is_active', true)
            ->with('benefit:id,name,category,is_active')
            ->orderBy('id')
            ->get()
            ->filter(fn (TierBenefit $tb) => $tb->benefit !== null && $tb->benefit->is_active)
            ->map(fn (TierBenefit $tb) => [
                'name'     => (string) $tb->benefit->name,
                'value'    => $tb->value,
                'category' => $tb->benefit->category,
            ])->values()->all();
    }
}
