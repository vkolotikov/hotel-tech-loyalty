<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\CorporateAccount;
use App\Models\Inquiry;
use App\Models\InquiryLostReason;
use App\Models\PipelineStage;
use App\Models\Reservation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * CRM Phase 4 — read-only reporting endpoints.
 *
 * Each method is one chart on the /reports page and is intentionally
 * a single SQL query (or a small fixed set) so the page paints
 * quickly and we don't have to invent a job pipeline. Heavy lift —
 * cohort analysis, attribution modelling, custom dashboards — is
 * out of scope.
 */
class ReportingController extends Controller
{
    /**
     * GET /v1/admin/reporting/forecast — open-pipeline revenue forecast.
     *
     * For every still-open inquiry: probability × value, bucketed by
     * the month of expected close (we use `check_in` as the close
     * proxy when set; falls back to `created_at + 30d`). Probability
     * comes from `ai_win_probability` if present, otherwise the
     * stage's `default_win_probability`, otherwise 25 (a conservative
     * fallback for unscored deals).
     */
    public function forecast(Request $request): JsonResponse
    {
        $months = max(1, min(12, (int) $request->get('months', 6)));

        $rows = Inquiry::with(['pipelineStage:id,kind,default_win_probability'])
            ->whereHas('pipelineStage', fn ($q) => $q->where('kind', 'open'))
            ->whereNotNull('total_value')
            ->where('total_value', '>', 0)
            ->get(['id', 'pipeline_stage_id', 'total_value', 'check_in', 'created_at',
                   'ai_win_probability', 'assigned_to']);

        $now = now()->startOfMonth();
        $buckets = [];
        for ($i = 0; $i < $months; $i++) {
            $m = $now->copy()->addMonths($i);
            $buckets[$m->format('Y-m')] = [
                'month'             => $m->format('M Y'),
                'key'               => $m->format('Y-m'),
                'gross_value'       => 0.0,
                'expected_value'    => 0.0,
                'deal_count'        => 0,
            ];
        }
        $beyondKey = 'beyond';
        $buckets[$beyondKey] = [
            'month'          => 'Later',
            'key'            => $beyondKey,
            'gross_value'    => 0.0,
            'expected_value' => 0.0,
            'deal_count'     => 0,
        ];

        $totalExpected = 0.0;
        $totalGross    = 0.0;
        foreach ($rows as $r) {
            $closeAt = $r->check_in ?? $r->created_at?->copy()->addDays(30);
            if (!$closeAt) continue;

            $monthKey = $closeAt->lt($now) ? $now->format('Y-m') : $closeAt->copy()->startOfMonth()->format('Y-m');
            if (!isset($buckets[$monthKey])) {
                $monthKey = $beyondKey;
            }

            $prob = $r->ai_win_probability
                ?? $r->pipelineStage?->default_win_probability
                ?? 25;
            $prob = max(0, min(100, (int) $prob));
            $expected = (float) $r->total_value * ($prob / 100);

            $buckets[$monthKey]['gross_value']    += (float) $r->total_value;
            $buckets[$monthKey]['expected_value'] += $expected;
            $buckets[$monthKey]['deal_count']     += 1;

            $totalGross    += (float) $r->total_value;
            $totalExpected += $expected;
        }

        return response()->json([
            'buckets'        => array_values($buckets),
            'total_gross'    => round($totalGross, 2),
            'total_expected' => round($totalExpected, 2),
            'months'         => $months,
        ]);
    }

    /**
     * GET /v1/admin/reporting/lost-reasons — funnel-leak breakdown.
     *
     * Counts lost inquiries grouped by reason over the requested
     * window. Returns label + count + lost-value so the operator can
     * see "we leaked €40k to Price last quarter".
     */
    public function lostReasons(Request $request): JsonResponse
    {
        $months = max(1, min(24, (int) $request->get('months', 6)));
        $since = now()->subMonths($months);

        $rows = Inquiry::select(
                'lost_reason_id',
                DB::raw('count(*) as count'),
                DB::raw('coalesce(sum(total_value),0) as lost_value'),
            )
            ->where('status', 'Lost')
            ->where('updated_at', '>=', $since)
            ->groupBy('lost_reason_id')
            ->get();

        $reasonLabels = InquiryLostReason::pluck('label', 'id');

        $unspecifiedCount = 0;
        $unspecifiedValue = 0.0;
        $reasons = [];

        foreach ($rows as $r) {
            if (!$r->lost_reason_id) {
                $unspecifiedCount += (int) $r->count;
                $unspecifiedValue += (float) $r->lost_value;
                continue;
            }
            $label = $reasonLabels[$r->lost_reason_id] ?? 'Unknown';
            $reasons[] = [
                'label'      => $label,
                'count'      => (int) $r->count,
                'lost_value' => (float) $r->lost_value,
            ];
        }

        if ($unspecifiedCount > 0) {
            $reasons[] = [
                'label'      => 'Unspecified',
                'count'      => $unspecifiedCount,
                'lost_value' => $unspecifiedValue,
            ];
        }

        usort($reasons, fn ($a, $b) => $b['count'] <=> $a['count']);

        $totalLost = array_sum(array_column($reasons, 'count'));
        $totalLostValue = array_sum(array_column($reasons, 'lost_value'));

        return response()->json([
            'reasons'         => $reasons,
            'total_count'     => $totalLost,
            'total_value'     => round($totalLostValue, 2),
            'months'          => $months,
        ]);
    }

