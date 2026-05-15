<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Models\VenueBooking;
use App\Services\AnalyticsService;
use App\Models\LoyaltyMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AnalyticsController extends Controller
{
    public function __construct(protected AnalyticsService $analytics) {}

    public function overview(): JsonResponse
    {
        return response()->json([
            'kpis'              => $this->analytics->getDashboardKpis(),
            'tier_distribution' => $this->analytics->getTierDistribution(),
            'top_members'       => $this->analytics->getTopMembers(5),
        ]);
    }

    public function points(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getPointsOverTime($request->get('days', 30)));
    }

    public function memberGrowth(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getMemberGrowth($request->get('months', 12)));
    }

    public function cohortRetention(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getCohortRetention((int) $request->get('months', 6)));
    }

    public function atRiskMembers(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getAtRiskMembers(
            (int) $request->get('days', 60),
            (int) $request->get('limit', 50),
        ));
    }

    public function tierMovement(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getTierMovement((int) $request->get('days', 90)));
    }

    public function revenue(): JsonResponse
    {
        return response()->json($this->analytics->getRevenueByRoomType());
    }

    public function revenueTrend(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getRevenueTrend($request->get('months', 12)));
    }

    public function bookingTrends(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingTrends($request->get('days', 30)));
    }

    public function engagement(): JsonResponse
    {
        return response()->json($this->analytics->getMemberEngagement());
    }

    public function pointsDistribution(): JsonResponse
    {
        return response()->json($this->analytics->getPointsDistribution());
    }

    public function redemptionTrend(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getRedemptionTrend($request->get('months', 12)));
    }

    public function bookingMetrics(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingMetrics($request->get('months', 12)));
    }

    /** GET /v1/admin/analytics/hotel-ops?days=N — occupancy/ADR/RevPAR over a window. */
    public function hotelOps(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getHotelOpsKpis($request->get('days', 30)));
    }

    public function expiryForecast(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getExpiryForecast($request->get('months', 6)));
    }

    // ─── CRM Analytics Endpoints ─────────────────────────────────────────────

    public function crmTrends(Request $request): JsonResponse
    {
        $period = $request->get('period', 'months6');
        $isPg = DB::getDriverName() === 'pgsql';

        [$from, $pgFmt, $myFmt] = match ($period) {
            'days14'   => [now()->subDays(14)->toDateString(), 'YYYY-MM-DD', '%Y-%m-%d'],
            'weeks6'   => [now()->subWeeks(6)->startOfWeek()->toDateString(), $isPg ? 'IYYY-IW' : '%x-%v', '%x-%v'],
            'months6'  => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m'],
            'months12' => [now()->subMonths(12)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m'],
            default    => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m'],
        };

        $periodSql = fn(string $col) => $isPg
            ? "to_char({$col}, '{$pgFmt}')"
            : "DATE_FORMAT({$col}, '{$myFmt}')";

        $newGuests = Guest::select(DB::raw($periodSql('created_at') . ' as period'), DB::raw('count(*) as count'))
            ->where('created_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $newInquiries = Inquiry::select(DB::raw($periodSql('created_at') . ' as period'), DB::raw('count(*) as count'))
            ->where('created_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $confirmedInquiries = Inquiry::select(DB::raw($periodSql('updated_at') . ' as period'), DB::raw('count(*) as count'))
            ->where('status', 'Confirmed')->where('updated_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $revenue = Reservation::select(DB::raw($periodSql('check_in') . ' as period'), DB::raw('coalesce(sum(total_amount),0) as total'))
            ->whereIn('status', ['Confirmed', 'Checked In', 'Checked Out'])->where('check_in', '>=', $from)
            ->groupBy('period')->pluck('total', 'period');

        $allPeriods = collect($newGuests->keys())->merge($newInquiries->keys())->merge($revenue->keys())->unique()->sort()->values();

        $data = $allPeriods->map(fn($p) => [
            'period'              => $p,
            'new_guests'          => $newGuests[$p] ?? 0,
            'new_inquiries'       => $newInquiries[$p] ?? 0,
            'confirmed_inquiries' => $confirmedInquiries[$p] ?? 0,
            'revenue'             => (float) ($revenue[$p] ?? 0),
        ]);

        return response()->json($data);
    }

    public function inquiryPipeline(): JsonResponse
    {
        $total = Inquiry::count() ?: 1;
        $data = Inquiry::select('status', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_value),0) as value'))
            ->groupBy('status')
            ->orderByDesc('count')
            ->get()
            ->map(fn($r) => ['status' => $r->status, 'count' => $r->count, 'value' => (float) $r->value, 'pct' => round($r->count / $total * 100, 1)]);
        return response()->json($data);
    }

    /**
     * GET /v1/admin/analytics/inquiry-funnel — ordered conversion funnel.
     *
     * Distinct from `inquiryPipeline` (status counts as a pie):
     * this returns stages in pipeline order with the conversion rate
     * from the previous stage. Win-rate is computed as
     * Confirmed / (Confirmed + Lost) so abandoned inquiries don't
     * dilute the metric.
     */
    public function inquiryFunnel(Request $request): JsonResponse
    {
        $months = (int) $request->get('months', 6);
        $since = now()->subMonths($months);

        // Stage order — matches the visual pipeline. Status names that
        // a tenant has renamed will simply not appear in the funnel,
        // which is the right failure mode (better than mis-grouping).
        $stages = ['New', 'Responded', 'Site Visit', 'Proposal Sent', 'Negotiating', 'Tentative', 'Confirmed'];

        $rows = Inquiry::select('status', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_value),0) as value'))
            ->where('created_at', '>=', $since)
            ->whereIn('status', array_merge($stages, ['Lost']))
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $confirmed = (int) ($rows['Confirmed']->count ?? 0);
        $lost      = (int) ($rows['Lost']->count ?? 0);
        $winRate   = ($confirmed + $lost) > 0 ? round($confirmed / ($confirmed + $lost) * 100, 1) : 0;

        // The funnel walks forward through the stage list. At each
        // stage the count is "everyone who reached this stage OR
        // beyond" — modelled by summing this stage's count + all
        // downstream counts. That matches how managers think: of
        // 100 New inquiries, 60 Responded, 30 reached Proposal Sent,
        // etc. Without this rollup the pie would mislead because
        // bookings that already converted leave the New bucket.
        $funnel = [];
        $cumulativeForward = 0;
        $stageRollups = [];
        foreach (array_reverse($stages) as $stage) {
            $cumulativeForward += (int) ($rows[$stage]->count ?? 0);
            $stageRollups[$stage] = $cumulativeForward;
        }

        $first = $stageRollups[$stages[0]] ?? 0;
        foreach ($stages as $i => $stage) {
            $reachedHere = $stageRollups[$stage] ?? 0;
            $reachedPrev = $i === 0 ? $reachedHere : ($stageRollups[$stages[$i - 1]] ?? $reachedHere);
            $stepRate = $reachedPrev > 0 ? round($reachedHere / $reachedPrev * 100, 1) : 0;
            $overall  = $first > 0 ? round($reachedHere / $first * 100, 1) : 0;
            $funnel[] = [
                'stage'           => $stage,
                'count'           => $reachedHere,
                'value'           => (float) ($rows[$stage]->value ?? 0),
                'rate_from_prev'  => $stepRate,
                'rate_from_start' => $overall,
            ];
        }

        // Avg days from creation to Confirmed — the time-to-close metric
        // sales managers obsess over. Lost inquiries excluded; only
        // those that closed-won contribute to the average.
        $avgClose = Inquiry::where('status', 'Confirmed')
            ->where('created_at', '>=', $since)
            ->whereNotNull('updated_at')
            ->get(['created_at', 'updated_at'])
            ->map(fn ($r) => $r->created_at->diffInDays($r->updated_at))
            ->filter(fn ($d) => $d >= 0)
            ->avg();

        return response()->json([
            'months'              => $months,
            'stages'              => $funnel,
            'won'                 => $confirmed,
            'lost'                => $lost,
            'win_rate_pct'        => $winRate,
            'avg_days_to_close'   => $avgClose !== null ? round($avgClose, 1) : null,
        ]);
    }

    public function bookingChannels(): JsonResponse
    {
        $data = Reservation::select('booking_channel', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_amount),0) as revenue'))
            ->whereNotNull('booking_channel')
            ->groupBy('booking_channel')
            ->orderByDesc('revenue')
            ->get()
            ->map(fn($r) => ['channel' => $r->booking_channel, 'count' => $r->count, 'revenue' => (float) $r->revenue]);
        return response()->json($data);
    }

    public function revenueComparison(): JsonResponse
    {
        $currentStart = now()->startOfMonth()->toDateString();
        $currentEnd = now()->endOfMonth()->toDateString();
        $prevStart = now()->subMonth()->startOfMonth()->toDateString();
        $prevEnd = now()->subMonth()->endOfMonth()->toDateString();

        $current = $this->monthStats($currentStart, $currentEnd);
        $previous = $this->monthStats($prevStart, $prevEnd);

        $pct = fn($c, $p) => $p > 0 ? round(($c - $p) / $p * 100, 1) : 0;

        return response()->json([
            'current'  => $current,
            'previous' => $previous,
            'changes'  => [
                'revenue_pct'  => $pct($current['total_revenue'], $previous['total_revenue']),
                'bookings_pct' => $pct($current['total_bookings'], $previous['total_bookings']),
                'rate_pct'     => $pct($current['avg_rate'], $previous['avg_rate']),
                'guests_pct'   => $pct($current['new_guests'], $previous['new_guests']),
            ],
        ]);
    }

    public function occupancyTrend(Request $request): JsonResponse
    {
        $period = $request->get('period', 'months6');
        $isPg = DB::getDriverName() === 'pgsql';

        [$from, $pgFmt, $myFmt, $fixedDays] = match ($period) {
            'days14'   => [now()->subDays(14)->toDateString(), 'YYYY-MM-DD', '%Y-%m-%d', 1],
            'weeks6'   => [now()->subWeeks(6)->startOfWeek()->toDateString(), $isPg ? 'IYYY-IW' : '%x-%v', '%x-%v', 7],
            'months6'  => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m', null],
            'months12' => [now()->subMonths(12)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m', null],
            default    => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', '%Y-%m', null],
        };

        $periodSql = $isPg ? "to_char(check_in, '{$pgFmt}')" : "DATE_FORMAT(check_in, '{$myFmt}')";
        $dateDiffSql = $isPg
            ? "(check_out::date - check_in::date)"
            : "DATEDIFF(check_out, check_in)";

        $totalRooms = DB::table('properties')->where('is_active', true)->sum('total_rooms');

        $occupied = Reservation::select(
                DB::raw("{$periodSql} as period"),
                DB::raw("sum(coalesce(num_nights, {$dateDiffSql}) * coalesce(num_rooms,1)) as occupied_nights")
            )
            ->whereIn('status', ['Confirmed', 'Checked In', 'Checked Out'])
            ->where('check_in', '>=', $from)
            ->groupBy('period')
            ->pluck('occupied_nights', 'period');

        $data = $occupied->keys()->sort()->values()->map(function ($p) use ($occupied, $totalRooms, $fixedDays) {
            $occ = (int) ($occupied[$p] ?? 0);
            if ($fixedDays) {
                $periodDays = $fixedDays;
            } else {
                $parts = explode('-', $p);
                $periodDays = cal_days_in_month(CAL_GREGORIAN, (int) $parts[1], (int) $parts[0]);
            }
            $capacity = $totalRooms * $periodDays;
            return [
                'period'         => $p,
                'occupied_nights'=> $occ,
                'total_capacity' => $capacity,
                'occupancy_rate' => $capacity > 0 ? round($occ / $capacity * 100, 1) : 0,
            ];
        });

        return response()->json($data);
    }

    public function vipDistribution(): JsonResponse
    {
        $data = Guest::select('vip_level as level', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_revenue),0) as revenue'))
            ->whereNotNull('vip_level')
            ->groupBy('vip_level')
            ->orderByDesc('revenue')
            ->get();
        return response()->json($data);
    }

    public function nationalityBreakdown(): JsonResponse
    {
        $total = Guest::count() ?: 1;
        $data = Guest::select('nationality', DB::raw('count(*) as count'))
            ->whereNotNull('nationality')
            ->groupBy('nationality')
            ->orderByDesc('count')
            ->limit(20)
            ->get()
            ->map(fn($r) => ['nationality' => $r->nationality, 'count' => $r->count, 'pct' => round($r->count / $total * 100, 1)]);
        return response()->json($data);
    }

    public function venueUtilization(): JsonResponse
    {
        $data = VenueBooking::join('venues', 'venue_bookings.venue_id', '=', 'venues.id')
            ->select('venues.venue_type', DB::raw('count(*) as bookings'), DB::raw('coalesce(sum(venue_bookings.rate_charged),0) as revenue'))
            ->groupBy('venues.venue_type')
            ->orderByDesc('bookings')
            ->get();
        return response()->json($data);
    }

    public function revenueByProperty(): JsonResponse
    {
        $data = Reservation::join('properties', 'reservations.property_id', '=', 'properties.id')
            ->select('properties.name', 'properties.code',
                DB::raw('count(*) as bookings'),
                DB::raw('coalesce(sum(total_amount),0) as revenue'),
                DB::raw('round(avg(rate_per_night),2) as avg_rate'))
            ->whereIn('reservations.status', ['Confirmed', 'Checked In', 'Checked Out'])
            ->groupBy('properties.name', 'properties.code')
            ->orderByDesc('revenue')
            ->get();
        return response()->json($data);
    }

    public function export(): StreamedResponse
    {
        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");

            // Section 1: KPIs
            $kpis = $this->analytics->getDashboardKpis();
            fputcsv($out, ['=== KPI Summary ===']);
            foreach ($kpis as $key => $value) {
                fputcsv($out, [str_replace('_', ' ', ucfirst($key)), $value]);
            }
            fputcsv($out, []);

            // Section 2: Tier Distribution
            fputcsv($out, ['=== Tier Distribution ===']);
            fputcsv($out, ['Tier', 'Count']);
            foreach ($this->analytics->getTierDistribution() as $tier) {
                fputcsv($out, [$tier['name'] ?? $tier['tier'] ?? '', $tier['count'] ?? 0]);
            }
            fputcsv($out, []);

            // Section 3: Member Detail
            fputcsv($out, ['=== Member Analytics ===']);
            fputcsv($out, ['ID', 'Member Number', 'Name', 'Email', 'Tier', 'Current Points', 'Lifetime Points', 'Active', 'Joined']);
            LoyaltyMember::with(['user:id,name,email', 'tier:id,name'])
                ->orderByDesc('lifetime_points')
                ->chunk(500, function ($rows) use ($out) {
                    foreach ($rows as $m) {
                        fputcsv($out, [
                            $m->id, $m->member_number, $m->user?->name, $m->user?->email,
                            $m->tier?->name, $m->current_points, $m->lifetime_points,
                            $m->is_active ? 'Yes' : 'No', $m->joined_at?->toDateString(),
                        ]);
                    }
                });

            fclose($out);
        }, 'analytics-report-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * GET /v1/admin/analytics/leads-deep?days=N
     *
     * Sales-pipeline metrics that go beyond what /reports already
     * covers. Returns:
     *   - win_rate_by_source: count/won/win_rate% per source (top 8)
     *   - avg_value_by_source: count/avg_value per source (top 8)
     *   - avg_value_by_owner: count/avg_value per owner (top 8)
     *   - activity_by_owner: calls/emails/meetings/notes per owner (top 8)
     */
    public function leadsDeep(Request $request): JsonResponse
    {
        $days = max(7, min(365, (int) $request->query('days', 30)));
        $from = now()->subDays($days - 1)->startOfDay();

        // Window query: inquiries created in the period.
        $base = fn () => Inquiry::query()->where('created_at', '>=', $from);

        // ── Win rate by source ────────────────────────────────────
        $winRateRows = $base()
            ->whereNotNull('source')
            ->where('source', '!=', '')
            ->selectRaw("source,
                COUNT(*) as total_count,
                SUM(CASE WHEN status = 'Confirmed' THEN 1 ELSE 0 END) as won_count")
            ->groupBy('source')
            ->orderByDesc('total_count')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'source'   => $r->source,
                'total'    => (int) $r->total_count,
                'won'      => (int) $r->won_count,
                'win_rate' => $r->total_count > 0 ? round(($r->won_count / $r->total_count) * 100, 1) : 0,
            ]);

        // ── Avg deal value by source ──────────────────────────────
        $avgValueBySource = $base()
            ->whereNotNull('source')
            ->where('source', '!=', '')
            ->whereNotNull('total_value')
            ->where('total_value', '>', 0)
            ->selectRaw('source, COUNT(*) as cnt, AVG(total_value) as avg_value, SUM(total_value) as total_value')
            ->groupBy('source')
            ->orderByDesc('avg_value')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'source'      => $r->source,
                'count'       => (int) $r->cnt,
                'avg_value'   => round((float) $r->avg_value, 2),
                'total_value' => round((float) $r->total_value, 2),
            ]);

        // ── Avg deal value by owner ───────────────────────────────
        $avgValueByOwner = $base()
            ->whereNotNull('assigned_to')
            ->where('assigned_to', '!=', '')
            ->whereNotNull('total_value')
            ->where('total_value', '>', 0)
            ->selectRaw('assigned_to as owner, COUNT(*) as cnt, AVG(total_value) as avg_value, SUM(total_value) as total_value')
            ->groupBy('assigned_to')
            ->orderByDesc('avg_value')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'owner'       => $r->owner,
                'count'       => (int) $r->cnt,
                'avg_value'   => round((float) $r->avg_value, 2),
                'total_value' => round((float) $r->total_value, 2),
            ]);

        // ── Activity volume per owner ─────────────────────────────
        // Joins activities ← inquiries to attribute by the inquiry's
        // current owner. Activities table is append-only so the
        // window matches the activity timestamp.
        $activityRows = DB::table('activities')
            ->join('inquiries', 'activities.inquiry_id', '=', 'inquiries.id')
            ->where('activities.occurred_at', '>=', $from)
            ->whereNotNull('inquiries.assigned_to')
            ->where('inquiries.assigned_to', '!=', '')
            ->selectRaw("inquiries.assigned_to as owner,
                SUM(CASE WHEN activities.type = 'call'    THEN 1 ELSE 0 END) as calls,
                SUM(CASE WHEN activities.type = 'email'   THEN 1 ELSE 0 END) as emails,
                SUM(CASE WHEN activities.type = 'meeting' THEN 1 ELSE 0 END) as meetings,
                SUM(CASE WHEN activities.type = 'note'    THEN 1 ELSE 0 END) as notes,
                COUNT(*) as total")
            ->groupBy('inquiries.assigned_to')
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'owner'    => $r->owner,
                'calls'    => (int) $r->calls,
                'emails'   => (int) $r->emails,
                'meetings' => (int) $r->meetings,
                'notes'    => (int) $r->notes,
                'total'    => (int) $r->total,
            ]);

        return response()->json([
            'period_days'         => $days,
            'win_rate_by_source'  => $winRateRows,
            'avg_value_by_source' => $avgValueBySource,
            'avg_value_by_owner'  => $avgValueByOwner,
            'activity_by_owner'   => $activityRows,
        ]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function monthStats(string $from, string $to): array
    {
        $res = Reservation::whereIn('status', ['Confirmed', 'Checked In', 'Checked Out'])
            ->whereBetween('check_in', [$from, $to]);

        return [
            'total_revenue'  => round((float) (clone $res)->sum('total_amount'), 2),
            'total_bookings' => (clone $res)->count(),
            'avg_rate'       => round((float) (clone $res)->avg('rate_per_night'), 2),
            'new_guests'     => Guest::whereBetween('created_at', [$from, $to])->count(),
        ];
    }
}
