<?php

namespace App\Services\Loyalty\Access;

use App\Models\AccessPlace;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\Members\MemberErasure;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The one decider of who gets in (release 8, spec 2026-10-25 §1): a member at a place, or at an event. Reads only —
 * the scan at a place (PlaceScan) and part E's EventCheckIn write what follows from the answer.
 *
 * The checks run in the spec's order and the first that applies is the answer:
 *
 *  1. `member_erased`    — deleted, by staff (MemberErasure::isErased) or by the member (isSelfDeleted);
 *  2. `member_off`       — switched off (`is_active` false);
 *  3. `expired`          — `membership_valid_until` before the venue's today (the last day itself still lets in); at an
 *                          event, before the day it begins (release 9: as its sign-up judges, so a night that runs past
 *                          midnight does not refuse at 00:30 a member it let in at 23:00);
 *  4. `place_off`        — the place is switched off;
 *  5. `tier_not_allowed` — the place, or the event, admits chosen tiers and the member's tier is not one of them (a
 *                          member without a tier is not one either); `allowed_tiers` names them in the ladder's order;
 *  6. for an event: `event_not_open` (not published, or now on the venue's clock is outside its start less two hours to
 *     its end, the end itself excluded), `event_full` (no place left for a walk-in: the standing sign-ups and the walk-ins fill the capacity, and this member
 *     did not sign up), `not_signed_up`
 *     (sign-up on, walk-ins off, and no sign-up standing); a member already checked in passes the last two, so a second
 *     scan reads as "already in", not as "full";
 *  7. `welcome`.
 *
 * Every verdict carries the membership's end date, the days left when it ends within EXPIRING_DAYS, and the member's
 * tier, so a red answer still says who stands at the door.
 *
 * Event times are the venue's wall clock stored as written (as appointment times): they are compared with the venue's
 * now as `YYYY-MM-DDTHH:mm` strings (VenueClock), never converted. Fast enough for a door: the venue's zone is memoised
 * for the request, the member's user and tier and the place's or event's tiers are read once (or not at all when the
 * caller loaded them), and an event's counts are one query.
 */
class AccessDecision
{
    /** How near an end date counts as "ends soon" (the verdict's `expires_in_days`). */
    public const EXPIRING_DAYS = 14;

    /** An event's doors open this long before it starts. */
    public const OPENS_BEFORE_MINUTES = 120;

    public function decide(LoyaltyMember $member, ?AccessPlace $place = null, ?LoyaltyEvent $event = null): AccessVerdict
    {
        $orgId = (int) $member->organization_id;
        $member->loadMissing('user');
        $tier = self::tierOf($member, $orgId);
        $validUntil = $member->membership_valid_until?->toDateString();
        // The venue's today, as PortalBootstrap::venueToday() reads it (the same zone), memoised for the request.
        $today = VenueClock::today($orgId);
        $daysLeft = $validUntil !== null ? self::daysBetween($today, $validUntil) : null;

        $verdict = fn (string $reason, array $allowed = []) => new AccessVerdict(
            $reason === AccessVerdict::WELCOME,
            $reason,
            $validUntil,
            $daysLeft !== null && $daysLeft >= 0 && $daysLeft <= self::EXPIRING_DAYS ? $daysLeft : null,
            $tier ? ['id' => (int) $tier->id, 'name' => (string) $tier->name, 'color' => $tier->color_hex] : null,
            $allowed,
        );

        if (MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member)) {
            return $verdict(AccessVerdict::MEMBER_ERASED);
        }
        if (!$member->is_active) {
            return $verdict(AccessVerdict::MEMBER_OFF);
        }
        if ($validUntil !== null && $validUntil < ($event !== null ? \App\Services\Loyalty\Events\EventClock::day($event) : $today)) {
            return $verdict(AccessVerdict::EXPIRED);
        }
        if ($place !== null && !$place->is_active) {
            return $verdict(AccessVerdict::PLACE_OFF);
        }
        foreach ([$place, $event] as $door) {
            if ($door !== null && $door->admits === AccessPlace::ADMITS_TIERS) {
                $admitted = self::ladder(self::tiersOf($door, $orgId));
                if ($member->tier_id === null || !$admitted->contains(fn (LoyaltyTier $t) => (int) $t->id === (int) $member->tier_id)) {
                    return $verdict(AccessVerdict::TIER_NOT_ALLOWED, $admitted->map(fn (LoyaltyTier $t) => (string) $t->name)->values()->all());
                }
            }
        }
        if ($event === null) {
            return $verdict(AccessVerdict::WELCOME);
        }

        if ($event->status !== LoyaltyEvent::PUBLISHED || !self::isOpen($event, VenueClock::now($orgId)->format(VenueClock::WALL))) {
            return $verdict(AccessVerdict::EVENT_NOT_OPEN);
        }
        $counts = self::counts($event, (int) $member->id);
        if ($counts['mine_in']) {
            return $verdict(AccessVerdict::WELCOME);
        }
        // A walk-in takes a place only while one is left after the standing sign-ups (EventRows::roomLeft(), the rule a
        // sign-up follows too): members who signed up but have not arrived keep theirs, and always get in.
        if ($event->capacity !== null && !$counts['signed_up'] && $counts['held'] + $counts['walk_ins'] >= (int) $event->capacity) {
            return $verdict(AccessVerdict::EVENT_FULL);
        }
        if ($event->sign_up && !$event->walk_ins && !$counts['signed_up']) {
            return $verdict(AccessVerdict::NOT_SIGNED_UP);
        }

