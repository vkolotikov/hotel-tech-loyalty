<?php

namespace App\Services\IndustryKpis;

use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\ServiceBooking;

/**
 * Restaurant / venue / HospitalityTech dashboard KPI computer.
 *
 * Per the Phase 6 schema-feasibility audit, restaurant surfaces:
 *   - Covers tonight (sum party_size for ServiceBookings tonight,
 *     excluding cancelled / no_show). "Tonight" = today's date in
 *     the org's timezone (we use the server tz today; per-org
 *     timezone awareness lands with the Phase 5.x business-hours
 *     work).
 *   - Avg ticket (last 30d)
 *   - Repeat customer % (same formula as beauty's returning clients)
 *   - Pipeline value (catering / private-dining enquiries)
 *
 * `ServiceBooking.party_size` is the canonical source for cover
 * counts. `booking_mirror` has no party_size column — restaurant
 * orgs that exclusively use the PMS mirror won't surface covers
 * until they migrate to the services engine (which is the Phase 4
 * controller-swap target anyway).
 *
 * Industry Platform Plan Phase 6.
 */
class RestaurantKpiService implements IndustryKpiService
{
    public function compute(int $orgId): array
    {
        $today      = now()->toDateString();
        $yesterday  = now()->subDay()->toDateString();
        $thirtyDays = now()->subDays(30)->toDateString();

        // Covers tonight = sum party_size for today's ServiceBookings.
        // Yesterday's covers for the delta.
        $coverStats = ServiceBooking::selectRaw("
            COALESCE(SUM(CASE WHEN DATE(start_at) = ? THEN party_size END), 0) as covers_today,
            COALESCE(SUM(CASE WHEN DATE(start_at) = ? THEN party_size END), 0) as covers_yesterday,
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as reservations_today
        ", [$today, $yesterday, $today])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->first();

        $avgTicket = (float) (ServiceBooking::selectRaw("AVG(NULLIF(total_amount, 0)) as avg_amount")
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->whereDate('start_at', '>=', $thirtyDays)
            ->value('avg_amount') ?? 0);

        // Repeat customer % — same formula as beauty. Guests with > 1
        // delivered booking in the 30-day window count as "repeats."
        // withoutGlobalScopes() required — TenantScope's qualified
        // WHERE references the `service_bookings` table which fromRaw
        // has replaced with `per_guest_count`. Tenant safety preserved
        // by the explicit `WHERE organization_id = ?` inside the
        // subquery. See BeautyKpiService for the long explanation.
        $returningStats = ServiceBooking::withoutGlobalScopes()
            ->selectRaw("
                COUNT(DISTINCT guest_id) FILTER (WHERE guest_id IS NOT NULL) as total_distinct,
                COUNT(DISTINCT CASE WHEN per_guest_count.cnt > 1 THEN per_guest_count.guest_id END) as returning_distinct
            ")
            ->fromRaw("(
                SELECT guest_id, COUNT(*) as cnt
                FROM service_bookings
                WHERE organization_id = ?
                  AND status NOT IN ('cancelled', 'no_show')
                  AND start_at >= ?
                  AND guest_id IS NOT NULL
                GROUP BY guest_id
            ) as per_guest_count", [$orgId, $thirtyDays])
            ->first();

        $totalDistinct = (int) ($returningStats->total_distinct ?? 0);
        $returningDistinct = (int) ($returningStats->returning_distinct ?? 0);
        $repeatPct = $totalDistinct > 0
            ? (int) round(($returningDistinct / $totalDistinct) * 100)
            : null;

        $inquiryStats = Inquiry::selectRaw("
            COUNT(CASE WHEN status NOT IN ('Confirmed','Lost') THEN 1 END) as active_count,
            COALESCE(SUM(CASE WHEN status NOT IN ('Confirmed','Lost') THEN total_value END), 0) as pipeline_value
        ")->first();

        $coversToday = (int) $coverStats->covers_today;
        $coversYesterday = (int) $coverStats->covers_yesterday;
        $coversDelta = $coversYesterday > 0
            ? (int) round((($coversToday - $coversYesterday) / $coversYesterday) * 100)
            : null;

        return [
            'kpi_tiles' => [
                [
                    'key'    => 'covers_today',
                    'label'  => 'Covers tonight',
                    'value'  => $coversToday,
                    'delta'  => $coversDelta !== null ? ($coversDelta >= 0 ? '+' : '') . $coversDelta . '%' : null,
                    'format' => 'count',
                    'icon'   => 'Utensils',
                    'accent' => 'sky',
                    'link'   => '/service-bookings',
                ],
                [
                    'key'    => 'avg_ticket_30d',
                    'label'  => 'Avg ticket (30d)',
                    'value'  => $avgTicket,
                    'format' => 'currency',
                    'icon'   => 'Receipt',
                    'accent' => 'emerald',
                    'link'   => '/analytics',
                ],
                [
                    'key'    => 'repeat_customers_pct',
                    'label'  => 'Repeat customers (30d)',
                    'value'  => $repeatPct,
                    'format' => 'percent',
                    'icon'   => 'UserCheck',
                    'accent' => 'amber',
                    'link'   => '/members',
                ],
                [
                    'key'    => 'pipeline_value',
                    'label'  => 'Pipeline',
                    'value'  => (float) $inquiryStats->pipeline_value,
                    'format' => 'currency',
                    'icon'   => 'Briefcase',
                    'accent' => 'violet',
                    'link'   => '/leads',
                ],
            ],

            // Back-compat flat keys.
            'total_guests'            => Guest::count(),
            'active_inquiries'        => (int) $inquiryStats->active_count,
            'pipeline_value'          => (float) $inquiryStats->pipeline_value,
            'service_bookings_today'  => (int) $coverStats->reservations_today,
            'covers_today'            => $coversToday,
            'covers_yesterday'        => $coversYesterday,
            'avg_ticket_30d'          => $avgTicket,
            'repeat_customers_pct'    => $repeatPct,
            'repeat_customers_count'  => $returningDistinct,
            'distinct_customers_30d'  => $totalDistinct,
            'occupancy_pct'           => null,
            'total_units'             => null,
            'avg_daily_rate'          => null,
            'arrivals_today'          => 0,
            'arrivals_change'         => 0,
            'departures_today'        => 0,
            'departures_change'       => 0,
            'in_house_guests'         => 0,
            'crm_revenue_month'       => 0.0,
        ];
    }
}
