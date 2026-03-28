<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Models\VenueBooking;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    public function expiryForecast(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getExpiryForecast($request->get('months', 6)));
    }

    // ─── CRM Analytics Endpoints ─────────────────────────────────────────────

    public function crmTrends(Request $request): JsonResponse
    {
        $period = $request->get('period', 'months6');
        [$from, $groupFormat] = match ($period) {
            'days14'   => [now()->subDays(14)->toDateString(), 'YYYY-MM-DD'],
            'weeks6'   => [now()->subWeeks(6)->startOfWeek()->toDateString(), 'IYYY-IW'],
            'months6'  => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM'],
            'months12' => [now()->subMonths(12)->startOfMonth()->toDateString(), 'YYYY-MM'],
            default    => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM'],
        };

        $newGuests = Guest::select(DB::raw("to_char(created_at, '$groupFormat') as period"), DB::raw('count(*) as count'))
            ->where('created_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $newInquiries = Inquiry::select(DB::raw("to_char(created_at, '$groupFormat') as period"), DB::raw('count(*) as count'))
            ->where('created_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $confirmedInquiries = Inquiry::select(DB::raw("to_char(updated_at, '$groupFormat') as period"), DB::raw('count(*) as count'))
            ->where('status', 'Confirmed')->where('updated_at', '>=', $from)->groupBy('period')->pluck('count', 'period');

        $revenue = Reservation::select(DB::raw("to_char(check_in, '$groupFormat') as period"), DB::raw('coalesce(sum(total_amount),0) as total'))
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
        [$from, $groupFormat, $fixedDays] = match ($period) {
            'days14'   => [now()->subDays(14)->toDateString(), 'YYYY-MM-DD', 1],
            'weeks6'   => [now()->subWeeks(6)->startOfWeek()->toDateString(), 'IYYY-IW', 7],
            'months6'  => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', null],
            'months12' => [now()->subMonths(12)->startOfMonth()->toDateString(), 'YYYY-MM', null],
            default    => [now()->subMonths(6)->startOfMonth()->toDateString(), 'YYYY-MM', null],
        };

        $totalRooms = DB::table('properties')->where('is_active', true)->sum('total_rooms');

        $occupied = Reservation::select(
                DB::raw("to_char(check_in, '$groupFormat') as period"),
                DB::raw('sum(coalesce(num_nights, (check_out::date - check_in::date)) * coalesce(num_rooms,1)) as occupied_nights')
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
