<?php

namespace App\Services;

use App\Models\Inquiry;
use Illuminate\Support\Facades\Log;
use OpenAI\Laravel\Facades\OpenAI;

/**
 * CRM Phase 2 — Smart Panel briefing for the lead-detail page.
 *
 * One OpenAI call per refresh, returning five fields the panel renders
 * in a single shot:
 *   • brief                 — 2-3 sentence "what is this lead about" summary
 *   • intent                — one of: booking_inquiry, group, event, info_request, complaint, other
 *   • win_probability       — 0-100, integer
 *   • going_cold_risk       — low / medium / high
 *   • suggested_action      — one short imperative sentence ("Send a proposal today")
 *
 * Cached on the inquiry row (`ai_brief`, `ai_brief_at`, `ai_intent`,
 * `ai_win_probability`, `ai_going_cold_risk`, `ai_suggested_action`)
 * with a 15-minute TTL — long enough to avoid repeat costs when an
 * agent flips between leads, short enough that a fresh call captures
 * "guest just emailed" within a quarter-hour.
 *
 * Mirrors the EngagementAiService pattern (lazy, gpt-4o-mini, JSON
 * response_format, deterministic temp 0.2). Failure mode: returns
 * the cached payload (if any) plus an error string. Never throws.
 */
class InquiryAiService
{
    private const CACHE_TTL_MINUTES = 15;
    private const MODEL             = 'gpt-4o-mini';

    private const INTENTS = [
        'booking_inquiry', 'group', 'event',
        'info_request', 'complaint', 'other',
    ];

    private const COLD_RISKS = ['low', 'medium', 'high'];

    /**
     * @return array{
     *   brief: ?string,
     *   intent: ?string,
     *   win_probability: ?int,
     *   going_cold_risk: ?string,
     *   suggested_action: ?string,
     *   generated_at: ?string,
     *   cached: bool,
     *   error?: string
     * }
     */
    public function briefForInquiry(Inquiry $inquiry, bool $forceRefresh = false): array
    {
        // Cache hit — < 15 min old AND we have at least a brief.
        if (!$forceRefresh
            && $inquiry->ai_brief
            && $inquiry->ai_brief_at
            && $inquiry->ai_brief_at->gt(now()->subMinutes(self::CACHE_TTL_MINUTES))) {
            return [
                'brief'            => $inquiry->ai_brief,
                'intent'           => $inquiry->ai_intent,
                'win_probability'  => $inquiry->ai_win_probability,
                'going_cold_risk'  => $inquiry->ai_going_cold_risk,
                'suggested_action' => $inquiry->ai_suggested_action,
                'generated_at'     => $inquiry->ai_brief_at->toIso8601String(),
                'cached'           => true,
            ];
        }

        $context = $this->gatherContext($inquiry);

        try {
            $payload = $this->callOpenAi($context);

            $brief    = trim((string) ($payload['brief'] ?? ''));
            $intent   = $this->normaliseIntent($payload['intent'] ?? null);
            $winProb  = $this->normaliseWinProbability($payload['win_probability'] ?? null);
            $cold     = $this->normaliseColdRisk($payload['going_cold_risk'] ?? null);
            $action   = trim((string) ($payload['suggested_action'] ?? ''));

            if ($brief === '') {
                throw new \RuntimeException('OpenAI returned an empty brief');
            }

            $inquiry->forceFill([
                'ai_brief'            => $brief,
                'ai_brief_at'         => now(),
                'ai_intent'           => $intent,
                'ai_win_probability'  => $winProb,
                'ai_going_cold_risk'  => $cold,
                'ai_suggested_action' => $action ?: null,
            ])->save();

            return [
                'brief'            => $brief,
                'intent'           => $intent,
                'win_probability'  => $winProb,
                'going_cold_risk'  => $cold,
                'suggested_action' => $action ?: null,
                'generated_at'     => $inquiry->ai_brief_at->toIso8601String(),
                'cached'           => false,
            ];
        } catch (\Throwable $e) {
            Log::warning('InquiryAiService brief failed: ' . $e->getMessage(), [
                'inquiry_id' => $inquiry->id,
            ]);

            return [
                'brief'            => $inquiry->ai_brief,
                'intent'           => $inquiry->ai_intent,
                'win_probability'  => $inquiry->ai_win_probability,
                'going_cold_risk'  => $inquiry->ai_going_cold_risk,
                'suggested_action' => $inquiry->ai_suggested_action,
                'generated_at'     => $inquiry->ai_brief_at?->toIso8601String(),
                'cached'           => false,
                'error'            => 'Could not generate AI brief — try again in a moment.',
            ];
        }
    }

