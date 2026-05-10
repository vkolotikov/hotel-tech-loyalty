<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\PlannerPresetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Industry preset picker for the Planner. Mirror of
 * IndustryPresetController but scoped to task groups + templates.
 *
 * GET  /v1/admin/planner-presets        → list of presets + current
 * POST /v1/admin/planner-presets/apply  → apply one
 */
class PlannerPresetController extends Controller
{
    public function __construct(protected PlannerPresetService $svc) {}

    public function index(): JsonResponse
    {
        return response()->json($this->svc->listPresets());
    }

    public function apply(Request $request): JsonResponse
    {
        $data = $request->validate([
            'preset' => 'required|string',
        ]);

        try {
            $summary = $this->svc->apply($data['preset']);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        $msg = "Applied: {$summary['groups_set']} groups, {$summary['templates_added']} new templates";
        if ($summary['templates_skipped'] > 0) {
            $msg .= ", {$summary['templates_skipped']} already existed";
        }

        return response()->json([
            'message' => $msg,
            'summary' => $summary,
        ]);
    }
}
