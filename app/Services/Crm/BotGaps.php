<?php

namespace App\Services\Crm;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatMessageFeedback;
use App\Scopes\TenantScope;
use Illuminate\Support\Collection;

/**
 * HexaTech CRM's "Teach the assistant" list (2026-11-07): the assistant's answers a person rated wrong in the inbox
 * that nobody has corrected since, each with the visitor's question it answered. Reads only.
 *
 * The correction is the inbox's own feedback endpoint (`POST admin/chat-inbox/messages/{id}/feedback` with
 * `corrected_answer` and `apply_to_training`), the one writer of the "AI Corrections" knowledge it creates — so an
 * answer leaves this list once any person's feedback on it was applied to training, whoever rated it first.
 */
final class BotGaps
{
    public const LIMIT = 50;

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $bad = ChatMessageFeedback::query()
            ->where('rating', 'bad')
            ->whereNotIn('message_id', ChatMessageFeedback::query()->where('applied_to_training', true)->select('message_id'))
            ->with('user:id,name')
            ->orderByDesc('updated_at')
            ->get(['id', 'message_id', 'user_id', 'comment', 'updated_at']);

        // One row per answer: the newest rating of it, with how many people rated it wrong.
        $byMessage = $bad->groupBy('message_id');
        $messageIds = $byMessage->keys()->map(fn ($id) => (int) $id)->all();
        if ($messageIds === []) {
            return [];
        }

        // Only answers in this organisation's conversations (TenantScope on ChatConversation); messages are read by
        // conversation, as the inbox reads them.
        $conversations = ChatConversation::query()
            ->whereIn('id', ChatMessage::withoutGlobalScope(TenantScope::class)->whereIn('id', $messageIds)->select('conversation_id'))
            ->get(['id', 'visitor_name', 'visitor_email'])
            ->keyBy('id');
        /** @var Collection<int, ChatMessage> $answers */
        $answers = ChatMessage::withoutGlobalScope(TenantScope::class)
            ->whereIn('id', $messageIds)
            ->whereIn('conversation_id', $conversations->keys())
            ->where('sender_type', 'ai')
            ->get(['id', 'conversation_id', 'content', 'created_at']);

        $out = [];
        foreach ($byMessage as $messageId => $ratings) {
            $answer = $answers->firstWhere('id', (int) $messageId);
            if (!$answer) {
                continue;
            }
            $question = ChatMessage::withoutGlobalScope(TenantScope::class)
                ->where('conversation_id', $answer->conversation_id)
                ->where('sender_type', 'visitor')
                ->where('created_at', '<', $answer->created_at)
                ->orderByDesc('created_at')
                ->value('content');
            $newest = $ratings->first();
            $conversation = $conversations[$answer->conversation_id] ?? null;
            $out[] = [
                'message_id'      => (int) $answer->id,
                'conversation_id' => (int) $answer->conversation_id,
                'visitor'         => $conversation?->visitor_name ?: ($conversation?->visitor_email ?: null),
                'question'        => $question !== null ? mb_substr((string) $question, 0, 1000) : null,
                'answer'          => mb_substr((string) $answer->content, 0, 2000),
                'comment'         => $newest->comment ? mb_substr((string) $newest->comment, 0, 1000) : null,
                'rated_by'        => $newest->user?->name,
                'rated_at'        => $newest->updated_at?->toIso8601String(),
                'ratings'         => $ratings->count(),
                // Nothing to teach without the question the answer was for (the feedback endpoint stores none then).
                'teachable'       => $question !== null && trim((string) $question) !== '',
            ];
            if (count($out) >= self::LIMIT) {
                break;
            }
        }

        return $out;
    }
}
