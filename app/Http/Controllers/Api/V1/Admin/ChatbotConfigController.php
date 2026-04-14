<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
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
        $config = ChatbotBehaviorConfig::updateOrCreate(
            ['organization_id' => $orgId],
            array_merge($validated, ['organization_id' => $orgId])
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
        ]);

        $orgId = $request->user()->organization_id;
        $config = ChatbotModelConfig::updateOrCreate(
            ['organization_id' => $orgId],
            array_merge($validated, ['organization_id' => $orgId])
        );

        return response()->json($config);
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
        $behavior = ChatbotBehaviorConfig::where('organization_id', $orgId)->first();
        $model = ChatbotModelConfig::where('organization_id', $orgId)->first();

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
