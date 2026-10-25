<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;
use App\Services\LoyaltyService;

/**
 * The tier qualification counters (release 7, spec 2026-10-25 §4.3): what a visit counts towards a tier judged on
 * nights, stays or spend. A finished stay adds its nights, one stay and its spend; a completed appointment and a desk
 * purchase add their spend; a check-in without an amount adds nothing. VisitRecorder is the one caller.
 *
 * The counting itself — once per reference, under the member row lock, with the tier assessed after — is
 * LoyaltyService's (countQualifyingVisit() / uncountQualifyingVisit()), the counters' one writer; this class only
 * decides what a visit is worth. A visit without a reference cannot be counted once, so it is not counted at all
 * (the desk names its scan event; bookings name themselves).
 */
class TierCounters
{
    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    /** Adds the visit to the member's counters (once per reference) and assesses the tier. */
    public function count(LoyaltyMember $member, Visit $visit): void
    {
        if ($visit->referenceType === null || $visit->referenceId === null) {
            return;
        }
        [$nights, $stays, $spend] = self::worth($visit);
        $this->loyalty->countQualifyingVisit($member, $visit->referenceType, $visit->referenceId, $nights, $stays, $spend);
    }

    /** A refunded or cancelled booking: what it added comes off again (never below zero), and the tier is assessed. */
    public function uncount(int $orgId, string $referenceType, int $referenceId): void
    {
        $this->loyalty->uncountQualifyingVisit($orgId, $referenceType, $referenceId);
    }

    /**
     * What a visit counts: [nights, stays, spend]. Only a stay counts nights (at least one) and a stay; every visit with
     * an amount counts that spend.
     *
     * @return array{0: int, 1: int, 2: float}
     */
    public static function worth(Visit $visit): array
    {
        $spend = $visit->amount !== null && $visit->amount > 0 ? round($visit->amount, 2) : 0.0;
        if ($visit->source === Visit::STAY) {
            return [max(1, (int) ($visit->nights ?? 1)), 1, $spend];
        }

        return [0, 0, $spend];
    }
}
