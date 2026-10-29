<?php

namespace App\Services\Loyalty\Visits;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\User;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;
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
        $effects = app(VisitEffects::class);
        $id = $effects->remember($member, $visit);
        return $id !== null ? $effects->run($id) : $this->recordEffects($member, $visit);
    }

    /** Internal effect runner; durable entry points are record() and reversed(). */
    public function recordEffects(LoyaltyMember $member, Visit $visit): VisitOutcome
    {
        $outcome = new VisitOutcome();
        $outcome->stamp = $this->effect('stamp', $member, $visit, $outcome, fn () => $this->stamps->stamp($member, $visit));
        // A worker can stop after the stamp committed but before its free reward was settled.
        if (is_array($outcome->stamp)) {
            $this->effect('stamp_rewards', $member, $visit, $outcome, fn () => $this->stamps->settleRewards((int) $member->organization_id, (int) $member->id));
        }
        $outcome->credit = $this->effect('cashback', $member, $visit, $outcome, fn () => $this->credit->earnCashback($member, $visit));
        $outcome->referralQualified = (bool) $this->effect('referral', $member, $visit, $outcome, fn () => $this->referrals->qualify($member, $visit));
        $this->effect('tier_counters', $member, $visit, $outcome, fn () => $this->counters->count($member, $visit));

        return $outcome;
    }

    /** A refunded or cancelled booking: its stamp comes off (an open card only), its cashback and tier counts go back. */
    public function reversed(int $orgId, string $referenceType, int $referenceId, ?User $by = null): void
    {
        $effects = app(VisitEffects::class);
        $id = $effects->reverse($orgId, $referenceType, $referenceId, $by);
        // Cancellation can call this under booking/payment locks. Persist only the intent there;
        // its independent writers and reward locks run after the producer commits (or via recovery).
        DB::afterCommit(fn () => $effects->run($id));
    }

    /** @return list<string> Effects still needing recovery. */
    public function reverseEffects(int $orgId, string $referenceType, int $referenceId, ?User $by = null): array
    {
        $failed = [];
        foreach ([
            'points'        => fn () => $this->reverseBookingPoints($orgId, $referenceType, $referenceId, $by),
            'stamp'         => fn () => $this->stamps->removeFor($orgId, $referenceType, $referenceId, $by),
            'cashback'      => fn () => $this->credit->reverseFor($orgId, $referenceType, $referenceId, $by),
            'tier_counters' => fn () => $this->counters->uncount($orgId, $referenceType, $referenceId),
        ] as $name => $run) {
            try {
                $run();
            } catch (\Throwable $e) {
                $failed[] = $name;
                $this->failed($orgId, null, $name, "{$referenceType}#{$referenceId}", $e);
            }
        }
        return $failed;
    }

    /** Refund intents also recover a worker stopping before the booking's inline points reversal. */
    private function reverseBookingPoints(int $orgId, string $referenceType, int $referenceId, ?User $by): void
    {
        if (!in_array($referenceType, ['booking_mirror', 'service_booking'], true)) {
            return; // Desk reversals name a particular ledger line; they must not reverse its other awards.
        }

        $ids = PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)
            ->where('reference_type', $referenceType)->where('reference_id', $referenceId)
            ->where('points', '>', 0)->where('is_reversed', false)->orderBy('id')->pluck('id');
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $orgId, $referenceType, $referenceId, $by) {
                $line = PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($id)->lockForUpdate()->first();
                if ($line && !$line->is_reversed) {
                    app(LoyaltyService::class)->reverseTransaction($line, "Refunded {$referenceType} #{$referenceId}", $by);
                }
            });
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
