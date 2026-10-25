<?php

namespace App\Services\Loyalty\Access;

use App\Models\AccessPlace;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;

/**
 * The one decider of who gets in (release 8, spec 2026-10-25 §1): a member at a place, or at an event. Reads only.
 * PRE-WIRED STUB: part A implements it (the order of the checks is the spec's table); part E's EventCheckIn calls it.
 */
class AccessDecision
{
    public function decide(LoyaltyMember $member, ?AccessPlace $place = null, ?LoyaltyEvent $event = null): AccessVerdict
    {
        return new AccessVerdict(true, AccessVerdict::WELCOME);
    }
}
