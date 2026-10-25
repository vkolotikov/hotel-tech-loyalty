<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;

/**
 * The tier qualification counters (release 7 §4.3): nights, stays and spend. PRE-WIRED STUB: part F implements it.
 */
class TierCounters
{
    public function count(LoyaltyMember $member, Visit $visit): void
    {
    }

    public function uncount(int $orgId, string $referenceType, int $referenceId): void
    {
    }
}
