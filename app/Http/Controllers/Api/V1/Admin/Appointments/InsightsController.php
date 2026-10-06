<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Services\Appointments\Insights\InsightsPeriod;
use App\Services\Appointments\Insights\InsightsReport;
use App\Services\Appointments\Setup\SetupAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** How the venue is doing over a period (Part G): managers only. */
class InsightsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $period = InsightsPeriod::fromInput($request->query('from'), $request->query('to'));

        return response()->json(InsightsReport::for((int) app('current_organization_id'), $period, CarbonImmutable::now()));
    }
}
