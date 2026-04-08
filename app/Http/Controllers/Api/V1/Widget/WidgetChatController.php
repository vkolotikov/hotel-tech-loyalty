<?php

namespace App\Http\Controllers\Api\V1\Widget;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Models\ChatWidgetConfig;
use App\Models\PopupRule;
use App\Models\Visitor;
use App\Models\VisitorPageView;
use App\Services\KnowledgeService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WidgetChatController extends Controller
{
    public function __construct(
        protected OpenAiService $openAi,
        protected KnowledgeService $knowledge,
    ) {}

    /**
     * Find or create a Visitor record for this request. The fingerprint is a
     * hash of (org_id|ip|truncated user agent|optional cookie id) so the same
     * person opening multiple chat sessions or tabs from the same device
     * collapses into ONE visitor identity. We bump last_seen_at on every call
     * and increment visit_count when the gap since last activity exceeds
     * 30 minutes (a "new visit").
     */
    private function resolveVisitor(Request $request, int $orgId, ?string $cookieId = null): Visitor
    {
        $ip = (string) $request->ip();
        $ua = substr((string) $request->header('User-Agent'), 0, 500);
        $fingerprint = hash('sha256', $orgId . '|' . $ip . '|' . substr($ua, 0, 200) . '|' . ($cookieId ?: ''));

        $visitor = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('visitor_key', $fingerprint)
            ->first();

        $now      = now();
        $pageUrl  = $request->input('page_url') ?: $request->header('Referer');
        $pageTitle = $request->input('page_title');
        $referrer = $request->input('referrer') ?: $request->header('Referer');

        if (!$visitor) {
            $visitor = Visitor::create([
                'organization_id'    => $orgId,
                'visitor_key'        => $fingerprint,
                'visitor_ip'         => $ip,
                'user_agent'         => $ua,
                'referrer'           => $referrer,
                'current_page'       => $pageUrl,
                'current_page_title' => $pageTitle,
                'first_seen_at'      => $now,
                'last_seen_at'       => $now,
                'visit_count'        => 1,
            ]);
        } else {
            // New visit if there's been a 30+ minute gap
            $isNewVisit = !$visitor->last_seen_at || $visitor->last_seen_at->lt($now->copy()->subMinutes(30));
            $visitor->fill([
                'visitor_ip'         => $ip,
                'user_agent'         => $ua,
                'last_seen_at'       => $now,
                'current_page'       => $pageUrl ?: $visitor->current_page,
                'current_page_title' => $pageTitle ?: $visitor->current_page_title,
            ]);
            if ($isNewVisit) {
                $visitor->visit_count = (int) $visitor->visit_count + 1;
            }
            $visitor->save();
        }

        return $visitor;
    }

    /**
     * Resolve the widget config and bind the org context so all
     * downstream scoped model queries work correctly.
     */
    private function resolveWidget(string $widgetKey): ?ChatWidgetConfig
    {
        $config = ChatWidgetConfig::withoutGlobalScopes()
            ->where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if ($config) {
            app()->instance('current_organization_id', $config->organization_id);
        }

        return $config;
    }

    /**
     * GET /v1/widget/{widgetKey}/config
     */
    public function getConfig(string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found or inactive'], 404);
        }

        $behavior = ChatbotBehaviorConfig::where('organization_id', $config->organization_id)->first();
        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $config->organization_id)->first();

        $primaryColor = $config->primary_color ?: (\App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $config->organization_id)
            ->where('key', 'primary_color')
            ->value('value') ?: '#2d6a4f');

        return response()->json([
            'company_name'       => $config->company_name,
            'welcome_message'    => $config->welcome_message,
            'primary_color'      => $primaryColor,
            'header_text_color'  => $config->header_text_color ?? '#ffffff',
            'user_bubble_color'  => $config->user_bubble_color ?? $primaryColor,
            'user_bubble_text'   => $config->user_bubble_text ?? '#ffffff',
            'bot_bubble_color'   => $config->bot_bubble_color ?? '#f3f4f6',
            'bot_bubble_text'    => $config->bot_bubble_text ?? '#1f2937',
            'chat_bg_color'      => $config->chat_bg_color ?? '#ffffff',
            'font_family'        => $config->font_family ?? 'Inter',
            'border_radius'      => $config->border_radius ?? 16,
            'show_branding'      => $config->show_branding ?? true,
            'header_style'       => $config->header_style ?? 'solid',
            'header_gradient_end' => $config->header_gradient_end,
            'launcher_size'      => $config->launcher_size ?? 56,
            'position'           => $config->position,
            'icon_style'         => $config->icon_style,
            'launcher_shape'     => $config->launcher_shape,
            'launcher_icon'      => $config->launcher_icon,
            'lead_capture'       => [
                'enabled' => $config->lead_capture_enabled,
                'fields'  => $config->lead_capture_fields ?? ['name' => true, 'email' => true, 'phone' => false],
                'delay'   => $config->lead_capture_delay,
            ],
            'assistant_name'     => $behavior->assistant_name ?? 'Hotel Assistant',
            'assistant_avatar'   => $behavior->assistant_avatar ?? null,
            'offline_message'    => $config->offline_message,
            'voice_enabled'      => $voiceConfig && $voiceConfig->is_active && $voiceConfig->realtime_enabled,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/init
     */
    public function initSession(Request $request, string $widgetKey): JsonResponse
    {
        try {
            $config = $this->resolveWidget($widgetKey);

            if (!$config) {
                return response()->json(['error' => 'Widget not found'], 404);
            }

            $sessionId   = $request->input('session_id') ?? Str::uuid()->toString();
            $visitorName = $request->input('visitor_name');
            $cookieId    = $request->input('visitor_cookie');

            // Resolve persistent visitor identity (dedupes by fingerprint).
            $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $cookieId);

            $userAgent = substr((string) $request->header('User-Agent'), 0, 500);
            $pageUrl   = $request->input('page_url') ?: $request->header('Referer');

            AiConversation::updateOrCreate(
                ['session_id' => $sessionId],
                [
                    'organization_id' => $config->organization_id,
                    'member_id' => null,
                    'messages' => [],
                    'model' => 'gpt-4o',
                    'is_active' => true,
                ]
            );

            ChatConversation::updateOrCreate(
                ['session_id' => $sessionId],
                [
                    'organization_id'    => $config->organization_id,
                    'visitor_id'         => $visitor->id,
                    'visitor_name'       => $visitorName ?: $visitor->display_name,
                    'visitor_email'      => $visitor->email,
                    'visitor_phone'      => $visitor->phone,
                    'visitor_ip'         => $visitor->visitor_ip,
                    'visitor_user_agent' => $userAgent,
                    'page_url'           => $pageUrl,
                    'channel'            => 'widget',
                    'status'             => 'active',
                    'last_message_at'    => now(),
                ]
            );

            return response()->json([
                'session_id'      => $sessionId,
                'visitor_id'      => $visitor->id,
                'visitor_key'     => $visitor->visitor_key,
                'welcome_message' => $config->welcome_message,
            ]);
        } catch (\Throwable $e) {
            \Log::error('Widget init error: ' . $e->getMessage(), ['file' => $e->getFile() . ':' . $e->getLine()]);
            return response()->json(['error' => 'Init failed', 'debug' => config('app.debug') ? $e->getMessage() : null], 500);
        }
    }

    /**
     * POST /v1/widget/{widgetKey}/message
     */
    public function sendMessage(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'message'    => 'required|string|max:2000',
            'session_id' => 'required|string|max:64',
            'lang'       => 'nullable|string|max:16',
        ]);

        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;
        $behaviorConfig = ChatbotBehaviorConfig::where('organization_id', $orgId)->first();
        $modelConfig = ChatbotModelConfig::where('organization_id', $orgId)->first();

        // Get knowledge context
        $knowledgeContext = '';
        try {
            $knowledgeContext = $this->knowledge->getKnowledgeContext($request->message, $orgId);
        } catch (\Throwable $e) {
            \Log::warning('Widget knowledge lookup failed: ' . $e->getMessage());
        }

        // Load or create conversation
        $conversation = AiConversation::firstOrCreate(
            ['session_id' => $request->session_id],
            [
                'organization_id' => $orgId,
                'member_id' => null,
                'messages' => [],
                'model' => $modelConfig->model_name ?? 'gpt-4o',
                'is_active' => true,
            ]
        );

        $messages = $conversation->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $request->message, 'timestamp' => now()->toIso8601String()];

        $systemPrompt = $this->buildWidgetSystemPrompt($behaviorConfig, $knowledgeContext, $config->company_name, $request->input('lang'));

        $contextMessages = array_slice(
            array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $messages),
            -20
        );

        $provider = $modelConfig->provider ?? 'openai';
        $model = $modelConfig->model_name ?? 'gpt-4o';
        $temperature = (float) ($modelConfig->temperature ?? 0.7);
        $maxTokens = (int) ($modelConfig->max_tokens ?? 500);

        try {
            $aiResponse = match ($provider) {
                'anthropic' => $this->callAnthropic($systemPrompt, $contextMessages, $model, $temperature, $maxTokens),
                'google'    => $this->callGoogle($systemPrompt, $contextMessages, $model, $temperature, $maxTokens),
                default     => $this->callOpenAi($systemPrompt, $contextMessages, $model, $temperature, $maxTokens),
            };
        } catch (\Throwable $e) {
            \Log::error("Widget chat error [{$provider}/{$model}]: " . $e->getMessage());
            $aiResponse = $behaviorConfig->fallback_message
                ?? "I'm sorry, I'm having trouble responding right now. Please try again shortly.";
        }

        $messages[] = ['role' => 'assistant', 'content' => $aiResponse, 'timestamp' => now()->toIso8601String()];

        $conversation->update([
            'messages' => $messages,
            'tokens_used' => $conversation->tokens_used + (int) (strlen($aiResponse) / 4),
        ]);

        // Bump visitor heartbeat so they stay "online" while chatting.
        try {
            $visitor = $this->resolveVisitor($request, (int) $orgId);
            $visitor->increment('messages_count');
        } catch (\Throwable $e) {
            \Log::warning('Widget visitor heartbeat (sendMessage) failed: ' . $e->getMessage());
            $visitor = null;
        }

        // Store in chat_messages for inbox
        try {
            $chatConv = ChatConversation::where('session_id', $request->session_id)->first();
            if ($chatConv && $visitor && !$chatConv->visitor_id) {
                $chatConv->visitor_id = $visitor->id;
            }
            if ($chatConv) {
                ChatMessage::create([
                    'conversation_id' => $chatConv->id,
                    'sender_type' => 'visitor',
                    'content' => $request->message,
                    'created_at' => now(),
                ]);
                ChatMessage::create([
                    'conversation_id' => $chatConv->id,
                    'sender_type' => 'ai',
                    'content' => $aiResponse,
                    'created_at' => now(),
                ]);
                $chatConv->update([
                    'last_message_at' => now(),
                    'messages_count' => $chatConv->messages_count + 2,
                ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Widget inbox save failed: ' . $e->getMessage());
        }

        return response()->json([
            'response' => $aiResponse,
            'session_id' => $request->session_id,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/lead
     */
    public function captureLead(Request $request, string $widgetKey): JsonResponse
    {
        $validated = $request->validate([
            'name'       => 'nullable|string|max:120',
            'email'      => 'nullable|email|max:180',
            'phone'      => 'nullable|string|max:30',
            'message'    => 'nullable|string|max:2000',
            'session_id' => 'nullable|string|max:64',
        ]);

        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;

        $guest = null;
        if (!empty($validated['email'])) {
            $guest = \App\Models\Guest::where('organization_id', $orgId)
                ->where('email', $validated['email'])
                ->first();
        }

        if (!$guest) {
            $nameParts = explode(' ', $validated['name'] ?? 'Widget Visitor', 2);
            $guest = \App\Models\Guest::create([
                'organization_id'  => $orgId,
                'first_name'       => $nameParts[0] ?? '',
                'last_name'        => $nameParts[1] ?? '',
                'full_name'        => $validated['name'] ?? 'Widget Visitor',
                'email'            => $validated['email'] ?? null,
                'phone'            => $validated['phone'] ?? null,
                'guest_type'       => 'Individual',
                'lead_source'      => 'Chat Widget',
                'lifecycle_status' => 'Lead',
                'last_activity_at' => now(),
            ]);
        }

        $inquiry = \App\Models\Inquiry::create([
            'organization_id' => $orgId,
            'guest_id'        => $guest->id,
            'notes'           => $validated['message'] ?? null,
            'source'          => 'chatbot',
            'status'          => 'new',
            'inquiry_type'    => 'general',
        ]);

        // Mark the visitor as a lead and link to the guest so the admin
        // visitors view shows the lead badge and can jump to the guest record.
        try {
            $visitor = $this->resolveVisitor($request, $orgId);
            $visitor->fill([
                'is_lead'      => true,
                'guest_id'     => $guest->id,
                'display_name' => $validated['name'] ?? $visitor->display_name,
                'email'        => $validated['email'] ?? $visitor->email,
                'phone'        => $validated['phone'] ?? $visitor->phone,
            ])->save();

            // Also link any existing chat conversation for this session.
            if (!empty($validated['session_id'])) {
                ChatConversation::where('session_id', $validated['session_id'])
                    ->update([
                        'visitor_id'   => $visitor->id,
                        'lead_captured' => true,
                        'inquiry_id'   => $inquiry->id,
                        'visitor_name' => $validated['name'] ?? null,
                        'visitor_email'=> $validated['email'] ?? null,
                        'visitor_phone'=> $validated['phone'] ?? null,
                    ]);
            }
        } catch (\Throwable $e) {
            \Log::warning('Widget lead visitor link failed: ' . $e->getMessage());
        }

        return response()->json([
            'success'    => true,
            'inquiry_id' => $inquiry->id,
            'guest_id'   => $guest->id,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/heartbeat — keep visitor "online" status fresh.
     * Called every ~30s while the page is open.
     */
    public function heartbeat(Request $request, string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $request->input('visitor_cookie'));

        return response()->json([
            'visitor_id' => $visitor->id,
            'online'     => true,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/page-view — record a page navigation.
     * Body: { url, title, referrer, duration_seconds (for previous page) }
     */
    public function pageView(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'url'              => 'required|string|max:2000',
            'title'            => 'nullable|string|max:500',
            'referrer'         => 'nullable|string|max:2000',
            'duration_seconds' => 'nullable|integer|min:0|max:86400',
        ]);

        $config = $this->resolveWidget($widgetKey);
        if (!$config) return response()->json(['error' => 'Widget not found'], 404);

        $visitor = $this->resolveVisitor($request, (int) $config->organization_id, $request->input('visitor_cookie'));

        $pv = VisitorPageView::create([
            'organization_id'  => $config->organization_id,
            'visitor_id'       => $visitor->id,
            'url'              => $request->input('url'),
            'title'            => $request->input('title'),
            'referrer'         => $request->input('referrer'),
            'duration_seconds' => $request->input('duration_seconds'),
            'viewed_at'        => now(),
        ]);

        $visitor->increment('page_views_count');
        $visitor->fill([
            'current_page'       => $request->input('url'),
            'current_page_title' => $request->input('title'),
        ])->save();

        return response()->json(['ok' => true, 'page_view_id' => $pv->id]);
    }

    /**
     * GET /v1/widget/{widgetKey}/popup-rules
     */
    public function getPopupRules(string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['rules' => []]);
        }

        $rules = PopupRule::where('organization_id', $config->organization_id)
            ->active()
            ->orderByDesc('priority')
            ->get(['id', 'trigger_type', 'trigger_value', 'url_match_type', 'url_match_value', 'visitor_type', 'language_targets', 'message', 'quick_replies', 'priority']);

        PopupRule::where('organization_id', $config->organization_id)
            ->active()
            ->increment('impressions_count');

        return response()->json(['rules' => $rules]);
    }

    private function buildWidgetSystemPrompt(?ChatbotBehaviorConfig $config, string $knowledgeContext, string $companyName, ?string $userLang = null): string
    {
        $parts = [];

        // Language instruction — match the user's browser/voice locale so replies are in their language.
        if ($userLang) {
            $langMap = [
                'en' => 'English', 'es' => 'Spanish', 'fr' => 'French', 'de' => 'German',
                'it' => 'Italian', 'pt' => 'Portuguese', 'nl' => 'Dutch', 'pl' => 'Polish',
                'ru' => 'Russian', 'uk' => 'Ukrainian', 'lv' => 'Latvian', 'lt' => 'Lithuanian',
                'et' => 'Estonian', 'fi' => 'Finnish', 'sv' => 'Swedish', 'no' => 'Norwegian',
                'da' => 'Danish', 'cs' => 'Czech', 'sk' => 'Slovak', 'hu' => 'Hungarian',
                'ro' => 'Romanian', 'bg' => 'Bulgarian', 'el' => 'Greek', 'tr' => 'Turkish',
                'ar' => 'Arabic', 'he' => 'Hebrew', 'zh' => 'Chinese', 'ja' => 'Japanese',
                'ko' => 'Korean', 'hi' => 'Hindi',
            ];
            $prefix = strtolower(explode('-', $userLang)[0]);
            $langName = $langMap[$prefix] ?? $userLang;
            $parts[] = "IMPORTANT: Reply in {$langName}. The user's preferred language is {$userLang}. Always respond in the same language as the user, unless they explicitly switch.";
        }

        if ($config && $config->identity) {
            $parts[] = $config->identity;
        } else {
            $name = $config->assistant_name ?? 'Hotel Assistant';
            $parts[] = "You are {$name}, a helpful hotel concierge AI assistant" . ($companyName ? " for {$companyName}" : '') . ".";
        }

        if ($config && $config->goal) {
            $parts[] = "Your goal: {$config->goal}";
        }

        $toneMap = [
            'professional' => 'Be professional and courteous.',
            'friendly' => 'Be warm, friendly, and approachable.',
            'casual' => 'Use a casual, relaxed conversational style.',
            'formal' => 'Maintain a formal, respectful tone.',
        ];
        $lengthMap = [
            'concise' => 'Keep replies short (1-2 sentences).',
            'moderate' => 'Provide moderately detailed replies (2-4 sentences).',
            'detailed' => 'Give thorough, detailed responses.',
        ];

        if ($config) {
            $parts[] = $toneMap[$config->tone] ?? $toneMap['professional'];
            $parts[] = $lengthMap[$config->reply_length] ?? $lengthMap['moderate'];

            if (!empty($config->core_rules)) {
                $parts[] = "Rules you MUST follow:";
                foreach ($config->core_rules as $rule) {
                    $parts[] = "- {$rule}";
                }
            }

            if ($config->escalation_policy) {
                $parts[] = "Escalation: {$config->escalation_policy}";
            }

            if ($config->custom_instructions) {
                $parts[] = $config->custom_instructions;
            }
        }

        $parts[] = "You are chatting with a website visitor. You do not have access to their loyalty account.";
        $parts[] = "Date: " . now()->format('Y-m-d');

        if ($knowledgeContext) {
            $parts[] = "\n{$knowledgeContext}";
            $parts[] = "Use the knowledge base above to answer questions when relevant.";
        }

        return implode("\n", $parts);
    }

    private function callOpenAi(string $system, array $messages, string $model, float $temp, int $maxTokens): string
    {
        $allMessages = array_merge([['role' => 'system', 'content' => $system]], $messages);
        $response = \OpenAI\Laravel\Facades\OpenAI::chat()->create([
            'model' => $model, 'messages' => $allMessages,
            'max_tokens' => $maxTokens, 'temperature' => $temp,
        ]);
        return $response->choices[0]->message->content ?? '';
    }

    private function callAnthropic(string $system, array $messages, string $model, float $temp, int $maxTokens): string
    {
        $apiKey = config('services.anthropic.api_key', env('ANTHROPIC_API_KEY'));
        if (!$apiKey) throw new \RuntimeException('Anthropic API key not configured');

        $response = \Illuminate\Support\Facades\Http::withHeaders([
            'x-api-key' => $apiKey, 'anthropic-version' => '2023-06-01', 'content-type' => 'application/json',
        ])->timeout(60)->post('https://api.anthropic.com/v1/messages', [
            'model' => $model, 'max_tokens' => $maxTokens,
            'temperature' => min($temp, 1.0), 'system' => $system, 'messages' => $messages,
        ]);

        if ($response->failed()) throw new \RuntimeException('Anthropic API error: ' . $response->body());
        return $response->json()['content'][0]['text'] ?? '';
    }

    private function callGoogle(string $system, array $messages, string $model, float $temp, int $maxTokens): string
    {
        $apiKey = config('services.google.gemini_api_key', env('GOOGLE_GEMINI_API_KEY'));
        if (!$apiKey) throw new \RuntimeException('Google Gemini API key not configured');

        $contents = [];
        foreach ($messages as $msg) {
            $contents[] = [
                'role' => $msg['role'] === 'assistant' ? 'model' : 'user',
                'parts' => [['text' => $msg['content']]],
            ];
        }

        $response = \Illuminate\Support\Facades\Http::timeout(60)->post(
            "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
            [
                'system_instruction' => ['parts' => [['text' => $system]]],
                'contents' => $contents,
                'generationConfig' => ['temperature' => $temp, 'maxOutputTokens' => $maxTokens],
            ]
        );

        if ($response->failed()) throw new \RuntimeException('Gemini API error: ' . $response->body());
        return $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? '';
    }

    /**
     * POST /v1/widget/{widgetKey}/realtime-session
     */
    public function createRealtimeSession(Request $request, string $widgetKey): JsonResponse
    {
        $config = $this->resolveWidget($widgetKey);

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $voiceConfig = \App\Models\VoiceAgentConfig::where('organization_id', $config->organization_id)->first();

        if (!$voiceConfig || !$voiceConfig->is_active || !$voiceConfig->realtime_enabled) {
            return response()->json(['error' => 'Voice agent not enabled'], 403);
        }

        $apiKey = config('services.openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            return response()->json(['error' => 'OpenAI not configured'], 500);
        }

        $behavior = ChatbotBehaviorConfig::where('organization_id', $config->organization_id)->first();
        $instructions = $this->buildVoiceInstructions($config, $behavior, $voiceConfig);

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Authorization' => 'Bearer ' . $apiKey,
            ])->post('https://api.openai.com/v1/realtime/sessions', [
                'model' => $voiceConfig->realtime_model ?? 'gpt-4o-realtime-preview',
                'voice' => $voiceConfig->voice ?? 'alloy',
                'instructions' => $instructions,
                'input_audio_transcription' => ['model' => 'gpt-4o-transcribe'],
                'temperature' => $voiceConfig->temperature ?? 0.8,
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
                'voice' => $voiceConfig->voice,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    private function buildVoiceInstructions(
        ChatWidgetConfig $widget,
        ?ChatbotBehaviorConfig $behavior,
        \App\Models\VoiceAgentConfig $voiceConfig,
    ): string {
        $companyName = $widget->company_name ?: 'our hotel';
        $assistantName = $behavior->assistant_name ?? 'Hotel Assistant';

        $base = $voiceConfig->voice_instructions;

        if (!$base) {
            $tone = $behavior->tone ?? 'professional';
            $style = $behavior->sales_style ?? 'consultative';

            $base = <<<PROMPT
# Identity
You are {$assistantName}, the voice AI assistant for {$companyName}.

# Task
Help hotel guests and website visitors with questions about the hotel: rooms, amenities, check-in/out, dining, booking, loyalty program, and local recommendations.

# Tone
{$tone}, warm, and {$style}. Be concise in voice — keep answers to 2-3 sentences unless more detail is requested.

# Rules
- Always greet the caller warmly
- If you don't know specific hotel details, suggest they contact the front desk
- Never make up prices or availability — offer to connect them with reservations
- If they want to book, collect their name, dates, and room preference, then confirm
- Speak naturally with occasional filler words for a human feel
PROMPT;
        }

        try {
            $knowledgeSummary = $this->knowledge->getKnowledgeContext('hotel information general', $widget->organization_id);
            if ($knowledgeSummary) {
                $base .= "\n\n# Hotel Knowledge Base\n" . $knowledgeSummary;
            }
        } catch (\Throwable $e) {
            // Knowledge service failure shouldn't break voice
        }

        return $base;
    }
}
