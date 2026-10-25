<?php

namespace App\Services\Loyalty\Events;

use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use Illuminate\Support\Collection;

/**
 * Events as the workspace reads them (release 8, spec 2026-10-25 §4): an event's row with its numbers, and its people.
 * Reads only. Every query names the organisation, whatever tenant is bound.
 *
 * The numbers: `signed_up` — sign-ups that stand; `checked_in` — every check-in; `walk_ins` — check-ins of members who
 * had not signed up; `room_left` — the capacity less the sign-ups and the walk-ins (each holds a place), never below
 * zero, null without a capacity. EventSignUp refuses a sign-up when no room is left.
 */
final class EventRows
{
    /** The people list's page size. */
    public const PEOPLE_PER_PAGE = 200;

    /**
     * The numbers of several events at once.
     *
     * @param list<int> $ids
     * @return array<int, array{signed_up: int, checked_in: int, walk_ins: int}>
     */
    public static function counts(int $orgId, array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[(int) $id] = ['signed_up' => 0, 'checked_in' => 0, 'walk_ins' => 0];
        }
        if ($ids === []) {
            return $out;
        }
        $grouped = fn ($query, string $as) => $query->whereIn('loyalty_event_id', $ids)->groupBy('loyalty_event_id')
            ->selectRaw("loyalty_event_id, COUNT(*) AS {$as}")->pluck($as, 'loyalty_event_id');

