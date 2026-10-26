<?php

namespace App\Services\Loyalty\Events;

use App\Models\AuditLog;
use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Scopes\TenantScope;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use App\Support\SharedCache;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Members' sign-ups for events, from the portal or by staff on the event's page (release 8, spec 2026-10-25 §4) — the
 * only writer of `loyalty_event_registrations`.
 *
 * A member may sign up (refusal(), in this order) when the event is published, takes sign-ups and has not ended
 * (`sign_up_closed`); the member is neither switched off nor deleted (`inactive`); their membership still stands on the
 * event's day (`membership_expired`, with `valid_until`: a membership that ends before then would be refused at the
 * door); the event admits their tier (`tier_not_allowed`, with `allowed_tiers`) — AccessDecision's own rules for the
 * member, without the door's "open now"; they are not signed up already (`already_signed_up`) nor checked in already
 * (`already_in`); and a place is left — standing sign-ups and walk-ins below the capacity (`event_full`).
 *
 * One row per member per event: a cancelled sign-up is signed up again on its own row. Each write locks the member row,
 * then the event row (EventCheckIn takes them in the same order), re-reads under the locks, and leaves the unique index
 * (`loyalty_event_registrations_member_unique`) as the last line, caught in its own savepoint. A cancel is allowed until
 * the start from the portal and until the end by staff (`cancel_closed`), never after the member checked in
 * (`already_in`); cancelling a cancelled sign-up answers it as it is. Staff's sign-ups take a key: the same press sent
 * again answers the sign-up it made, for a day. Audited `loyalty.event_signed_up` / `loyalty.event_sign_up_cancelled`.
 */
final class EventSignUp
{
    public const PORTAL = 'portal';
    public const STAFF = 'staff';

    private const REPLAY_SECONDS = 86400;

    public function signUp(LoyaltyEvent $event, LoyaltyMember $member, string $source, ?User $by = null, ?string $key = null): EventRegistration
    {
        $orgId = (int) $event->organization_id;
        $replayKey = $key !== null && $key !== '' ? "loyalty-event-signup:{$orgId}:{$event->id}:{$member->id}:" . sha1($key) : null;

        $registration = DB::transaction(function () use ($event, $member, $source, $by, $orgId, $replayKey) {
            [$lockedMember, $lockedEvent] = self::lock($event, $member);
            $current = self::registrationOf($lockedEvent, (int) $lockedMember->id);
            if ($replayKey !== null && $current !== null && $current->status === EventRegistration::SIGNED_UP
                && (int) SharedCache::store()->get($replayKey) === (int) $current->id) {
                return $current;
            }
            $attended = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $lockedEvent->id)->where('member_id', $lockedMember->id)->exists();
            if ($refused = self::refusal($lockedEvent, $lockedMember, EventRows::countsOf($lockedEvent), $current, $attended)) {
                throw $refused;
            }

            $now = now();
            if ($current !== null) {
                $current->forceFill(['status' => EventRegistration::SIGNED_UP, 'source' => $source, 'signed_up_at' => $now, 'cancelled_at' => null])->save();
            } else {
                $current = new EventRegistration();
                $current->forceFill([
                    'organization_id'  => $orgId,
                    'loyalty_event_id' => (int) $lockedEvent->id,
                    'member_id'        => (int) $lockedMember->id,
                    'status'           => EventRegistration::SIGNED_UP,
                    'source'           => $source,
                    'signed_up_at'     => $now,
                ]);
                try {
                    // The unique index is the last line: a second sign-up the locks did not keep out fails here alone.
                    DB::transaction(fn () => $current->save());
                } catch (UniqueConstraintViolationException) {
                    throw new LoyaltyRefused('already_signed_up', 'This member is already signed up.', 409);
                }
            }
            self::audit($lockedEvent, $lockedMember, 'loyalty.event_signed_up', $source, $by, "Signed up for \"{$lockedEvent->title}\"");

            return $current;
        });

        if ($replayKey !== null) {
            SharedCache::store()->put($replayKey, (int) $registration->id, self::REPLAY_SECONDS);
        }

