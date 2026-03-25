<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    // ───────────────────────────────────────────────
    //  Standardized metric definitions
    // ───────────────────────────────────────────────

    /** Total enrolled members (active or inactive). */
    public function totalMembers(): int
    {
        return LoyaltyMember::count();
    }

    /** Members with is_active = true. */
    public function activeMembers(): int
    {
        return LoyaltyMember::where('is_active', true)->count();
    }

    /** Members who earned or redeemed within the last N days. */
    public function engagedMembers(int $days = 30): int
    {
        return LoyaltyMember::where('is_active', true)
            ->where('last_activity_at', '>=', now()->subDays($days))
            ->count();
    }

    /** Members who have earned at least once in the period. */
    public function earningMembers(\DateTimeInterface $from, \DateTimeInterface $to): int
    {
        return LoyaltyMember::whereHas('pointsTransactions', function ($q) use ($from, $to) {
            $q->where('points', '>', 0)->whereBetween('created_at', [$from, $to]);
        })->count();
    }

    /** Members who have redeemed at least once in the period. */
    public function redeemingMembers(\DateTimeInterface $from, \DateTimeInterface $to): int
    {
        return LoyaltyMember::whereHas('pointsTransactions', function ($q) use ($from, $to) {
            $q->where('type', 'redeem')->whereBetween('created_at', [$from, $to]);
        })->count();
    }

    /** Total outstanding redeemable points. */
    public function totalOutstandingPoints(): int
    {
        return (int) LoyaltyMember::where('is_active', true)->sum('current_points');
    }

    /** Point liability in estimated currency. */
    public function pointLiabilityCurrency(): float
    {
        $rate = LoyaltyTier::avg('points_to_currency_rate') ?: 0.01;
        return round($this->totalOutstandingPoints() * $rate, 2);
    }

    /** Redemption rate = redeemed / (earned + redeemed) in period. */
    public function redemptionRate(\DateTimeInterface $from, \DateTimeInterface $to): float
    {
        $earned = PointsTransaction::where('points', '>', 0)
            ->where('is_reversed', false)
            ->whereBetween('created_at', [$from, $to])
            ->sum('points');

        $redeemed = PointsTransaction::where('type', 'redeem')
            ->where('is_reversed', false)
            ->whereBetween('created_at', [$from, $to])
            ->sum(DB::raw('ABS(points)'));

        $total = $earned + $redeemed;
        return $total > 0 ? round($redeemed / $total * 100, 1) : 0;
    }

    // ───────────────────────────────────────────────
    //  Dashboard KPIs — uses standardized metrics
    // ───────────────────────────────────────────────

    public function getDashboardKpis(): array
    {
        $now = now();
        $monthStart = $now->copy()->startOfMonth();
        $lastMonthStart = $now->copy()->subMonth()->startOfMonth();
        $lastMonthEnd = $now->copy()->subMonth()->endOfMonth();
        $todayStart = $now->copy()->startOfDay();

        $pointsIssuedThisMonth = PointsTransaction::where('points', '>', 0)
            ->where('is_reversed', false)
            ->where('created_at', '>=', $monthStart)
            ->sum('points');

        $pointsRedeemedThisMonth = PointsTransaction::where('type', 'redeem')
            ->where('is_reversed', false)
            ->where('created_at', '>=', $monthStart)
            ->sum(DB::raw('ABS(points)'));

        return [
            // Standardized counts
            'total_members'              => $this->totalMembers(),
            'active_members'             => $this->activeMembers(),
            'engaged_members_30d'        => $this->engagedMembers(30),

            // Period metrics
            'new_members_this_month'     => LoyaltyMember::where('joined_at', '>=', $monthStart)->count(),
            'new_members_last_month'     => LoyaltyMember::whereBetween('joined_at', [$lastMonthStart, $lastMonthEnd])->count(),
            'points_issued_this_month'   => $pointsIssuedThisMonth,
            'points_redeemed_this_month' => $pointsRedeemedThisMonth,

            // Today at a glance
            'new_members_today'          => LoyaltyMember::where('joined_at', '>=', $todayStart)->count(),
            'points_issued_today'        => PointsTransaction::where('points', '>', 0)
                ->where('is_reversed', false)
                ->where('created_at', '>=', $todayStart)->sum('points'),
            'points_redeemed_today'      => PointsTransaction::where('type', 'redeem')
                ->where('is_reversed', false)
                ->where('created_at', '>=', $todayStart)->sum(DB::raw('ABS(points)')),

            // Operations
            'active_stays'               => Booking::where('status', 'checked_in')->count(),
            'revenue_this_month'         => Booking::where('created_at', '>=', $monthStart)->sum('total_amount'),

            // Financial
            'total_outstanding_points'   => $this->totalOutstandingPoints(),
            'point_liability_currency'   => $this->pointLiabilityCurrency(),
            'redemption_rate'            => $this->redemptionRate($monthStart, $now),

            // Distribution
            'tier_distribution'          => $this->getTierDistribution(),
            'avg_points_per_member'      => round(LoyaltyMember::where('is_active', true)->avg('current_points') ?? 0),
        ];
    }

    public function getTierDistribution(): array
    {
        return LoyaltyTier::leftJoin('loyalty_members', function ($join) {
                $join->on('loyalty_tiers.id', '=', 'loyalty_members.tier_id')
                     ->where('loyalty_members.is_active', true);
            })
            ->select(
                'loyalty_tiers.id',
                'loyalty_tiers.name as tier',
                'loyalty_tiers.color_hex as color',
                DB::raw('COUNT(loyalty_members.id) as count')
            )
            ->where('loyalty_tiers.is_active', true)
            ->groupBy('loyalty_tiers.id', 'loyalty_tiers.name', 'loyalty_tiers.color_hex')
            ->orderBy('loyalty_tiers.sort_order')
            ->get()
            ->toArray();
    }

    public function getPointsOverTime(int $days = 30): array
    {
        return PointsTransaction::select(
                DB::raw('DATE(created_at) as date'),
                DB::raw("SUM(CASE WHEN points > 0 AND is_reversed = false THEN points ELSE 0 END) as earned"),
                DB::raw("SUM(CASE WHEN type = 'redeem' AND is_reversed = false THEN ABS(points) ELSE 0 END) as redeemed")
            )
            ->where('created_at', '>=', now()->subDays($days))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->toArray();
    }

    public function getMemberGrowth(int $months = 12): array
    {
        return LoyaltyMember::select(
                DB::raw("EXTRACT(YEAR FROM joined_at)::int as year"),
                DB::raw("EXTRACT(MONTH FROM joined_at)::int as month"),
                DB::raw('COUNT(*) as new_members')
            )
            ->where('joined_at', '>=', now()->subMonths($months))
            ->groupBy('year', 'month')
            ->orderBy('year')
            ->orderBy('month')
            ->get()
            ->map(fn($row) => [
                'date'        => sprintf('%d-%02d', $row->year, $row->month),
                'new_members' => $row->new_members,
            ])
            ->toArray();
    }

    public function getTopMembers(int $limit = 10): array
    {
        return LoyaltyMember::with(['user:id,name,email', 'tier:id,name,color_hex'])
            ->where('is_active', true)
            ->orderByDesc('lifetime_points')
            ->limit($limit)
            ->get()
            ->map(fn($m) => [
                'id'              => $m->id,
                'member_number'   => $m->member_number,
                'name'            => $m->user->name,
                'email'           => $m->user->email,
                'tier'            => $m->tier->name,
                'tier_color'      => $m->tier->color_hex,
                'lifetime_points' => $m->lifetime_points,
                'current_points'  => $m->current_points,
                'qualifying_points' => $m->qualifying_points,
            ])
            ->toArray();
    }

    public function getRevenueByRoomType(): array
    {
        return Booking::select('room_type', DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as stays'))
            ->whereNotNull('room_type')
            ->groupBy('room_type')
            ->orderByDesc('revenue')
            ->get()
            ->toArray();
    }

    public function getWeeklyKpiSummary(): array
    {
        $weekStart = now()->startOfWeek();
        $lastWeekStart = now()->subWeek()->startOfWeek();
        $lastWeekEnd = now()->subWeek()->endOfWeek();

        $buildPeriod = fn($from, $to) => [
            'new_members'     => LoyaltyMember::whereBetween('joined_at', [$from, $to])->count(),
            'points_issued'   => PointsTransaction::where('points', '>', 0)->where('is_reversed', false)->whereBetween('created_at', [$from, $to])->sum('points'),
            'points_redeemed' => PointsTransaction::where('type', 'redeem')->where('is_reversed', false)->whereBetween('created_at', [$from, $to])->sum(DB::raw('ABS(points)')),
            'new_bookings'    => Booking::whereBetween('created_at', [$from, $to])->count(),
            'revenue'         => Booking::whereBetween('created_at', [$from, $to])->sum('total_amount'),
        ];

        return [
            'week'              => $buildPeriod($weekStart, now()),
            'last_week'         => $buildPeriod($lastWeekStart, $lastWeekEnd),
            'tier_distribution' => $this->getTierDistribution(),
            'top_members'       => $this->getTopMembers(5),
        ];
    }

    /**
     * Point expiry forecast — how many points expire per month.
     */
    public function getExpiryForecast(int $months = 6): array
    {
        return PointExpiryBucket::where('is_expired', false)
            ->where('remaining_points', '>', 0)
            ->where('expires_at', '<=', now()->addMonths($months))
            ->selectRaw("TO_CHAR(expires_at, 'YYYY-MM') as month, SUM(remaining_points) as points, COUNT(DISTINCT member_id) as members")
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->toArray();
    }

    /**
     * Revenue trend over time (monthly).
     */
    public function getRevenueTrend(int $months = 12): array
    {
        return Booking::selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, SUM(total_amount) as revenue, COUNT(*) as bookings")
            ->where('created_at', '>=', now()->subMonths($months))
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->toArray();
    }

    /**
     * Booking trends (daily) for a given period.
     */
    public function getBookingTrends(int $days = 30): array
    {
        return Booking::selectRaw("DATE(created_at) as date, COUNT(*) as bookings, SUM(total_amount) as revenue, SUM(nights) as nights")
            ->where('created_at', '>=', now()->subDays($days))
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->toArray();
    }

    /**
     * Member engagement breakdown: active, inactive, new, at-risk.
     */
    public function getMemberEngagement(): array
    {
        $now = now();
        $total = LoyaltyMember::count();
        $active = LoyaltyMember::where('is_active', true)
            ->where('last_activity_at', '>=', $now->copy()->subDays(30))
            ->count();
        $atRisk = LoyaltyMember::where('is_active', true)
            ->where('last_activity_at', '<', $now->copy()->subDays(30))
            ->where('last_activity_at', '>=', $now->copy()->subDays(90))
            ->count();
        $dormant = LoyaltyMember::where('is_active', true)
            ->where(function ($q) use ($now) {
                $q->where('last_activity_at', '<', $now->copy()->subDays(90))
                  ->orWhereNull('last_activity_at');
            })
            ->count();
        $newMembers = LoyaltyMember::where('joined_at', '>=', $now->copy()->subDays(30))->count();
        $inactive = LoyaltyMember::where('is_active', false)->count();

        return [
            ['segment' => 'Active', 'count' => $active, 'color' => '#32d74b'],
            ['segment' => 'New (30d)', 'count' => $newMembers, 'color' => '#6366f1'],
            ['segment' => 'At Risk', 'count' => $atRisk, 'color' => '#f59e0b'],
            ['segment' => 'Dormant', 'count' => $dormant, 'color' => '#ef4444'],
            ['segment' => 'Inactive', 'count' => $inactive, 'color' => '#636366'],
        ];
    }

    /**
     * Points balance distribution — how many members in each points range.
     */
    public function getPointsDistribution(): array
    {
        $ranges = [
            ['label' => '0', 'min' => 0, 'max' => 0],
            ['label' => '1-500', 'min' => 1, 'max' => 500],
            ['label' => '501-2k', 'min' => 501, 'max' => 2000],
            ['label' => '2k-5k', 'min' => 2001, 'max' => 5000],
            ['label' => '5k-10k', 'min' => 5001, 'max' => 10000],
            ['label' => '10k+', 'min' => 10001, 'max' => 999999999],
        ];

        return collect($ranges)->map(function ($r) {
            return [
                'range' => $r['label'],
                'members' => LoyaltyMember::where('is_active', true)
                    ->whereBetween('current_points', [$r['min'], $r['max']])
                    ->count(),
            ];
        })->toArray();
    }

    /**
     * Redemption rate over time (monthly).
     */
    public function getRedemptionTrend(int $months = 12): array
    {
        $result = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $from = now()->subMonths($i)->startOfMonth();
            $to = now()->subMonths($i)->endOfMonth();

            $earned = PointsTransaction::where('points', '>', 0)
                ->where('is_reversed', false)
                ->whereBetween('created_at', [$from, $to])
                ->sum('points');

            $redeemed = PointsTransaction::where('type', 'redeem')
                ->where('is_reversed', false)
                ->whereBetween('created_at', [$from, $to])
                ->sum(DB::raw('ABS(points)'));

            $total = $earned + $redeemed;
            $result[] = [
                'month' => $from->format('Y-m'),
                'earned' => (int) $earned,
                'redeemed' => (int) $redeemed,
                'rate' => $total > 0 ? round($redeemed / $total * 100, 1) : 0,
            ];
        }
        return $result;
    }

    /**
     * Avg stay duration and avg spend per booking over time.
     */
    public function getBookingMetrics(int $months = 12): array
    {
        return Booking::selectRaw("TO_CHAR(created_at, 'YYYY-MM') as month, AVG(nights) as avg_nights, AVG(total_amount) as avg_spend, COUNT(*) as bookings")
            ->where('created_at', '>=', now()->subMonths($months))
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->map(fn($r) => [
                'month' => $r->month,
                'avg_nights' => round($r->avg_nights, 1),
                'avg_spend' => round($r->avg_spend, 0),
                'bookings' => $r->bookings,
            ])
            ->toArray();
    }
}
