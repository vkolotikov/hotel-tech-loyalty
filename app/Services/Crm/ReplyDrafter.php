<?php

namespace App\Services\Crm;

use App\Models\ChatbotBehaviorConfig;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Organization;
use App\Scopes\TenantScope;
use App\Services\AiUsageService;
use App\Services\KnowledgeService;
use Illuminate\Support\Facades\Log;
use OpenAI\Laravel\Facades\OpenAI;

/**
 * HexaTech CRM's "Draft a reply" in the inbox (2026-11-07): the AI writes a reply a person reads, changes and sends —
 * it never sends anything itself and stores nothing but the spend. It speaks as the venue's assistant is set up to
 * (ChatbotBehaviorConfig: name, tone, length, language, rules) and answers from the venue's knowledge
 * (KnowledgeService::searchRelevantItems, read without counting a use).
 *
 * Refusals, in our words (CrmRefused): `ai_budget_used_up` once the month's AI allowance is spent
 * (AiUsageService::budgetStatus, the same stop as the website widget), `model_not_allowed` when the plan's model list
 * leaves the drafting model out, `nothing_to_answer` when the visitor has not written yet, `ai_failed` when the
 * provider fails (its text goes to the log only). Every call's spend is recorded as feature `crm_draft`.
 */
final class ReplyDrafter
{
    public const MODEL = 'gpt-4o-mini';

    public const MAX_MESSAGES = 16;

    public function __construct(private readonly AiUsageService $usage, private readonly KnowledgeService $knowledge)
    {
    }

    /** @return array{draft: string} */
    public function draft(Organization $org, ChatConversation $conversation, ?string $instruction = null): array
    {
        if (!$this->usage->isModelAllowed($org, self::MODEL)) {
            throw new CrmRefused('model_not_allowed', 'Your plan does not include the AI model that drafts replies.', 403);
        }
        if (($this->usage->budgetStatus($org)['status'] ?? null) === 'over') {
            throw new CrmRefused('ai_budget_used_up', "This month's AI allowance is used up. Drafts are back next month, or with a larger package.", 403);
        }

        $messages = ChatMessage::withoutGlobalScope(TenantScope::class)
            ->where('conversation_id', $conversation->id)
            ->orderByDesc('created_at')
            ->limit(self::MAX_MESSAGES)
            ->get(['sender_type', 'content', 'created_at'])
            ->reverse()
            ->values();
        $lastVisitor = $messages->last(fn (ChatMessage $m) => $m->sender_type === 'visitor');
        if (!$lastVisitor || trim((string) $lastVisitor->content) === '') {
            throw new CrmRefused('nothing_to_answer', 'The visitor has not written anything to answer yet.', 422);
        }

        $behavior = ChatbotBehaviorConfig::getForOrg((int) $org->id);
        $facts = $this->knowledge->searchRelevantItems((string) $lastVisitor->content, (int) $org->id, 5);

        $thread = $messages->map(fn (ChatMessage $m) => '[' . match ($m->sender_type) {
            'visitor' => 'VISITOR',
            'ai'      => 'ASSISTANT',
            'agent'   => 'STAFF',
            default   => 'NOTE',
        } . '] ' . mb_substr((string) $m->content, 0, 800))->implode("\n");
        $knowledge = $facts->isEmpty()
            ? '(no matching answers in the knowledge base: do not invent prices, times or policies; offer to check)'
            : $facts->map(fn ($i) => "Q: {$i->question}\nA: {$i->answer}")->implode("\n\n");
        $rules = collect((array) ($behavior->core_rules ?? []))->filter()->map(fn ($r) => '- ' . mb_substr((string) $r, 0, 300))->implode("\n");
        $length = match ($behavior->reply_length) {
            'concise'  => 'one to three short sentences',
            'detailed' => 'a complete answer of up to two short paragraphs',
            default    => 'two to four sentences',
        };
        $venue = (string) $org->name;
        $assistant = trim((string) ($behavior->assistant_name ?? '')) ?: 'the team';
        $tone = (string) ($behavior->tone ?: 'professional');
        $extra = $instruction !== null && trim($instruction) !== '' ? "\nThe staff member asks for this reply: " . mb_substr(trim($instruction), 0, 300) : '';
        $identity = trim((string) ($behavior->identity ?? '')) !== '' ? "\nAbout the venue: " . mb_substr((string) $behavior->identity, 0, 1500) : '';

        $prompt = <<<PROMPT
You draft the next reply a staff member of {$venue} will send in a website chat. The staff member reads and edits it
before sending. Write as a person of the venue's team ({$assistant}), in a {$tone} tone, {$length}.
Reply in the language the visitor writes in. Answer the visitor's latest message; use only the facts below and the
conversation. Never promise what the facts do not say; when unsure, say you will check. No greeting if the
conversation already has one. Plain text only: no markdown, no placeholders like [name], no signature.{$identity}{$extra}

Venue rules:
{$rules}

FACTS FROM THE VENUE'S KNOWLEDGE BASE:
{$knowledge}

CONVERSATION (oldest first):
{$thread}
PROMPT;

        try {
            $response = OpenAI::chat()->create([
                'model'       => self::MODEL,
                'messages'    => [['role' => 'user', 'content' => $prompt]],
                'max_tokens'  => 400,
                'temperature' => 0.4,
            ]);
        } catch (\Throwable $e) {
            Log::warning('CRM reply draft failed: ' . $e->getMessage(), ['conversation_id' => $conversation->id]);
            throw new CrmRefused('ai_failed', 'The AI could not draft a reply just now. Please try again in a moment.', 502);
        }

        $this->usage->recordUsage(
            orgId: (int) $org->id,
            model: self::MODEL,
            inputTokens: (int) ($response->usage->promptTokens ?? 0),
            outputTokens: (int) ($response->usage->completionTokens ?? 0),
            feature: 'crm_draft',
        );

        $draft = trim((string) ($response->choices[0]->message->content ?? ''));
        if ($draft === '') {
            throw new CrmRefused('ai_failed', 'The AI could not draft a reply just now. Please try again in a moment.', 502);
        }

        return ['draft' => mb_substr($draft, 0, 2000)];
    }
}
