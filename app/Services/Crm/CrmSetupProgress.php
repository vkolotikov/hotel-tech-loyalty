<?php

namespace App\Services\Crm;

use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\KnowledgeDocument;
use App\Models\KnowledgeItem;
use App\Models\Pipeline;
use App\Models\Staff;
use App\Models\Visitor;
use App\Scopes\TenantScope;

/**
 * What a HexaTech CRM still lacks before it works for the venue (2026-11-07), the server's answer as Loyalty's
 * SetupProgress is: each step is done when the data says so, never when someone ticks it. Reads only.
 *
 * - `widget`: the chat widget runs on the venue's website — a visitor was seen or a chat started;
 * - `assistant`: the AI assistant's behaviour was saved for the organisation (ChatbotBehaviorConfig);
 * - `knowledge`: the assistant has something to answer from — KNOWLEDGE_MINIMUM active answers, or a processed document;
 * - `reply`: a person answered a chat in the inbox;
 * - `pipeline`: leads have a pipeline with its stages;
 * - `team`: a colleague besides the first person signs in.
 *
 * The workspace places and words each step and links it to its area; `done` counts the steps finished.
 */
final class CrmSetupProgress
{
    public const KNOWLEDGE_MINIMUM = 5;

    public const STEPS = ['widget', 'assistant', 'knowledge', 'reply', 'pipeline', 'team'];

    /** @return array{steps: list<array{key: string, done: bool}>, done: int, total: int, complete: bool} */
    public function for(int $orgId): array
    {
        $done = [
            'widget'    => Visitor::query()->exists() || ChatConversation::query()->exists(),
            'assistant' => ChatbotBehaviorConfig::withoutGlobalScopes()->where('organization_id', $orgId)->exists(),
            'knowledge' => KnowledgeItem::query()->where('is_active', true)->count() >= self::KNOWLEDGE_MINIMUM
                || KnowledgeDocument::query()->completed()->exists(),
            'reply'     => ChatMessage::withoutGlobalScope(TenantScope::class)
                ->whereIn('conversation_id', ChatConversation::query()->select('id'))
                ->where('sender_type', 'agent')
                ->exists(),
            'pipeline'  => Pipeline::query()->whereHas('stages')->exists(),
            'team'      => Staff::query()->where('is_active', true)->count() > 1,
        ];

        $steps = array_map(fn (string $key) => ['key' => $key, 'done' => (bool) $done[$key]], self::STEPS);
        $count = count(array_filter($done));

        return ['steps' => $steps, 'done' => $count, 'total' => count(self::STEPS), 'complete' => $count === count(self::STEPS)];
    }
}
