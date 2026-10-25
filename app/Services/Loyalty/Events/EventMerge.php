<?php

namespace App\Services\Loyalty\Events;

use App\Models\EventRegistration;
use App\Models\LoyaltyMember;
use Illuminate\Support\Facades\DB;

/**
 * Two members merged (MemberMergeService): their sign-ups and check-ins become the winner's, one per event (release 8,
 * spec 2026-10-25 §4) — the unique indexes allow one sign-up and one check-in per member per event.
 *
 * Called inside the merge's transaction, with both member rows locked, before the generic move carries the loser's
 * rows over. For an event both have a row for, the winner's row stays and the loser's is deleted — a winner's
 * cancelled sign-up is signed up again (with the earlier sign-up time) when the loser's stood, so the merged member
 * keeps their place. A check-in the merged member keeps as a walk-in is no longer one once they have a standing
 * sign-up for that event, so the event's numbers count them once. Every other row moves with the generic move.
 * Answers how many rows were dropped.
 */
class EventMerge
{
    /** Before MemberMergeService moves MEMBER_COLUMNS rows: drops the loser's rows that would duplicate the winner's. */
    public function beforeMerge(LoyaltyMember $winner, LoyaltyMember $loser): int
    {
        $orgId = (int) $winner->organization_id;
        $registrations = fn (int $memberId) => DB::table('loyalty_event_registrations')->where('organization_id', $orgId)->where('member_id', $memberId);
        $attendances = fn (int $memberId) => DB::table('loyalty_event_attendances')->where('organization_id', $orgId)->where('member_id', $memberId);

        $winnerSignUps = $registrations((int) $winner->id)->get()->keyBy('loyalty_event_id');
        $loserSignUps = $registrations((int) $loser->id)->get()->keyBy('loyalty_event_id');
        $winnerIn = $attendances((int) $winner->id)->get()->keyBy('loyalty_event_id');
        $loserIn = $attendances((int) $loser->id)->get()->keyBy('loyalty_event_id');
        $dropped = 0;

        foreach ($loserSignUps as $eventId => $theirs) {
            $ours = $winnerSignUps->get($eventId);
            if ($ours === null) {
                continue;
            }
            if ($ours->status !== EventRegistration::SIGNED_UP && $theirs->status === EventRegistration::SIGNED_UP) {
                DB::table('loyalty_event_registrations')->where('id', $ours->id)->update([
                    'status'       => EventRegistration::SIGNED_UP,
                    'signed_up_at' => $theirs->signed_up_at,
                    'cancelled_at' => null,
                    'updated_at'   => now(),
                ]);
            }
            DB::table('loyalty_event_registrations')->where('id', $theirs->id)->delete();
            $dropped++;
        }
        foreach ($loserIn as $eventId => $theirs) {
            if ($winnerIn->has($eventId)) {
                DB::table('loyalty_event_attendances')->where('id', $theirs->id)->delete();
                $dropped++;
            }
        }

        // The merged member's standing sign-ups, against the check-in each event keeps for them.
        $standing = $registrations((int) $winner->id)->where('status', EventRegistration::SIGNED_UP)->pluck('loyalty_event_id')
            ->merge($registrations((int) $loser->id)->where('status', EventRegistration::SIGNED_UP)->pluck('loyalty_event_id'))
            ->map(fn ($id) => (int) $id)->unique()->values()->all();
        if ($standing !== []) {
            DB::table('loyalty_event_attendances')->where('organization_id', $orgId)->whereIn('member_id', [(int) $winner->id, (int) $loser->id])
                ->whereIn('loyalty_event_id', $standing)->where('walk_in', true)->update(['walk_in' => false, 'updated_at' => now()]);
        }

        return $dropped;
    }
}
