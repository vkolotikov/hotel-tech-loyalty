<?php

namespace App\Services\Crm;

use App\Models\Activity;
use App\Models\CorporateAccount;
use App\Models\Inquiry;
use App\Models\InquiryLostReason;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * The sales reports (CRM Phase 4), in one place for both interfaces (round 5, owner 2026-11-12: "implement all features
 * we have in our main platform"): the full admin's Reports page (`reporting/*`, `analytics/inquiry-funnel`) and
 * HexaTech CRM's Insights (`crm/reports/*`) answer from these methods, so the two always agree. Reads only, under the
 * request's tenant and brand scopes (the models' global scopes).
 *
 * Every report is CRM data — leads, their lost reasons, sources, owners, the timeline and companies — except a
 * company's confirmed reservation revenue, which is booking data: `companies()` reads reservations only when asked
 * (`$withBookings`), and HexaTech CRM asks only for an organisation that may reach bookings (Admin\Crm\ReportsController::seesBookings).
 *
 * The SQL runs on PostgreSQL and SQLite alike: `SUM(CASE …)` where the first version used PostgreSQL's
 * `count(*) filter (…)`, which gives the same counts.
 */
final class SalesReports
{
    /** The funnel's stages in the pipeline's order (status names; a renamed status simply does not appear). */
    public const FUNNEL_STAGES = ['New', 'Responded', 'Site Visit', 'Proposal Sent', 'Negotiating', 'Tentative', 'Confirmed'];

    /**
     * Stage drop-off over the last `$months` months: at each stage everyone who reached it or a later one, the share
     * of the stage before and of the first, the won and lost counts, the win rate and the average days to close.
     *
     * @return array<string, mixed>
     */
    public function funnel(int $months): array
    {
        $since = now()->subMonths($months);
        $stages = self::FUNNEL_STAGES;

        $rows = Inquiry::select('status', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_value),0) as value'))
            ->where('created_at', '>=', $since)
            ->whereIn('status', array_merge($stages, ['Lost']))
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $confirmed = (int) ($rows['Confirmed']->count ?? 0);
        $lost = (int) ($rows['Lost']->count ?? 0);
        $winRate = ($confirmed + $lost) > 0 ? round($confirmed / ($confirmed + $lost) * 100, 1) : 0;

        // Everyone who reached a stage or beyond: this stage's count plus every later one's.
        $cumulative = 0;
        $reached = [];
        foreach (array_reverse($stages) as $stage) {
            $cumulative += (int) ($rows[$stage]->count ?? 0);
            $reached[$stage] = $cumulative;
        }

        $first = $reached[$stages[0]];
        $funnel = [];
        foreach ($stages as $i => $stage) {
            $here = $reached[$stage];
            $before = $i === 0 ? $here : $reached[$stages[$i - 1]];
            $funnel[] = [
                'stage'           => $stage,
                'count'           => $here,
                'value'           => (float) ($rows[$stage]->value ?? 0),
                'rate_from_prev'  => $before > 0 ? round($here / $before * 100, 1) : 0,
                'rate_from_start' => $first > 0 ? round($here / $first * 100, 1) : 0,
            ];
        }

        // Days from creation to Confirmed, over the won ones only.
        $avgClose = Inquiry::where('status', 'Confirmed')
            ->where('created_at', '>=', $since)
            ->whereNotNull('updated_at')
            ->get(['created_at', 'updated_at'])
            ->map(fn ($r) => $r->created_at->diffInDays($r->updated_at))
            ->filter(fn ($d) => $d >= 0)
            ->avg();

