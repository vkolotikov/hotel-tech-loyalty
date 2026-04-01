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
     * GET /v1/widget/{widgetKey}/config
     * Returns widget configuration for the embeddable widget.
     */
    public function getConfig(string $widgetKey): JsonResponse
    {
        $config = ChatWidgetConfig::where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found or inactive'], 404);
        }

        $behavior = ChatbotBehaviorConfig::where('organization_id', $config->organization_id)->first();

        return response()->json([
            'company_name'    => $config->company_name,
            'welcome_message' => $config->welcome_message,
            'primary_color'   => $config->primary_color,
            'position'        => $config->position,
            'icon_style'      => $config->icon_style,
            'launcher_shape'  => $config->launcher_shape,
            'launcher_icon'   => $config->launcher_icon,
            'lead_capture'    => [
                'enabled' => $config->lead_capture_enabled,
                'fields'  => $config->lead_capture_fields ?? ['name' => true, 'email' => true, 'phone' => false],
                'delay'   => $config->lead_capture_delay,
            ],
            'assistant_name'  => $behavior->assistant_name ?? 'Hotel Assistant',
            'assistant_avatar' => $behavior->assistant_avatar ?? null,
            'offline_message' => $config->offline_message,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/init
     * Initialize a chat session for a visitor.
     */
    public function initSession(Request $request, string $widgetKey): JsonResponse
    {
        $config = ChatWidgetConfig::where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $sessionId = $request->input('session_id') ?? Str::uuid()->toString();
        $visitorName = $request->input('visitor_name');

        // Create AiConversation for AI message history
        AiConversation::firstOrCreate(
            ['session_id' => $sessionId],
            [
                'organization_id' => $config->organization_id,
                'member_id' => null,
                'messages' => [],
                'model' => 'gpt-4o',
                'is_active' => true,
            ]
        );

        // Create ChatConversation for inbox tracking
        ChatConversation::firstOrCreate(
            ['session_id' => $sessionId],
            [
                'organization_id' => $config->organization_id,
                'visitor_name' => $visitorName,
                'channel' => 'widget',
                'status' => 'active',
                'last_message_at' => now(),
            ]
        );

        return response()->json([
            'session_id' => $sessionId,
            'welcome_message' => $config->welcome_message,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/message
     * Send a visitor message and get AI response.
     */
    public function sendMessage(Request $request, string $widgetKey): JsonResponse
    {
        $request->validate([
            'message'    => 'required|string|max:2000',
            'session_id' => 'required|string|max:64',
        ]);

        $config = ChatWidgetConfig::where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;
        $behaviorConfig = ChatbotBehaviorConfig::where('organization_id', $orgId)->first();
        $modelConfig = ChatbotModelConfig::where('organization_id', $orgId)->first();

        // Get knowledge context
        $knowledgeContext = $this->knowledge->getKnowledgeContext($request->message, $orgId);

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

        // Build system prompt for widget visitor (no member context)
        $systemPrompt = $this->buildWidgetSystemPrompt($behaviorConfig, $knowledgeContext, $config->company_name);

        $contextMessages = array_slice(
            array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $messages),
            -20
        );

        // Call AI provider (supports OpenAI, Anthropic, Google)
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

        // Store in chat_messages for inbox
        $chatConv = ChatConversation::where('session_id', $request->session_id)->first();
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

        return response()->json([
            'response' => $aiResponse,
            'session_id' => $request->session_id,
        ]);
    }

    /**
     * POST /v1/widget/{widgetKey}/lead
     * Capture lead info from widget visitor (creates an Inquiry).
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

        $config = ChatWidgetConfig::where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['error' => 'Widget not found'], 404);
        }

        $orgId = $config->organization_id;

        // Find or create a guest record
        $guest = null;
        if (!empty($validated['email'])) {
            $guest = \App\Models\Guest::where('organization_id', $orgId)
                ->where('email', $validated['email'])
                ->first();
        }

        if (!$guest) {
            $nameParts = explode(' ', $validated['name'] ?? 'Widget Visitor', 2);
            $guest = \App\Models\Guest::create([
                'organization_id' => $orgId,
                'first_name'      => $nameParts[0] ?? '',
                'last_name'       => $nameParts[1] ?? '',
                'full_name'       => $validated['name'] ?? 'Widget Visitor',
                'email'           => $validated['email'] ?? null,
                'phone'           => $validated['phone'] ?? null,
                'guest_type'      => 'individual',
            ]);
        }

        // Create an inquiry linked to the guest
        $inquiry = \App\Models\Inquiry::create([
            'organization_id' => $orgId,
            'guest_id'        => $guest->id,
            'notes'           => $validated['message'] ?? null,
            'source'          => 'chatbot',
            'status'          => 'new',
            'inquiry_type'    => 'general',
        ]);

        return response()->json([
            'success' => true,
            'inquiry_id' => $inquiry->id,
        ]);
    }

    /**
     * GET /v1/widget/{widgetKey}/popup-rules
     * Return active popup rules for the widget.
     */
    public function getPopupRules(string $widgetKey): JsonResponse
    {
        $config = ChatWidgetConfig::where('widget_key', $widgetKey)
            ->where('is_active', true)
            ->first();

        if (!$config) {
            return response()->json(['rules' => []]);
        }

        $rules = PopupRule::where('organization_id', $config->organization_id)
            ->active()
            ->orderByDesc('priority')
            ->get(['id', 'trigger_type', 'trigger_value', 'url_match_type', 'url_match_value', 'visitor_type', 'language_targets', 'message', 'quick_replies', 'priority']);

        // Increment impressions
        PopupRule::where('organization_id', $config->organization_id)
            ->active()
            ->increment('impressions_count');

        return response()->json(['rules' => $rules]);
    }

    private function buildWidgetSystemPrompt(?ChatbotBehaviorConfig $config, string $knowledgeContext, string $companyName): string
    {
        $parts = [];

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
}
