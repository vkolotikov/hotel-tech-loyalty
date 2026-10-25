<?php

namespace App\Services\Loyalty\Stamps;

use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\Visits\Visit;

/**
 * The stamp card (release 7 §2): the only writer of `stamps` and `stamp_cards`. PRE-WIRED STUB: part S implements it.
 */
class StampCards
{
    /** @return array<string, mixed>|null the card after the stamp, `['added' => false, 'reason' => …]`, or null when the option is off */
    public function stamp(LoyaltyMember $member, Visit $visit): ?array
    {
        return null;
    }

    public function removeFor(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
    }
}
