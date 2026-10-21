<?php

namespace App\Services\Loyalty;

use App\Models\LoyaltyMember;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * The organisation's members as HexaTech Loyalty lists and finds them (spec
 * 2026-10-21 §4.2, §4.8). Plain SQL that runs on PostgreSQL and on the tests'
 * SQLite: no ILIKE, the search words matched literally (`%`, `_` and `!` in
 * them match themselves), a phone found by its digits whatever the spacing it
 * was stored with. Members are the organisation's, not a brand's: the tenant
 * scope is the only filter.
 */
final class MemberDirectory
{
    public const PER_PAGE = 50;
    public const FIND_LIMIT = 8;
    public const SORTS = ['recent', 'points', 'name', 'activity'];
    public const STATES = ['active', 'inactive', 'all'];

    /**
     * One page of the list.
     *
     * @param array{q?: ?string, tier_id?: ?int, state?: ?string, sort?: ?string} $filters
     * @return array{members: list<array<string, mixed>>, page: int, pages: int, total: int}
     */
    public function page(array $filters, int $page): array
    {
        $query = $this->filtered($filters);

        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, $page), $pages);
        $rows = $query->forPage($page, self::PER_PAGE)->get();

        return [
            'members' => $rows->map(fn (LoyaltyMember $m) => self::row($m))->values()->all(),
            'page'    => $page,
            'pages'   => $pages,
            'total'   => $total,
        ];
    }

    /**
     * The list's members for these filters, in the list's order, unpaged: the page reads one slice of it, the
     * export (release 2 §4.2) all of it, so the file holds exactly what the list shows.
     *
     * @param array{q?: ?string, tier_id?: ?int, state?: ?string, sort?: ?string} $filters
     * @return Builder<LoyaltyMember>
     */
    public function filtered(array $filters): Builder
    {
        $query = $this->base();
        $this->search($query, (string) ($filters['q'] ?? ''));
        if (!empty($filters['tier_id'])) {
            $query->where('loyalty_members.tier_id', (int) $filters['tier_id']);
        }
        $state = in_array($filters['state'] ?? null, self::STATES, true) ? $filters['state'] : 'active';
        if ($state !== 'all') {
            $query->where('loyalty_members.is_active', $state === 'active');
        }

        match (in_array($filters['sort'] ?? null, self::SORTS, true) ? $filters['sort'] : 'recent') {
            'points'   => $query->orderByDesc('loyalty_members.current_points'),
            'name'     => $query->orderByRaw('LOWER(COALESCE(users.name, \'\'))'),
            // Never-active members last, on both databases (no NULLS LAST in SQLite before 3.30's).
            'activity' => $query->orderByRaw('loyalty_members.last_activity_at IS NULL')->orderByDesc('loyalty_members.last_activity_at'),
            default    => $query->orderByDesc('loyalty_members.created_at'),
        };

        return $query->orderByDesc('loyalty_members.id');
    }

    /** @return list<array<string, mixed>> Up to eight members whose name, email, phone or number holds the words. */
    public function find(string $q): array
    {
        if (mb_strlen(trim($q)) < 2) {
            return [];
        }
        $query = $this->base();
        $this->search($query, $q);

        return $query->where('loyalty_members.is_active', true)
            ->orderByRaw('LOWER(COALESCE(users.name, \'\'))')
            ->orderBy('loyalty_members.id')
            ->limit(self::FIND_LIMIT)
            ->get()
            ->map(fn (LoyaltyMember $m) => self::row($m))
            ->values()->all();
    }

    /**
     * The numbers line over the list: every member, the active ones, those who joined this month on the venue's
     * clock, the average balance of the active ones, and each tier's active members.
     *
     * @return array{total: int, active: int, new_this_month: int, average_points: int, tiers: array<int, int>}
     */
    public function figures(int $orgId): array
    {
        $monthStart = CarbonImmutable::parse(VenueClock::today($orgId), VenueClock::zone($orgId))->startOfMonth()->utc();

        $active = LoyaltyMember::query()->where('is_active', true);

        return [
            'total'          => LoyaltyMember::query()->count(),
            'active'         => (clone $active)->count(),
            // Joined as the list's own column shows it (`joined_at`, else `created_at`), as Insights counts new members: an
            // import keeps its members' join dates and does not read as a month of new members.
            'new_this_month' => LoyaltyMember::query()->where(fn ($w) => $w->where('joined_at', '>=', $monthStart)
                ->orWhere(fn ($x) => $x->whereNull('joined_at')->where('created_at', '>=', $monthStart)))->count(),
            'average_points' => (int) round((float) ((clone $active)->avg('current_points') ?? 0)),
            'tiers'          => (clone $active)->selectRaw('tier_id, COUNT(*) AS n')->groupBy('tier_id')->pluck('n', 'tier_id')
                ->filter(fn ($n, $tier) => $tier !== null && $tier !== '')
                ->mapWithKeys(fn ($n, $tier) => [(int) $tier => (int) $n])->all(),
        ];
    }

    /** A member as the list, Find and the member's page show them. @return array<string, mixed> */
    public static function row(LoyaltyMember $m): array
    {
        return [
            'id'               => (int) $m->id,
            'name'             => (string) ($m->user_name ?? $m->user?->name ?? ''),
            'email'            => $m->user_email ?? $m->user?->email,
            'phone'            => $m->user_phone ?? $m->user?->phone,
            'member_number'    => $m->member_number,
            'tier_id'          => $m->tier_id !== null ? (int) $m->tier_id : null,
            'points'           => (int) $m->current_points,
            'lifetime_points'  => (int) $m->lifetime_points,
            'is_active'        => (bool) $m->is_active,
            'joined_at'        => ($m->joined_at ?? $m->created_at)?->toIso8601String(),
            'last_activity_at' => $m->last_activity_at?->toIso8601String(),
        ];
    }

    /** @return Builder<LoyaltyMember> */
    private function base(): Builder
    {
        return LoyaltyMember::query()
            ->leftJoin('users', 'users.id', '=', 'loyalty_members.user_id')
            ->select('loyalty_members.*', 'users.name as user_name', 'users.email as user_email', 'users.phone as user_phone');
    }

    /** @param Builder<LoyaltyMember> $query */
    private function search(Builder $query, string $q): void
    {
        $q = trim($q);
        if ($q === '') {
            return;
        }
        $needle = '%' . self::literal(mb_strtolower($q)) . '%';
        $digits = preg_replace('/\D/', '', $q) ?? '';

        $query->where(function (Builder $w) use ($needle, $digits) {
            foreach (['users.name', 'users.email', 'loyalty_members.member_number'] as $column) {
                $w->orWhereRaw("LOWER(COALESCE({$column}, '')) LIKE ? ESCAPE '!'", [$needle]);
            }
            // A number stored as "+371 26 123 456" is found by "26123456"; four digits at least, so a short number
            // does not sweep in everyone.
            if (strlen($digits) >= 4) {
                $w->orWhereRaw(
                    "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(users.phone, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?",
                    ['%' . $digits . '%'],
                );
            }
        });
    }

    /** The words as they are: LIKE's own characters escaped with `!`. */
    public static function literal(string $q): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q);
    }
}
