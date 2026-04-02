<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\CrmAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CrmAiController extends Controller
{
    /**
     * Diagnostic endpoint — check AI service configuration.
     * GET /api/v1/admin/crm-ai/diagnose
     */
    public function diagnose(): JsonResponse
    {
        $checks = [];

        // 1. Config check — only expose boolean presence, never key content
        $apiKey = config("services.anthropic.api_key", "");
        $checks["anthropic_key_set"] = !empty($apiKey);
        $checks["anthropic_model"] = config("services.anthropic.model", "(not set)");
        $checks["config_cached"] = app()->configurationIsCached();

        // 3. DB connectivity
        try {
            $checks["db_driver"] = \Illuminate\Support\Facades\DB::getDriverName();
            $checks["crm_settings_count"] = \App\Models\CrmSetting::count();
            $checks["db_ok"] = true;
        } catch (\Throwable $e) {
            $checks["db_ok"] = false;
            $checks["db_error"] = $e->getMessage();
        }

        // 4. HTTP outbound check
        try {
            $r = \Illuminate\Support\Facades\Http::timeout(10)
                ->withHeaders(["x-api-key" => $apiKey, "anthropic-version" => "2023-06-01", "content-type" => "application/json"])
                ->post("https://api.anthropic.com/v1/messages", [
                    "model" => "claude-sonnet-4-20250514", "max_tokens" => 5,
                    "messages" => [["role" => "user", "content" => "Say hi"]],
                ]);
            $checks["api_status"] = $r->status();
            $checks["api_body_preview"] = substr($r->body(), 0, 200);
        } catch (\Throwable $e) {
            $checks["api_reachable"] = false;
            $checks["api_error"] = $e->getMessage();
        }

        return response()->json($checks);
    }

    public function chat(Request $request): JsonResponse
    {
        $request->validate([
            'messages'           => 'required|array|min:1',
            'messages.*.role'    => 'required|string|in:user,assistant',
            'messages.*.content' => 'required|string',
        ]);

        try {
            $result = (new CrmAiService())->chat($request->input('messages'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI chat failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'response' => 'AI service error: ' . $e->getMessage(),
                'actions'  => [],
                'error'    => true,
            ], 200); // Return 200 so frontend can display the message
        }
    }

    public function captureLead(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractLead($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-lead failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    public function captureMember(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractMember($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-member failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    public function captureCorporate(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractCorporate($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-corporate failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    /**
     * POST /api/v1/admin/crm-ai/realtime-session
     * Creates an ephemeral OpenAI Realtime API session for voice-to-voice in admin AI chat.
     */
    public function createRealtimeSession(Request $request): JsonResponse
    {
        $apiKey = config('services.openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            return response()->json(['error' => 'OpenAI API key not configured'], 500);
        }

        $orgId = $request->user()->organization_id;
        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $orgId)->first();

        $voice = $voiceConfig->voice ?? 'alloy';
        $model = $voiceConfig->realtime_model ?? 'gpt-4o-realtime-preview';
        $temperature = $voiceConfig->temperature ?? 0.8;

        // Build admin-specific instructions
        $user = $request->user();
        $instructions = <<<PROMPT
# Identity
You are the AI Assistant for Hotel Tech Platform — an admin tool for hotel staff.

# Context
You're speaking with {$user->name}, a hotel staff member. Help them with:
- CRM data: guests, inquiries, reservations, corporate accounts
- Loyalty program: members, points, tiers, offers, benefits
- Booking engine: PMS bookings, calendar, payments
- Campaigns, venues, events
- Platform guidance and best practices

# Tone
Professional but friendly. Be concise in voice — keep answers to 2-3 sentences. If they ask for data you can't look up in voice mode, suggest they use the text chat for detailed queries.

# Rules
- This is an internal admin tool, not guest-facing
- You can discuss sensitive data like revenue, guest info, bookings
- If asked to perform actions (create records, award points), explain that actions require the text chat — voice mode is for quick questions and guidance
- Be proactive with suggestions and tips
PROMPT;

        if ($voiceConfig && $voiceConfig->voice_instructions) {
            $instructions = $voiceConfig->voice_instructions;
        }

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
            ])->post('https://api.openai.com/v1/realtime/sessions', [
                'model' => $model,
                'voice' => $voice,
                'instructions' => $instructions,
                'input_audio_transcription' => ['model' => 'gpt-4o-transcribe'],
                'temperature' => $temperature,
            ]);

            if ($response->failed()) {
                return response()->json([
                    'error' => 'Failed to create realtime session',
                    'details' => $response->json(),
                ], 502);
            }

            $data = $response->json();

            return response()->json([
                'client_secret' => $data['client_secret']['value'] ?? null,
                'expires_at' => $data['client_secret']['expires_at'] ?? null,
                'session_id' => $data['id'] ?? null,
                'voice' => $voice,
                'model' => $model,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
