<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\AnalyticsService;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Fulfilling and cancelling a reward redemption: the one writer both the full
 * admin (`RewardAdminController`) and HexaTech Loyalty call (spec 2026-10-21
 * §6.5). Moved here unchanged from the controller.
 *
 * Both work under the row's lock: otherwise a concurrent cancel can refund the
 * points while the same redemption is marked fulfilled, leaving the member
 * with the reward and the points, and two cancels both refund. A cancel on a
 * pending redemption gives the points back by reversing the original debit
 * (never by awarding, which would raise lifetime points nobody earned) and
 * returns the stock; a cancel on a fulfilled one is bookkeeping only — its
 * value is gone.
 *
 * `notes`: false keeps the row's; a string or null replaces them (what the full admin did when a request named
 * `notes`).
 */
final class RedemptionActions
{
    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    /** @throws RedemptionStateException when it is not pending */
    public function fulfil(int $id, User $by, string|null|false $notes = false): RewardRedemption
    {
        $row = DB::transaction(function () use ($id, $by, $notes) {
            $row = RewardRedemption::whereKey($id)->lockForUpdate()->firstOrFail();
            if ($row->status !== RewardRedemption::STATUS_PENDING) {
                throw new RedemptionStateException("Redemption is already {$row->status}.");
            }
            if ($this->debit($row)?->is_reversed) {
                throw new RedemptionStateException('This redemption was refunded. Cancel it instead.');
            }
            $row->update([
                'status'               => RewardRedemption::STATUS_FULFILLED,
                'fulfilled_at'         => now(),
                'fulfilled_by_user_id' => $by->id,
                'notes'                => $notes === false ? $row->notes : $notes,
            ]);

            return $row;
        });
        $row->load(['reward' => fn ($q) => $q->withoutGlobalScope(BrandScope::class)->where('organization_id', $row->organization_id)]);

        AuditLog::record('reward_redemption_fulfilled', $row,
            ['status' => 'fulfilled'], ['status' => 'pending'],
            $by, "Redemption {$row->code} fulfilled for {$row->reward?->name}");
        AnalyticsService::clearDashboardCache();

        return $row;
    }

    /** @throws RedemptionStateException when it is cancelled already */
    public function cancel(int $id, User $by, string|null|false $notes = false): RewardRedemption
    {
        $row = RewardRedemption::with('reward', 'member')->findOrFail($id);
        if ($row->status === RewardRedemption::STATUS_CANCELLED) {
            throw new RedemptionStateException('Redemption is already cancelled.');
        }

        DB::transaction(function () use (&$row, $by, $notes) {
            // Re-read under lock: two concurrent cancels both passed the check above.
            $row = RewardRedemption::with(['reward' => fn ($q) => $q->withoutGlobalScope(BrandScope::class)
                ->where('organization_id', $row->organization_id), 'member'])->whereKey($row->id)->lockForUpdate()->firstOrFail();
            if ($row->status === RewardRedemption::STATUS_CANCELLED) {
                throw new RedemptionStateException('Redemption is already cancelled.');
            }

            if ($row->status === RewardRedemption::STATUS_PENDING) {
                // A fresh redemption locks reward then member. Keep the same order while returning stock.
                $row->setRelation('reward', Reward::withoutGlobalScope(BrandScope::class)
                    ->where('organization_id', $row->organization_id)->whereKey($row->reward_id)->lockForUpdate()->first());
                if ($row->member && $row->points_spent > 0) {
                    $debit = $this->debit($row);

                    if ($debit && !$debit->is_reversed) {
                        $this->loyalty->reverseTransaction($debit, "cancelled reward redemption {$row->code}", $by);
                    } elseif (!$debit) {
                        // No matching debit (rows from before the idempotency key): a credit, so the member is not
                        // left short.
                        $this->loyalty->awardPoints($row->member, $row->points_spent, "Refund: cancelled reward redemption {$row->code}", 'adjust',
                            reasonCode: 'redemption_refund', idempotencyKey: 'reward_refund_' . $row->id, qualifying: false);
                    }
                }
                if ($row->reward && $row->reward->stock !== null) {
                    $row->reward->increment('stock');
                }
            }

            $row->update([
                'status'               => RewardRedemption::STATUS_CANCELLED,
                'cancelled_at'         => now(),
                'cancelled_by_user_id' => $by->id,
                'notes'                => $notes === false ? $row->notes : $notes,
            ]);
        });

        AuditLog::record('reward_redemption_cancelled', $row,
            ['status' => 'cancelled'], ['status' => $row->getOriginal('status')],
            $by, "Redemption {$row->code} cancelled");
        AnalyticsService::clearDashboardCache();

        return $row;
    }

