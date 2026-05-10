<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\IndustryPresetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One-click industry setup. The Settings → Pipelines page surfaces a
 * picker that calls these endpoints to reshape the entire CRM
 * (pipeline + lost reasons + layout + custom fields) for the chosen
 * vertical.
 */
class IndustryPresetController extends Controller
{
    public function __construct(protected IndustryPresetService $svc) {}

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
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $bits = [];
        $bits[] = $summary['stages_replaced'] . ' stage' . ($summary['stages_replaced'] === 1 ? '' : 's');
        $bits[] = $summary['reasons_set']     . ' lost reason' . ($summary['reasons_set'] === 1 ? '' : 's');
        if ($summary['fields_added'] > 0) $bits[] = '+' . $summary['fields_added'] . ' field' . ($summary['fields_added'] === 1 ? '' : 's');
        if ($summary['fields_deactivated'] > 0) $bits[] = '−' . $summary['fields_deactivated'] . ' previous field' . ($summary['fields_deactivated'] === 1 ? '' : 's');

        return response()->json([
            'success' => true,
            'summary' => $summary,
            'message' => 'Industry preset applied: ' . implode(', ', $bits) . '.',
        ]);
    }
}
