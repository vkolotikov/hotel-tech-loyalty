<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 2 §4 (spec 2026-10-21 release 2) — replaced by the area's build. */
class DuplicatesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function merge(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