        return $registration;
    }

    public function cancel(LoyaltyEvent $event, LoyaltyMember $member, string $source, ?User $by = null): EventRegistration
    {
        return DB::transaction(function () use ($event, $member, $source, $by) {
            [$lockedMember, $lockedEvent] = self::lock($event, $member);
            $current = self::registrationOf($lockedEvent, (int) $lockedMember->id);
            if ($current === null) {
                throw new LoyaltyRefused('not_signed_up', 'This member is not signed up.', 409);
            }
            if ($current->status === EventRegistration::CANCELLED) {
                return $current;
            }
            $attended = EventAttendance::withoutGlobalScopes()->where('organization_id', $lockedEvent->organization_id)
                ->where('loyalty_event_id', $lockedEvent->id)->where('member_id', $lockedMember->id)->exists();
            if ($attended) {
                throw new LoyaltyRefused('already_in', 'This member has already checked in.', 409);
            }
            if (!self::canCancel($lockedEvent, $source)) {
                throw new LoyaltyRefused('cancel_closed', $source === self::PORTAL ? 'A sign-up can be cancelled until the event starts.' : 'This event has ended.', 409);
            }
            $current->forceFill(['status' => EventRegistration::CANCELLED, 'cancelled_at' => now()])->save();
            self::audit($lockedEvent, $lockedMember, 'loyalty.event_sign_up_cancelled', $source, $by, "Sign-up for \"{$lockedEvent->title}\" cancelled");

            return $current;
        });
    }

    /**
     * A deleted member gives back the places they held (release 9): each standing sign-up for an event that has not
     * ended is cancelled — under the member row's lock, then the event's, as cancel() takes them — and audited, so the
     * counts, "Full" and the walk-ins' places follow at once. Called after a staff erasure (MemberErasure) and a member's
     * own deletion. A member switched off keeps theirs (they may be switched on again; staff cancel on the event's page).
     *
     * @return int how many sign-ups were cancelled
     */
    public function releaseAll(LoyaltyMember $member, string $source, ?User $by = null): int
    {
        if (!\Illuminate\Support\Facades\Schema::hasTable('loyalty_event_registrations')) {
            return 0;
        }
        $orgId = (int) $member->organization_id;
        $eventIds = EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)
            ->where('status', EventRegistration::SIGNED_UP)->pluck('loyalty_event_id')->all();
        $events = LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('id', $eventIds)->orderBy('id')->get()
            ->reject(fn (LoyaltyEvent $e) => EventClock::hasEnded($e));

        $released = 0;
        foreach ($events as $event) {
            $released += DB::transaction(function () use ($event, $member, $source, $by) {
                [$lockedMember, $lockedEvent] = self::lock($event, $member);
                $current = self::registrationOf($lockedEvent, (int) $lockedMember->id);
                if ($current === null || $current->status !== EventRegistration::SIGNED_UP) {
                    return 0;
                }
                $current->forceFill(['status' => EventRegistration::CANCELLED, 'cancelled_at' => now()])->save();
                self::audit($lockedEvent, $lockedMember, 'loyalty.event_sign_up_cancelled', $source, $by, "Sign-up for \"{$lockedEvent->title}\" cancelled: the member was deleted");

                return 1;
            });
        }

        return $released;
    }

    /**
     * Why this member may not sign up for the event now, as the refusal to throw, or null when they may. Reads only.
     *
     * @param array{signed_up: int, walk_ins: int}|null $counts the event's numbers (EventRows), read when not given
     */
    public static function refusal(LoyaltyEvent $event, LoyaltyMember $member, ?array $counts = null, ?EventRegistration $current = null, bool $attended = false): ?LoyaltyRefused
    {
        if ($event->status !== LoyaltyEvent::PUBLISHED || !$event->sign_up || EventClock::hasEnded($event)) {
            return new LoyaltyRefused('sign_up_closed', 'This event does not take sign-ups now.', 409);
        }
        $member->loadMissing('user');
        if (!$member->is_active || MemberErasure::isErased($member) || MemberErasure::isSelfDeleted($member)) {
            return new LoyaltyRefused('inactive', 'This member’s account is switched off.', 409);
        }
        $validUntil = $member->membership_valid_until?->toDateString();
        // Valid on the day the event begins — the day the door judges too (AccessDecision), so a sign-up accepted is a
        // member let in, however late the night runs.
        if ($validUntil !== null && $validUntil < EventClock::day($event)) {
            return new LoyaltyRefused('membership_expired', 'The membership ends before this event.', 409, ['valid_until' => $validUntil]);
        }
        if (!self::admits($event, $member)) {
            return new LoyaltyRefused('tier_not_allowed', 'This event is for other tiers.', 409, ['allowed_tiers' => self::allowedTiers($event)]);
        }
        if ($current !== null && $current->status === EventRegistration::SIGNED_UP) {
            return new LoyaltyRefused('already_signed_up', 'This member is already signed up.', 409);
        }
        if ($attended) {
            return new LoyaltyRefused('already_in', 'This member has already checked in.', 409);
        }
        $counts ??= EventRows::countsOf($event);
        if (EventRows::roomLeft($event->capacity !== null ? (int) $event->capacity : null, $counts) === 0) {
            return new LoyaltyRefused('event_full', 'This event is full.', 409);
        }

        return null;
    }

    /** Whether the event admits the member's tier: every member, or a member of one of its tiers. */
    public static function admits(LoyaltyEvent $event, LoyaltyMember $member): bool
    {
        if ($event->admits !== 'tiers') {
            return true;
        }

        return $member->tier_id !== null
            && DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->where('tier_id', $member->tier_id)->exists();
    }

    /** @return list<string> the names of the tiers an event for tiers lets in, lowest first */
    public static function allowedTiers(LoyaltyEvent $event): array
    {
        $ids = DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->pluck('tier_id')->all();

        return LoyaltyTier::withoutGlobalScope(TenantScope::class)->where('organization_id', $event->organization_id)->whereIn('id', $ids)
            ->orderBy('sort_order')->orderBy('min_points')->pluck('name')->map(fn ($n) => (string) $n)->values()->all();
    }

    /** A member cancels until the event starts; staff until it ends. */
    public static function canCancel(LoyaltyEvent $event, string $source): bool
    {
        return $source === self::PORTAL ? !EventClock::hasStarted($event) : !EventClock::hasEnded($event);
    }

    /** The member's sign-up row for the event, whatever its state. */
    public static function registrationOf(LoyaltyEvent $event, int $memberId): ?EventRegistration
    {
        return EventRegistration::withoutGlobalScopes()->where('organization_id', $event->organization_id)
            ->where('loyalty_event_id', $event->id)->where('member_id', $memberId)->first();
    }

    /** The member row, then the event row, locked — EventCheckIn's order. @return array{0: LoyaltyMember, 1: LoyaltyEvent} */
    private static function lock(LoyaltyEvent $event, LoyaltyMember $member): array
    {
        $orgId = (int) $event->organization_id;
        $lockedMember = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->first()
            ?? throw LoyaltyRefused::notFound();
        $lockedEvent = LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($event->id)->lockForUpdate()->first()
            ?? throw LoyaltyRefused::notFound();
        $lockedMember->setRelation('user', $member->relationLoaded('user') ? $member->user : $lockedMember->user()->first());

        return [$lockedMember, $lockedEvent];
    }

    private static function audit(LoyaltyEvent $event, LoyaltyMember $member, string $action, string $source, ?User $by, string $description): void
    {
        AuditLog::create([
            'organization_id' => (int) $event->organization_id,
            'causer_type'     => User::class,
            'causer_id'       => $by?->id ?? $member->user_id,
            'action'          => $action,
            'subject_type'    => 'loyalty_member',
            'subject_id'      => (int) $member->id,
            'new_values'      => ['event_id' => (int) $event->id, 'source' => $source],
            'description'     => mb_substr($description, 0, 250),
        ]);
    }
}
