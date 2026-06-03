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
     * POST /v1/admin/crm-ai/capture-guest
     *
     * Pulls a CRM guest profile out of pasted text — email signature,
     * business card, scraped page, etc. Used by the New Customer drawer
     * on /customers so staff can capture-and-create in one step.
     */
    public function captureGuest(Request $request): JsonResponse
    {
        $request->validate([
            'text' => 'required|string|max:10000',
        ]);

        try {
            $result = (new CrmAiService())->extractGuest($request->input('text'));
            return response()->json($result);
        } catch (\Throwable $e) {
            Log::error('CRM AI capture-guest failed: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json(['success' => false, 'error' => 'AI service error: ' . $e->getMessage()]);
        }
    }

    /**
     * Default voice model for the admin AI voice agent. Pinned to a dated
     * snapshot so a silent breaking upgrade can't strand prod. Alias
     * "gpt-realtime" also works. Older "gpt-4o-realtime-preview*" snapshots
     * are deprecated as of 2026-05-12 — Beta interface removed.
     */
    private const REALTIME_MODEL_DEFAULT = 'gpt-realtime-2025-08-28';

    /**
     * Voices supported by the GA Realtime API. `marin` + `cedar` are the
     * new GA voices with substantially better prosody; the rest are legacy
     * carryovers that still resolve on the GA model.
     */
    private const REALTIME_VOICES_GA = [
        'marin', 'cedar',                                                              // GA
        'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse',         // legacy
    ];

    /**
     * POST /api/v1/admin/crm-ai/realtime-session
     *
     * Mints an ephemeral OpenAI Realtime API client secret for the admin
     * voice agent's WebRTC SDP exchange.
     *
     * Uses the GA endpoint /v1/realtime/client_secrets (the legacy
     * /v1/realtime/sessions was retired with the Beta interface on
     * 2026-05-12).
     *
     * Session JSON conforms to the GA shape:
     *   - `output_modalities` (replaces flat `modalities`)
     *   - `audio.{input,output}` nested config (was flat siblings)
     *   - `audio.input.turn_detection` = `semantic_vad` (model-driven —
     *     significantly better than server_vad for hospitality chatter)
     *   - `audio.input.transcription.model` = `gpt-4o-transcribe`
     *   - `tools` reserved for Ship 3 (left empty here so this ship is
     *     pure model-bump risk).
     */
    public function createRealtimeSession(Request $request): JsonResponse
    {
        $apiKey = config('services.openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            return response()->json(['error' => 'OpenAI API key not configured'], 500);
        }

        $orgId = $request->user()->organization_id;
        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $orgId)->first();
        $user = $request->user();

        $model = $this->resolveModel($voiceConfig);
        $voice = $this->resolveVoice($voiceConfig);
        $temperature = (float) ($voiceConfig->temperature ?? 0.7);
        $instructions = $this->resolveInstructions($voiceConfig, $user);

        $sessionPayload = [
            'session' => [
                'type'              => 'realtime',
                'model'             => $model,
                'output_modalities' => ['audio'],
                'instructions'      => $instructions,
                'audio'             => [
                    'input' => [
                        'format'         => 'pcm16',
                        'turn_detection' => [
                            'type'      => 'semantic_vad',
                            'eagerness' => 'medium',
                        ],
                        'transcription'  => [
                            'model' => 'gpt-4o-transcribe',
                        ],
                    ],
                    'output' => [
                        'format' => 'pcm16',
                        'voice'  => $voice,
                        'speed'  => 1.0,
                    ],
                ],
                'temperature' => $temperature,
                'tool_choice' => 'auto',
                'tools'       => [], // Ship 3 wires the toolset
            ],
        ];

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
                // No OpenAI-Beta: realtime=v1 header — Beta interface removed 2026-05-12.
            ])
                ->timeout(30)
                ->post('https://api.openai.com/v1/realtime/client_secrets', $sessionPayload);

            if ($response->failed()) {
                \Illuminate\Support\Facades\Log::warning('crm_ai.realtime_session.failed', [
                    'status' => $response->status(),
                    'body'   => mb_substr((string) $response->body(), 0, 1000),
                    'org_id' => $orgId,
                    'model'  => $model,
                ]);
                return response()->json([
                    'error'   => 'Failed to create realtime session',
                    'details' => $response->json(),
                ], 502);
            }

            $data = $response->json();

            // GA endpoint returns { value, expires_at, session: {...} }.
            // Old endpoint returned { id, client_secret: { value, expires_at } }.
            // Read defensively so a future shape tweak doesn't strand the SPA.
            $clientSecret = $data['value']
                ?? $data['client_secret']['value']
                ?? null;
            $expiresAt = $data['expires_at']
                ?? $data['client_secret']['expires_at']
                ?? null;

            if ($clientSecret === null) {
                return response()->json([
                    'error'   => 'Realtime session response missing client secret',
                    'details' => $data,
                ], 502);
            }

            return response()->json([
                'client_secret' => $clientSecret,
                'expires_at'    => $expiresAt,
                'session_id'    => $data['id'] ?? $data['session']['id'] ?? null,
                'voice'         => $voice,
                'model'         => $model,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('crm_ai.realtime_session.exception', [
                'error'  => $e->getMessage(),
                'org_id' => $orgId,
            ]);
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Resolve the realtime model, transparently migrating orgs that pinned
     * a now-deprecated `gpt-4o-realtime-preview*` snapshot. We can't keep
     * those alive on the new GA endpoint, so anything matching that prefix
     * gets the current default.
     */
    private function resolveModel(?\App\Models\VoiceAgentConfig $cfg): string
    {
        $configured = $cfg?->realtime_model;
        if (!$configured || str_starts_with(strtolower((string) $configured), 'gpt-4o-realtime')) {
            return self::REALTIME_MODEL_DEFAULT;
        }
        return $configured;
    }

    /**
     * Resolve the voice. Default 'marin' (GA-recommended). Validates against
     * the GA-supported list — admin-saved legacy voices stay honoured.
     */
    private function resolveVoice(?\App\Models\VoiceAgentConfig $cfg): string
    {
        $configured = strtolower((string) ($cfg?->voice ?? ''));
        if ($configured === '' || !in_array($configured, self::REALTIME_VOICES_GA, true)) {
            return 'marin';
        }
        return $configured;
    }

    private function resolveInstructions(?\App\Models\VoiceAgentConfig $cfg, $user): string
    {
        // Ship 2 introduces VoicePromptBuilder. Until then keep the inline
        // prompt but strip the "actions require text chat" line — Ship 7
        // adds the confirmation modal so voice mutations become real.
        if ($cfg && $cfg->voice_instructions) {
            return $cfg->voice_instructions;
        }
        $userName = (string) ($user->name ?? 'there');
        return <<<PROMPT
# Identity
You are the AI Assistant for the Hotel Tech Platform — a voice copilot for hotel staff.

# Context
You're speaking with {$userName}, a hotel staff member. Help them with:
- CRM data: guests, inquiries, reservations, corporate accounts
- Loyalty program: members, points, tiers, offers, benefits
- Booking engine: PMS bookings, calendar, payments
- Campaigns, venues, events, planner / day planning
- Platform guidance and best practices

# Tone
Professional but friendly. Speak conversationally — short sentences, no markdown, no bullet lists when speaking aloud. Confirm key identifying details (guest name, dates, amounts) when relevant. Match the user's language.

# Rules
- Internal admin tool, not guest-facing — you can discuss sensitive data.
- Never invent IDs, names, prices, or stages. If you don't know, say so.
- Stay concise — 2-3 sentences per turn is the sweet spot.
PROMPT;
    }
}
