<?php

namespace App\Services\Loyalty\Members;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\MemberDirectory;

/**
 * A member as HexaTech Loyalty's member page shows them (spec 2026-10-21 §4.3, release 2 §4.1): the list's row
 * (MemberDirectory::row) with the details block — language, nationality, date of birth, marketing consent — the tier
 * a manager holds them in until a day (`tier_override_until`), and whether the member was deleted. The member page,
 * and every change the members area makes, answer with this one shape.
 */
final class MemberProfile
{
    /** @return array<string, mixed> */
    public static function of(LoyaltyMember $member): array
    {
        $member->loadMissing('user');
        $user = $member->user;

        return MemberDirectory::row($member) + [
            'qualifying_points'   => (int) $member->qualifying_points,
            'referral_code'       => $member->referral_code,
            'language'            => $user?->language,
            'nationality'         => $user?->nationality,
            'date_of_birth'       => $user?->date_of_birth?->toDateString(),
            'marketing_consent'   => (bool) $member->marketing_consent,
            'tier_override_until' => $member->tier_override_until?->toIso8601String(),
            'is_erased'           => MemberErasure::isErased($member),
        ];
    }
}