        return [
            'months'            => $months,
            'stages'            => $funnel,
            'won'               => $confirmed,
            'lost'              => $lost,
            'win_rate_pct'      => $winRate,
            'avg_days_to_close' => $avgClose !== null ? round($avgClose, 1) : null,
        ];
    }

    /**
     * The open pipeline's value weighted by its chance, by the month it is expected to close (`check_in` when set,
     * else 30 days after it came in), over the next `$months` months and a "later" bucket. The chance is the lead's AI
     * score, else its stage's default, else 25.
     *
     * @return array<string, mixed>
     */
    public function forecast(int $months): array
    {
        $rows = Inquiry::with(['pipelineStage:id,kind,default_win_probability'])
            ->whereHas('pipelineStage', fn ($q) => $q->where('kind', 'open'))
            ->whereNotNull('total_value')
            ->where('total_value', '>', 0)
            ->get(['id', 'pipeline_stage_id', 'total_value', 'check_in', 'created_at', 'ai_win_probability', 'assigned_to']);

        $now = now()->startOfMonth();
        $buckets = [];
        for ($i = 0; $i < $months; $i++) {
            $m = $now->copy()->addMonths($i);
            $buckets[$m->format('Y-m')] = ['month' => $m->format('M Y'), 'key' => $m->format('Y-m'), 'gross_value' => 0.0, 'expected_value' => 0.0, 'deal_count' => 0];
        }
        $buckets['beyond'] = ['month' => 'Later', 'key' => 'beyond', 'gross_value' => 0.0, 'expected_value' => 0.0, 'deal_count' => 0];

        $totalExpected = 0.0;
        $totalGross = 0.0;
        foreach ($rows as $r) {
            $closeAt = $r->check_in ?? $r->created_at?->copy()->addDays(30);
            if (!$closeAt) {
                continue;
            }
            $key = $closeAt->lt($now) ? $now->format('Y-m') : $closeAt->copy()->startOfMonth()->format('Y-m');
            if (!isset($buckets[$key])) {
                $key = 'beyond';
            }
            $chance = max(0, min(100, (int) ($r->ai_win_probability ?? $r->pipelineStage?->getAttribute('default_win_probability') ?? 25)));
            $expected = (float) $r->total_value * ($chance / 100);

            $buckets[$key]['gross_value'] += (float) $r->total_value;
            $buckets[$key]['expected_value'] += $expected;
            $buckets[$key]['deal_count'] += 1;
            $totalGross += (float) $r->total_value;
            $totalExpected += $expected;
        }

        return [
            'buckets'        => array_values($buckets),
            'total_gross'    => round($totalGross, 2),
            'total_expected' => round($totalExpected, 2),
            'months'         => $months,
        ];
    }

    /**
     * Leads lost in the last `$months` months by the reason chosen (those without one as "Unspecified"), with the
     * value lost, the most first.
     *
     * @return array<string, mixed>
     */
    public function lostReasons(int $months): array
    {
        $rows = Inquiry::select('lost_reason_id', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_value),0) as lost_value'))
            ->where('status', 'Lost')
            ->where('updated_at', '>=', now()->subMonths($months))
            ->groupBy('lost_reason_id')
            ->get();

        $labels = InquiryLostReason::pluck('label', 'id');
        $unspecifiedCount = 0;
        $unspecifiedValue = 0.0;
        $reasons = [];
        foreach ($rows as $r) {
            if (!$r->lost_reason_id) {
                $unspecifiedCount += self::int($r, 'count');
                $unspecifiedValue += self::float($r, 'lost_value');
                continue;
            }
            $reasons[] = ['label' => $labels[$r->lost_reason_id] ?? 'Unknown', 'count' => self::int($r, 'count'), 'lost_value' => self::float($r, 'lost_value')];
        }
        if ($unspecifiedCount > 0) {
            $reasons[] = ['label' => 'Unspecified', 'count' => $unspecifiedCount, 'lost_value' => $unspecifiedValue];
        }
        usort($reasons, fn ($a, $b) => $b['count'] <=> $a['count']);

        return [
            'reasons'     => $reasons,
            'total_count' => array_sum(array_column($reasons, 'count')),
            'total_value' => round(array_sum(array_column($reasons, 'lost_value')), 2),
            'months'      => $months,
        ];
    }

    /**
     * Where the leads of the last `$months` months came from: per source the leads, the won and the lost, the win
     * rate of those closed and the value won.
     *
     * @return array<string, mixed>
     */
    public function sources(int $months): array
    {
        $source = "coalesce(source, 'unknown')";
        $rows = Inquiry::select(
            DB::raw("{$source} as source"),
            DB::raw('count(*) as count'),
            DB::raw("sum(case when status = 'Confirmed' then 1 else 0 end) as won"),
            DB::raw("sum(case when status = 'Lost' then 1 else 0 end) as lost"),
            DB::raw("coalesce(sum(case when status = 'Confirmed' then total_value else 0 end), 0) as won_value"),
        )
            ->where('created_at', '>=', now()->subMonths($months))
            ->groupBy(DB::raw($source))
            ->orderByDesc(DB::raw('count(*)'))
            ->get();

        return [
            'sources' => $rows->map(function (Inquiry $r) {
                $won = self::int($r, 'won');
                $closed = $won + self::int($r, 'lost');

                return [
                    'source'       => $r->source,
                    'count'        => self::int($r, 'count'),
                    'won'          => $won,
                    'lost'         => self::int($r, 'lost'),
                    'won_value'    => self::float($r, 'won_value'),
                    'win_rate_pct' => $closed > 0 ? round($won / $closed * 100, 1) : null,
                ];
            })->values()->all(),
            'months'  => $months,
        ];
    }

    /**
     * Each person's work in the last `$days` days: the timeline lines they logged and the tasks they completed (by
     * who logged them), and the leads that came in owned by them, open, won and lost (`inquiries.assigned_to` holds
     * the owner's name). The busiest first.
     *
     * @return array<string, mixed>
     */
    public function owners(int $days): array
    {
        $since = now()->subDays($days);

        $activityRows = Activity::select(
            'created_by',
            DB::raw('count(*) as activities'),
            DB::raw("sum(case when type = 'task_completed' then 1 else 0 end) as tasks_done"),
        )
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('created_by')
            ->groupBy('created_by')
            ->with('creator:id,name')
            ->get();

        $leadRows = Inquiry::select(
            'assigned_to',
            DB::raw('count(*) as total'),
            DB::raw("sum(case when status = 'Confirmed' then 1 else 0 end) as won"),
            DB::raw("sum(case when status = 'Lost' then 1 else 0 end) as lost"),
            DB::raw("sum(case when status not in ('Confirmed', 'Lost') then 1 else 0 end) as open"),
        )
            ->where('created_at', '>=', $since)
            ->whereNotNull('assigned_to')
            ->groupBy('assigned_to')
            ->get()
            ->keyBy(fn ($r) => strtolower(trim((string) $r->assigned_to)));

        $owners = [];
        foreach ($activityRows as $r) {
            $creator = $r->getRelation('creator');
            $name = $creator instanceof User ? (string) $creator->name : "User #{$r->created_by}";
            $key = strtolower(trim($name));
            $leads = $leadRows[$key] ?? null;
            $owners[$key] = [
                'name'       => $name,
                'activities' => self::int($r, 'activities'),
                'tasks_done' => self::int($r, 'tasks_done'),
                'inquiries'  => self::int($leads, 'total'),
                'open'       => self::int($leads, 'open'),
                'won'        => self::int($leads, 'won'),
                'lost'       => self::int($leads, 'lost'),
            ];
        }
        // Owners with leads and no timeline lines are on the board too, at nought on that side.
        foreach ($leadRows as $key => $leads) {
            if (isset($owners[$key])) {
                continue;
            }
            $owners[$key] = [
                'name'       => $leads->assigned_to,
                'activities' => 0,
                'tasks_done' => 0,
                'inquiries'  => self::int($leads, 'total'),
                'open'       => self::int($leads, 'open'),
                'won'        => self::int($leads, 'won'),
                'lost'       => self::int($leads, 'lost'),
            ];
        }
        $owners = array_values($owners);
        usort($owners, fn ($a, $b) => $b['activities'] <=> $a['activities']);

        return ['owners' => $owners, 'days' => $days];
    }

    /**
     * The companies worth most, with their leads, the value of the won ones and the open pipeline. With bookings
     * (the full admin's Reports): ordered by their confirmed reservation revenue, with their reservations, as that
     * page has always shown. Without (HexaTech CRM for an organisation that has no bookings): no reservation is read;
     * the companies with a won or an open lead, by the value won, then the open pipeline.
     *
     * Each sum is a subquery with COALESCE, so a company with nothing reads 0 and sorts last on PostgreSQL too (a bare
     * `withSum` is NULL there, and NULL sorts first in a descending order).
     *
     * @return list<array<string, mixed>>
     */
    public function companies(int $limit, bool $withBookings): array
    {
        $sum = fn (Builder $query, string $column) => $query->selectRaw("COALESCE(SUM({$column}), 0)")->whereColumn('corporate_account_id', 'corporate_accounts.id');

        $query = CorporateAccount::query()
            ->select('corporate_accounts.*')
            ->withCount('inquiries')
            ->addSelect([
                'won_value'           => $sum(Inquiry::query(), 'total_value')->where('status', 'Confirmed'),
                'open_pipeline_value' => $sum(Inquiry::query(), 'total_value')->whereNotIn('status', ['Confirmed', 'Lost']),
            ]);

        if ($withBookings) {
            $query->withCount('reservations')
                ->addSelect(['confirmed_revenue' => $sum(Reservation::query(), 'total_amount')->where('status', 'Confirmed')])
                ->orderByDesc('confirmed_revenue');
        } else {
            $query->whereHas('inquiries', fn ($q) => $q->where(fn ($w) => $w->whereNull('status')->orWhere('status', '!=', 'Lost')))
                ->orderByDesc('won_value')
                ->orderByDesc('open_pipeline_value');
        }

        return $query->orderBy('corporate_accounts.id')->limit($limit)->get()->map(function (CorporateAccount $c) use ($withBookings) {
            $row = [
                'id'                  => (int) $c->id,
                'company_name'        => (string) $c->company_name,
                'industry'            => $c->industry,
                'status'              => $c->status,
                'credit_limit'        => $c->credit_limit,
                'contract_end'        => $c->contract_end,
                'inquiries_count'     => (int) $c->getAttribute('inquiries_count'),
                'won_value'           => (float) $c->getAttribute('won_value'),
                'open_pipeline_value' => (float) $c->getAttribute('open_pipeline_value'),
            ];
            if ($withBookings) {
                $row['reservations_count'] = (int) $c->getAttribute('reservations_count');
                $row['confirmed_revenue'] = (float) $c->getAttribute('confirmed_revenue');
            }

            return $row;
        })->values()->all();
    }

    /** An aggregate a query selected (`count`, `won`…) as a whole number; 0 for no row. */
    private static function int(?Model $row, string $key): int
    {
        return (int) ($row?->getAttribute($key) ?? 0);
    }

    /** An aggregate a query selected (`lost_value`, `won_value`) as an amount; 0 for no row. */
    private static function float(?Model $row, string $key): float
    {
        return (float) ($row?->getAttribute($key) ?? 0);
    }
}
