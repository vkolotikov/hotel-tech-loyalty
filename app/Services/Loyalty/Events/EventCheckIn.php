<?php

namespace App\Services\Loyalty\Events;

use App\Models\AuditLog;
use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Models\User;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Access\AccessVerdict;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitRecorder;
use App\Services\LoyaltyService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Checking a member in at an event (release 8, spec 2026-10-25 §4) — the only writer of `loyalty_event_attendances`.
 * Part A's scan (`POST scan` with an `event_id`) and the event page's "Check in by name" both come here.
 *
 * - AccessDecision decides (the one decider: membership, tier, the event open now, capacity, sign-up); this never adds
 *   a rule of its own. Granted, the member gets one attendance per event — `walk_in` when they had not signed up — the
 *   event's points (LoyaltyService::awardPoints, a `bonus` line "Event: {title}", key `event_{event}_{member}`, not
 *   qualifying) and, after the commit, the visit when the event counts as one (VisitRecorder: `Visit::EVENT`, reference
 *   `loyalty_event_attendance` + the attendance's id, the event's venue day — the stamp, tier progress by visits).
 * - A member already checked in is let in again with `already_in` (the first check-in's time on the venue's clock) and
 *   nothing new — also when the event has filled or closed since; only a refusal of the member themself (deleted,
 *   switched off, expired) still refuses them.
 * - Every attempt, refused ones too, writes one `scan_events` row: `scan_type` `event`, `loyalty_event_id`, `result`
 *   `granted` | `denied`, `action_taken` the reason (`welcome`, `already_in`, or the refusal's code), the staff member,
 *   and the points line it wrote. A caller that logged the attempt already (the scan, for the code it read) passes that
 *   row's id and it is filled in instead of a second one.
 * - The member row, then the event row, are locked for the whole attempt (EventSignUp's order), so two scans at once
 *   check in once and capacity is counted against what is committed; the unique index
 *   (`loyalty_event_attendances_member_unique`) is the last line, caught in its own savepoint.
 * - Idempotent by key (`loyalty-event:{org}:{event}:{member}:{key}`, kept hashed in the row's `token_value`): the same
 *   attempt sent again writes nothing and answers what the first did.
 *
 * The answer: `{ verdict: AccessVerdict::toArray(), checked_in: bool (this attempt checked the member in), already_in:
 * 'HH:mm'|null, signed_up: bool, points: int (given by this attempt), attendance_id: int|null, scan_event_id: int,
 * stamp: StampCards::stamp()'s answer|null }`.
 */
final class EventCheckIn
{
    public const SCAN_TYPE = 'event';
    public const WELCOME = 'welcome';
    public const ALREADY_IN = 'already_in';
    public const GRANTED = 'granted';
    public const DENIED = 'denied';

    /** Refusals that concern the event, not the member: a member already inside is not turned away for them. */
    private const EVENT_REASONS = [AccessVerdict::TIER_NOT_ALLOWED, AccessVerdict::EVENT_NOT_OPEN, AccessVerdict::EVENT_FULL, AccessVerdict::NOT_SIGNED_UP, AccessVerdict::PLACE_OFF];

    public function __construct(
        private readonly AccessDecision $decider,
        private readonly LoyaltyService $loyalty,
        private readonly VisitRecorder $visits,
    ) {
    }

    /**
     * @return array{verdict: array<string, mixed>, checked_in: bool, already_in: ?string, signed_up: bool, points: int, attendance_id: ?int, scan_event_id: int, stamp: mixed}
     */
    public function checkIn(LoyaltyEvent $event, LoyaltyMember $member, User $by, ?string $key = null, ?int $scanEventId = null): array
    {
        $orgId = (int) $event->organization_id;
        if ((int) $member->organization_id !== $orgId) {
            throw LoyaltyRefused::notFound();
        }
        $mark = $key !== null && $key !== '' ? 'event ' . sha1("loyalty-event:{$orgId}:{$event->id}:{$member->id}:{$key}") : null;

        $done = DB::transaction(function () use ($event, $member, $by, $orgId, $mark, $scanEventId) {
            $lockedMember = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->first()
                ?? throw LoyaltyRefused::notFound();
            $lockedEvent = LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($event->id)->lockForUpdate()->first()
                ?? throw LoyaltyRefused::notFound();
            $lockedMember->load(['user', 'tier' => fn ($q) => $q->withoutGlobalScopes()]);

            if ($mark !== null) {
                $first = ScanEvent::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $lockedMember->id)
                    ->where('scan_type', self::SCAN_TYPE)->where('loyalty_event_id', $lockedEvent->id)->where('token_value', $mark)->first();
                if ($first !== null) {
                    return ['replay' => true, 'row' => $first, 'member' => $lockedMember, 'event' => $lockedEvent];
                }
            }

            $verdict = $this->decider->decide($lockedMember, null, $lockedEvent);
            $attendance = self::attendanceOf($lockedEvent, (int) $lockedMember->id);
            $registration = EventSignUp::registrationOf($lockedEvent, (int) $lockedMember->id);
            $signedUp = $registration !== null && $registration->status === EventRegistration::SIGNED_UP;

            if ($attendance !== null) {
                $inside = $verdict->granted || in_array($verdict->reason, self::EVENT_REASONS, true);
                $shown = $inside && !$verdict->granted ? self::welcomeLike($verdict) : $verdict;
                $row = $this->log($orgId, $lockedEvent, $lockedMember, $by, $shown->granted, $inside ? self::ALREADY_IN : $verdict->reason, $mark, $scanEventId);

                return ['replay' => false, 'row' => $row, 'verdict' => $shown, 'attendance' => $attendance, 'new' => false, 'signed_up' => !$attendance->walk_in, 'line' => null];
            }
            if (!$verdict->granted) {
                $row = $this->log($orgId, $lockedEvent, $lockedMember, $by, false, $verdict->reason, $mark, $scanEventId);

                return ['replay' => false, 'row' => $row, 'verdict' => $verdict, 'attendance' => null, 'new' => false, 'signed_up' => $signedUp, 'line' => null];
            }

            $row = $this->log($orgId, $lockedEvent, $lockedMember, $by, true, self::WELCOME, $mark, $scanEventId);
            $attendance = new EventAttendance();
            $attendance->forceFill([
                'organization_id'  => $orgId,
                'loyalty_event_id' => (int) $lockedEvent->id,
                'member_id'        => (int) $lockedMember->id,
                'checked_in_at'    => now(),
                'checked_in_by'    => $by->id,
                'walk_in'          => !$signedUp,
                'scan_event_id'    => (int) $row->id,
            ]);
            try {
                DB::transaction(fn () => $attendance->save());
            } catch (UniqueConstraintViolationException) {
                // The locks keep this out; should a check-in slip past them, it is the one that stands.
                $attendance = self::attendanceOf($lockedEvent, (int) $lockedMember->id) ?? throw new \RuntimeException('Check-in vanished.');
                $row->forceFill(['action_taken' => self::ALREADY_IN])->save();

                return ['replay' => false, 'row' => $row, 'verdict' => $verdict, 'attendance' => $attendance, 'new' => false, 'signed_up' => !$attendance->walk_in, 'line' => null];
            }

            $line = null;
            if ((int) $lockedEvent->points > 0) {
                $line = $this->loyalty->awardPoints(
                    member:         $lockedMember,
                    points:         (int) $lockedEvent->points,
                    description:    mb_substr('Event: ' . $lockedEvent->title, 0, 191),
                    type:           'bonus',
                    staff:          $by,
                    referenceType:  'loyalty_event_attendance',
                    referenceId:    (int) $attendance->id,
                    idempotencyKey: "event_{$lockedEvent->id}_{$lockedMember->id}",
                    qualifying:     false,
                );
                $attendance->forceFill(['points_transaction_id' => (int) $line->id])->save();
                $row->forceFill(['transaction_id' => (int) $line->id])->save();
            }
            // A check-in is activity, with points or without.
            LoyaltyMember::withoutGlobalScopes()->whereKey($lockedMember->id)->update(['last_activity_at' => now()]);

            AuditLog::create([
                'organization_id' => $orgId,
                'causer_type'     => User::class,
                'causer_id'       => $by->id,
                'action'          => 'loyalty.event_check_in',
                'subject_type'    => 'loyalty_member',
                'subject_id'      => (int) $lockedMember->id,
                'new_values'      => ['event_id' => (int) $lockedEvent->id, 'attendance_id' => (int) $attendance->id, 'walk_in' => !$signedUp, 'points' => (int) ($line?->points ?? 0), 'scan_event_id' => (int) $row->id],
                'description'     => mb_substr("Checked in at \"{$lockedEvent->title}\"", 0, 250),
            ]);

            if ($lockedEvent->counts_as_visit) {
                app(\App\Services\Loyalty\Visits\VisitEffects::class)->remember($lockedMember,
                    new Visit(Visit::EVENT, 'loyalty_event_attendance', (int) $attendance->id, null, EventClock::day($lockedEvent), $by));
            }

            return ['replay' => false, 'row' => $row, 'verdict' => $verdict, 'attendance' => $attendance, 'new' => true, 'signed_up' => $signedUp, 'line' => $line, 'event' => $lockedEvent];
        });

        if ($done['replay']) {
            return $this->replayed($done['row'], $done['event'], $done['member']);
        }

        $stamp = null;
        if ($done['new'] && ($done['event']->counts_as_visit ?? false)) {
            $fresh = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->with('user')->find($member->id) ?? $member;
            $outcome = $this->visits->record($fresh, new Visit(Visit::EVENT, 'loyalty_event_attendance', (int) $done['attendance']->id, null, EventClock::day($done['event']), $by));
            $stamp = $outcome->stamp;
        }

        return self::answer($done['verdict'], $done['attendance'], $done['new'], $done['signed_up'], (int) ($done['line']?->points ?? 0), (int) $done['row']->id, $orgId, $stamp);
    }

    /** @return array<string, mixed> */
    private static function answer(AccessVerdict $verdict, ?EventAttendance $attendance, bool $checkedIn, bool $signedUp, int $points, int $rowId, int $orgId, mixed $stamp = null): array
    {
        return [
            'verdict'       => $verdict->toArray(),
            'checked_in'    => $checkedIn,
            'already_in'    => $attendance !== null && !$checkedIn ? EventClock::timeOf($attendance->checked_in_at, $orgId) : null,
            // Release 9: the same as the venue's wall clock with its day, for an event that runs several days.
            'already_in_at' => $attendance !== null && !$checkedIn ? EventClock::wallOf($attendance->checked_in_at, $orgId) : null,
            'signed_up'     => $signedUp,
            'points'        => $points,
            'attendance_id' => $attendance !== null ? (int) $attendance->id : null,
            'scan_event_id' => $rowId,
            'stamp'         => $stamp,
        ];
    }

    /**
     * What the first attempt answered, read back from its row: its verdict (the member's details as they are now), and
     * whether it checked the member in, with the points it gave.
     *
     * @return array<string, mixed>
     */
    private function replayed(ScanEvent $row, LoyaltyEvent $event, LoyaltyMember $member): array
    {
        $orgId = (int) $event->organization_id;
        $now = $this->decider->decide($member, null, $event);
        $granted = $row->result === self::GRANTED;
        $verdict = new AccessVerdict($granted, $granted ? AccessVerdict::WELCOME : (string) $row->action_taken, $now->validUntil, $now->expiresInDays, $now->tier, $granted ? [] : $now->allowedTiers);
        $attendance = self::attendanceOf($event, (int) $member->id);
        $checkedIn = $attendance !== null && (int) $attendance->scan_event_id === (int) $row->id;
        $points = $checkedIn && $attendance->points_transaction_id !== null
            ? (int) PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($attendance->points_transaction_id)->value('points')
            : 0;
        $registration = EventSignUp::registrationOf($event, (int) $member->id);
        $signedUp = $attendance !== null ? !$attendance->walk_in : ($registration !== null && $registration->status === EventRegistration::SIGNED_UP);

        return self::answer($verdict, $attendance, $checkedIn, $signedUp, $points, (int) $row->id, $orgId);
    }

    /** A member already inside, for an event-level refusal: let in, with the member's own details. */
    private static function welcomeLike(AccessVerdict $verdict): AccessVerdict
    {
        return new AccessVerdict(true, AccessVerdict::WELCOME, $verdict->validUntil, $verdict->expiresInDays, $verdict->tier);
    }

    /** One `scan_events` row per attempt (or the caller's own, filled in). */
    private function log(int $orgId, LoyaltyEvent $event, LoyaltyMember $member, User $by, bool $granted, string $reason, ?string $mark, ?int $scanEventId): ScanEvent
    {
        $row = $scanEventId !== null ? ScanEvent::withoutGlobalScopes()->where('organization_id', $orgId)->find($scanEventId) : null;
        $row ??= new ScanEvent();
        $row->forceFill([
            'organization_id'  => $orgId,
            'member_id'        => (int) $member->id,
            'staff_id'         => $row->staff_id ?? $by->id,
            'property_id'      => $row->property_id ?? ($by->property_id ?? null),
            'scan_type'        => self::SCAN_TYPE,
            'loyalty_event_id' => (int) $event->id,
            'result'           => $granted ? self::GRANTED : self::DENIED,
            'action_taken'     => mb_substr($reason, 0, 20),
            'device_id'        => $row->device_id ?? (mb_substr((string) request()?->header('X-Device-Id', ''), 0, 100) ?: null),
            'ip_address'       => $row->ip_address ?? request()?->ip(),
        ]);
        if ($mark !== null && ($row->token_value ?? '') === '') {
            $row->token_value = $mark;
        }
        $row->save();

        return $row;
    }

    public static function attendanceOf(LoyaltyEvent $event, int $memberId): ?EventAttendance
    {
        return EventAttendance::withoutGlobalScopes()->where('organization_id', $event->organization_id)
            ->where('loyalty_event_id', $event->id)->where('member_id', $memberId)->first();
    }
}
