<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * The member portal's events: the list and signing up or cancelling (release 8, spec 2026-10-25 §4). PRE-WIRED STUB: part E builds it.
 */
class PortalEventController extends Controller
{
    public function index(): JsonResponse
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
}
