<?php

namespace App\Services\IndustryKpis;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Models\ServiceBooking;

/**
 * Hotel dashboard KPI computer.
 *
 * Mirrors the pre-Phase-6 DashboardController::kpis() CRM bundle so
 * existing hotel orgs see ZERO behaviour change. The flat keys at the
 * bottom of the return value preserve every key the old code returned
 * — pre-existing consumers (mobile summary, charts, integrations)
 * continue to work. The new `kpi_tiles` array is added on top so the
 * frontend can flex its layout via a single field.
 *
 * Industry Platform Plan Phase 6.
 */
class HotelKpiService implements IndustryKpiService
{
    public function compute(int $orgId): array
    {
        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        $inquiryStats = Inquiry::selectRaw("
            COUNT(CASE WHEN status NOT IN ('Confirmed','Lost') THEN 1 END) as active_count,
            COALESCE(SUM(CASE WHEN status NOT IN ('Confirmed','Lost') THEN total_value END), 0) as pipeline_value,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'Confirmed' THEN 1 END) as confirmed_count
        ")->first();

        $reservationStats = Reservation::selectRaw("
            COUNT(CASE WHEN check_in = ?  AND status = 'Confirmed'   THEN 1 END) as arrivals_today,
            COUNT(CASE WHEN check_in = ?  AND status = 'Confirmed'   THEN 1 END) as arrivals_yesterday,
            COUNT(CASE WHEN check_out = ? AND status = 'Checked In'  THEN 1 END) as departures_today,
            COUNT(CASE WHEN check_out = ? AND status = 'Checked In'  THEN 1 END) as departures_yesterday,
            COUNT(CASE WHEN status = 'Checked In' THEN 1 END) as in_house,
            COALESCE(SUM(CASE WHEN status = 'Checked Out' AND checked_out_at >= ? THEN total_amount END), 0) as revenue_month,
            AVG(CASE WHEN status IN ('Confirmed','Checked In','Checked Out') AND check_in >= ? THEN rate_per_night END) as avg_rate
        ", [$today, $yesterday, $today, $yesterday, $monthStart, $monthStart])->first();

        $totalInquiries = (int) $inquiryStats->total_count;
        $confirmedInquiries = (int) $inquiryStats->confirmed_count;

        $inHouse = (int) $reservationStats->in_house;
        $totalUnits = (int) BookingMirror::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereNotNull('apartment_id')
            ->distinct('apartment_id')
            ->count('apartment_id');
        $occupancyPct = null;
        if ($totalUnits > 0) {
            $occupancyPct = (int) round(min(100, ($inHouse / max($totalUnits, 1)) * 100));
        }

        $serviceStats = ServiceBooking::selectRaw("
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as today,
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as yesterday
        ", [$today, $yesterday])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->first();

        $pct = function ($now, $prev) {
            if ((float) $prev <= 0) return null;
            return (int) round((($now - $prev) / $prev) * 100);
        };

        $arrivalsToday   = (int) $reservationStats->arrivals_today;
        $departuresToday = (int) $reservationStats->departures_today;
        $arrivalsDelta   = $pct($arrivalsToday, (int) $reservationStats->arrivals_yesterday);
        $revenueMonth    = (float) $reservationStats->revenue_month;
        $pipelineValue   = (float) $inquiryStats->pipeline_value;

        return [
            // ── Phase 6 industry-aware tile layout ──────────────
            'kpi_tiles' => [
                [
                    'key'    => 'occupancy',
                    'label'  => 'Occupancy',
                    'value'  => $occupancyPct,
                    'format' => 'percent',
                    'icon'   => 'BedDouble',
                    'accent' => 'sky',
                    'link'   => '/bookings/calendar',
                ],
                [
                    'key'    => 'revenue_month',
                    'label'  => 'Revenue MTD',
                    'value'  => $revenueMonth,
                    'format' => 'currency',
                    'icon'   => 'TrendingUp',
                    'accent' => 'emerald',
                    'link'   => '/analytics',
                ],
                [
                    'key'    => 'arrivals_today',
                    'label'  => 'Arrivals today',
                    'value'  => $arrivalsToday,
                    'delta'  => $arrivalsDelta !== null ? ($arrivalsDelta >= 0 ? '+' : '') . $arrivalsDelta . '%' : null,
                    'format' => 'count',
                    'icon'   => 'PlaneLanding',
                    'accent' => 'amber',
                    'link'   => '/bookings',
                ],
                [
                    'key'    => 'pipeline_value',
                    'label'  => 'Pipeline',
                    'value'  => $pipelineValue,
                    'format' => 'currency',
                    'icon'   => 'Briefcase',
                    'accent' => 'violet',
                    'link'   => '/leads',
                ],
            ],

            // ── Back-compat flat keys — every key the pre-Phase-6
            //    DashboardController::kpis() returned. Mobile
            //    summary endpoint + integrations + analytics
            //    consumers all rely on these.
            'total_guests'             => Guest::count(),
            'active_inquiries'         => (int) $inquiryStats->active_count,
            'pipeline_value'           => $pipelineValue,
            'arrivals_today'           => $arrivalsToday,
            'arrivals_change'          => $arrivalsDelta ?? 0,
            'departures_today'         => $departuresToday,
            'departures_change'        => $pct($departuresToday, (int) $reservationStats->departures_yesterday) ?? 0,
            'in_house_guests'          => $inHouse,
            'service_bookings_today'   => (int) $serviceStats->today,
            'service_bookings_change'  => $pct((int) $serviceStats->today, (int) $serviceStats->yesterday) ?? 0,
            'occupancy_pct'            => $occupancyPct,
            'total_units'              => $totalUnits,
            'crm_revenue_month'        => $revenueMonth,
            'avg_daily_rate'           => (float) ($reservationStats->avg_rate ?? 0),
            'conversion_rate'          => $totalInquiries > 0 ? round(($confirmedInquiries / $totalInquiries) * 100, 1) : 0,
        ];
    }
}
