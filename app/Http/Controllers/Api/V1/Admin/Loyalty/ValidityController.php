<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * A membership's end date: set, extend or remove it (release 8, spec 2026-10-25 §3). PRE-WIRED STUB: part M builds it.
 */
class ValidityController extends Controller
{
    public function update(): JsonResponse
    {
        return response()->json(['message' => 'Not built yet.'], 501);
    }
}
