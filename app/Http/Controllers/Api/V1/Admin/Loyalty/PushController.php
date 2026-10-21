<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Placeholder: release 3 §5 (push messages) — replaced by the area's build. */
class PushController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function update(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function destroy(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function audience(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function send(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function cancel(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }

    public function duplicate(Request $request): JsonResponse
    {
        return response()->json(['error' => 'not_built'], 501);
    }
}
