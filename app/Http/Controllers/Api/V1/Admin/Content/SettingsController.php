<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingsController extends Controller
{
    public function show(Request $request, ContentSettings $settings): JsonResponse
    {
        return response()->json($settings->read($request->attributes->get('workspace_org')));
    }

    public function update(Request $request, ContentSettings $settings): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate(['timezone' => ['required', 'string', Rule::in(BookingRules::zones())]]);

        return response()->json($settings->write($request->attributes->get('workspace_org'), $data['timezone']));
    }
}
