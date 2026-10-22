<?php

namespace App\Services\Loyalty\Insights;

use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Cohort retention (release 4 part E): the members of each of the last twelve venue months by the month they joined,
 * and how many of them were active in that month and in each month after it, to this one.
 *
 * Definitions (pinned by tests/Feature/LoyaltyWorkspace/InsightsCohortsTest.php):
 *  - Joined: `joined_at`, else `created_at`, on the venue's clock — as LoyaltyInsights counts new members. Every
 *    member counts in their cohort, whatever their state now.
 *  - Active in a month: the member earned or spent points in that venue month — a ledger line Insights counts as
 *    issued or redeemed (LoyaltyInsights::points()). A reversed line and its reversal count nowhere; an expiry, a
 *    deduction and a cancelled redemption's refund are not the member's doing and do not count either. Not
 *    `last_activity_at`: it holds only the latest activity, so it cannot say who was active in an earlier month.
 *  - Month 0 is the month they joined. A line dated before the member joined (an import, a merge) counts nowhere.
 *
 * Portable SQL (PostgreSQL and SQLite): each instant is placed in its venue month by comparing it with the months'
 * starts as UTC instants (a CASE over the twelve ranges, as InsightsPeriod places a stored time), inside a derived
 * table, and the counts are grouped on that table's columns — no time-zone function, no list of member ids. Two
 * queries whatever the programme's size; the ledger's read uses the (organization_id, created_at) index.
 */
final class InsightsCohorts
{
    public const MONTHS = 12;

    /**
     * @return array{timezone: string, months: list<string>, rows: list<array{key: string, members: int, active: list<int>}>}
     */
    public static function for(int $orgId): array
    {
        $zone = VenueClock::zone($orgId);
        $first = CarbonImmutable::createFromFormat('!Y-m-d', VenueClock::today($orgId), 'UTC')->startOfMonth();
        $keys = [];
        $bounds = [];
        foreach (range(self::MONTHS - 1, 0) as $back) {
            $month = $first->subMonthsNoOverflow($back);
            $keys[] = $month->format('Y-m');
            $bounds[] = InsightsPeriod::dayStartUtc($month->format('Y-m-d'), $zone);
        }
        $bounds[] = InsightsPeriod::dayStartUtc($first->addMonthNoOverflow()->format('Y-m-d'), $zone);

        $joined = 'COALESCE(lm.joined_at, lm.created_at)';
        [$cohortSql, $cohortBindings] = self::monthOf($joined, $bounds);
        $inRange = fn ($q) => $q->where('lm.organization_id', $orgId)
            ->whereRaw("{$joined} >= ? AND {$joined} < ?", [$bounds[0], $bounds[self::MONTHS]]);

        $sizes = array_fill(0, self::MONTHS, 0);
        $members = $inRange(DB::table('loyalty_members as lm'))->selectRaw("{$cohortSql} AS cohort_ix", $cohortBindings);
        foreach (DB::query()->fromSub($members, 'c')->selectRaw('c.cohort_ix AS cohort_ix, COUNT(*) AS n')->groupBy('c.cohort_ix')->get() as $row) {
            $sizes[(int) $row->cohort_ix] = (int) $row->n;
        }

        [$monthSql, $monthBindings] = self::monthOf('pt.created_at', $bounds);
        $lines = $inRange(DB::table('points_transactions as pt')->join('loyalty_members as lm', 'lm.id', '=', 'pt.member_id'))
            ->where('pt.organization_id', $orgId)
            ->where('pt.created_at', '>=', $bounds[0])
            ->where('pt.created_at', '<', $bounds[self::MONTHS])
            ->where('pt.is_reversed', false)
            ->whereNull('pt.reversal_of_id')
            ->where(fn ($w) => $w->whereNull('pt.type')->orWhereNotIn('pt.type', ['reverse', 'expire']))
            // Earned (a positive line that is not a cancelled redemption's refund) or spent (a redemption).
            ->where(fn ($w) => $w
                ->where(fn ($x) => $x->where('pt.type', 'redeem')->where('pt.points', '<>', 0))
                ->orWhere(fn ($x) => $x->where('pt.points', '>', 0)
                    ->whereRaw("NOT (COALESCE(pt.type, '') = 'adjust' AND COALESCE(pt.description, '') LIKE ?)", [LoyaltyInsights::REFUND_PREFIX . '%'])))
            ->selectRaw("pt.member_id AS member_id, {$cohortSql} AS cohort_ix, {$monthSql} AS month_ix", [...$cohortBindings, ...$monthBindings]);

        $active = array_map(fn (int $i) => array_fill(0, self::MONTHS - $i, 0), range(0, self::MONTHS - 1));
        $counts = DB::query()->fromSub($lines, 'a')
            ->selectRaw('a.cohort_ix AS cohort_ix, a.month_ix AS month_ix, COUNT(DISTINCT a.member_id) AS n')
            ->groupBy('a.cohort_ix', 'a.month_ix')->get();
        foreach ($counts as $row) {
            $cohort = (int) $row->cohort_ix;
            $offset = (int) $row->month_ix - $cohort;
            if (isset($active[$cohort][$offset])) {
                $active[$cohort][$offset] = (int) $row->n;
            }
        }

        return [
            'timezone' => $zone,
            'months'   => $keys,
            'rows'     => array_map(fn (string $key, int $i) => ['key' => $key, 'members' => $sizes[$i], 'active' => $active[$i]], $keys, array_keys($keys)),
        ];
    }

    /**
     * The venue month (0 = the oldest) a stored instant falls in, as SQL: `CASE WHEN x >= ? AND x < ? THEN 0 … END`,
     * null outside the months.
     *
     * @param list<string> $bounds the months' starts in UTC, then the end
     * @return array{0: string, 1: list<string>}
     */
    private static function monthOf(string $column, array $bounds): array
    {
        $sql = 'CASE';
        $bindings = [];
        for ($i = 0; $i < self::MONTHS; $i++) {
            $sql .= " WHEN {$column} >= ? AND {$column} < ? THEN {$i}";
            array_push($bindings, $bounds[$i], $bounds[$i + 1]);
        }

        return [$sql . ' END', $bindings];
    }
}
