<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Places and who may enter them, and each place's entries (release 8, spec 2026-10-25 §1). PRE-WIRED STUB: part A builds it.
 */
class PlaceController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function store(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function update(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function destroy(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function entries(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }
}
