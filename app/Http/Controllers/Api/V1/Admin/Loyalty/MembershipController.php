<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 2 §4 (spec 2026-10-21 release 2) — replaced by the area's build. */
class MembershipController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function update(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function tier(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function deactivate(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function reactivate(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function erase(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function card(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function welcome(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
