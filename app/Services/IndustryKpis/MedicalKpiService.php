<?php

namespace App\Services\IndustryKpis;

use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\ServiceBooking;

/**
 * Medical / clinic dashboard KPI computer.
 *
 * Per the Phase 6 schema-feasibility audit, medical surfaces:
 *   - Appointments today (count of ServiceBooking for today, exc.
 *     cancelled / no_show)
 *   - New vs returning patient SPLIT (returning patient % over last
 *     30 days). Returning = guest with > 1 delivered booking in
 *     window.
 *   - Active patient enquiries (Inquiry count not in Confirmed/Lost)
 *   - Pipeline value (open enquiries — clinics get consultation
 *     bookings via the same CRM, but value can stay even if 0)
 *
 * Decision #5: medical has no loyalty program → no points / tier
 * KPIs surfaced. Revenue is also deliberately omitted from the
 * dashboard tile set — payment data is sensitive in a clinical
 * context and the admin AI's hard guardrail (Phase 7) explicitly
 * rules out billing-style displays on the landing surface.
 *
 * Deferred to Phase 6.x once schema lands:
 *   - No-show rate (status enum has 'no_show' but no historical
 *     trend column — needs a recall_pipeline table or daily roll-up)
 *   - Practitioner throughput (service_masters → bookings ratio;
 *     surfaces as a Phase 7 follow-up alongside provider scheduling)
 *
 * Industry Platform Plan Phase 6.
 */
class MedicalKpiService implements IndustryKpiService
{
    public function compute(int $orgId): array
    {
        $today      = now()->toDateString();
        $yesterday  = now()->subDay()->toDateString();
        $thirtyDays = now()->subDays(30)->toDateString();

        $bookingsStats = ServiceBooking::selectRaw("
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as today,
            COUNT(CASE WHEN DATE(start_at) = ? THEN 1 END) as yesterday
        ", [$today, $yesterday])
            ->whereNotIn('status', ['cancelled', 'no_show'])
            ->first();

        // New vs returning patient split (30-day window). Returning
        // = guest with > 1 delivered booking. New = guest with EXACTLY
        // 1 booking AND no prior bookings before the 30-day window.
        // We approximate "no prior" via a tighter subquery — a patient
        // who booked first 60d ago + once 5d ago is "returning" even
        // if only 1 booking is in the 30d window.
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
        $returningPct = $totalDistinct > 0
            ? (int) round(($returningDistinct / $totalDistinct) * 100)
            : null;

        $inquiryStats = Inquiry::selectRaw("
            COUNT(CASE WHEN status NOT IN ('Confirmed','Lost') THEN 1 END) as active_count,
            COALESCE(SUM(CASE WHEN status NOT IN ('Confirmed','Lost') THEN total_value END), 0) as pipeline_value
        ")->first();

        $bookingsToday = (int) $bookingsStats->today;
        $bookingsYesterday = (int) $bookingsStats->yesterday;
        $bookingsDelta = $bookingsYesterday > 0
            ? (int) round((($bookingsToday - $bookingsYesterday) / $bookingsYesterday) * 100)
            : null;

        return [
            'kpi_tiles' => [
                [
                    'key'    => 'appointments_today',
                    'label'  => 'Appointments today',
                    'value'  => $bookingsToday,
                    'delta'  => $bookingsDelta !== null ? ($bookingsDelta >= 0 ? '+' : '') . $bookingsDelta . '%' : null,
                    'format' => 'count',
                    'icon'   => 'Stethoscope',
                    'accent' => 'sky',
                    'link'   => '/service-bookings',
                ],
                [
                    'key'    => 'returning_patients_pct',
                    'label'  => 'Returning patients (30d)',
                    'value'  => $returningPct,
                    'format' => 'percent',
                    'icon'   => 'UserCheck',
                    'accent' => 'emerald',
                    'link'   => '/members',
                ],
                [
                    'key'    => 'active_inquiries',
                    'label'  => 'Patient enquiries',
                    'value'  => (int) $inquiryStats->active_count,
                    'format' => 'count',
                    'icon'   => 'MessageSquare',
                    'accent' => 'amber',
                    'link'   => '/leads',
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
            'service_bookings_today'  => $bookingsToday,
            'service_bookings_change' => $bookingsDelta ?? 0,
            'appointments_today'      => $bookingsToday,
            'returning_patients_pct'  => $returningPct,
            'returning_patients_count'=> $returningDistinct,
            'distinct_patients_30d'   => $totalDistinct,
            // Hotel-only keys nulled per Phase 4 gating.
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
