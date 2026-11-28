<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Crm\SalesReports;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CRM Phase 4 — read-only reporting endpoints, one chart each on the full admin's /reports page.
 *
 * Since round 5 (2026-11-12) every report is `App\Services\Crm\SalesReports`, which HexaTech CRM's Insights
 * (`crm/reports/*`) reads too, so both interfaces show the same figures; the parameters and the answers here are as
 * they were.
 */
class ReportingController extends Controller
{
    public function __construct(private readonly SalesReports $reports)
    {
    }

    /** GET /v1/admin/reporting/forecast — the open pipeline weighted by its chance, by expected month (`months` 1–12, 6). */
    public function forecast(Request $request): JsonResponse
    {
        return response()->json($this->reports->forecast(max(1, min(12, (int) $request->get('months', 6)))));
    }

    /** GET /v1/admin/reporting/lost-reasons — leads lost by reason, with the value lost (`months` 1–24, 6). */
    public function lostReasons(Request $request): JsonResponse
    {
        return response()->json($this->reports->lostReasons(max(1, min(24, (int) $request->get('months', 6)))));
    }

    /** GET /v1/admin/reporting/source-attribution — leads, won, lost, win rate and value won per source (`months` 1–24, 6). */
    public function sourceAttribution(Request $request): JsonResponse
    {
        return response()->json($this->reports->sources(max(1, min(24, (int) $request->get('months', 6)))));
    }

    /** GET /v1/admin/reporting/owner-activity — per person: timeline lines, tasks done, their leads (`days` 1–180, 30). */
    public function ownerActivity(Request $request): JsonResponse
    {
        return response()->json($this->reports->owners(max(1, min(180, (int) $request->get('days', 30)))));
    }

    /**
     * GET /v1/admin/reporting/company-ltv — the companies by confirmed reservation revenue, with their open pipeline
     * (`limit` 5–50, 15). The full admin is a full customer's, so the reservations are read.
     */
    public function companyLtv(Request $request): JsonResponse
    {
        $limit = max(5, min(50, (int) $request->get('limit', 15)));

        return response()->json(['companies' => $this->reports->companies($limit, true), 'limit' => $limit]);
    }
}