    /* ─── internals ─────────────────────────────────────────────── */

    /**
     * Pull the bits of context the model needs: guest identity, stay
     * basics, last 8 timeline activities, current pipeline stage.
     */
    private function gatherContext(Inquiry $inquiry): array
    {
        $inquiry->loadMissing([
            'guest:id,full_name,email,phone,company,nationality',
            'pipelineStage:id,name,kind,default_win_probability',
            'property:id,name',
            'corporateAccount:id,company_name',
            'activities' => fn ($q) => $q
                ->latest('occurred_at')
                ->limit(8),
        ]);

        $activities = ($inquiry->activities ?? collect())
            ->map(fn ($a) => [
                'type'      => $a->type,
                'subject'   => $a->subject,
                'body'      => mb_substr((string) $a->body, 0, 400),
                'occurred'  => optional($a->occurred_at)->toIso8601String(),
            ])
            ->values()
            ->all();

        return [
            'guest_name'      => $inquiry->guest?->full_name,
            'company'         => $inquiry->guest?->company ?: $inquiry->corporateAccount?->company_name,
            'nationality'     => $inquiry->guest?->nationality,
            'email'           => $inquiry->guest?->email,
            'phone'           => $inquiry->guest?->phone,
            'inquiry_type'    => $inquiry->inquiry_type,
            'source'          => $inquiry->source,
            'check_in'        => optional($inquiry->check_in)->toDateString(),
            'check_out'       => optional($inquiry->check_out)->toDateString(),
            'num_nights'      => $inquiry->num_nights,
            'num_rooms'       => $inquiry->num_rooms,
            'num_adults'      => $inquiry->num_adults,
            'num_children'    => $inquiry->num_children,
            'room_type'       => $inquiry->room_type_requested,
            'rate_offered'    => $inquiry->rate_offered,
            'total_value'     => $inquiry->total_value,
            'event_type'      => $inquiry->event_type,
            'event_pax'       => $inquiry->event_pax,
            'special_requests' => $inquiry->special_requests,
            'priority'        => $inquiry->priority,
            'stage_name'      => $inquiry->pipelineStage?->name,
            'stage_kind'      => $inquiry->pipelineStage?->kind,
            'stage_default_win_prob' => $inquiry->pipelineStage?->default_win_probability,
            'property'        => $inquiry->property?->name,
            'last_contacted_at' => optional($inquiry->last_contacted_at)->toIso8601String(),
            'phone_calls_made'  => $inquiry->phone_calls_made,
            'emails_sent'       => $inquiry->emails_sent,
            'created_at'      => optional($inquiry->created_at)->toIso8601String(),
            'updated_at'      => optional($inquiry->updated_at)->toIso8601String(),
            'activities'      => $activities,
        ];
    }

