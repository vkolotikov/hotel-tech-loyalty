<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\PointsTransaction;
use App\Models\RewardRedemption;
use App\Models\User;
use App\Services\AnalyticsService;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;

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
            $row->update([
                'status'               => RewardRedemption::STATUS_FULFILLED,
                'fulfilled_at'         => now(),
                'fulfilled_by_user_id' => $by->id,
                'notes'                => $notes === false ? $row->notes : $notes,
            ]);

            return $row;
        });
        $row->load('reward');

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
            $row = RewardRedemption::with('reward', 'member')->whereKey($row->id)->lockForUpdate()->firstOrFail();
            if ($row->status === RewardRedemption::STATUS_CANCELLED) {
                throw new RedemptionStateException('Redemption is already cancelled.');
            }

            if ($row->status === RewardRedemption::STATUS_PENDING) {
                if ($row->member && $row->points_spent > 0) {
                    $debit = PointsTransaction::where('idempotency_key', 'reward_redemption_' . $row->id)
                        ->where('is_reversed', false)
                        ->first();

                    if ($debit) {
                        $this->loyalty->reverseTransaction($debit, "cancelled reward redemption {$row->code}", $by);
                    } else {
                        // No matching debit (rows from before the idempotency key): a credit, so the member is not
                        // left short.
                        $this->loyalty->awardPoints($row->member, $row->points_spent, "Refund: cancelled reward redemption {$row->code}", 'adjust');
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
}
