<?php

namespace App\Services\IndustryKpis;

use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\ServiceBooking;

/**
 * Beauty / salon dashboard KPI computer.
 *
 * Per the Phase 6 schema-feasibility audit, beauty surfaces:
 *   - Bookings today (count of ServiceBooking for today, excluding
 *     cancelled / no_show)
 *   - Avg ticket (AVG total_amount over last 30 days of delivered
 *     bookings)
 *   - Returning clients % (guests with > 1 delivered ServiceBooking
 *     / total distinct guests with ≥ 1)
 *   - Pipeline value (open inquiries — same as hotel; salons get
 *     consultation enquiries too)
 *
 * Deferred to Phase 6.x once schema lands:
 *   - No-show rate (needs no_show flag on ServiceBooking — column
 *     value 'no_show' exists in status enum but not surfaced as a
 *     dedicated KPI tile yet)
 *   - Chair utilization (no chair entity in current schema)
 *
 * Industry Platform Plan Phase 6.
 */
class BeautyKpiService implements IndustryKpiService
{
    public function compute(int $orgId): array
    {
        $today      = now()->toDateString();
        $yesterday  = now()->subDay()->toDateString();
        $thirtyDays = now()->subDays(30)->toDateString();

        // Bookings today + yesterday for delta. Excludes cancelled +
        // no_show so the number reflects actual delivered activity.
        $bookingsStats = ServiceBooking::selectRaw("
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as today,
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as yesterday
        ", [$today, $yesterday])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->first();

        // Avg ticket = AVG total_amount over last 30 days for
        // delivered bookings (not cancelled / no_show / null amount).
        $avgTicket = (float) (ServiceBooking::selectRaw("AVG(NULLIF(total_amount, 0)) as avg_amount")
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->whereDate('start_at', '>=', $thirtyDays)
            ->value('avg_amount') ?? 0);

        // Returning clients % over last 30 days. Two distinct counts:
        // total distinct guest_id with any delivered booking, and the
        // subset who had > 1 delivered booking. Excludes guest_id =
        // null (walk-in / unclaimed entries).
        //
        // **withoutGlobalScopes() is REQUIRED here**: TenantScope on
        // ServiceBooking appends `WHERE service_bookings.organization_id
        // = X` qualified with the model's table name. When fromRaw
        // replaces the FROM clause with the aliased subquery
        // `per_guest_count`, the dangling `service_bookings` reference
        // in the WHERE causes Postgres to error with `missing
        // FROM-clause entry for table "service_bookings"`. Tenant
        // safety is preserved by the explicit `WHERE organization_id =
        // ?` inside the subquery — same bound `$orgId`.
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
        $returningPct = $totalDistinct > 0
            ? (int) round(($returningDistinct / $totalDistinct) * 100)
            : null;

        // Open inquiries value — same shape as hotel. Salons see
        // consultation enquiries flow through the same CRM pipeline.
        $inquiryStats = Inquiry::selectRaw("
            COUNT(CASE WHEN status NOT IN ('Confirmed','Lost') THEN 1 END) as active_count,
            COALESCE(SUM(CASE WHEN status NOT IN ('Confirmed','Lost') THEN total_value END), 0) as pipeline_value,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'Confirmed' THEN 1 END) as confirmed_count
        ")->first();

        $bookingsToday = (int) $bookingsStats->today;
        $bookingsYesterday = (int) $bookingsStats->yesterday;
        $bookingsDelta = $bookingsYesterday > 0
            ? (int) round((($bookingsToday - $bookingsYesterday) / $bookingsYesterday) * 100)
            : null;

        return [
            'kpi_tiles' => [
                [
                    'key'    => 'bookings_today',
                    'label'  => 'Appointments today',
                    'value'  => $bookingsToday,
                    'delta'  => $bookingsDelta !== null ? ($bookingsDelta >= 0 ? '+' : '') . $bookingsDelta . '%' : null,
                    'format' => 'count',
                    'icon'   => 'Calendar',
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
                    'key'    => 'returning_clients_pct',
                    'label'  => 'Returning clients',
                    'value'  => $returningPct,
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

            // Back-compat flat keys for any existing consumer. New
            // keys (avg_ticket_30d, returning_clients_pct) are
            // additive — old consumers keep working.
            'total_guests'            => Guest::count(),
            'active_inquiries'        => (int) $inquiryStats->active_count,
            'pipeline_value'          => (float) $inquiryStats->pipeline_value,
            'service_bookings_today'  => $bookingsToday,
            'service_bookings_change' => $bookingsDelta ?? 0,
            'avg_ticket_30d'          => $avgTicket,
            'returning_clients_pct'   => $returningPct,
            'returning_clients_count' => $returningDistinct,
            'distinct_clients_30d'    => $totalDistinct,
            // Null-out the hotel-only keys so the back-compat block
            // doesn't leak hotel KPIs into a beauty workspace.
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
