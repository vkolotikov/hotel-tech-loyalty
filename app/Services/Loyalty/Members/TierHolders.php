<?php

namespace App\Services\Loyalty\Members;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\TierAssessment;
use App\Models\User;
use App\Services\Appointments\VenueClock;

/**
 * Every member of one tier given another at once (release 11: a tier is deleted only once nobody holds it,
 * Programme\TierRemoval). Each member's move is history as a review's is — a tier assessment with the reason, the
 * counters it was made at and who made it — and the guest record's copy of the tier name follows. A kept-until day
 * or a grace clock was about the old tier, so both are cleared; a locked tier stays locked on the new one. Members are
 * not told: the programme changed, not their standing in it.
 */
final class TierHolders
{
    public const REASON_DELETED = 'tier_deleted';
    private const CHUNK = 500;

    /** @return int How many members moved. */
    public function moveAll(LoyaltyTier $from, LoyaltyTier $to, User $by, string $reason = self::REASON_DELETED): int
    {
        $orgId = (int) $from->organization_id;
        $today = VenueClock::today($orgId);
        $moved = 0;

        LoyaltyMember::query()->where('tier_id', $from->id)
            ->select(['id', 'qualifying_points', 'qualifying_nights', 'qualifying_stays', 'qualifying_spend'])
            ->orderBy('id')
            ->chunkById(self::CHUNK, function ($members) use ($from, $to, $by, $reason, $orgId, $today, &$moved) {
                $ids = $members->pluck('id')->all();
                // Only those still on the old tier: a review that moved one meanwhile keeps its own move.
                $now = LoyaltyMember::query()->whereIn('id', $ids)->where('tier_id', $from->id)->pluck('id')->all();
                if ($now === []) {
                    return;
                }
                LoyaltyMember::query()->whereIn('id', $now)->where('tier_id', $from->id)->update([
                    'tier_id'              => $to->id,
                    'tier_effective_from'  => $today,
                    'tier_effective_until' => null,
                    'tier_override_until'  => null,
                ]);

                $stamp = now();
                TierAssessment::query()->insert($members->whereIn('id', $now)->map(fn (LoyaltyMember $m) => [
                    'organization_id'                 => $orgId,
                    'member_id'                       => $m->id,
                    'old_tier_id'                     => $from->id,
                    'new_tier_id'                     => $to->id,
                    'reason'                          => $reason,
                    'qualifying_points_at_assessment' => (int) ($m->qualifying_points ?? 0),
                    'qualifying_nights_at_assessment' => (int) ($m->qualifying_nights ?? 0),
                    'qualifying_stays_at_assessment'  => (int) ($m->qualifying_stays ?? 0),
                    'qualifying_spend_at_assessment'  => round((float) ($m->qualifying_spend ?? 0), 2),
                    'assessment_window_start'         => $today,
                    'assessment_window_end'           => $today,
                    'assessed_by'                     => $by->id,
                    'notes'                           => "Tier '{$from->name}' was deleted",
                    'created_at'                      => $stamp,
                    'updated_at'                      => $stamp,
                ])->values()->all());

                Guest::query()->whereIn('member_id', $now)->update(['loyalty_tier' => self::guestCopy($to->name)]);
                $moved += count($now);
            });

        return $moved;
    }

    /** A tier renamed (release 11): the guest records of its members carry the new name. */
    public function renamed(LoyaltyTier $tier): void
    {
        Guest::query()->whereIn('member_id', LoyaltyMember::query()->where('tier_id', $tier->id)->select('id'))
            ->update(['loyalty_tier' => self::guestCopy((string) $tier->name)]);
    }

    /** `guests.loyalty_tier` holds 30 characters; a tier's name may be longer. */
    private static function guestCopy(string $name): string
    {
        return mb_substr($name, 0, 30);
    }
}