        foreach ($grouped(EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('status', EventRegistration::SIGNED_UP), 'n') as $id => $n) {
            $out[(int) $id]['signed_up'] = (int) $n;
        }
        foreach ($grouped(EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId), 'n') as $id => $n) {
            $out[(int) $id]['checked_in'] = (int) $n;
        }
        foreach ($grouped(EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('walk_in', true), 'n') as $id => $n) {
            $out[(int) $id]['walk_ins'] = (int) $n;
        }

        return $out;
    }

    /** @return array{signed_up: int, checked_in: int, walk_ins: int} */
    public static function countsOf(LoyaltyEvent $event): array
    {
        return self::counts((int) $event->organization_id, [(int) $event->id])[(int) $event->id];
    }

    /** @param array{signed_up: int, walk_ins: int} $counts */
    public static function roomLeft(?int $capacity, array $counts): ?int
    {
        return $capacity === null ? null : max(0, $capacity - $counts['signed_up'] - $counts['walk_ins']);
    }

    /** The relations a row reads, without the tenant scope (the query already names the organisation). */
    public static function with(): array
    {
        return [
            'place' => fn ($q) => $q->withoutGlobalScopes()->select(['id', 'organization_id', 'name']),
            'tiers' => fn ($q) => $q->withoutGlobalScopes()->select(['loyalty_tiers.id', 'loyalty_tiers.name', 'loyalty_tiers.color_hex', 'loyalty_tiers.sort_order'])->orderBy('loyalty_tiers.sort_order'),
        ];
    }

    /**
     * One event as the workspace shows it.
     *
     * @param array{signed_up: int, checked_in: int, walk_ins: int} $counts
     * @return array<string, mixed>
     */
    public static function row(LoyaltyEvent $event, array $counts, ?string $now = null): array
    {
        $event->loadMissing(self::with());
        $capacity = $event->capacity !== null ? (int) $event->capacity : null;

        return [
            'id'              => (int) $event->id,
            'title'           => (string) $event->title,
            'description'     => $event->description !== null && $event->description !== '' ? (string) $event->description : null,
            'starts_at'       => EventClock::wall($event->starts_at),
            'ends_at'         => EventClock::wall($event->ends_at),
            'place'           => $event->place ? ['id' => (int) $event->place->id, 'name' => (string) $event->place->name] : null,
            'location'        => $event->location !== null && $event->location !== '' ? (string) $event->location : null,
            'admits'          => (string) $event->admits,
            'tiers'           => $event->admits === 'tiers'
                ? $event->tiers->map(fn (LoyaltyTier $t) => ['id' => (int) $t->id, 'name' => (string) $t->name, 'color' => $t->color_hex])->values()->all()
                : [],
            'points'          => (int) $event->points,
            'counts_as_visit' => (bool) $event->counts_as_visit,
            'sign_up'         => (bool) $event->sign_up,
            'walk_ins'        => (bool) $event->walk_ins,
            'capacity'        => $capacity,
            'status'          => (string) $event->status,
            'phase'           => EventClock::phase($event, $now),
            'counts'          => $counts + ['room_left' => self::roomLeft($capacity, $counts)],
        ];
    }

    /** Where an event is, in words: its place's name, or the written location, or null. */
    public static function where(LoyaltyEvent $event): ?string
    {
        $event->loadMissing(['place' => fn ($q) => $q->withoutGlobalScopes()]);
        if ($event->place) {
            return (string) $event->place->name;
        }

        return $event->location !== null && $event->location !== '' ? (string) $event->location : null;
    }

    /**
     * An event's people (`GET events/{id}/people`): everyone who signed up (standing sign-ups first, by when they
     * signed up), then the walk-ins (by when they came), then cancelled sign-ups. A check-in's time is the venue's clock
     * ('HH:mm'); a sign-up's times are instants.
     *
     * @return array{people: list<array<string, mixed>>, page: int, pages: int, total: int}
     */
    public static function people(LoyaltyEvent $event, int $page = 1): array
    {
        $orgId = (int) $event->organization_id;
        $registrations = EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)->get()->keyBy('member_id');
        $attendances = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)->get()->keyBy('member_id');

        $memberIds = $registrations->keys()->merge($attendances->keys())->unique()->values();
        $rank = function (int $memberId) use ($registrations, $attendances): array {
            $r = $registrations->get($memberId);
            $a = $attendances->get($memberId);
            if ($r && $r->status === EventRegistration::SIGNED_UP) {
                return [0, (string) $r->signed_up_at, $memberId];
            }
            if ($a) {
                return [1, (string) $a->checked_in_at, $memberId];
            }

            return [2, (string) $r?->cancelled_at, $memberId];
        };
        $ordered = $memberIds->map(fn ($id) => (int) $id)->sort(fn (int $x, int $y) => $rank($x) <=> $rank($y))->values();

        $total = $ordered->count();
        $pages = max(1, (int) ceil($total / self::PEOPLE_PER_PAGE));
        $page = min(max(1, $page), $pages);
        $slice = $ordered->slice(($page - 1) * self::PEOPLE_PER_PAGE, self::PEOPLE_PER_PAGE)->values();

        $members = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('id', $slice->all())
            ->with(['user:id,name', 'tier' => fn ($q) => $q->withoutGlobalScopes()])->get()->keyBy('id');

        $people = $slice->map(fn (int $memberId) => self::personRow($members->get($memberId), $memberId, $registrations->get($memberId), $attendances->get($memberId), $orgId))->all();

        return ['people' => $people, 'page' => $page, 'pages' => $pages, 'total' => $total];
    }

    /**
     * The latest check-ins, newest first by when they really happened (release 9): the scan screen's "Today here".
     * people() pages by sign-up and shows a check-in as the venue's 'HH:mm', which sorts 00:10 before 23:50 and leaves
     * the walk-ins behind the 200 sign-ups of its first page.
     *
     * @return list<array<string, mixed>>
     */
    public static function latestCheckIns(LoyaltyEvent $event, int $limit = 8): array
    {
        $orgId = (int) $event->organization_id;
        $attendances = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)
            ->orderByDesc('checked_in_at')->orderByDesc('id')->limit($limit)->get();
        $memberIds = $attendances->pluck('member_id')->map(fn ($id) => (int) $id)->all();
        $members = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('id', $memberIds)
            ->with(['user:id,name', 'tier' => fn ($q) => $q->withoutGlobalScopes()])->get()->keyBy('id');
        $registrations = EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)
            ->whereIn('member_id', $memberIds)->get()->keyBy('member_id');

        return $attendances->map(fn (EventAttendance $a) => self::personRow($members->get($a->member_id), (int) $a->member_id, $registrations->get($a->member_id), $a, $orgId))
            ->values()->all();
    }

    /** One member of an event's people, as people() lists them (the sign-up endpoints answer it). @return array<string, mixed> */
    public static function person(LoyaltyEvent $event, int $memberId): array
    {
        $orgId = (int) $event->organization_id;
        $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->with(['user:id,name', 'tier' => fn ($q) => $q->withoutGlobalScopes()])->find($memberId);
        $registration = EventRegistration::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)->where('member_id', $memberId)->first();
        $attendance = EventAttendance::withoutGlobalScopes()->where('organization_id', $orgId)->where('loyalty_event_id', $event->id)->where('member_id', $memberId)->first();

        return self::personRow($member, $memberId, $registration, $attendance, $orgId);
    }

    /** @return array<string, mixed> */
    private static function personRow(?LoyaltyMember $member, int $memberId, ?EventRegistration $r, ?EventAttendance $a, int $orgId): array
    {
        return [
            'member'        => self::memberRef($member, $memberId),
            'signed_up_at'  => $r?->signed_up_at?->toIso8601String(),
            'cancelled_at'  => $r && $r->status === EventRegistration::CANCELLED ? $r->cancelled_at?->toIso8601String() : null,
            'checked_in_at' => $a ? EventClock::timeOf($a->checked_in_at, $orgId) : null,
            'walk_in'       => $a ? (bool) $a->walk_in : false,
            'source'        => $r ? (string) $r->source : null,
        ];
    }

    /** @return array{id: int, name: string, member_number: ?string, tier: ?array{id: int, name: string, color: ?string}} */
    public static function memberRef(?LoyaltyMember $member, int $id): array
    {
        $tier = $member?->tier;

        return [
            'id'            => $id,
            'name'          => (string) ($member?->user?->name ?? ''),
            'member_number' => $member?->member_number,
            'tier'          => $tier ? ['id' => (int) $tier->id, 'name' => (string) $tier->name, 'color' => $tier->color_hex] : null,
        ];
    }

    /** @param Collection<int, LoyaltyEvent> $events @return list<array<string, mixed>> */
    public static function rows(int $orgId, Collection $events): array
    {
        $counts = self::counts($orgId, $events->pluck('id')->map(fn ($id) => (int) $id)->all());
        $now = EventClock::now($orgId);

        return $events->map(fn (LoyaltyEvent $e) => self::row($e, $counts[(int) $e->id], $now))->values()->all();
    }
}
