<?php

namespace App\Services\Booking;

use App\Models\MemberOffer;
use App\Models\RewardRedemption;

/**
 * Gives a coupon back when the booking that used it is cancelled — and only
 * then: the row must still say it was used by THIS booking. A claim can
 * also be marked used at the counter (no reference) or by a later booking,
 * and neither is this cancellation's to undo.
 *
 * `special_offers.times_used` counts claims, not uses, and is not touched.
 */
final class CouponRelease
{
    public function release(?string $source, ?int $sourceId, string $reference): bool
    {
        if (!$sourceId || $reference === '') {
            return false;
        }

        if ($source === 'offer') {
            return MemberOffer::whereKey($sourceId)
                ->where('used_reference', $reference)
                ->update(['used_at' => null, 'status' => 'claimed', 'used_reference' => null]) === 1;
        }

        if ($source === 'reward') {
            return RewardRedemption::whereKey($sourceId)
                ->where('status', RewardRedemption::STATUS_FULFILLED)
                ->where('notes', "Applied to {$reference}")
                ->update(['status' => RewardRedemption::STATUS_PENDING, 'fulfilled_at' => null, 'notes' => null]) === 1;
        }

        return false;
    }

    /**
     * Whether the coupon is still marked used by THIS booking — the same row
     * release() would give back. A booking cancelled in the portal had its
     * coupon given back, so reopening it would use the coupon twice (Part F).
     */
    public function stillUsedBy(string $source, int $sourceId, string $reference): bool
    {
        return match ($source) {
            'offer'  => MemberOffer::whereKey($sourceId)->where('used_reference', $reference)->exists(),
            'reward' => RewardRedemption::whereKey($sourceId)
                ->where('status', RewardRedemption::STATUS_FULFILLED)
                ->where('notes', "Applied to {$reference}")
                ->exists(),
            default  => true,
        };
    }
}
