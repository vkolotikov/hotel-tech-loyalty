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
 * GET  /v1/admin/planner-presets                 → list of presets + current
 * POST /v1/admin/planner-presets/apply           → apply one
 * GET  /v1/admin/planner-presets/missing-groups  → groups still in use but off the list
 * POST /v1/admin/planner-presets/restore-groups  → put them back
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

        $msg = "Applied: {$summary['groups_added']} new groups, {$summary['templates_added']} new templates";
        if ($summary['templates_skipped'] > 0) {
            $msg .= ", {$summary['templates_skipped']} already existed";
        }

        return response()->json([
            'message' => $msg,
            'summary' => $summary,
        ]);
    }

    public function missingGroups(): JsonResponse
    {
        return response()->json(['missing' => $this->svc->missingGroups()]);
    }

    public function restoreGroups(Request $request): JsonResponse
    {
        $data = $request->validate([
            'groups'   => 'nullable|array|max:200',
            'groups.*' => 'string|max:80',
        ]);

        $restored = $this->svc->restoreGroups($data['groups'] ?? null);

        return response()->json([
            'restored' => $restored,
            'message'  => count($restored) === 1 ? 'Restored 1 group' : 'Restored ' . count($restored) . ' groups',
        ]);
    }
}
