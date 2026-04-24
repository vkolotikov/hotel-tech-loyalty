<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    // Cache TTLs in seconds
    private const TTL_SHORT  = 300;   // 5 minutes — for KPIs / dashboard
    private const TTL_MEDIUM = 900;   // 15 minutes — for analytics charts
    private const TTL_LONG   = 3600;  // 1 hour — for slow-moving data

    /* ────────────────────────────────────────────────
     *  DB-agnostic SQL helpers (MySQL + PostgreSQL)
     * ──────────────────────────────────────────────── */

    private static function isPostgres(): bool
    {
        return DB::getDriverName() === 'pgsql';
    }

    private static function yearMonthSql(string $column): string
    {
        return self::isPostgres()
            ? "TO_CHAR({$column}, 'YYYY-MM')"
            : "DATE_FORMAT({$column}, '%Y-%m')";
    }

    private static function yearSql(string $column): string
    {
        return self::isPostgres()
            ? "EXTRACT(YEAR FROM {$column})::int"
            : "YEAR({$column})";
    }

    private static function monthSql(string $column): string
    {
        return self::isPostgres()
            ? "EXTRACT(MONTH FROM {$column})::int"
            : "MONTH({$column})";
    }

    private static function dateDiffSql(string $end, string $start): string
    {
        return self::isPostgres()
            ? "({$end}::date - {$start}::date)"
            : "DATEDIFF({$end}, {$start})";
    }

    private static function toCharSql(string $column, string $pgFormat, string $mysqlFormat): string
    {
        return self::isPostgres()
            ? "to_char({$column}, '{$pgFormat}')"
            : "DATE_FORMAT({$column}, '{$mysqlFormat}')";
    }

    // ───────────────────────────────────────────────
    //  Standardized metric definitions
    // ───────────────────────────────────────────────

    public function totalMembers(): int
    {
        return LoyaltyMember::count();
    }

    public function activeMembers(): int
    {
        return LoyaltyMember::where('is_active', true)->count();
    }

    public function engagedMembers(int $days = 30): int
    {
        return LoyaltyMember::where('is_active', true)
            ->where('last_activity_at', '>=', now()->subDays($days))
            ->count();
    }

    public function earningMembers(\DateTimeInterface $from, \DateTimeInterface $to): int
    {
        return LoyaltyMember::whereHas('pointsTransactions', function ($q) use ($from, $to) {
            $q->where('points', '>', 0)->whereBetween('created_at', [$from, $to]);
        })->count();
    }

    public function redeemingMembers(\DateTimeInterface $from, \DateTimeInterface $to): int
    {
        return LoyaltyMember::whereHas('pointsTransactions', function ($q) use ($from, $to) {
            $q->where('type', 'redeem')->whereBetween('created_at', [$from, $to]);
        })->count();
    }

    public function totalOutstandingPoints(): int
    {
        return (int) LoyaltyMember::where('is_active', true)->sum('current_points');
    }

    public function pointLiabilityCurrency(): float
    {
        $rate = LoyaltyTier::avg('points_to_currency_rate') ?: 0.01;
        return round($this->totalOutstandingPoints() * $rate, 2);
    }

    public function redemptionRate(\DateTimeInterface $from, \DateTimeInterface $to): float
    {
        $row = PointsTransaction::where('is_reversed', false)
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as earned")
            ->selectRaw("SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END) as redeemed")
            ->first();

        $earned = (float) ($row->earned ?? 0);
        $redeemed = (float) ($row->redeemed ?? 0);
        $total = $earned + $redeemed;
        return $total > 0 ? round($redeemed / $total * 100, 1) : 0;
    }

    // ───────────────────────────────────────────────
    //  Dashboard KPIs — cached, uses standardized metrics
    // ───────────────────────────────────────────────

    public function getDashboardKpis(): array
    {
        return Cache::remember('dashboard:loyalty_kpis', self::TTL_SHORT, function () {
            $now = now();
            $monthStart = $now->copy()->startOfMonth();
            $lastMonthStart = $now->copy()->subMonth()->startOfMonth();
            $lastMonthEnd = $now->copy()->subMonth()->endOfMonth();
            $todayStart = $now->copy()->startOfDay();

            // Batch points queries: one query for month, one for today
            $monthPoints = PointsTransaction::where('is_reversed', false)
                ->where('created_at', '>=', $monthStart)
                ->selectRaw("SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as issued")
                ->selectRaw("SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END) as redeemed")
                ->first();

            $todayPoints = PointsTransaction::where('is_reversed', false)
                ->where('created_at', '>=', $todayStart)
                ->selectRaw("SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as issued")
                ->selectRaw("SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END) as redeemed")
                ->first();

            // Yesterday's points — needed so the Loyalty tab can render
            // "↑ 12% vs yesterday" delta pills on the Points / Redemptions
            // KPI cards. One query for both sums, bucketed to yesterday only.
            $yesterdayStart = $now->copy()->subDay()->startOfDay();
            $yesterdayPoints = PointsTransaction::where('is_reversed', false)
                ->whereBetween('created_at', [$yesterdayStart, $todayStart])
                ->selectRaw("SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as issued")
                ->selectRaw("SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END) as redeemed")
                ->first();

            // New members joined yesterday — same purpose as above.
            $newMembersYesterday = (int) LoyaltyMember::whereBetween('joined_at', [$yesterdayStart, $todayStart])->count();

            // Percent-change helper. Zero-floor to avoid +∞ / NaN.
            $pct = function ($now, $prev) {
                if ((float) $prev <= 0) return 0;
                return (int) round((($now - $prev) / $prev) * 100);
            };

            // Batch member counts in one query.
            //
            // "engaged" here means a member who has actually done something:
            // earned/holds points OR is linked to a Guest with at least one
            // recorded stay. Everyone else is a "passive_contact" — typically
            // an auto-Bronze record created from a single form fill. The
            // split keeps the dashboard from being misled by the flood of
            // form-fill members the auto-Bronze hook produces.
            $memberStats = LoyaltyMember::selectRaw("COUNT(*) as total")
                ->selectRaw("SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active")
                ->selectRaw("SUM(CASE WHEN is_active = true AND last_activity_at >= ? THEN 1 ELSE 0 END) as engaged_30d", [$now->copy()->subDays(30)])
                ->selectRaw("SUM(CASE WHEN
                        lifetime_points > 0
                        OR current_points > 0
                        OR EXISTS (SELECT 1 FROM guests WHERE guests.member_id = loyalty_members.id AND COALESCE(guests.total_stays, 0) > 0)
                    THEN 1 ELSE 0 END) as engaged_total")
                ->selectRaw("SUM(CASE WHEN joined_at >= ? THEN 1 ELSE 0 END) as new_month", [$monthStart])
                ->selectRaw("SUM(CASE WHEN joined_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as new_last_month", [$lastMonthStart, $lastMonthEnd])
                ->selectRaw("SUM(CASE WHEN joined_at >= ? THEN 1 ELSE 0 END) as new_today", [$todayStart])
                ->selectRaw("AVG(CASE WHEN is_active = true THEN current_points END) as avg_points")
                ->first();

            $total      = (int) $memberStats->total;
            $engagedAll = (int) ($memberStats->engaged_total ?? 0);

            return [
                'total_members'              => $total,
                'active_members'             => (int) $memberStats->active,
                'engaged_members'            => $engagedAll,
                'passive_contacts'           => max(0, $total - $engagedAll),
                'engaged_members_30d'        => (int) ($memberStats->engaged_30d ?? 0),
                'new_members_this_month'     => (int) $memberStats->new_month,
                'new_members_last_month'     => (int) $memberStats->new_last_month,
                'points_issued_this_month'   => (int) ($monthPoints->issued ?? 0),
                'points_redeemed_this_month' => (int) ($monthPoints->redeemed ?? 0),
                'new_members_today'          => (int) $memberStats->new_today,
                'new_members_delta'          => $pct((int) $memberStats->new_today, $newMembersYesterday),
                'points_issued_today'        => (int) ($todayPoints->issued ?? 0),
                'points_issued_delta'        => $pct((int) ($todayPoints->issued ?? 0), (int) ($yesterdayPoints->issued ?? 0)),
                'points_redeemed_today'      => (int) ($todayPoints->redeemed ?? 0),
                'redemptions_delta'          => $pct((int) ($todayPoints->redeemed ?? 0), (int) ($yesterdayPoints->redeemed ?? 0)),
                'active_stays'               => Booking::where('status', 'checked_in')->count(),
                'revenue_this_month'         => Booking::where('created_at', '>=', $monthStart)->sum('total_amount'),
                'total_outstanding_points'   => $this->totalOutstandingPoints(),
                'point_liability_currency'   => $this->pointLiabilityCurrency(),
                'redemption_rate'            => $this->redemptionRate($monthStart, $now),
                'tier_distribution'          => $this->getTierDistribution(),
                'avg_points_per_member'      => round($memberStats->avg_points ?? 0),
            ];
        });
    }

    public function getTierDistribution(): array
    {
        return Cache::remember('analytics:tier_distribution', self::TTL_LONG, function () {
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
        });
    }

    public function getPointsOverTime(int $days = 30): array
    {
        return Cache::remember("analytics:points_over_time:{$days}", self::TTL_SHORT, function () use ($days) {
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
        });
    }

    public function getMemberGrowth(int $months = 12): array
    {
        return Cache::remember("analytics:member_growth:{$months}", self::TTL_MEDIUM, function () use ($months) {
            $yearSql = self::yearSql('joined_at');
            $monthSql = self::monthSql('joined_at');

            return LoyaltyMember::select(
                    DB::raw("{$yearSql} as year"),
                    DB::raw("{$monthSql} as month"),
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
        });
    }

    public function getTopMembers(int $limit = 10): array
    {
        return Cache::remember("analytics:top_members:{$limit}", self::TTL_MEDIUM, function () use ($limit) {
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
        });
    }

    public function getRevenueByRoomType(): array
    {
        return Cache::remember('analytics:revenue_by_room_type', self::TTL_MEDIUM, function () {
            return Booking::select('room_type', DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as stays'))
                ->whereNotNull('room_type')
                ->groupBy('room_type')
                ->orderByDesc('revenue')
                ->get()
                ->toArray();
        });
    }

    public function getWeeklyKpiSummary(): array
    {
        return Cache::remember('analytics:weekly_kpi_summary', self::TTL_SHORT, function () {
            $weekStart = now()->startOfWeek();
            $lastWeekStart = now()->subWeek()->startOfWeek();
            $lastWeekEnd = now()->subWeek()->endOfWeek();

            $buildPeriod = fn($from, $to) => [
                'new_members'      => LoyaltyMember::whereBetween('joined_at', [$from, $to])->count(),
                'points_issued'    => PointsTransaction::where('points', '>', 0)->where('is_reversed', false)->whereBetween('created_at', [$from, $to])->sum('points'),
                'points_redeemed'  => PointsTransaction::where('type', 'redeem')->where('is_reversed', false)->whereBetween('created_at', [$from, $to])->sum(DB::raw('ABS(points)')),
                'new_bookings'     => Booking::whereBetween('created_at', [$from, $to])->count(),
                'revenue'          => Booking::whereBetween('created_at', [$from, $to])->sum('total_amount'),
                'service_bookings' => \App\Models\ServiceBooking::whereBetween('created_at', [$from, $to])
                                        ->whereNotIn('status', ['cancelled', 'no_show'])
                                        ->count(),
            ];

            $week = $buildPeriod($weekStart, now());
            $last = $buildPeriod($lastWeekStart, $lastWeekEnd);

            // Percent change helper — returns 0 if the last period was zero
            // (no point dividing by 0; the mobile Dashboard hides the delta
            // pill when the change is 0 anyway).
            $pct = function ($now, $prev) {
                $now = (float) $now;
                $prev = (float) $prev;
                if ($prev <= 0) return 0;
                return round((($now - $prev) / $prev) * 100, 1);
            };

            // Flattened keys the mobile Dashboard reads directly — saves the
            // client from hand-unwrapping `week.*` / `last_week.*` and
            // computing deltas on every render.
            $flat = [
                'bookings_this_week'         => (int) $week['new_bookings'],
                'bookings_last_week'         => (int) $last['new_bookings'],
                'bookings_change'            => $pct($week['new_bookings'], $last['new_bookings']),

                'revenue_this_week'          => (float) $week['revenue'],
                'revenue_last_week'          => (float) $last['revenue'],
                'revenue_change'             => $pct($week['revenue'], $last['revenue']),

                'new_members_this_week'      => (int) $week['new_members'],
                'new_members_last_week'      => (int) $last['new_members'],
                'members_change'             => $pct($week['new_members'], $last['new_members']),

                'service_bookings_this_week' => (int) $week['service_bookings'],
                'service_bookings_last_week' => (int) $last['service_bookings'],
                'service_bookings_change'    => $pct($week['service_bookings'], $last['service_bookings']),
            ];

            return array_merge($flat, [
                'week'              => $week,
                'last_week'         => $last,
                'tier_distribution' => $this->getTierDistribution(),
                'top_members'       => $this->getTopMembers(5),
            ]);
        });
    }

    public function getExpiryForecast(int $months = 6): array
    {
        $ymSql = self::yearMonthSql('expires_at');
        return Cache::remember("analytics:expiry_forecast:{$months}", self::TTL_LONG, function () use ($months, $ymSql) {
            return PointExpiryBucket::where('is_expired', false)
                ->where('remaining_points', '>', 0)
                ->where('expires_at', '<=', now()->addMonths($months))
                ->selectRaw("{$ymSql} as month, SUM(remaining_points) as points, COUNT(DISTINCT member_id) as members")
                ->groupBy('month')
                ->orderBy('month')
                ->get()
                ->toArray();
        });
    }

    public function getRevenueTrend(int $months = 12): array
    {
        $ymSql = self::yearMonthSql('created_at');
        return Cache::remember("analytics:revenue_trend:{$months}", self::TTL_MEDIUM, function () use ($months, $ymSql) {
            return Booking::selectRaw("{$ymSql} as month, SUM(total_amount) as revenue, COUNT(*) as bookings")
                ->where('created_at', '>=', now()->subMonths($months))
                ->groupBy('month')
                ->orderBy('month')
                ->get()
                ->toArray();
        });
    }

    public function getBookingTrends(int $days = 30): array
    {
        return Cache::remember("analytics:booking_trends:{$days}", self::TTL_SHORT, function () use ($days) {
            return Booking::selectRaw("DATE(created_at) as date, COUNT(*) as bookings, SUM(total_amount) as revenue, SUM(nights) as nights")
                ->where('created_at', '>=', now()->subDays($days))
                ->groupBy('date')
                ->orderBy('date')
                ->get()
                ->toArray();
        });
    }

    /**
     * Daily service-booking count series, mirroring getBookingTrends shape
     * so the mobile Dashboard's "Services" chart tab can plot it the same
     * way as the "Bookings" tab. Cancelled / no-show rows excluded so the
     * chart reflects actual activity, not noise.
     */
    public function getServiceBookingTrends(int $days = 30): array
    {
        return Cache::remember("analytics:service_booking_trends:{$days}", self::TTL_SHORT, function () use ($days) {
            return \App\Models\ServiceBooking::selectRaw("DATE(start_at) as date, COUNT(*) as bookings")
                ->where('start_at', '>=', now()->subDays($days))
                ->whereNotIn('status', ['cancelled', 'no_show'])
                ->groupBy('date')
                ->orderBy('date')
                ->get()
                ->toArray();
        });
    }

    /**
     * Member engagement breakdown — single query with CASE aggregations.
     */
    public function getMemberEngagement(): array
    {
        return Cache::remember('analytics:member_engagement', self::TTL_MEDIUM, function () {
            $now = now();
            $d30 = $now->copy()->subDays(30);
            $d90 = $now->copy()->subDays(90);

            $stats = LoyaltyMember::selectRaw("COUNT(*) as total")
                ->selectRaw("SUM(CASE WHEN is_active = true AND last_activity_at >= ? THEN 1 ELSE 0 END) as active", [$d30])
                ->selectRaw("SUM(CASE WHEN is_active = true AND last_activity_at < ? AND last_activity_at >= ? THEN 1 ELSE 0 END) as at_risk", [$d30, $d90])
                ->selectRaw("SUM(CASE WHEN is_active = true AND (last_activity_at < ? OR last_activity_at IS NULL) THEN 1 ELSE 0 END) as dormant", [$d90])
                ->selectRaw("SUM(CASE WHEN joined_at >= ? THEN 1 ELSE 0 END) as new_members", [$d30])
                ->selectRaw("SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive")
                ->first();

            return [
                ['segment' => 'Active', 'count' => (int) $stats->active, 'color' => '#32d74b'],
                ['segment' => 'New (30d)', 'count' => (int) $stats->new_members, 'color' => '#6366f1'],
                ['segment' => 'At Risk', 'count' => (int) $stats->at_risk, 'color' => '#f59e0b'],
                ['segment' => 'Dormant', 'count' => (int) $stats->dormant, 'color' => '#ef4444'],
                ['segment' => 'Inactive', 'count' => (int) $stats->inactive, 'color' => '#636366'],
            ];
        });
    }

    /**
     * Points balance distribution — single query with CASE aggregations.
     */
    public function getPointsDistribution(): array
    {
        return Cache::remember('analytics:points_distribution', self::TTL_MEDIUM, function () {
            $stats = LoyaltyMember::where('is_active', true)
                ->selectRaw("SUM(CASE WHEN current_points = 0 THEN 1 ELSE 0 END) as r0")
                ->selectRaw("SUM(CASE WHEN current_points BETWEEN 1 AND 500 THEN 1 ELSE 0 END) as r1")
                ->selectRaw("SUM(CASE WHEN current_points BETWEEN 501 AND 2000 THEN 1 ELSE 0 END) as r2")
                ->selectRaw("SUM(CASE WHEN current_points BETWEEN 2001 AND 5000 THEN 1 ELSE 0 END) as r3")
                ->selectRaw("SUM(CASE WHEN current_points BETWEEN 5001 AND 10000 THEN 1 ELSE 0 END) as r4")
                ->selectRaw("SUM(CASE WHEN current_points > 10000 THEN 1 ELSE 0 END) as r5")
                ->first();

            return [
                ['range' => '0',      'members' => (int) $stats->r0],
                ['range' => '1-500',  'members' => (int) $stats->r1],
                ['range' => '501-2k', 'members' => (int) $stats->r2],
                ['range' => '2k-5k',  'members' => (int) $stats->r3],
                ['range' => '5k-10k', 'members' => (int) $stats->r4],
                ['range' => '10k+',   'members' => (int) $stats->r5],
            ];
        });
    }

    /**
     * Redemption rate over time — single query with monthly grouping.
     */
    public function getRedemptionTrend(int $months = 12): array
    {
        $ymSql = self::yearMonthSql('created_at');
        return Cache::remember("analytics:redemption_trend:{$months}", self::TTL_LONG, function () use ($months, $ymSql) {
            $rows = PointsTransaction::where('is_reversed', false)
                ->where('created_at', '>=', now()->subMonths($months)->startOfMonth())
                ->selectRaw("{$ymSql} as month")
                ->selectRaw("SUM(CASE WHEN points > 0 THEN points ELSE 0 END) as earned")
                ->selectRaw("SUM(CASE WHEN type = 'redeem' THEN ABS(points) ELSE 0 END) as redeemed")
                ->groupBy('month')
                ->orderBy('month')
                ->get();

            return $rows->map(function ($r) {
                $earned = (int) $r->earned;
                $redeemed = (int) $r->redeemed;
                $total = $earned + $redeemed;
                return [
                    'month'    => $r->month,
                    'earned'   => $earned,
                    'redeemed' => $redeemed,
                    'rate'     => $total > 0 ? round($redeemed / $total * 100, 1) : 0,
                ];
            })->toArray();
        });
    }

    public function getBookingMetrics(int $months = 12): array
    {
        $ymSql = self::yearMonthSql('created_at');
        return Cache::remember("analytics:booking_metrics:{$months}", self::TTL_MEDIUM, function () use ($months, $ymSql) {
            return Booking::selectRaw("{$ymSql} as month, AVG(nights) as avg_nights, AVG(total_amount) as avg_spend, COUNT(*) as bookings")
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
        });
    }

    /**
     * Bust dashboard-related caches. Call after points/member/booking changes.
     */
    public static function clearDashboardCache(): void
    {
        $keys = [
            'dashboard:loyalty_kpis',
            'dashboard:crm_kpis',
            'analytics:tier_distribution',
            'analytics:weekly_kpi_summary',
            'analytics:member_engagement',
            'analytics:points_distribution',
        ];
        foreach ($keys as $key) {
            Cache::forget($key);
        }
    }
}
