<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\VoiceAgentConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class VoiceAgentController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        try {
            $orgId = $request->user()->organization_id;
            return response()->json(VoiceAgentConfig::getForOrg($orgId));
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'is_active'          => 'nullable|boolean',
            'voice'              => 'nullable|string|max:30',
            'tts_model'          => 'nullable|string|max:60',
            'realtime_enabled'   => 'nullable|boolean',
            'realtime_model'     => 'nullable|string|max:60',
            'voice_instructions' => 'nullable|string|max:5000',
            'language'           => 'nullable|string|max:10',
            'temperature'        => 'nullable|numeric|min:0|max:2',
        ]);

        try {
            $orgId = $request->user()->organization_id;
            $config = VoiceAgentConfig::where('organization_id', $orgId)->first();

            if (!$config) {
                $config = VoiceAgentConfig::create(array_merge($validated, [
                    'organization_id' => $orgId,
                ]));
            } else {
                $config->update($validated);
            }

            return response()->json($config);
        } catch (Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
