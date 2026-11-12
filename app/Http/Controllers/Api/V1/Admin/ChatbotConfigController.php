<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Exceptions\AiHelperRefused;
use App\Models\Organization;
use App\Services\AiUsageService;
use App\Services\KnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ChatbotConfigController extends Controller
{
    use \App\Traits\DispatchesAiChat;

    /** The model suggest-keywords asks; its spend is recorded as feature `knowledge_keywords`. */
    private const KEYWORDS_MODEL = 'gpt-4o-mini';

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

        // The plan's model list beside the settings (2026-11-12, HexaTech CRM's model choice): null or empty means every
        // model (AiUsageService::isModelAllowed), so a page can mark the models the assistant could not answer with.
        return response()->json([...$config->toArray(), 'allowed_models' => $this->allowedModels($request->user()->organization)]);
    }

    /** @return list<string>|null */
    private function allowedModels(?Organization $org): ?array
    {
        $allowed = $org?->featureValue('ai_allowed_models');

        return is_array($allowed) && $allowed !== [] ? array_values(array_map('strval', $allowed)) : null;
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

        // A switch to a model the plan does not include is refused (2026-11-12): saved, the widget would hand every
        // chat to the team (`model_not_allowed`) without anyone being told. A model already saved stays savable, so a
        // venue whose plan changed can still change its other settings.
        if (!empty($validated['model_name'])) {
            $stored = ChatbotModelConfig::withoutGlobalScopes()->where('organization_id', $orgId)->where('brand_id', $brandId)->value('model_name');
            if ($validated['model_name'] !== $stored && !app(AiUsageService::class)->isModelAllowed($request->user()->organization, $validated['model_name'])) {
                return response()->json(['error' => 'model_not_allowed', 'message' => 'Your plan does not include this AI model.'], 403);
            }
        }

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
     *   anthropic → GET /v1/models/{id} through the SDK (no tokens spent)
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
            // GET /v1/models/{id} (SDK, API version 2026-10-21): answers for
            // this key without spending tokens, and says whether the model is
            // active, deprecated or retired. A 404 means the id is unknown.
            $info = \App\Services\Ai\AnthropicSdk::client((string) $apiKey, 15)->models->retrieve($model);
            $lifecycle = $info->lifecycle ?? 'active';

            if ($lifecycle === 'retired') {
                return response()->json(['available' => false, 'message' => 'Retired by Anthropic — choose a current model']);
            }
            if ($lifecycle === 'deprecated') {
                $retires = ($info->retiresAt ?? null)?->format('Y-m-d');
                return response()->json([
                    'available' => true,
                    'message'   => 'Available, but deprecated' . ($retires ? " (retires {$retires})" : '') . ' — consider switching',
                ]);
            }

            return response()->json(['available' => true, 'message' => 'Available']);
        } catch (\Anthropic\Core\Exceptions\APIStatusException $e) {
            return response()->json([
                'available' => false,
                'message'   => "HTTP {$e->status}: " . \App\Services\Ai\AnthropicSdk::errorDetail($e),
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
        // The month's AI allowance stops the test before the provider is asked (2026-11-08); its spend is recorded
        // by callProvider as feature `chatbot_test`.
        AiHelperRefused::unlessAllowanceLeft(Organization::withoutGlobalScopes()->find($orgId));
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
            $reply = $this->callProvider($provider, $systemPrompt, $history, $modelName, $temperature, $maxTokens, $extraParams, 'chatbot_test');
        } catch (\App\Exceptions\AiModelNotAllowed $e) {
            return response()->json(['error' => 'model_not_allowed', 'message' => 'Your plan does not include the AI model this assistant is set to use.'], 403);
        } catch (\Throwable $e) {
            // The provider's own words stay in the log.
            Log::warning('Chatbot test chat failed: ' . $e->getMessage(), ['org_id' => $orgId, 'provider' => $provider, 'model' => $modelName]);
            throw AiHelperRefused::failed();
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

        $org = Organization::withoutGlobalScopes()->find($request->user()->organization_id);
        AiHelperRefused::unlessAllowanceLeft($org);

        $prompt = "Given this knowledge base entry, return ONLY a JSON array of 5-10 short search keywords (lowercase, single words or 2-word phrases) that visitors might use to find this info. No explanation, just the JSON array.\n\nQuestion: {$request->question}\nAnswer: " . ($request->answer ?? '');

        try {
            $response = \OpenAI\Laravel\Facades\OpenAI::chat()->create([
                'model'       => self::KEYWORDS_MODEL,
                'messages'    => [['role' => 'user', 'content' => $prompt]],
                'max_tokens'  => 200,
                'temperature' => 0.3,
            ]);
        } catch (\Throwable $e) {
            // The provider's own words stay in the log.
            Log::warning('Keyword suggestion failed: ' . $e->getMessage(), ['org_id' => $org?->id]);
            throw AiHelperRefused::failed();
        }

        if ($org) {
            app(AiUsageService::class)->recordUsage(
                orgId: (int) $org->id,
                model: self::KEYWORDS_MODEL,
                inputTokens: (int) ($response->usage->promptTokens ?? 0),
                outputTokens: (int) ($response->usage->completionTokens ?? 0),
                feature: 'knowledge_keywords',
            );
        }

        $raw = trim((string) ($response->choices[0]->message->content ?? '[]'));
        // Strip markdown fences if the model added them.
        $raw = preg_replace('/^```(?:json)?\s*|\s*```$/m', '', $raw);
        $keywords = json_decode((string) $raw, true);
        if (!is_array($keywords)) $keywords = [];
        $keywords = array_values(array_filter(array_map('strtolower', array_map('trim', array_filter($keywords, 'is_string')))));

        return response()->json(['keywords' => $keywords]);
    }
}
