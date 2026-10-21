<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 2 §7 (spec 2026-10-21 release 2) — replaced by the area's build. */
class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function update(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function appleCert(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function appleWwdr(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function googleServiceAccount(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
