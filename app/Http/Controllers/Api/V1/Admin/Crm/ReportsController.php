<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Crm\SalesReports;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech CRM's sales reports on Insights (round 5, owner 2026-11-12: "implement all features we have in our main
 * platform"): the full admin's Reports — the funnel, the forecast, lost reasons, sources, the owners' board and the
 * companies — answered by the same code (SalesReports), so the two interfaces agree. Under `crm/reports/*` (behind
 * `workspace:crm`, AccessMap product `crm`, the Reports page's read rule `can_view_analytics`), because the full
 * admin's `reporting/*` are product `admin`, which an organisation on the CRM module does not reach.
 *
 * Every report is CRM data except a company's confirmed reservation revenue: it is read only for an organisation that
 * may reach bookings (a full customer), never for one on modules without them.
 */
class ReportsController extends Controller
{
    public function __construct(private readonly SalesReports $reports)
    {
    }

    /** GET crm/reports/funnel?months=3|6|12 (6). */
    public function funnel(Request $request): JsonResponse
    {
        return response()->json($this->reports->funnel($this->months($request, 12)));
    }

    /** GET crm/reports/forecast?months=1…12 (6): months ahead. */
    public function forecast(Request $request): JsonResponse
    {
        return response()->json($this->reports->forecast($this->months($request, 12)));
    }

    /** GET crm/reports/lost-reasons?months=1…24 (6). */
    public function lostReasons(Request $request): JsonResponse
    {
        return response()->json($this->reports->lostReasons($this->months($request, 24)));
    }

    /** GET crm/reports/sources?months=1…24 (6). */
    public function sources(Request $request): JsonResponse
    {
        return response()->json($this->reports->sources($this->months($request, 24)));
    }

    /** GET crm/reports/owners?days=1…180 (30). */
    public function owners(Request $request): JsonResponse
    {
        $days = $request->validate(['days' => 'nullable|integer|min:1|max:180'])['days'] ?? 30;

        return response()->json($this->reports->owners((int) $days));
    }

    /** GET crm/reports/companies?limit=5…50 (10): with the reservations' revenue only where bookings are the organisation's. */
    public function companies(Request $request): JsonResponse
    {
        $limit = (int) ($request->validate(['limit' => 'nullable|integer|min:5|max:50'])['limit'] ?? 10);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $withBookings = self::seesBookings($org);

        return response()->json([
            'companies'     => $this->reports->companies($limit, $withBookings),
            'limit'         => $limit,
            'with_bookings' => $withBookings,
        ]);
    }

    /** Whether an organisation reaches the bookings product: a full customer does; one on modules only if they hold it. */
    public static function seesBookings(Organization $org): bool
    {
        $modules = $org->planModules();

        return $modules === null || in_array('booking', AccessMap::productsFor($modules), true);
    }

    private function months(Request $request, int $max): int
    {
        return (int) ($request->validate(['months' => "nullable|integer|min:1|max:{$max}"])['months'] ?? 6);
    }
}