    /**
     * GET /v1/admin/reporting/source-attribution — where deals come from.
     *
     * Per-source: total inquiries, won count, lost count, win-rate,
     * and won-value. Lets the team see which channel returns the most
     * revenue per inquiry.
     */
    public function sourceAttribution(Request $request): JsonResponse
    {
        $months = max(1, min(24, (int) $request->get('months', 6)));
        $since = now()->subMonths($months);

        $rows = Inquiry::select(
                DB::raw("coalesce(source, 'unknown') as source"),
                DB::raw('count(*) as count'),
                DB::raw("count(*) filter (where status = 'Confirmed') as won"),
                DB::raw("count(*) filter (where status = 'Lost') as lost"),
                DB::raw("coalesce(sum(total_value) filter (where status = 'Confirmed'), 0) as won_value"),
            )
            ->where('created_at', '>=', $since)
            ->groupBy(DB::raw("coalesce(source, 'unknown')"))
            ->orderByDesc(DB::raw('count(*)'))
            ->get();

        $sources = $rows->map(function ($r) {
            $closed = (int) $r->won + (int) $r->lost;
            return [
                'source'       => $r->source,
                'count'        => (int) $r->count,
                'won'          => (int) $r->won,
                'lost'         => (int) $r->lost,
                'won_value'    => (float) $r->won_value,
                'win_rate_pct' => $closed > 0 ? round((int) $r->won / $closed * 100, 1) : null,
            ];
        });

        return response()->json([
            'sources' => $sources,
            'months'  => $months,
        ]);
    }

    /**
     * GET /v1/admin/reporting/owner-activity — per-rep scoreboard.
     *
     * Activities logged + tasks completed + open + won + lost counts
     * per assigned_to user, last N days. The assigned_to column on
     * inquiries holds a string (legacy) — we group by it directly so
     * names render whether the org reassigned the field to user_id
     * or not.
     */
    public function ownerActivity(Request $request): JsonResponse
    {
        $days = max(1, min(180, (int) $request->get('days', 30)));
        $since = now()->subDays($days);

        // Activities by creator (via inquiry → assigned_to bridges
        // back through joins that aren't reliable here, so we report
        // by the user who *logged* the activity rather than the deal
        // owner — that's the metric you actually want for "who's
        // actively working the pipeline").
        $activityRows = Activity::select(
                'created_by',
                DB::raw('count(*) as activities'),
                DB::raw("count(*) filter (where type = 'task_completed') as tasks_done"),
            )
            ->where('occurred_at', '>=', $since)
            ->whereNotNull('created_by')
            ->groupBy('created_by')
            ->with('creator:id,name')
            ->get();

        // Inquiries by assigned_to. assigned_to is a string field today
        // (free-text owner name) so we group by name directly.
        $inquiryRows = Inquiry::select(
                'assigned_to',
                DB::raw('count(*) as total'),
                DB::raw("count(*) filter (where status = 'Confirmed') as won"),
                DB::raw("count(*) filter (where status = 'Lost') as lost"),
                DB::raw("count(*) filter (where status not in ('Confirmed','Lost')) as open"),
            )
            ->where('created_at', '>=', $since)
            ->whereNotNull('assigned_to')
            ->groupBy('assigned_to')
            ->get()
            ->keyBy(fn ($r) => strtolower(trim((string) $r->assigned_to)));

        $owners = [];
        foreach ($activityRows as $r) {
            $name = $r->creator?->name ?? "User #{$r->created_by}";
            $key = strtolower(trim($name));
            $iq = $inquiryRows[$key] ?? null;
            $owners[$key] = [
                'name'        => $name,
                'activities'  => (int) $r->activities,
                'tasks_done'  => (int) $r->tasks_done,
                'inquiries'   => $iq ? (int) $iq->total : 0,
                'open'        => $iq ? (int) $iq->open : 0,
                'won'         => $iq ? (int) $iq->won : 0,
                'lost'        => $iq ? (int) $iq->lost : 0,
            ];
        }

        // Add owners that have inquiries but no activities — they
        // exist on the leaderboard, just at zero on the activity side.
        foreach ($inquiryRows as $key => $iq) {
            if (isset($owners[$key])) continue;
            $owners[$key] = [
                'name'        => $iq->assigned_to,
                'activities'  => 0,
                'tasks_done'  => 0,
                'inquiries'   => (int) $iq->total,
                'open'        => (int) $iq->open,
                'won'         => (int) $iq->won,
                'lost'        => (int) $iq->lost,
            ];
        }

        $owners = array_values($owners);
        usort($owners, fn ($a, $b) => $b['activities'] <=> $a['activities']);

        return response()->json([
            'owners' => $owners,
            'days'   => $days,
        ]);
    }

    /**
     * GET /v1/admin/reporting/company-ltv — top corporate accounts by
     * confirmed-revenue + open-pipeline. Drives the "where does our
     * business come from" panel + the Companies page LTV column.
     */
    public function companyLtv(Request $request): JsonResponse
    {
        $limit = max(5, min(50, (int) $request->get('limit', 15)));

        $rows = CorporateAccount::query()
            ->withCount(['inquiries', 'reservations'])
            ->withSum(['reservations as confirmed_revenue' => fn ($q) => $q->where('status', 'Confirmed')], 'total_amount')
            ->withSum(['inquiries as open_pipeline_value' => fn ($q) => $q->whereNotIn('status', ['Confirmed', 'Lost'])], 'total_value')
            ->orderByDesc('confirmed_revenue')
            ->limit($limit)
            ->get(['id', 'company_name', 'industry', 'status', 'credit_limit', 'contract_end']);

        $rows->each(function ($r) {
            $r->confirmed_revenue   = (float) ($r->confirmed_revenue ?? 0);
            $r->open_pipeline_value = (float) ($r->open_pipeline_value ?? 0);
        });

        return response()->json([
            'companies' => $rows,
            'limit'     => $limit,
        ]);
    }
}
