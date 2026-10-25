<?php

namespace App\Services\Loyalty\Credit;

use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\Visits\Visit;

/**
 * Cashback credit (release 7 §3): the only writer of `credit_transactions` and `loyalty_members.credit_balance`.
 * PRE-WIRED STUB: part C implements it.
 */
class CreditLedger
{
    /** @return array<string, mixed>|null the earn line and the balance after it, or null when nothing was earned */
    public function earnCashback(LoyaltyMember $member, Visit $visit): ?array
    {
        return null;
    }

    public function reverseFor(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
    }
}
