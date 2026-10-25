<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;

/**
 * Referrals rewarded at the friend's first visit (release 7 §4.5). PRE-WIRED STUB: part F implements it.
 */
class ReferralRewards
{
    /** The referee's first visit qualifies their pending referral: both bonuses paid. True when one was qualified now. */
    public function qualify(LoyaltyMember $member, Visit $visit): bool
    {
        return false;
    }
}
