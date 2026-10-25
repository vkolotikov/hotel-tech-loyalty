<?php

namespace App\Services\Loyalty\Events;

use App\Models\LoyaltyMember;

/**
 * Two members merged (MemberMergeService): their sign-ups and check-ins become the winner's, one per event (release 8,
 * spec 2026-10-25 §4). PRE-WIRED STUB: part E implements it.
 */
class EventMerge
{
    /** Before MemberMergeService moves MEMBER_COLUMNS rows: drops the loser's rows that would duplicate the winner's. */
    public function beforeMerge(LoyaltyMember $winner, LoyaltyMember $loser): int
    {
        return 0;
    }
}
