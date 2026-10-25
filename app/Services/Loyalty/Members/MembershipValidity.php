<?php

namespace App\Services\Loyalty\Members;

use App\Models\LoyaltyMember;

/**
 * A membership's optional end date (release 8, spec 2026-10-25 §3): the only writer of
 * `loyalty_members.membership_valid_until`. PRE-WIRED STUB: part M implements it.
 */
class MembershipValidity
{
    /**
     * What the portal and the screens show of a member's validity.
     *
     * @return array{valid_until: ?string, state: string}
     */
    public static function summaryFor(LoyaltyMember $member): array
    {
        return ['valid_until' => $member->membership_valid_until?->toDateString(), 'state' => $member->is_active ? 'active' : 'off'];
    }
}
