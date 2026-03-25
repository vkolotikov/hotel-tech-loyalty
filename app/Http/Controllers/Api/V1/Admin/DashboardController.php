<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(
        protected AnalyticsService $analytics,
        protected OpenAiService $openAi,
    ) {}

    public function kpis(): JsonResponse
    {
        return response()->json($this->analytics->getDashboardKpis());
    }

    public function pointsChart(Request $request): JsonResponse
    {
        $days = $request->get('days', 30);
        return response()->json($this->analytics->getPointsOverTime($days));
    }

    public function memberGrowth(Request $request): JsonResponse
    {
        $months = $request->get('months', 12);
        return response()->json($this->analytics->getMemberGrowth($months));
    }

    public function topMembers(): JsonResponse
    {
        return response()->json($this->analytics->getTopMembers(10));
    }

    public function aiInsights(): JsonResponse
    {
        $kpis = $this->analytics->getWeeklyKpiSummary();
        $insight = $this->openAi->generateInsightReport($kpis);
        return response()->json(['insight' => $insight, 'kpis' => $kpis]);
    }

    public function weekComparison(): JsonResponse
    {
        return response()->json($this->analytics->getWeeklyKpiSummary());
    }

    public function bookingTrends(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingTrends($request->get('days', 14)));
    }
}
