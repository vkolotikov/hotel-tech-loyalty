<?php

namespace App\Services\Loyalty\Access;

use App\Models\AccessPlace;
use App\Models\LoyaltyTier;
use App\Scopes\TenantScope;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Places as the workspace reads them, and who came in (release 8, spec 2026-10-25 §1). Reads only.
 *
 * An entry is a `scan_events` row a scan at the place wrote (PlaceScan: `access_place_id`, `result` granted or denied,
 * `action_taken` the verdict's reason, or the code's refusal when the code named nobody — such a row has no member).
 * A check-in at an event is the event's, not the place's, even when the event is held there. A venue day runs from
 * midnight to midnight on the venue's clock (VenueClock::zone); `at` is the venue's wall clock, `YYYY-MM-DDTHH:mm`.
 */
final class PlaceEntries
{
    public const PER_PAGE = 50;

    /**
     * Every place of the organisation with its tiers and the given day's counts, in the list's order (sort order, then
     * name), and the organisation's tiers in use, for the place dialog.
     *
     * @return array{places: list<array<string, mixed>>, tiers: list<array{id: int, name: string, color: ?string}>}
     */
    public function list(int $orgId, string $day): array
    {
        $places = AccessPlace::withoutGlobalScopes()->where('organization_id', $orgId)->with('tiers')
            ->orderBy('sort_order')->orderBy('name')->orderBy('id')->get();
        $counts = $this->counts($orgId, $day);
        $tiers = AccessDecision::ladder(LoyaltyTier::withoutGlobalScope(TenantScope::class)->where('organization_id', $orgId)->where('is_active', true)->get());

        return [
            'places' => $places->map(fn (AccessPlace $p) => self::row($p, $counts[(int) $p->id] ?? null))->values()->all(),
            'tiers'  => $tiers->map(fn (LoyaltyTier $t) => self::tier($t))->values()->all(),
        ];
    }

    /**
     * A place as the list shows it: `{ id, name, description, admits, tiers: [{id, name, color}] (the ladder's order),
     * is_active, sort_order, today: {granted, denied} }`.
     *
     * @param array{granted: int, denied: int}|null $today
     * @return array<string, mixed>
     */
    public static function row(AccessPlace $place, ?array $today = null): array
    {
        $place->loadMissing('tiers');

        return [
            'id'          => (int) $place->id,
            'name'        => (string) $place->name,
            'description' => $place->description,
            'admits'      => (string) $place->admits,
            'tiers'       => AccessDecision::ladder($place->tiers)->map(fn (LoyaltyTier $t) => self::tier($t))->values()->all(),
            'is_active'   => (bool) $place->is_active,
            'sort_order'  => (int) $place->sort_order,
            'today'       => $today ?? ['granted' => 0, 'denied' => 0],
        ];
    }

    /** @return array{id: int, name: string, color: ?string} */
    public static function tier(LoyaltyTier $tier): array
    {
        return ['id' => (int) $tier->id, 'name' => (string) $tier->name, 'color' => $tier->color_hex];
    }

    /**
     * Granted and denied entries on a venue day, by place (one grouped query).
     *
     * @return array<int, array{granted: int, denied: int}>
     */
    public function counts(int $orgId, string $day, ?int $placeId = null): array
    {
        $rows = $this->onDay($orgId, $day)
            ->when($placeId !== null, fn (Builder $q) => $q->where('s.access_place_id', $placeId))
            ->selectRaw('s.access_place_id AS place_id, s.result AS result, COUNT(*) AS n')
            ->groupBy('s.access_place_id', 's.result')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $id = (int) $row->place_id;
            $out[$id] ??= ['granted' => 0, 'denied' => 0];
            $key = $row->result === PlaceScan::GRANTED ? 'granted' : 'denied';
            $out[$id][$key] += (int) $row->n;
        }

        return $out;
    }

    /**
     * One page of a place's entries on a venue day, newest first: `{ entries: [{ id, at, member: {id, name,
     * member_number}|null, granted, reason, by }], page, pages, counts: {granted, denied} }`.
     *
     * @return array<string, mixed>
     */
    public function page(AccessPlace $place, string $day, int $page): array
    {
        $orgId = (int) $place->organization_id;
        $zone = VenueClock::zone($orgId);
        $stored = (string) config('app.timezone', 'UTC');
        $base = $this->onDay($orgId, $day)->where('s.access_place_id', $place->id);

        $counts = $this->counts($orgId, $day, (int) $place->id)[(int) $place->id] ?? ['granted' => 0, 'denied' => 0];
        $pages = max(1, (int) ceil(($counts['granted'] + $counts['denied']) / self::PER_PAGE));
        $page = min(max(1, $page), $pages);

        $rows = $base
            ->leftJoin('loyalty_members as m', 'm.id', '=', 's.member_id')
            ->leftJoin('users as mu', 'mu.id', '=', 'm.user_id')
            ->leftJoin('users as st', 'st.id', '=', 's.staff_id')
            ->orderByDesc('s.created_at')->orderByDesc('s.id')
            ->offset(($page - 1) * self::PER_PAGE)->limit(self::PER_PAGE)
            ->get(['s.id', 's.created_at', 's.member_id', 's.result', 's.action_taken', 'm.member_number', 'mu.name as member_name', 'st.name as staff_name']);

        return [
            'entries' => $rows->map(fn ($r) => [
                'id'      => (int) $r->id,
                'at'      => CarbonImmutable::parse((string) $r->created_at, $stored)->setTimezone($zone)->format(VenueClock::WALL),
                'member'  => $r->member_id !== null ? ['id' => (int) $r->member_id, 'name' => (string) ($r->member_name ?? ''), 'member_number' => $r->member_number] : null,
                'granted' => $r->result === PlaceScan::GRANTED,
                'reason'  => (string) $r->action_taken,
                'by'      => $r->staff_name,
            ])->values()->all(),
            'page'    => $page,
            'pages'   => $pages,
            'counts'  => $counts,
        ];
    }

    /** The organisation's place entries on a venue day: its midnight to the next on the venue's clock, as stored. */
    private function onDay(int $orgId, string $day): Builder
    {
        $zone = VenueClock::zone($orgId);
        $stored = (string) config('app.timezone', 'UTC');
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $day, $zone);

        return DB::table('scan_events as s')
            ->where('s.organization_id', $orgId)
            ->whereNotNull('s.access_place_id')
            ->whereNull('s.loyalty_event_id')
            ->where('s.created_at', '>=', $from->setTimezone($stored)->format('Y-m-d H:i:s'))
            ->where('s.created_at', '<', $from->addDay()->setTimezone($stored)->format('Y-m-d H:i:s'));
    }
}
