<?php

namespace App\Services\IndustryPrompts;

/**
 * Industry-aware prompt fragment bundle.
 *
 * Industry Platform Plan Phase 7.
 *
 * Carries everything an AI-prompt builder needs to swap hotel
 * framing for industry-aware language WITHOUT each call site
 * branching on industry id. Built by IndustryPromptService for a
 * single org / single chat session.
 *
 * Lifecycle:
 *   - persona ─→ the role the AI plays (one short phrase)
 *   - nouns   ─→ vocabulary map applied as a search/replace over
 *                hotel-flavoured prompt text. Keys are canonical
 *                English ('guest', 'room', 'stay'); values are the
 *                industry-correct noun.
 *   - guardrails ─→ a Markdown block injected at the prompt frame
 *                  layer (NOT inside an admin-editable field) so
 *                  medical guardrails ("never give a diagnosis", "no
 *                  medication advice") survive admin tone tweaks.
 *   - workspaceLabel ─→ what to call the business in admin AI
 *                  ("hotel" / "salon" / "clinic" / "restaurant" /
 *                  "workspace")
 *   - hasLoyalty ─→ false for medical (decision #5). Loyalty-only
 *                  AI prompts short-circuit when this is false.
 */
final class IndustryPromptProfile
{
    public function __construct(
        public readonly string $industry,
        public readonly string $persona,
        /** @var array<string,string> Canonical English noun → industry-correct noun */
        public readonly array $nouns,
        public readonly string $guardrails,
        public readonly string $workspaceLabel,
        public readonly bool $hasLoyalty = true,
        /**
         * Phase 7 reviewer-flagged: admin AI guardrails differ from
         * the patient/customer-facing block. Staff legitimately need
         * to discuss medical context (look up a patient's records,
         * summarise visits) which the customer-facing 7-rule block
         * would refuse. When non-empty, CrmAiService::buildSystemPrompt
         * uses this instead of the full `guardrails` string.
         * Defaults to the full guardrails (back-compat for the 4 GTM
         * industries that don't need an admin/customer split).
         */
        public readonly string $adminGuardrails = '',
    ) {}

    /**
     * Apply the noun map to a string. Case-aware: 'guest' → 'client',
     * 'Guest' → 'Client', 'GUEST' → 'CLIENT'. Plural-aware: 'guests'
     * → 'clients', 'Guests' → 'Clients', "guest's" → "client's".
     *
     * Phase 7 reviewer-flagged bug: the prior implementation used a
     * bare `\b{from}\b` regex which does NOT match `guests` because
     * the boundary between `t` and `s` is between two WORD chars
     * (both alphanumeric) and `\b` only matches word ↔ non-word
     * transitions. So `\bguest\b` against 'guests' missed entirely,
     * and the noun map was a near-no-op for almost every real
     * hotel-flavoured prompt (which uses plurals constantly).
     *
     * Fix: match an OPTIONAL trailing suffix (`es` | `'s` | `s`),
     * preserve it on the replacement. Replacement values in the
     * profile MUST be the SINGULAR form — pluralisation is automatic.
     *
     * Hotel's identity nounMap is empty, so this is still a no-op for
     * hotel orgs — preserves verbatim back-compat with pre-Phase-7
     * prompts.
     */
    public function swapNouns(string $text): string
    {
        if (empty($this->nouns)) return $text;

        $out = $text;
        foreach ($this->nouns as $from => $to) {
            // Capture group 1 = root (case preserved); group 2 =
            // optional plural / genitive (es | 's | s). Alternation
            // order matters: longer wins so 'es' fires before 's'
            // on words like 'witnesses'. The root from the map is
            // preg-quoted.
            $pattern = '/\b(' . preg_quote($from, '/') . ")(es|'s|s)?\\b/i";
            $out = preg_replace_callback($pattern, function ($m) use ($to) {
                $matched = $m[1];          // matched root, original case
                $suffix  = $m[2] ?? '';    // captured plural / genitive
                $replacement = $to;
                if ($matched !== '' && ctype_upper($matched)) {
                    $replacement = mb_strtoupper($to);
                } elseif ($matched !== '' && ctype_upper(mb_substr($matched, 0, 1))) {
                    $replacement = mb_strtoupper(mb_substr($to, 0, 1)) . mb_substr($to, 1);
                }
                return $replacement . $suffix;
            }, $out);
        }
        return $out;
    }
}
