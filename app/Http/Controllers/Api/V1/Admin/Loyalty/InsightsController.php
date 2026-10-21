<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 2 §5 (spec 2026-10-21 release 2) — replaced by the area's build. */
class InsightsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function atRisk(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
