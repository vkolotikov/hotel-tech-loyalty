<?php

namespace App\Services;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Visitor;
use App\Models\VisitorPageView;
use Illuminate\Support\Facades\Log;
use OpenAI\Laravel\Facades\OpenAI;

/**
 * Engagement Hub Phase 3 — generates the per-conversation AI brief
 * (2-3 sentence summary the agent reads before replying) and an
 * intent_tag classification in a single OpenAI roundtrip.
 *
 * Cached on the conversation row (`ai_brief`, `ai_brief_at`,
 * `intent_tag`). Regenerated only when the cached version is older
 * than 5 minutes — the agent gets fresh context each visit without
 * us paying for redundant calls.
 *
 * Failure mode: if OpenAI is unreachable, returns a stub brief with
 * the cached intent_tag (if any) and logs a warning. The drawer still
 * loads; only the AI panel shows a "couldn't generate" line.
 */
class EngagementAiService
{
    /** TTL for the cached brief — refresh when older. */
    private const CACHE_TTL_MINUTES = 5;

    /** OpenAI model to call — small + cheap is plenty for summarisation. */
    private const MODEL = 'gpt-4o-mini';

    /** Recognised intent tags. Anything outside this set is normalised to 'other'. */
    private const INTENTS = [
        'booking_inquiry', 'info_request', 'complaint',
        'cancellation', 'support', 'spam', 'other',
    ];

    /**
     * Get a fresh-or-cached brief + intent for a conversation. Caller
     * (the GET /engagement/conversations/{id}/brief endpoint) doesn't
     * need to know whether we hit OpenAI or the cache.
     *
     * @return array{brief: ?string, intent_tag: ?string, generated_at: ?string, cached: bool}
     */
    public function briefForConversation(ChatConversation $conv, bool $forceRefresh = false): array
    {
        // Cache hit — < 5 min old.
        if (!$forceRefresh
            && $conv->ai_brief
            && $conv->ai_brief_at
            && $conv->ai_brief_at->gt(now()->subMinutes(self::CACHE_TTL_MINUTES))) {
            return [
                'brief'        => $conv->ai_brief,
                'intent_tag'   => $conv->intent_tag,
                'generated_at' => $conv->ai_brief_at->toIso8601String(),
                'cached'       => true,
            ];
        }

        $context = $this->gatherContext($conv);

        // Empty conversation — nothing to summarise.
        if (empty($context['messages'])) {
            return [
                'brief'        => 'No messages yet — visitor opened the widget but hasn\'t typed anything.',
                'intent_tag'   => $conv->intent_tag, // keep prior tag if any
                'generated_at' => now()->toIso8601String(),
                'cached'       => false,
            ];
        }

        try {
            $payload = $this->callOpenAi($context);
            $intentTag = $this->normaliseIntent($payload['intent_tag'] ?? null);
            $brief = trim((string) ($payload['brief'] ?? ''));

            if ($brief === '') {
                throw new \RuntimeException('OpenAI returned an empty brief');
            }

            // Persist on the conversation. Use update with raw fields so the
            // global brand/tenant scopes don't accidentally exclude this row.
            $conv->forceFill([
                'ai_brief'    => $brief,
                'ai_brief_at' => now(),
                'intent_tag'  => $intentTag,
            ])->save();

            return [
                'brief'        => $brief,
                'intent_tag'   => $intentTag,
                'generated_at' => $conv->ai_brief_at->toIso8601String(),
                'cached'       => false,
            ];
        } catch (\Throwable $e) {
            Log::warning('EngagementAiService brief failed: ' . $e->getMessage(), [
                'conversation_id' => $conv->id,
            ]);
            return [
                'brief'        => null,
                'intent_tag'   => $conv->intent_tag,
                'generated_at' => $conv->ai_brief_at?->toIso8601String(),
                'cached'       => false,
                'error'        => 'Could not generate AI brief — try again in a moment.',
            ];
        }
    }

    /* ─── internals ───────────────────────────────────────────────── */

