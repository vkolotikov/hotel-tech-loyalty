<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\Overview\OverviewPeriod;
use App\Services\Loyalty\Overview\OverviewRead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OverviewController extends Controller
{
    public function show(Request $request, string $module, OverviewRead $read): JsonResponse
    {
        abort_unless(in_array($module, ['summary', 'checks', 'metrics', 'queue', 'activity'], true), 404);
        if (in_array($module, ['metrics', 'activity'], true)) LoyaltyAccess::requireInsights($request->user());
        $input = $request->validate(['period' => 'sometimes|in:30d,90d,12m', 'filter' => 'sometimes|in:all,points,rewards,visits']);
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        $clock = new OverviewPeriod($orgId, $input['period'] ?? '30d');
        $data = match ($module) {
            'summary' => $read->summary($orgId, $clock),
            'checks' => $read->checks($orgId),
            'metrics' => $read->metrics($orgId, $clock),
            'queue' => $read->queue($orgId, $request->user()),
            'activity' => $read->activity($orgId, $clock, $input['filter'] ?? 'all'),
        };
        return response()->json(['scope' => $orgId, 'as_of' => $clock->now->toIso8601String(), 'period' => $clock->payload(), 'data' => $data])
            ->header('Cache-Control', 'private, no-store');
    }
}
