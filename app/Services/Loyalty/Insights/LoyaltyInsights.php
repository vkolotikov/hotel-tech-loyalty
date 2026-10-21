<?php

namespace App\Services\Loyalty\Insights;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Models\RewardRedemption;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\MemberDirectory;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * How the loyalty programme is doing (spec 2026-10-21 release 2 §5), written
 * like Appointments' InsightsReport: plain queries, every brand of the
 * organisation and only this organisation (the tenant is named on every
 * query; child tables are reached through their member), counted in PHP on
 * the venue's clock, no cache. Sums and counts the SQL can do portably
 * (SUM/COUNT, CASE, GROUP BY on plain columns) are done there; what needs the
 * venue's day — the ledger, new members, redemptions in the period — is
 * streamed row by row (`cursor()`, a few short columns) and placed in its
 * bucket, so the number of queries is fixed and PHP never holds a period's
 * rows as a list.
 *
 * Definitions (pinned by tests/Feature/LoyaltyWorkspace/InsightsTest.php):
 *  - A reversal removes its line from every figure: a line flagged
 *    `is_reversed` counts nowhere, and neither does the reversal (`reverse`,
 *    or any line with `reversal_of_id`).
 *  - Issued: the points of the remaining positive lines, except the refund of
 *    a cancelled redemption.
 *  - Redeemed: the points of the remaining `redeem` lines, less the refunds of
 *    cancelled redemptions. A pending redemption cancelled today reverses its
 *    debit (RedemptionActions), so its `redeem` line drops out; a redemption
 *    made before the debits carried a key is refunded by an `adjust` line
 *    "Refund: cancelled reward redemption …", the only mark it has — that line
 *    lowers Redeemed in its own bucket.
 *  - Expired: the points of the remaining `expire` lines (counted nowhere else).
 *    Any other negative line (a deduction) has no figure of its own; the
 *    balances carry it.
 *  - Outstanding: the sum of active members' current balances (as the full
 *    admin's liability; the balance chart counts the same members).
 *  - Redemption rate: Redeemed ÷ Issued over the period, as a percentage with
 *    one decimal (null when nothing was issued); above 100 when older points
 *    were spent.
 *  - Joined: `joined_at`, or `created_at` where it is empty — the date the
 *    members list shows as "Joined". An import keeps its members' own join
 *    dates, so it does not read as a spike of new members on the import day
 *    (MemberDirectory's "new this month" counts `created_at`).
 *  - "In the last N days" is today and the N − 1 venue days before, as the
 *    30-day period is.
 */
final class LoyaltyInsights
{
    /** How many members the at-risk list holds at most; `total` says how many there are. */
    public const AT_RISK_LIMIT = 100;

    /** The description RedemptionActions writes on the refund of a cancelled redemption made before debits had a key. */
    public const REFUND_PREFIX = 'Refund: cancelled reward redemption ';

    /** Balance bands, [min, max] inclusive, null for open (as the full admin's points distribution, with below zero). */
    public const BANDS = [[null, -1], [0, 0], [1, 500], [501, 2000], [2001, 5000], [5001, 10000], [10001, null]];

    /**
     * The whole answer of `GET insights` for one period (`InsightsPeriod::CHOICES`): the period and its buckets,
     * the tiles, the series per bucket and the snapshots of now (frontend/src/loyalty/insights/types.ts reads it).
     *
     * @return array<string, mixed>
     */
    public static function for(int $orgId, string $choice): array
    {
        $zone = VenueClock::zone($orgId);
        $today = VenueClock::today($orgId);
        $period = InsightsPeriod::of($choice, $today, $zone);
        $d30 = InsightsPeriod::dayStartUtc(InsightsPeriod::addDays($today, -29), $zone);
        $d90 = InsightsPeriod::dayStartUtc(InsightsPeriod::addDays($today, -89), $zone);

        $growth = self::growth($orgId, $period);
        $points = self::points($orgId, $period);
        $issued = array_sum(array_column($points, 'issued'));
        $redeemed = array_sum(array_column($points, 'redeemed'));

        return [
            'period'      => $period->choice,
            'bucket'      => $period->bucket,
            'from'        => $period->from,
            'to'          => $period->to,
            'timezone'    => $zone,
            'tiles'       => [
                'members'         => self::members($orgId)->count(),
                'new_members'     => array_sum(array_column($growth, 'new')),
                'active_members'  => self::members($orgId)->where('is_active', true)->where('last_activity_at', '>=', $d90)->count(),
                'issued'          => $issued,
                'redeemed'        => $redeemed,
                'expired'         => array_sum(array_column($points, 'expired')),
                'outstanding'     => (int) self::members($orgId)->where('is_active', true)->sum('current_points'),
                'redemption_rate' => $issued > 0 ? round($redeemed / $issued * 100, 1) : null,
            ],
            'growth'      => $growth,
            'points'      => $points,
            'redemptions' => self::redemptions($orgId, $period),
            'tiers'       => self::tiers($orgId),
            'movement'    => self::movement($orgId, $period),
            'expiry'      => self::expiry($orgId, $today),
            'engagement'  => self::engagement($orgId, $d30, $d90),
            'balances'    => self::balances($orgId),
        ];
    }

    /**
     * Active members with no activity in the last `days` days (`last_activity_at`: earning, a scan, a merge), the
     * longest quiet first, at most AT_RISK_LIMIT, each as the members list shows them with how many days they have
     * been quiet. Members who were never active are dormant, not at risk (the full admin's rule), and are left out.
     *
     * @return array{days: int, total: int, limit: int, members: list<array<string, mixed>>}
     */
    public static function atRisk(int $orgId, int $days): array
    {
        $zone = VenueClock::zone($orgId);
        $today = VenueClock::today($orgId);
        $cutoff = InsightsPeriod::dayStartUtc(InsightsPeriod::addDays($today, -($days - 1)), $zone);

        $quiet = self::members($orgId)
            ->where('loyalty_members.is_active', true)
            ->whereNotNull('loyalty_members.last_activity_at')
            ->where('loyalty_members.last_activity_at', '<', $cutoff);

        $rows = (clone $quiet)
            ->leftJoin('users', 'users.id', '=', 'loyalty_members.user_id')
            ->select('loyalty_members.*', 'users.name as user_name', 'users.email as user_email', 'users.phone as user_phone')
            ->orderBy('loyalty_members.last_activity_at')
            ->orderBy('loyalty_members.id')
            ->limit(self::AT_RISK_LIMIT)
            ->get();

        return [
            'days'    => $days,
            'total'   => $quiet->count(),
            'limit'   => self::AT_RISK_LIMIT,
            'members' => $rows->map(fn (LoyaltyMember $m) => MemberDirectory::row($m) + [
                'days_quiet' => InsightsPeriod::daysBetween(
                    CarbonImmutable::instance($m->last_activity_at)->setTimezone($zone)->format('Y-m-d'),
                    $today,
                ),
            ])->values()->all(),
        ];
    }

    /** @return Builder<LoyaltyMember> This organisation's members, every one of them (the tenant named, no scope relied on). */
    private static function members(int $orgId): Builder
    {
        return LoyaltyMember::withoutGlobalScopes()->where('loyalty_members.organization_id', $orgId);
    }

    /**
     * New members per bucket by the day they joined, and the running total at each bucket's end (those who joined
     * before the period, plus the new ones so far).
     *
     * @return list<array{key: string, new: int, total: int}>
     */
    private static function growth(int $orgId, InsightsPeriod $period): array
    {
        $start = $period->startUtc();
        $end = $period->endUtc();
        $before = self::members($orgId)->where(fn (Builder $w) => $w
            ->where('joined_at', '<', $start)
            ->orWhere(fn (Builder $x) => $x->whereNull('joined_at')->where('created_at', '<', $start)))
            ->count();

        $new = $period->zeros();
        $joined = self::members($orgId)->where(fn (Builder $w) => $w
            ->where(fn (Builder $x) => $x->where('joined_at', '>=', $start)->where('joined_at', '<', $end))
            ->orWhere(fn (Builder $x) => $x->whereNull('joined_at')->where('created_at', '>=', $start)->where('created_at', '<', $end)))
            ->select('joined_at', 'created_at')
            ->toBase()->cursor();
        foreach ($joined as $row) {
            $i = $period->indexOf($row->joined_at ?? $row->created_at);
            if ($i !== null) {
                $new[$i]++;
            }
        }

        $out = [];
        $total = $before;
        foreach ($period->keys as $i => $key) {
            $total += $new[$i];
            $out[] = ['key' => $key, 'new' => $new[$i], 'total' => $total];
        }

        return $out;
    }

    /**
     * Points issued, redeemed and expired per bucket, by the class docblock's definitions. Only the lines that can
     * count are read: not reversed, not a reversal, not zero.
     *
     * @return list<array{key: string, issued: int, redeemed: int, expired: int}>
     */
    private static function points(int $orgId, InsightsPeriod $period): array
    {
        $issued = $redeemed = $expired = $period->zeros();

        $lines = PointsTransaction::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('created_at', '>=', $period->startUtc())
            ->where('created_at', '<', $period->endUtc())
            ->where('is_reversed', false)
            ->whereNull('reversal_of_id')
            ->where(fn (Builder $w) => $w->whereNull('type')->orWhere('type', '<>', 'reverse'))
            ->where('points', '<>', 0)
            ->selectRaw(
                "created_at, type, points, CASE WHEN type = 'adjust' AND points > 0 AND description LIKE ? THEN 1 ELSE 0 END AS refund",
                [self::REFUND_PREFIX . '%'],
            )
            ->toBase()->cursor();

        foreach ($lines as $line) {
            $i = $period->indexOf($line->created_at);
            if ($i === null) {
                continue;
            }
            $points = (int) $line->points;
            if ((int) $line->refund === 1) {
                $redeemed[$i] -= $points;
            } elseif ($line->type === 'redeem') {
                $redeemed[$i] += abs($points);
            } elseif ($line->type === 'expire') {
                $expired[$i] += abs($points);
            } elseif ($points > 0) {
                $issued[$i] += $points;
            }
        }

        return array_map(fn (string $key, int $i) => [
            'key' => $key, 'issued' => $issued[$i], 'redeemed' => $redeemed[$i], 'expired' => $expired[$i],
        ], $period->keys, array_keys($period->keys));
    }

    /**
     * Reward redemptions made per bucket (by when the member made them), by where each stands now.
     *
     * @return list<array{key: string, fulfilled: int, pending: int, cancelled: int}>
     */
    private static function redemptions(int $orgId, InsightsPeriod $period): array
    {
        $counts = [
            RewardRedemption::STATUS_FULFILLED => $period->zeros(),
            RewardRedemption::STATUS_PENDING   => $period->zeros(),
            RewardRedemption::STATUS_CANCELLED => $period->zeros(),
        ];

        $rows = RewardRedemption::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('created_at', '>=', $period->startUtc())
            ->where('created_at', '<', $period->endUtc())
            ->select('created_at', 'status')
            ->toBase()->cursor();
        foreach ($rows as $row) {
            $i = $period->indexOf($row->created_at);
            if ($i !== null && isset($counts[$row->status])) {
                $counts[$row->status][$i]++;
            }
        }

        return array_map(fn (string $key, int $i) => [
            'key'       => $key,
            'fulfilled' => $counts[RewardRedemption::STATUS_FULFILLED][$i],
            'pending'   => $counts[RewardRedemption::STATUS_PENDING][$i],
            'cancelled' => $counts[RewardRedemption::STATUS_CANCELLED][$i],
        ], $period->keys, array_keys($period->keys));
    }

    /**
     * Active members by tier, the ladder in order: every tier in use, and a switched-off tier only while members are
     * still on it; `none` holds those without a tier of this programme.
     *
     * @return array{rows: list<array<string, mixed>>, none: int}
     */
    private static function tiers(int $orgId): array
    {
        $counts = [];
        $rows = self::members($orgId)->where('is_active', true)
            ->selectRaw('tier_id, COUNT(*) AS n')->groupBy('tier_id')->toBase()->get();
        foreach ($rows as $row) {
            $counts[$row->tier_id === null ? 0 : (int) $row->tier_id] = (int) $row->n;
        }

        $out = [];
        foreach (self::ladder($orgId) as $tier) {
            $n = $counts[$tier->id] ?? 0;
            unset($counts[$tier->id]);
            if ($tier->is_active || $n > 0) {
                $out[] = [
                    'id'         => (int) $tier->id,
                    'name'       => (string) $tier->name,
                    'color'      => $tier->color_hex,
                    'sort_order' => (int) $tier->sort_order,
                    'is_active'  => (bool) $tier->is_active,
                    'members'    => $n,
                ];
            }
        }

        return ['rows' => $out, 'none' => array_sum($counts)];
    }

    /**
     * Tier changes in the period (`tier_assessments`, which the programme writes on every change): up and down by
     * the ladder's order, sideways between tiers of the same place, and each flow from one tier to another, the
     * largest first. A first tier (no old one) and a tier no longer in the programme are not movement.
     *
     * @return array{up: int, down: int, lateral: int, flows: list<array<string, mixed>>}
     */
    private static function movement(int $orgId, InsightsPeriod $period): array
    {
        $tiers = self::ladder($orgId)->keyBy('id');
        $rows = DB::table('tier_assessments as ta')
            ->join('loyalty_members as lm', 'lm.id', '=', 'ta.member_id')
            ->where('lm.organization_id', $orgId)
            ->where('ta.created_at', '>=', $period->startUtc())
            ->where('ta.created_at', '<', $period->endUtc())
            ->whereNotNull('ta.old_tier_id')
            ->whereNotNull('ta.new_tier_id')
            ->selectRaw('ta.old_tier_id, ta.new_tier_id, COUNT(*) AS n')
            ->groupBy('ta.old_tier_id', 'ta.new_tier_id')
            ->get();

        $out = ['up' => 0, 'down' => 0, 'lateral' => 0, 'flows' => []];
        foreach ($rows as $row) {
            $from = $tiers->get((int) $row->old_tier_id);
            $to = $tiers->get((int) $row->new_tier_id);
            if (!$from || !$to || $from->id === $to->id) {
                continue;
            }
            $step = (int) $to->sort_order <=> (int) $from->sort_order;
            $direction = $step > 0 ? 'up' : ($step < 0 ? 'down' : 'lateral');
            $out[$direction] += (int) $row->n;
            $out['flows'][] = ['from' => (int) $from->id, 'to' => (int) $to->id, 'count' => (int) $row->n, 'direction' => $direction];
        }
        $place = fn (int $id) => [(int) $tiers[$id]->sort_order, $id];
        usort($out['flows'], fn (array $a, array $b) => [$b['count'], $place($a['from']), $place($a['to'])] <=> [$a['count'], $place($b['from']), $place($b['to'])]);

        return $out;
    }

    /**
     * Points still held in expiry buckets: those whose date has come (the hourly sweep takes a bucket from the start
     * of its date) but are not taken yet, and those due in this month and the five after, from tomorrow on.
     *
     * @return array{overdue: array{points: int, members: int}, months: list<array{key: string, points: int}>}
     */
    private static function expiry(int $orgId, string $today): array
    {
        $tomorrow = InsightsPeriod::addDays($today, 1);
        $live = fn () => DB::table('point_expiry_buckets as b')
            ->join('loyalty_members as lm', 'lm.id', '=', 'b.member_id')
            ->where('lm.organization_id', $orgId)
            ->where('b.is_expired', false)
            ->where('b.remaining_points', '>', 0);

        $overdue = $live()->where('b.expires_at', '<', $tomorrow)
            ->selectRaw('COALESCE(SUM(b.remaining_points), 0) AS points, COUNT(DISTINCT b.member_id) AS members')
            ->first();

        $first = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->startOfMonth();
        $months = [];
        foreach (range(0, 5) as $i) {
            $months[$first->addMonthsNoOverflow($i)->format('Y-m')] = 0;
        }
        $due = $live()->where('b.expires_at', '>=', $tomorrow)
            ->where('b.expires_at', '<', $first->addMonthsNoOverflow(6)->format('Y-m-d'))
            ->selectRaw('b.expires_at AS expires_on, SUM(b.remaining_points) AS points')
            ->groupBy('b.expires_at')
            ->get();
        foreach ($due as $row) {
            $key = substr((string) $row->expires_on, 0, 7);
            if (isset($months[$key])) {
                $months[$key] += (int) $row->points;
            }
        }

        return [
            'overdue' => ['points' => (int) ($overdue->points ?? 0), 'members' => (int) ($overdue->members ?? 0)],
            'months'  => array_map(fn (string $key, int $points) => ['key' => $key, 'points' => $points], array_keys($months), $months),
        ];
    }

    /**
     * Active members in four groups that add up to all of them: new (joined in the last 30 days, whatever they did);
     * of the rest, active (activity in the last 30 days), at risk (last activity 31 to 90 days ago) and dormant (none
     * in the last 90 days, or never).
     *
     * @return array{new: int, active: int, at_risk: int, dormant: int}
     */
    private static function engagement(int $orgId, string $d30, string $d90): array
    {
        $joined = 'COALESCE(joined_at, created_at)';
        $old = "({$joined} IS NULL OR {$joined} < ?)";
        $row = self::members($orgId)->where('is_active', true)
            ->selectRaw("COALESCE(SUM(CASE WHEN {$joined} >= ? THEN 1 ELSE 0 END), 0) AS new_members", [$d30])
            ->selectRaw("COALESCE(SUM(CASE WHEN {$old} AND last_activity_at >= ? THEN 1 ELSE 0 END), 0) AS active", [$d30, $d30])
            ->selectRaw("COALESCE(SUM(CASE WHEN {$old} AND last_activity_at < ? AND last_activity_at >= ? THEN 1 ELSE 0 END), 0) AS at_risk", [$d30, $d30, $d90])
            ->selectRaw("COALESCE(SUM(CASE WHEN {$old} AND (last_activity_at IS NULL OR last_activity_at < ?) THEN 1 ELSE 0 END), 0) AS dormant", [$d30, $d90])
            ->toBase()->first();

        return [
            'new'     => (int) ($row->new_members ?? 0),
            'active'  => (int) ($row->active ?? 0),
            'at_risk' => (int) ($row->at_risk ?? 0),
            'dormant' => (int) ($row->dormant ?? 0),
        ];
    }

    /**
     * Active members by their balance, in BANDS.
     *
     * @return list<array{min: ?int, max: ?int, members: int}>
     */
    private static function balances(int $orgId): array
    {
        $query = self::members($orgId)->where('is_active', true);
        foreach (self::BANDS as $i => [$min, $max]) {
            $test = match (true) {
                $min === null => 'current_points <= ?',
                $max === null => 'current_points >= ?',
                default       => 'current_points BETWEEN ? AND ?',
            };
            $bindings = array_values(array_filter([$min, $max], fn ($v) => $v !== null));
            $query->selectRaw("COALESCE(SUM(CASE WHEN {$test} THEN 1 ELSE 0 END), 0) AS b{$i}", $bindings);
        }
        $row = $query->toBase()->first();

        return array_map(fn (array $band, int $i) => [
            'min' => $band[0], 'max' => $band[1], 'members' => (int) ($row->{"b{$i}"} ?? 0),
        ], self::BANDS, array_keys(self::BANDS));
    }

    /** @return \Illuminate\Support\Collection<int, LoyaltyTier> The programme's tiers in the ladder's order. */
    private static function ladder(int $orgId)
    {
        return LoyaltyTier::withoutGlobalScopes()->where('organization_id', $orgId)
            ->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'color_hex', 'sort_order', 'is_active']);
    }
}