    /**
     * Pull the bits of context the model needs: visitor identity, last
     * 10 messages, last 5 page views. Kept small so the prompt stays
     * cheap — agents want a 2-3 sentence brief, not a transcript dump.
     */
    private function gatherContext(ChatConversation $conv): array
    {
        $messages = ChatMessage::where('conversation_id', $conv->id)
            ->orderBy('created_at')
            ->limit(20) // cap tokens
            ->get(['sender_type', 'content', 'created_at'])
            ->map(fn ($m) => [
                'role' => match ($m->sender_type) {
                    'visitor' => 'visitor',
                    'ai'      => 'assistant',
                    'agent'   => 'agent',
                    default   => 'system',
                },
                'text' => mb_substr((string) $m->content, 0, 500),
            ])
            ->values()
            ->all();

        $visitor = $conv->visitor_id
            ? Visitor::withoutGlobalScopes()->find($conv->visitor_id)
            : null;

        $pages = $visitor
            ? VisitorPageView::where('visitor_id', $visitor->id)
                ->orderByDesc('viewed_at')
                ->limit(5)
                ->pluck('url')
                ->all()
            : [];

        return [
            'name'      => $visitor?->display_name ?: $conv->visitor_name,
            'email'     => $visitor?->email ?: $conv->visitor_email,
            'phone'     => $visitor?->phone ?: $conv->visitor_phone,
            'country'   => $visitor?->country ?: $conv->visitor_country,
            'city'      => $visitor?->city ?: $conv->visitor_city,
            'visit_count' => $visitor?->visit_count ?? 1,
            'pages'     => $pages,
            'messages'  => $messages,
        ];
    }

    private function callOpenAi(array $ctx): array
    {
        $contactBits = array_filter([
            $ctx['name']    ? "Name: {$ctx['name']}" : null,
            $ctx['email']   ? "Email: {$ctx['email']}" : null,
            $ctx['phone']   ? "Phone: {$ctx['phone']}" : null,
            $ctx['city'] || $ctx['country']
                ? 'Location: ' . trim(($ctx['city'] ?? '') . ', ' . ($ctx['country'] ?? ''), ', ') : null,
            ($ctx['visit_count'] ?? 0) > 1 ? "Visits: {$ctx['visit_count']} (returning)" : null,
        ]);
        $contact = $contactBits ? implode("\n", $contactBits) : '(anonymous, no contact info)';

        $pages = $ctx['pages']
            ? "Recent page journey:\n- " . implode("\n- ", $ctx['pages'])
            : 'No page-view history.';

        $msgLines = array_map(
            fn ($m) => '[' . strtoupper($m['role']) . '] ' . $m['text'],
            $ctx['messages'],
        );
        $thread = implode("\n", $msgLines);

        $prompt = <<<PROMPT
You are an AI assistant briefing a hotel agent who's about to take over a
chat from the AI. Your job: a tight 2-3 sentence summary of WHO this
visitor is and WHAT they want, then a one-word intent tag.

Strict rules:
- 2-3 sentences total. No greetings. No bullet lists.
- Plain prose. Lead with the most useful fact.
- Mention names/emails/cities only if they help the agent. Don't repeat
  the obvious (e.g. don't say "this visitor sent messages").
- If the visitor expressed an intent (booking, complaint, support…), end
  the brief with the suggested next action.

intent_tag must be one of EXACTLY: booking_inquiry, info_request,
complaint, cancellation, support, spam, other.

Return STRICT JSON ONLY, no markdown:
{ "brief": "<2-3 sentences>", "intent_tag": "<one of the seven>" }

VISITOR CONTEXT:
{$contact}

{$pages}

CONVERSATION (oldest first):
{$thread}
PROMPT;

        $response = OpenAI::chat()->create([
            'model'       => self::MODEL,
            'messages'    => [['role' => 'user', 'content' => $prompt]],
            'max_tokens'  => 250,
            'temperature' => 0.2, // deterministic — same input → same brief
            'response_format' => ['type' => 'json_object'],
        ]);

        $raw = trim((string) ($response->choices[0]->message->content ?? '{}'));
        $decoded = json_decode($raw, true);

        if (!is_array($decoded)) {
            throw new \RuntimeException('OpenAI returned non-JSON: ' . substr($raw, 0, 200));
        }

        return $decoded;
    }

    private function normaliseIntent(?string $raw): string
    {
        $clean = strtolower(trim((string) $raw));
        return in_array($clean, self::INTENTS, true) ? $clean : 'other';
    }
}
