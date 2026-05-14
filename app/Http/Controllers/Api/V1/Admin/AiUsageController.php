<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AiUsageLog;
use App\Services\AiUsageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Read-only window onto the org's AI ledger. Powers the Settings → AI Usage
 * panel. Three things here, all scoped to the current org via TenantScope:
 *
 *   GET /v1/admin/ai-usage/stats   month-to-date totals + plan-cap budget
 *                                  status + per-model / per-feature breakdown
 *   GET /v1/admin/ai-usage/recent  the most recent ~50 calls, for spot-checks
 *   GET /v1/admin/ai-usage/series  daily cost time-series for a chart
 *                                  (last 30 days by default)
 */
class AiUsageController extends Controller
{
    public function __construct(private AiUsageService $usage) {}

    public function stats(Request $request)
    {
        $orgId = (int) $request->user()->organization_id;
        $org   = $request->user()->organization;

        $budget = $this->usage->budgetStatus($org);
        $breakdown = $this->usage->monthlyBreakdown($orgId);

        $allowed = $org?->featureValue('ai_allowed_models');
        $allowedModels = is_array($allowed) ? array_values($allowed) : null;

        // Total call count for the month — handy KPI alongside cost.
        $totalCalls = AiUsageLog::where('created_at', '>=', now()->startOfMonth())->count();
        $totalTokens = (int) AiUsageLog::where('created_at', '>=', now()->startOfMonth())
            ->select(DB::raw('SUM(input_tokens + output_tokens) as t'))
            ->value('t');

        return response()->json([
            'budget'         => $budget,
            'total_calls'    => $totalCalls,
            'total_tokens'   => $totalTokens,
            'allowed_models' => $allowedModels, // null = unrestricted
            'by_model'       => $breakdown['by_model'],
            'by_feature'     => $breakdown['by_feature'],
            'pricing'        => AiUsageService::MODEL_PRICING,
        ]);
    }

    public function recent(Request $request)
    {
        $limit = min((int) $request->query('limit', 50), 200);
        $rows = AiUsageLog::orderByDesc('created_at')->limit($limit)->get([
            'id', 'created_at', 'user_id', 'model', 'kind', 'feature',
            'input_tokens', 'output_tokens', 'cost_cents',
        ]);
        return response()->json(['data' => $rows]);
    }

    public function series(Request $request)
    {
        $days = max(1, min(90, (int) $request->query('days', 30)));
        $start = now()->subDays($days - 1)->startOfDay();

        $rows = AiUsageLog::where('created_at', '>=', $start)
            ->select(
                DB::raw("date_trunc('day', created_at) as day"),
                DB::raw('SUM(cost_cents) as cost_cents'),
                DB::raw('COUNT(*) as calls'),
            )
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->map(fn ($r) => [
                'day'        => (string) $r->day,
                'cost_cents' => (int) $r->cost_cents,
                'calls'      => (int) $r->calls,
            ])
            ->all();

        return response()->json(['data' => $rows, 'days' => $days]);
    }
}