        return $verdict(AccessVerdict::WELCOME);
    }

    /**
     * Whether an event's doors are open at this wall-clock minute (`YYYY-MM-DDTHH:mm` on the venue's clock): from
     * OPENS_BEFORE_MINUTES before its start (included) until its end (excluded). The end's own minute is closed: from
     * its first second every screen says the event has ended (EventClock::hasEnded, `ends_at <= now`), so the door must
     * not let a walk-in in during it. The stored times are read as written.
     */
    public static function isOpen(LoyaltyEvent $event, string $nowWall): bool
    {
        $start = VenueClock::parse((string) VenueClock::wall($event->starts_at));
        $end = VenueClock::wall($event->ends_at);
        if ($start === null || $end === null) {
            return false;
        }
        $opens = $start->subMinutes(self::OPENS_BEFORE_MINUTES)->format(VenueClock::WALL);

        return $nowWall >= $opens && $nowWall < $end;
    }

    /** Whole days from one `Y-m-d` to another (negative when the second is earlier). */
    public static function daysBetween(string $from, string $to): int
    {
        $utc = new \DateTimeZone('UTC');
        $diff = (new \DateTimeImmutable($from, $utc))->diff(new \DateTimeImmutable($to, $utc));

        return $diff->invert ? -(int) $diff->days : (int) $diff->days;
    }

    /**
     * Tiers in the ladder's order, as Program lists them (sort order, then the points that reach them).
     *
     * @param Collection<int, LoyaltyTier> $tiers
     * @return Collection<int, LoyaltyTier>
     */
    public static function ladder(Collection $tiers): Collection
    {
        return $tiers->sort(fn (LoyaltyTier $a, LoyaltyTier $b) => [(int) $a->sort_order, (int) $a->min_points, (int) $a->id] <=> [(int) $b->sort_order, (int) $b->min_points, (int) $b->id])->values();
    }

    /**
     * The member's tier as it is now (a tier changed since the relation was read is read again). Read under the member's
     * organisation, not the bound tenant, so the answer is the same from a request, the portal or a job.
     */
    private static function tierOf(LoyaltyMember $member, int $orgId): ?LoyaltyTier
    {
        if ($member->tier_id === null) {
            return null;
        }
        $loaded = $member->relationLoaded('tier') ? $member->tier : null;
        if ($loaded === null || (int) $loaded->id !== (int) $member->tier_id) {
            $member->setRelation('tier', LoyaltyTier::withoutGlobalScopes()->where('organization_id', $orgId)->find($member->tier_id));
        }

        return $member->tier;
    }

    /**
     * The tiers a place or an event lets in: as the caller loaded them, else read under the organisation (as tierOf()).
     *
     * @return Collection<int, LoyaltyTier>
     */
    private static function tiersOf(AccessPlace|LoyaltyEvent $door, int $orgId): Collection
    {
        if ($door->relationLoaded('tiers')) {
            return $door->tiers;
        }
        $tiers = $door->tiers()->withoutGlobalScopes()->where('loyalty_tiers.organization_id', $orgId)->get();
        $door->setRelation('tiers', $tiers);

        return $tiers;
    }

    /**
     * The event's counts in one query: the places held (standing sign-ups) and taken by walk-ins, whether this member is
     * checked in, and whether this member's sign-up stands.
     *
     * @return array{held: int, walk_ins: int, mine_in: bool, signed_up: bool}
     */
    private static function counts(LoyaltyEvent $event, int $memberId): array
    {
        $row = DB::selectOne(
            'SELECT (SELECT COUNT(*) FROM loyalty_event_registrations WHERE loyalty_event_id = ? AND status = ?) AS held,'
            . ' (SELECT COUNT(*) FROM loyalty_event_attendances WHERE loyalty_event_id = ? AND walk_in = ?) AS walk_ins,'
            . ' (SELECT COUNT(*) FROM loyalty_event_attendances WHERE loyalty_event_id = ? AND member_id = ?) AS mine_in,'
            . ' (SELECT COUNT(*) FROM loyalty_event_registrations WHERE loyalty_event_id = ? AND member_id = ? AND status = ?) AS signed_up',
            [$event->id, EventRegistration::SIGNED_UP, $event->id, true, $event->id, $memberId, $event->id, $memberId, EventRegistration::SIGNED_UP],
        );

        return [
            'held'       => (int) ($row->held ?? 0),
            'walk_ins'   => (int) ($row->walk_ins ?? 0),
            'mine_in'    => (int) ($row->mine_in ?? 0) > 0,
            'signed_up'  => (int) ($row->signed_up ?? 0) > 0,
        ];
    }
}
