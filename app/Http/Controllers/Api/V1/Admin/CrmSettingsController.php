<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CrmSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CrmSettingsController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = CrmSetting::all()->pluck('value', 'key');
        return response()->json($settings);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        $request->validate(['value' => 'required']);

        $setting = CrmSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $request->input('value')]
        );

        return response()->json($setting);
    }
}