    private function callOpenAi(array $ctx): array
    {
        $stayBits = array_filter([
            $ctx['inquiry_type']      ? "Type: {$ctx['inquiry_type']}" : null,
            $ctx['check_in']          ? "Check-in: {$ctx['check_in']}" : null,
            $ctx['check_out']         ? "Check-out: {$ctx['check_out']}" : null,
            $ctx['num_nights']        ? "Nights: {$ctx['num_nights']}" : null,
            $ctx['num_rooms']         ? "Rooms: {$ctx['num_rooms']}" : null,
            ($ctx['num_adults'] || $ctx['num_children'])
                ? 'Pax: ' . (int) $ctx['num_adults'] . 'A / ' . (int) $ctx['num_children'] . 'C'
                : null,
            $ctx['room_type']         ? "Room type: {$ctx['room_type']}" : null,
            $ctx['total_value']       ? 'Quoted value: €' . number_format((float) $ctx['total_value']) : null,
            $ctx['event_type']        ? "Event: {$ctx['event_type']}" . ($ctx['event_pax'] ? " ({$ctx['event_pax']} pax)" : '') : null,
            $ctx['property']          ? "Property: {$ctx['property']}" : null,
        ]);
        $stay = $stayBits ? implode("\n", $stayBits) : '(no stay details captured)';

        $contactBits = array_filter([
            $ctx['guest_name']  ? "Name: {$ctx['guest_name']}" : null,
            $ctx['company']     ? "Company: {$ctx['company']}" : null,
            $ctx['nationality'] ? "Nationality: {$ctx['nationality']}" : null,
            $ctx['email']       ? "Email: {$ctx['email']}" : null,
            $ctx['phone']       ? "Phone: {$ctx['phone']}" : null,
            $ctx['source']      ? "Source: {$ctx['source']}" : null,
        ]);
        $contact = $contactBits ? implode("\n", $contactBits) : '(no contact info)';

        $touchpoints = array_filter([
            $ctx['phone_calls_made'] ? "Calls made: {$ctx['phone_calls_made']}" : null,
            $ctx['emails_sent']      ? "Emails sent: {$ctx['emails_sent']}" : null,
            $ctx['last_contacted_at'] ? "Last contacted: {$ctx['last_contacted_at']}" : null,
            $ctx['priority']         ? "Priority: {$ctx['priority']}" : null,
        ]);
        $touch = $touchpoints ? implode("\n", $touchpoints) : '(not yet contacted)';

        $stage = $ctx['stage_name']
            ? "Stage: {$ctx['stage_name']}"
                . ($ctx['stage_kind'] ? " ({$ctx['stage_kind']})" : '')
                . ($ctx['stage_default_win_prob'] !== null ? " — pipeline default win prob {$ctx['stage_default_win_prob']}%" : '')
            : 'Stage: (unset)';

        $activities = $ctx['activities']
            ? implode("\n", array_map(
                fn ($a) => "- [{$a['type']}] " . ($a['subject'] ? "{$a['subject']}: " : '') . $a['body'],
                array_reverse($ctx['activities']),
            ))
            : '(no activity logged yet)';

        $createdAge = $ctx['created_at']
            ? round((time() - strtotime($ctx['created_at'])) / 86400, 1) . ' days old'
            : 'unknown age';

        $specials = $ctx['special_requests'] ? "Special requests: {$ctx['special_requests']}" : '';

        $prompt = <<<PROMPT
You are an AI sales coach briefing a hotel sales agent on this inquiry.
Produce a concise Smart Panel summary that helps the agent decide what
to do next — not a transcript dump.

Strict rules:
- "brief": 2-3 sentences. Plain prose. No greetings, no bullets. Lead
  with the most useful fact. Mention the dates / pax / value if it
  shapes the decision.
- "intent": EXACTLY one of: booking_inquiry, group, event, info_request,
  complaint, other.
- "win_probability": integer 0-100. Calibrate against:
    * pipeline stage default win prob (provided below) as a baseline
    * recency of last contact (no contact > 7 days lowers it)
    * specificity of stay details (firm dates + pax raises it)
    * presence of competing-quote signals in activities (lowers it)
    * "Lost" signals in activities (force ≤ 10)
- "going_cold_risk": EXACTLY one of: low, medium, high. Base it on the
  age of the inquiry vs last_contacted_at. Anything > 7 days untouched
  AND still in an early stage = high. Active & contacted in last 48h
  = low.
- "suggested_action": ONE short imperative sentence in <= 12 words. The
  next concrete action the agent should take. Examples: "Send a
  proposal today before they go elsewhere.", "Call to confirm the
  group size before quoting.", "Follow up — guest hasn't responded
  to last week's email."

Return STRICT JSON ONLY, no markdown:
{
  "brief": "<2-3 sentences>",
  "intent": "<one of the six>",
  "win_probability": <int 0-100>,
  "going_cold_risk": "<low|medium|high>",
  "suggested_action": "<one short imperative sentence>"
}

INQUIRY CONTEXT:
{$stage}
Created: {$createdAge}

CONTACT:
{$contact}

STAY:
{$stay}

{$specials}

TOUCHPOINTS:
{$touch}

ACTIVITY (oldest first):
{$activities}
PROMPT;

        $response = OpenAI::chat()->create([
            'model'           => self::MODEL,
            'messages'        => [['role' => 'user', 'content' => $prompt]],
            'max_tokens'      => 350,
            'temperature'     => 0.2,
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

    private function normaliseColdRisk(?string $raw): string
    {
        $clean = strtolower(trim((string) $raw));
        return in_array($clean, self::COLD_RISKS, true) ? $clean : 'medium';
    }

    private function normaliseWinProbability($raw): ?int
    {
        if ($raw === null || $raw === '') return null;
        $n = (int) round((float) $raw);
        return max(0, min(100, $n));
    }
}
