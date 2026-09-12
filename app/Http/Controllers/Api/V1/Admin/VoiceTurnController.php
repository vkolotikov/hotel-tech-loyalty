<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Voice\VoiceGateway;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VoiceTurnController extends Controller
{
    public function __invoke(Request $request, VoiceGateway $gateway): JsonResponse
    {
        $data = $request->validate([
            'said' => ['required', 'string', 'min:1', 'max:1000', 'regex:/\S/u'],
            'session_id' => ['sometimes', 'string', 'max:64', 'alpha_dash'],
        ]);

        try {
            return response()->json($gateway->turn($request->user(),
                $data['said'], $data['session_id'] ?? (string) Str::uuid()));
        } catch (AuthorizationException $error) {
            // Spoken, not raw: this reaches a microphone UI, not a developer.
            return response()->json(['message' => $error->getMessage()], 403);
        }
    }
}
