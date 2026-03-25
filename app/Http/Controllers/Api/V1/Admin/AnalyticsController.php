<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    public function __construct(protected AnalyticsService $analytics) {}

    public function overview(): JsonResponse
    {
        return response()->json([
            'kpis'              => $this->analytics->getDashboardKpis(),
            'tier_distribution' => $this->analytics->getTierDistribution(),
            'top_members'       => $this->analytics->getTopMembers(5),
        ]);
    }

    public function points(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getPointsOverTime($request->get('days', 30)));
    }

    public function memberGrowth(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getMemberGrowth($request->get('months', 12)));
    }

    public function revenue(): JsonResponse
    {
        return response()->json($this->analytics->getRevenueByRoomType());
    }

    public function revenueTrend(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getRevenueTrend($request->get('months', 12)));
    }

    public function bookingTrends(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingTrends($request->get('days', 30)));
    }

    public function engagement(): JsonResponse
    {
        return response()->json($this->analytics->getMemberEngagement());
    }

    public function pointsDistribution(): JsonResponse
    {
        return response()->json($this->analytics->getPointsDistribution());
    }

    public function redemptionTrend(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getRedemptionTrend($request->get('months', 12)));
    }

    public function bookingMetrics(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingMetrics($request->get('months', 12)));
    }

    public function expiryForecast(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getExpiryForecast($request->get('months', 6)));
    }
}
