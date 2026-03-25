<?php

namespace App\Http\Controllers\Api\V1\Chatbot;

use App\Http\Controllers\Controller;
use App\Models\AiConversation;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChatbotController extends Controller
{
    public function __construct(protected OpenAiService $openAi) {}

    public function message(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message'    => 'required|string|max:1000',
            'session_id' => 'nullable|string|max:64',
        ]);

        $member = $request->user()->loyaltyMember()->with(['tier', 'user'])->firstOrFail();
        $sessionId = $validated['session_id'] ?? Str::uuid()->toString();

        // Load or create conversation
        $conversation = AiConversation::firstOrCreate(
            ['session_id' => $sessionId, 'member_id' => $member->id],
            ['messages' => [], 'model' => 'gpt-4o', 'is_active' => true]
        );

        $messages = $conversation->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $validated['message'], 'timestamp' => now()->toIso8601String()];

        // Get AI response
        $aiResponse = $this->openAi->chat(
            array_map(fn($m) => ['role' => $m['role'], 'content' => $m['content']], $messages),
            $member
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
