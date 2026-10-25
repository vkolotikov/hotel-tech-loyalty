<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;
use App\Services\LoyaltyService;

/**
 * The tier qualification counters (release 7, spec 2026-10-25 §4.3; release 8 §3): what a visit counts towards a tier.
 * Every visit — an appointment, a stay, a desk check-in or purchase, an event — counts one visit, once per member per
 * venue day (a second visit the same day adds no visit, its spend still counts); a finished stay adds its nights and one
 * stay too; any visit with an amount adds its spend. VisitRecorder is the one caller.
 *
 * The counting itself — once per reference, one visit per venue day, under the member row lock, with the tier assessed
 * after when the programme moves members by visits or spend — is LoyaltyService's (countQualifyingVisit() /
 * uncountQualifyingVisit()), the counters' one writer; this class only decides what a visit is worth. A visit without a
 * reference cannot be counted once, so it is not counted at all (the desk names its scan event; bookings and event
 * check-ins name themselves).
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
        $this->loyalty->countQualifyingVisit($member, $visit->referenceType, $visit->referenceId, $nights, $stays, $spend, $visit->venueDay);
    }

    /**
     * A refunded or cancelled booking (or a taken-back visit): what it added comes off again (never below zero), its day's
     * visit passes to another visit of that day if one stands, and the tier is assessed.
     */
    public function uncount(int $orgId, string $referenceType, int $referenceId): void
    {
        $this->loyalty->uncountQualifyingVisit($orgId, $referenceType, $referenceId);
    }

    /**
     * What a visit counts besides the visit itself (one per venue day, LoyaltyService's to decide): [nights, stays,
     * spend]. Only a stay counts nights (at least one) and a stay; every visit with an amount counts that spend.
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
