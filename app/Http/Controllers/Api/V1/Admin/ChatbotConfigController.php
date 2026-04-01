<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatbotConfigController extends Controller
{
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
}