    private function debit(RewardRedemption $row): ?PointsTransaction
    {
        return PointsTransaction::withoutGlobalScope(BrandScope::class)->where('organization_id', $row->organization_id)
            ->where('member_id', $row->member_id)->where('idempotency_key', 'reward_redemption_' . $row->id)->first();
    }

    /**
     * Release 7 (spec 2026-10-25 §2): a free redemption of a catalogue reward — what a full stamp card gives. Like the
     * member's own redemption (`Member/RewardController::redeem`) it is pending, with the code the member shows at the
     * desk, and it takes one from a limited stock; it costs no points (`points_spent` 0, so a cancel gives none back),
     * and the reward's per-member limit — a rule for spending points — does not apply to it. Audited
     * `reward_redemption_issued`; fulfilled and cancelled like any other.
     *
     * Under the reward row's lock, in the caller's transaction when there is one (a savepoint). Never call it holding a
     * member row's lock: a member's own redemption locks the reward row, then the member row (StampCards issues it after
     * the stamp's transaction has committed). Null, with nothing written, when the reward is not this organisation's or
     * can no longer be had (switched off, expired, out of stock): the caller then gives something else.
     */
    public function issueFree(LoyaltyMember $member, int $rewardId, string $why, ?User $by = null): ?RewardRedemption
    {
        $orgId = (int) $member->organization_id;

        $row = DB::transaction(function () use ($member, $orgId, $rewardId, $why) {
            $reward = Reward::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($rewardId)->lockForUpdate()->first();
            if (!$reward || !$reward->isRedeemable()) {
                return null;
            }
            if ($reward->stock !== null) {
                // By the row, not the model: a brand bound in this request must not narrow the update to nothing.
                Reward::withoutGlobalScopes()->whereKey($reward->id)->where('stock', '>', 0)->decrement('stock');
            }

            // The member's own redemption's code: REW- and eight letters or digits, unique in the organisation.
            $code = null;
            for ($i = 0; $i < 4 && $code === null; $i++) {
                $try = 'REW-' . strtoupper(Str::random(8));
                if (!RewardRedemption::withoutGlobalScopes()->where('organization_id', $orgId)->where('code', $try)->exists()) {
                    $code = $try;
                }
            }

            $row = new RewardRedemption();
            $row->forceFill([
                'organization_id' => $orgId,
                'member_id'       => (int) $member->id,
                'reward_id'       => (int) $reward->id,
                'points_spent'    => 0,
                'code'            => $code ?? 'REW-' . strtoupper(Str::random(12)),
                'status'          => RewardRedemption::STATUS_PENDING,
                'notes'           => mb_substr($why, 0, 500),
            ])->save();

            return $row->setRelation('reward', $reward);
        });
        if ($row === null) {
            return null;
        }

        AuditLog::record('reward_redemption_issued', $row,
            ['status' => 'pending', 'reward_id' => (int) $row->reward_id, 'points_spent' => 0, 'why' => $why], [],
            $by, "Redemption {$row->code} issued free for {$row->reward?->name}: {$why}");
        AnalyticsService::clearDashboardCache();

        return $row;
    }
}
