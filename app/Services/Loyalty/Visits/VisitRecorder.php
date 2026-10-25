<?php

namespace App\Services\Loyalty\Visits;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\Stamps\StampCards;
use Illuminate\Support\Facades\Log;

/**
 * The one hook for a member's visit (release 7, spec 2026-10-25 §2): a completed appointment, a finished stay, a desk
 * check-in or a purchase entered at the desk. It is the only caller of a visit's effects — the stamp card
 * (StampCards), cashback credit (CreditLedger), referral qualification (ReferralRewards) and the tier counters
 * (TierCounters) — each idempotent by the visit's reference, so the callers' repeated calls are safe.
 *
 * Every effect runs on its own: one that throws is logged, audited `loyalty.visit_effect_failed` and named in the
 * outcome, and never takes the others — or the booking that called this — with it. Callers call it after their own
 * writes (no booking lock or `pi:` lock is held here).
 */
final class VisitRecorder
{
    public function __construct(
        private readonly StampCards $stamps,
        private readonly CreditLedger $credit,
        private readonly ReferralRewards $referrals,
        private readonly TierCounters $counters,
    ) {
    }

    public function record(LoyaltyMember $member, Visit $visit): VisitOutcome
    {
        $outcome = new VisitOutcome();
        $outcome->stamp = $this->effect('stamp', $member, $visit, $outcome, fn () => $this->stamps->stamp($member, $visit));
        $outcome->credit = $this->effect('cashback', $member, $visit, $outcome, fn () => $this->credit->earnCashback($member, $visit));
        $outcome->referralQualified = (bool) $this->effect('referral', $member, $visit, $outcome, fn () => $this->referrals->qualify($member, $visit));
        $this->effect('tier_counters', $member, $visit, $outcome, fn () => $this->counters->count($member, $visit));

        return $outcome;
    }

    /** A refunded or cancelled booking: its stamp comes off (an open card only), its cashback and tier counts go back. */
    public function reversed(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
        foreach ([
            'stamp'         => fn () => $this->stamps->removeFor($orgId, $referenceType, $referenceId, $by),
            'cashback'      => fn () => $this->credit->reverseFor($orgId, $referenceType, $referenceId, $by),
            'tier_counters' => fn () => $this->counters->uncount($orgId, $referenceType, $referenceId),
        ] as $name => $run) {
            try {
                $run();
            } catch (\Throwable $e) {
                $this->failed($orgId, null, $name, "{$referenceType}#{$referenceId}", $e);
            }
        }
    }

    private function effect(string $name, LoyaltyMember $member, Visit $visit, VisitOutcome $outcome, callable $run): mixed
    {
        try {
            return $run();
        } catch (\Throwable $e) {
            $outcome->failed[] = $name;
            $this->failed((int) $member->organization_id, (int) $member->id, $name, $visit->source . ($visit->referenceId !== null ? " {$visit->referenceType}#{$visit->referenceId}" : ''), $e);

            return null;
        }
    }

    private function failed(int $orgId, ?int $memberId, string $effect, string $what, \Throwable $e): void
    {
        Log::error('loyalty.visit_effect_failed', ['org' => $orgId, 'member' => $memberId, 'effect' => $effect, 'visit' => $what, 'error' => $e->getMessage()]);
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'action'          => 'loyalty.visit_effect_failed',
                'subject_type'    => 'loyalty_member',
                'subject_id'      => $memberId,
                'new_values'      => ['effect' => $effect, 'visit' => $what, 'error' => mb_substr($e->getMessage(), 0, 500)],
                'description'     => "A visit's {$effect} could not be recorded ({$what})",
            ]);
        } catch (\Throwable) {
            // The log line above is the record.
        }
    }
}
