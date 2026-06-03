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
        $instructions = $this->resolveInstructions($voiceConfig, $user);

        // Build the session payload to match the OpenAI GA docs exactly
        // (verified 2026-06-03 against developers.openai.com/api/docs/
        //  api-reference/realtime-sessions/create-realtime-client-secret).
        //
        // Key shape decisions documented inline because previous-ship
        // shapes have already cost us 400s in prod:
        //
        // - `audio.input.format` is an OBJECT, not a flat string.
        //   A string ("pcm16") gets rejected with a deep validator path
        //   error. The canonical pair is { type: "audio/pcm", rate: 24000 }.
        // - `output_modalities` accepts only ["text"], ["audio"], or
        //   ["text","audio"]. Audio-only is the minimal-example default
        //   in the docs; transcripts still stream via the dedicated
        //   audio.input.transcription model.
        // - `turn_detection: server_vad` is the safest default. The newer
        //   `semantic_vad` is documented but rejecting it for now keeps
        //   the connection reliable; we can promote it once we have a
        //   green prod baseline.
        // - `temperature`, `tool_choice`, `speed` removed -- not in the
        //   minimal example. OpenAI may accept them but every undocumented
        //   field is one more way a snapshot rev can 400 us. Defaults are
        //   sane.
        $sessionPayload = [
            'session' => [
                'type'              => 'realtime',
                'model'             => $model,
                'output_modalities' => ['audio'],
                'instructions'      => $instructions,
                'audio'             => [
                    'input' => [
                        'format'         => [
                            'type' => 'audio/pcm',
                            'rate' => 24000,
                        ],
                        'turn_detection' => [
                            'type' => 'server_vad',
                        ],
                        'transcription'  => [
                            'model' => 'gpt-4o-transcribe',
                        ],
                    ],
                    'output' => [
                        'format' => [
                            'type' => 'audio/pcm',
                            'rate' => 24000,
                        ],
                        'voice'  => $voice,
                    ],
                ],
                'tools'       => app(\App\Services\CrmVoiceToolset::class)->getTools(),
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
                // Log the FULL OpenAI error body so future failures are
                // triageable without re-running the request. Bumped from
                // 1000 to 4000 chars because realtime errors often quote
                // the offending JSON-path field which can be deep.
                \Illuminate\Support\Facades\Log::warning('crm_ai.realtime_session.failed', [
                    'status' => $response->status(),
                    'body'   => mb_substr((string) $response->body(), 0, 4000),
                    'org_id' => $orgId,
                    'model'  => $model,
                    'voice'  => $voice,
                    'tools_count' => count($sessionPayload['session']['tools'] ?? []),
                ]);
                // Forward the upstream status when it's a 4xx so the
                // client can distinguish "OpenAI rejected our request"
                // (4xx) from "we couldn't reach OpenAI" (502/5xx).
                $upstream = $response->status();
                $forwardStatus = ($upstream >= 400 && $upstream < 500) ? 400 : 502;
                return response()->json([
                    'error'           => 'Failed to create realtime session',
                    'upstream_status' => $upstream,
                    'details'         => $response->json() ?? mb_substr((string) $response->body(), 0, 500),
                ], $forwardStatus);
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

    /**
     * Voice agent system prompt — delegates to VoicePromptBuilder (Ship 2)
     * which is the single source of truth shared with future text-path
     * callers. Pass-through for admin-authored overrides happens inside
     * the builder so we keep one decision point.
     */
    private function resolveInstructions(?\App\Models\VoiceAgentConfig $cfg, $user): string
    {
        return app(\App\Services\VoicePromptBuilder::class)->build($user, $cfg);
    }

    /**
     * POST /v1/admin/crm-ai/voice-tool
     *
     * Executes a voice-agent tool call routed from the browser. The
     * OpenAI Realtime session emits `response.function_call_arguments.done`
     * events; the frontend forwards them here, the server dispatches via
     * `CrmVoiceToolset::execute()`, and the result goes back into the
     * WebRTC data channel as a `function_call_output`.
     *
     * Auth: standard `auth:sanctum` + `CheckSubscription` from the admin
     * group. `$user->organization_id` becomes the bound tenant. The
     * caller's `id` becomes the actor (used by mutation tools in Ship 7).
     *
     * Always returns HTTP 200 — even on tool errors — so the realtime
     * session never has to retry. The error payload is forwarded to the
     * model so it can speak something useful instead of going silent.
     */
    public function executeVoiceTool(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'    => 'required|string|max:80',
            'args'    => 'nullable|array',
            'call_id' => 'nullable|string|max:200',
        ]);

        $user = $request->user();
        $orgId = (int) $user->organization_id;

        $output = app(\App\Services\CrmVoiceToolset::class)->execute(
            name: $data['name'],
            args: (array) ($data['args'] ?? []),
            orgId: $orgId,
            userId: (int) $user->id,
        );

        return response()->json([
            'call_id' => $data['call_id'] ?? null,
            'name'    => $data['name'],
            'output'  => $output,
        ]);
    }

    /**
     * POST /v1/admin/crm-ai/voice-usage
     *
     * Ship 9 — voice billing. The realtime API emits a `response.done`
     * event after every assistant turn carrying token totals broken down
     * into text + audio + cached input. The frontend forwards them here;
     * we sum into a single (input, output) pair and record through the
     * same AiUsageService pipeline every other AI surface uses, so the
     * admin Settings → AI Usage panel shows voice spend in the same
     * KPI strip / sparkline / by-feature breakdown.
     *
     * Cost is computed via MODEL_PRICING; gpt-realtime entries pin the
     * audio rate ($32 in / $64 out per 1M tokens). Always returns 200
     * even on bad input — usage logging must never block the realtime
     * channel.
     */
    public function recordVoiceUsage(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'model'               => 'required|string|max:80',
                'input_text_tokens'   => 'nullable|integer|min:0|max:1000000',
                'input_audio_tokens'  => 'nullable|integer|min:0|max:1000000',
                'input_cached_tokens' => 'nullable|integer|min:0|max:1000000',
                'output_text_tokens'  => 'nullable|integer|min:0|max:1000000',
                'output_audio_tokens' => 'nullable|integer|min:0|max:1000000',
            ]);

            $user = $request->user();
            $orgId = (int) $user->organization_id;

            $inputTotal  = (int) ($data['input_text_tokens'] ?? 0)
                + (int) ($data['input_audio_tokens'] ?? 0)
                + (int) ($data['input_cached_tokens'] ?? 0);
            $outputTotal = (int) ($data['output_text_tokens'] ?? 0)
                + (int) ($data['output_audio_tokens'] ?? 0);

            // Never record empty rows — the realtime API occasionally
            // emits a final `response.done` with zero usage on
            // turn-cancellations.
            if ($inputTotal === 0 && $outputTotal === 0) {
                return response()->json(['recorded' => false, 'reason' => 'empty_usage']);
            }

            app(\App\Services\AiUsageService::class)->recordUsage(
                orgId: $orgId,
                model: $data['model'],
                inputTokens: $inputTotal,
                outputTokens: $outputTotal,
                feature: 'voice_agent',
                kind: 'chat',
            );

            return response()->json([
                'recorded'      => true,
                'input_tokens'  => $inputTotal,
                'output_tokens' => $outputTotal,
            ]);
        } catch (\Throwable $e) {
            Log::warning('voice_usage.record_failed', [
                'error' => $e->getMessage(),
            ]);
            return response()->json(['recorded' => false, 'error' => $e->getMessage()], 200);
        }
    }
}
