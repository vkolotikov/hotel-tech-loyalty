<?php

namespace App\Http\Controllers\Api\V1\Chatbot;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatbotModelConfig;
use App\Services\KnowledgeService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChatbotController extends Controller
{
    public function __construct(
        protected OpenAiService $openAi,
        protected KnowledgeService $knowledge,
    ) {}

    public function message(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message'    => 'required|string|max:1000',
            'session_id' => 'nullable|string|max:64',
        ]);

        $member = $request->user()->loyaltyMember()->with(['tier', 'user'])->firstOrFail();
        $orgId = $request->user()->organization_id;
        $sessionId = $validated['session_id'] ?? Str::uuid()->toString();

        // Load chatbot configuration for the organization
        $behaviorConfig = ChatbotBehaviorConfig::getForOrg($orgId);
        $modelConfig = ChatbotModelConfig::getForOrg($orgId);

        // Get knowledge context relevant to the user's message
        $knowledgeContext = $this->knowledge->getKnowledgeContext($validated['message'], $orgId);

        // Load or create conversation
        $conversation = AiConversation::firstOrCreate(
            ['session_id' => $sessionId, 'member_id' => $member->id],
            [
                'organization_id' => $orgId,
                'messages' => [],
                'model' => $modelConfig->model_name ?? 'gpt-4o',
                'is_active' => true,
            ]
        );

        $messages = $conversation->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $validated['message'], 'timestamp' => now()->toIso8601String()];

        // Keep last 20 messages for context window
        $contextMessages = array_slice(
            array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $messages),
            -20
        );

        // Get AI response with behavior config, model config, and knowledge context
        $aiResponse = $this->openAi->chat(
            $contextMessages,
            $member,
            $behaviorConfig->exists ? $behaviorConfig : null,
            $modelConfig->exists ? $modelConfig : null,
            $knowledgeContext,
        );

        $messages[] = ['role' => 'assistant', 'content' => $aiResponse, 'timestamp' => now()->toIso8601String()];

        $conversation->update([
            'messages'    => $messages,
            'tokens_used' => $conversation->tokens_used + (int) (strlen($aiResponse) / 4),
        ]);

        return response()->json([
            'response'   => $aiResponse,
            'session_id' => $sessionId,
        ]);
    }
}
