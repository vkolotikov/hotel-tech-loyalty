<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Services\KnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatbotConfigController extends Controller
{
    use \App\Traits\DispatchesAiChat;

    public function __construct(protected KnowledgeService $knowledge) {}

    public function getBehavior(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $config = ChatbotBehaviorConfig::getForOrg($orgId);

        return response()->json($config);
    }

    public function updateBehavior(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'assistant_name'    => 'nullable|string|max:120',
            'assistant_avatar'  => 'nullable|string|max:500',
            'identity'          => 'nullable|string|max:2000',
            'goal'              => 'nullable|string|max:1000',
            'sales_style'       => 'nullable|in:consultative,aggressive,passive,educational',
            'tone'              => 'nullable|in:professional,friendly,casual,formal',
            'reply_length'      => 'nullable|in:concise,moderate,detailed',
            'language'          => 'nullable|string|max:10',
            'core_rules'        => 'nullable|array',
            'core_rules.*'      => 'string|max:500',
            'escalation_policy' => 'nullable|string|max:2000',
            'fallback_message'  => 'nullable|string|max:500',
            'custom_instructions' => 'nullable|string|max:3000',
            'is_active'         => 'nullable|boolean',
        ]);

        $orgId = $request->user()->organization_id;
        $brandId = Brand::currentOrDefaultIdForOrg($orgId);
        $config = ChatbotBehaviorConfig::withoutGlobalScopes()->updateOrCreate(
            ['organization_id' => $orgId, 'brand_id' => $brandId],
            array_merge($validated, ['organization_id' => $orgId, 'brand_id' => $brandId])
        );

        return response()->json($config);
    }

    public function getModelConfig(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $config = ChatbotModelConfig::getForOrg($orgId);

        return response()->json($config);
    }

    public function updateModelConfig(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider'          => 'nullable|in:openai,anthropic,google',
            'model_name'        => 'nullable|string|max:60',
            'temperature'       => 'nullable|numeric|between:0,2',
            'top_p'             => 'nullable|numeric|between:0,1',
            'max_tokens'        => 'nullable|integer|between:50,4096',
            'frequency_penalty' => 'nullable|numeric|between:0,2',
            'presence_penalty'  => 'nullable|numeric|between:0,2',
            'stop_sequences'    => 'nullable|array',
            'reasoning_effort'  => 'nullable|in:none,low,medium,high,xhigh',
            'verbosity'         => 'nullable|in:low,medium,high',
        ]);

        $orgId = $request->user()->organization_id;
        $brandId = Brand::currentOrDefaultIdForOrg($orgId);
        $config = ChatbotModelConfig::withoutGlobalScopes()->updateOrCreate(
            ['organization_id' => $orgId, 'brand_id' => $brandId],
            array_merge($validated, ['organization_id' => $orgId, 'brand_id' => $brandId])
        );

        return response()->json($config);
    }

    /**
     * POST /v1/admin/chatbot-config/probe-model — verify a model id is
     * reachable on the org's API key BEFORE saving the config.
     *
     * Strategy by provider:
     *   openai    → GET /v1/models, look for the id in the data array
     *   anthropic → POST /v1/messages with a 1-token "ping" (cheapest valid call)
     *   google    → GET /v1beta/models/{id}
     *
     * Returns `available: true` only when we got a definitive yes. Network
     * errors return `available: false` with the underlying message so the
     * admin can see whether it's a key issue, a typo, or a regional rollout.
     */
    public function probeModel(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider'   => 'required|in:openai,anthropic,google',
            'model_name' => 'required|string|max:120',
        ]);

        return match ($validated['provider']) {
            'openai'    => $this->probeOpenAi($validated['model_name']),
            'anthropic' => $this->probeAnthropic($validated['model_name']),
            'google'    => $this->probeGoogle($validated['model_name']),
        };
    }

    private function probeOpenAi(string $model): JsonResponse
    {
        $apiKey = config('openai.api_key', env('OPENAI_API_KEY', ''));
        if (!$apiKey) {
            return response()->json(['available' => false, 'message' => 'No OpenAI API key configured. Set OPENAI_API_KEY in Settings → Integrations.']);
        }

        try {
            $response = \Illuminate\Support\Facades\Http::withToken($apiKey)
                ->timeout(10)
                ->get('https://api.openai.com/v1/models');

            if ($response->failed()) {
                return response()->json([
                    'available' => false,
                    'message'   => 'OpenAI API rejected the key (HTTP ' . $response->status() . ')',
                ]);
            }

            $ids = collect($response->json('data') ?? [])->pluck('id')->all();
            $found = in_array($model, $ids, true);
            return response()->json([
                'available'   => $found,
                'message'     => $found ? 'Available' : "Not enabled on this account ({" . count($ids) . " models visible})",
                'model_count' => count($ids),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['available' => false, 'message' => 'Probe failed: ' . $e->getMessage()]);
        }
    }

    private function probeAnthropic(string $model): JsonResponse
    {
        $apiKey = config('services.anthropic.api_key', env('ANTHROPIC_API_KEY'));
        if (!$apiKey) {
            return response()->json(['available' => false, 'message' => 'No Anthropic API key configured.']);
        }

        try {
            // Anthropic doesn't expose a public /models endpoint; use a
            // 1-token messages call as a cheap reachability check. A 200
            // means the model id was accepted; a 404 means it wasn't.
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'x-api-key'         => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type'      => 'application/json',
            ])->timeout(15)->post('https://api.anthropic.com/v1/messages', [
                'model'      => $model,
                'max_tokens' => 1,
                'messages'   => [['role' => 'user', 'content' => 'ping']],
            ]);

            if ($response->successful()) {
                return response()->json(['available' => true, 'message' => 'Available']);
            }
            $err = $response->json('error.message') ?? substr($response->body(), 0, 200);
            return response()->json([
                'available' => false,
                'message'   => "HTTP {$response->status()}: {$err}",
            ]);
        } catch (\Throwable $e) {
            return response()->json(['available' => false, 'message' => 'Probe failed: ' . $e->getMessage()]);
        }
    }

    private function probeGoogle(string $model): JsonResponse
    {
        $apiKey = config('services.google.gemini_api_key', env('GOOGLE_GEMINI_API_KEY'));
        if (!$apiKey) {
            return response()->json(['available' => false, 'message' => 'No Google Gemini API key configured.']);
        }

        try {
            $response = \Illuminate\Support\Facades\Http::timeout(10)
                ->get("https://generativelanguage.googleapis.com/v1beta/models/{$model}?key={$apiKey}");

            if ($response->successful()) {
                return response()->json(['available' => true, 'message' => 'Available']);
            }
            return response()->json([
                'available' => false,
                'message'   => "HTTP {$response->status()}: " . substr($response->body(), 0, 200),
            ]);
        } catch (\Throwable $e) {
            return response()->json(['available' => false, 'message' => 'Probe failed: ' . $e->getMessage()]);
        }
    }

    /**
     * Try the AI live with the org's current behavior + model + KB so admins
     * can verify their config without going through the public widget. Reuses
     * the same prompt-building approach the widget uses.
     */
    public function testChat(Request $request): JsonResponse
    {
        $request->validate([
            'message' => 'required|string|max:2000',
            'history' => 'nullable|array|max:20',
        ]);

        $orgId = $request->user()->organization_id;
        $brandId = Brand::currentOrDefaultIdForOrg($orgId);
        // BelongsToBrand global scope already filters by current_brand_id
        // when bound — these are explicit so the testChat endpoint behaves
        // identically when called from within a brand context vs. without.
        $behavior = ChatbotBehaviorConfig::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->first();
        $model = ChatbotModelConfig::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('brand_id', $brandId)
            ->first();

        $kbContext = '';
        try {
            $kbContext = $this->knowledge->getKnowledgeContext($request->message, $orgId);
        } catch (\Throwable $e) {
            \Log::warning('Test chat KB lookup failed: ' . $e->getMessage());
        }

        $companyName = (string) (\App\Models\Organization::find($orgId)->name ?? '');
        $systemPrompt = $this->buildTestSystemPrompt($behavior, $kbContext, $companyName);

        $history = $request->input('history', []);
        $history[] = ['role' => 'user', 'content' => $request->message];

        $provider = $model->provider ?? 'openai';
        $modelName = $model->model_name ?? 'gpt-4o';
        $temperature = (float) ($model->temperature ?? 0.7);
        $maxTokens = (int) ($model->max_tokens ?? 1024);
        $extraParams = array_filter([
            'top_p'             => $model->top_p ?? null,
            'frequency_penalty' => $model->frequency_penalty ?? null,
            'presence_penalty'  => $model->presence_penalty ?? null,
            'stop_sequences'    => $model->stop_sequences ?? null,
            'reasoning_effort'  => $model->reasoning_effort ?? 'low',
            'verbosity'         => $model->verbosity ?? 'medium',
            'prompt_cache_key'  => "org-{$orgId}-test-chat",
        ], fn($v) => $v !== null);

        try {
            $reply = $this->callProvider($provider, $systemPrompt, $history, $modelName, $temperature, $maxTokens, $extraParams);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'AI call failed: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'reply'           => $reply,
            'kb_context_used' => $kbContext !== '',
            'system_prompt'   => $systemPrompt, // surfaced for debugging
        ]);
    }

    private function buildTestSystemPrompt(?ChatbotBehaviorConfig $config, string $kb, string $companyName): string
    {
        $parts = [];
        if ($config && $config->identity) {
            $parts[] = $config->identity;
        } else {
            $name = $config->assistant_name ?? 'Hotel Assistant';
            $parts[] = "You are {$name}, a helpful hotel concierge AI assistant" . ($companyName ? " for {$companyName}" : '') . ".";
        }
        if ($config && $config->goal) $parts[] = "Your goal: {$config->goal}";
        $salesMap = [
            'consultative' => 'Ask questions to understand the visitor\'s needs before making recommendations.',
            'aggressive'   => 'Proactively suggest offers, upsells, and booking opportunities.',
            'passive'      => 'Only suggest products or services when the visitor explicitly asks.',
            'educational'  => 'Focus on informing and educating the visitor, letting them decide.',
        ];
        if ($config && !empty($config->sales_style) && isset($salesMap[$config->sales_style])) {
            $parts[] = $salesMap[$config->sales_style];
        }
        if ($config && !empty($config->core_rules)) {
            $parts[] = "Rules:";
            foreach ($config->core_rules as $r) $parts[] = "- {$r}";
        }
        if ($config && $config->custom_instructions) $parts[] = $config->custom_instructions;
        if ($kb) $parts[] = "\n{$kb}";
        return implode("\n", $parts);
    }

    /**
     * Use the AI to suggest 5-10 search keywords for a given KB question/answer
     * so admins don't have to come up with them by hand.
     */
    public function suggestKeywords(Request $request): JsonResponse
    {
        $request->validate([
            'question' => 'required|string|max:2000',
            'answer'   => 'nullable|string|max:5000',
        ]);

        $prompt = "Given this knowledge base entry, return ONLY a JSON array of 5-10 short search keywords (lowercase, single words or 2-word phrases) that visitors might use to find this info. No explanation, just the JSON array.\n\nQuestion: {$request->question}\nAnswer: " . ($request->answer ?? '');

        try {
            $response = \OpenAI\Laravel\Facades\OpenAI::chat()->create([
                'model'       => 'gpt-4o-mini',
                'messages'    => [['role' => 'user', 'content' => $prompt]],
                'max_tokens'  => 200,
                'temperature' => 0.3,
            ]);
            $raw = trim($response->choices[0]->message->content ?? '[]');
            // Strip markdown fences if the model added them.
            $raw = preg_replace('/^```(?:json)?\s*|\s*```$/m', '', $raw);
            $keywords = json_decode($raw, true);
            if (!is_array($keywords)) $keywords = [];
            $keywords = array_values(array_filter(array_map('strtolower', array_map('trim', $keywords))));
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Keyword suggestion failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['keywords' => $keywords]);
    }
}
