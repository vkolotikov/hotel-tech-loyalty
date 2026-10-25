<?php

namespace App\Services\Loyalty\Events;

use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;

/**
 * What the member portal shows of events (release 8, spec 2026-10-25 §4). Reads only; signing up is EventSignUp's.
 *
 * - offered(): the venue has a published event that has not ended and admits the member's tier — the portal bootstrap's
 *   `capabilities.events`, so the menu never leads to an empty page.
 * - forMember(): the published events that have not ended and admit the member's tier (every member, or one of its
 *   tiers), soonest first, each with what the member can do — `my` (`signed_up` | `none`), `can_sign_up`, `why_not`
 *   (EventSignUp::refusal()'s code while the event takes sign-ups, else null), `can_cancel` (until the start) — and the
 *   events the member attended, newest first, with the points the check-in gave. Times are the venue's wall clock
 *   (`YYYY-MM-DDTHH:mm`), as the workspace's.
 */
class PortalEvents
{
    /** How many attended events the page lists. */
    public const ATTENDED = 20;

    /** How many upcoming events the page lists. */
    public const UPCOMING = 50;

    /** Whether the venue has a published event that has not ended and admits the member's tier (the portal's menu offers Events then). */
    public function offered(LoyaltyMember $member): bool
    {
        if (!\Illuminate\Support\Facades\Schema::hasTable('loyalty_events')) {
            return false;
        }

        return $this->upcoming($member)->exists();
    }

    /** @return array{upcoming: list<array<string, mixed>>, attended: list<array<string, mixed>>} */
    public function forMember(LoyaltyMember $member): array
    {
        $orgId = (int) $member->organization_id;
        $events = $this->upcoming($member)->orderBy('starts_at')->orderBy('id')->limit(self::UPCOMING)
            ->with(['place' => fn ($q) => $q->withoutGlobalScopes()])->get();

        $counts = EventRows::counts($orgId, $events->pluck('id')->map(fn ($id) => (int) $id)->all());
        $mine = EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)
            ->whereIn('loyalty_event_id', $events->pluck('id')->all())->get()->keyBy('loyalty_event_id');
        $inside = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)
            ->whereIn('loyalty_event_id', $events->pluck('id')->all())->pluck('loyalty_event_id')->map(fn ($id) => (int) $id)->all();

        return [
            'upcoming' => $events->map(fn (LoyaltyEvent $e) => self::row($e, $member, $counts[(int) $e->id], $mine->get($e->id), in_array((int) $e->id, $inside, true)))->values()->all(),
            'attended' => $this->attended($member),
        ];
    }

    /** The published events that have not ended and admit the member's tier (every member, or one of its tiers). */
    private function upcoming(LoyaltyMember $member): \Illuminate\Database\Eloquent\Builder
    {
        $orgId = (int) $member->organization_id;

        return LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->where('status', LoyaltyEvent::PUBLISHED)
            ->where('ends_at', '>', EventClock::now($orgId))
            ->where(fn ($q) => $q->where('admits', 'all')->orWhereIn('id', fn ($s) => $s->select('loyalty_event_id')->from('loyalty_event_tiers')->where('tier_id', (int) ($member->tier_id ?? 0))));
    }

    /** One event as the member sees it (also the sign-up endpoints' answer). @return array<string, mixed> */
    public static function row(LoyaltyEvent $event, LoyaltyMember $member, ?array $counts = null, ?EventRegistration $registration = null, ?bool $attended = null): array
    {
        $counts ??= EventRows::countsOf($event);
        $registration ??= EventSignUp::registrationOf($event, (int) $member->id);
        $attended ??= EventCheckIn::attendanceOf($event, (int) $member->id) !== null;
        $signedUp = $registration !== null && $registration->status === EventRegistration::SIGNED_UP;
        $refusal = $event->sign_up && !$signedUp ? EventSignUp::refusal($event, $member, $counts, $registration, $attended) : null;
        $capacity = $event->capacity !== null ? (int) $event->capacity : null;

        return [
            'id'          => (int) $event->id,
            'title'       => (string) $event->title,
            'description' => $event->description !== null && $event->description !== '' ? (string) $event->description : null,
            'starts_at'   => EventClock::wall($event->starts_at),
            'ends_at'     => EventClock::wall($event->ends_at),
            'where'       => EventRows::where($event),
            'points'      => (int) $event->points,
            'sign_up'     => (bool) $event->sign_up,
            'walk_ins'    => (bool) $event->walk_ins,
            'capacity'    => $capacity,
            'room_left'   => EventRows::roomLeft($capacity, $counts),
            'my'          => $signedUp ? 'signed_up' : 'none',
            'checked_in'  => $attended,
            'can_sign_up' => $event->sign_up && !$signedUp && $refusal === null,
            'why_not'     => $refusal?->errorCode,
            'can_cancel'  => $signedUp && !$attended && EventSignUp::canCancel($event, EventSignUp::PORTAL),
        ];
    }

    /** @return list<array{id: int, title: string, starts_at: ?string, points: int}> */
    private function attended(LoyaltyMember $member): array
    {
        $orgId = (int) $member->organization_id;
        $rows = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)
            ->orderByDesc('checked_in_at')->orderByDesc('id')->limit(self::ATTENDED)->get();
        if ($rows->isEmpty()) {
            return [];
        }
        $events = LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('id', $rows->pluck('loyalty_event_id')->all())->get()->keyBy('id');
        $points = PointsTransaction::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', $rows->pluck('points_transaction_id')->filter()->all())->pluck('points', 'id');

        return $rows->filter(fn (EventAttendance $a) => $events->has($a->loyalty_event_id))->map(fn (EventAttendance $a) => [
            'id'        => (int) $a->loyalty_event_id,
            'title'     => (string) $events[$a->loyalty_event_id]->title,
            'starts_at' => EventClock::wall($events[$a->loyalty_event_id]->starts_at),
            'points'    => $a->points_transaction_id !== null ? (int) ($points[$a->points_transaction_id] ?? 0) : 0,
        ])->values()->all();
    }
}
