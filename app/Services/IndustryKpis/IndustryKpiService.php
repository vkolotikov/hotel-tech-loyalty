<?php

namespace App\Services\IndustryKpis;

/**
 * Industry-aware dashboard KPI service.
 *
 * Industry Platform Plan Phase 6.
 *
 * Each implementation returns a `kpi_tiles` array of 4 tiles plus
 * back-compat flat keys so existing consumers (mobile summary
 * endpoint, scheduled reports) don't break. The frontend Dashboard
 * renders `kpi_tiles` when present and falls back to its hardcoded
 * 4-tile layout when absent (legacy / unmapped industries).
 *
 * Each tile shape:
 *   [
 *     'key'    => 'bookings_today',      // stable identifier
 *     'label'  => 'Bookings today',      // canonical English; frontend wraps in vocab() ?? t()
 *     'value'  => 24,                    // raw numeric
 *     'delta'  => '+20%',                // optional, pre-formatted percent string
 *     'format' => 'count',               // count | currency | percent | currency_no_symbol
 *     'icon'   => 'Calendar',            // lucide icon name
 *     'accent' => 'sky',                 // Tailwind colour family
 *     'link'   => '/bookings',           // optional navigate-to path
 *   ]
 *
 * The label is canonical English so Phase 3 vocabulary swap can flex it
 * per industry (e.g. "Members" → "Clients" / "Patients" / "Regulars")
 * without each KPI service knowing about every industry's vocabulary.
 *
 * Implementations live under `App\Services\IndustryKpis\*KpiService` —
 * one file per GTM industry. Settings-only industries (legal /
 * real_estate / education / fitness) fall through to the hotel
 * service for Phase 6; bespoke implementations land if those
 * industries get promoted to GTM in a future ship.
 */
interface IndustryKpiService
{
    /**
     * Compute the dashboard KPI bundle for the org.
     *
     * @param  int  $orgId  tenant-scoped organisation id
     * @return array{
     *     kpi_tiles: array<int, array{
     *         key: string,
     *         label: string,
     *         value: int|float|null,
     *         delta?: string|null,
     *         format: string,
     *         icon: string,
     *         accent: string,
     *         link?: string|null,
     *     }>,
     *     ...
     * } Returns kpi_tiles + back-compat flat keys.
     */
    public function compute(int $orgId): array;
}
