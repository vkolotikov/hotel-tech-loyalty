<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Events: the list, one event, creating, changing, publishing and cancelling it, its people, sign-ups by staff and check-in by hand (release 8, spec 2026-10-25 §4). PRE-WIRED STUB: part E builds it.
 */
class EventController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function store(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function show(): JsonResponse
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

    public function publish(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function cancel(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function people(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function signUp(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function cancelSignUp(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }

    public function checkIn(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }
}
