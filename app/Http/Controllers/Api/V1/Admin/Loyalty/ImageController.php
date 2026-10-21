<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 2 §7 (spec 2026-10-21 release 2) — replaced by the area's build. */
class ImageController extends Controller
{
    public function storeReward(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function destroyReward(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function storeOffer(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function destroyOffer(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
