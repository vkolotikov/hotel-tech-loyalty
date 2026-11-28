<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Appointments\VenueClock;
use App\Services\Dashboard\VenuePulse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PulseController extends Controller
{
    public function show(Request $request, VenuePulse $pulse): JsonResponse
    {
        $org = $request->attributes->get('workspace_org');
        $data = $pulse->for($org, VenueClock::zone((int) $org->id));
        $data['timezone_named'] = VenueClock::isNamed((int) $org->id);

        return response()->json($data);
    }
}
