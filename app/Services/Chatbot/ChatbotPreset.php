<?php

namespace App\Services\Chatbot;

/**
 * A ready-to-use chatbot configuration for one industry.
 *
 * WHY THIS EXISTS
 * IndustryPromptService already gives every industry a persona, a noun map,
 * guardrails and a colour — but all of that describes how the AI should *sound*.
 * Nothing described what it should *know*, what it should *offer*, or what to
 * do when it cannot help. Those gaps were filled by hard-coded hotel strings:
 * ChatbotBehaviorConfig::getForOrg() named every assistant "Hotel Assistant"
 * regardless of industry, `suggestions` was never seeded for anyone, and no
 * industry had an escalation policy, a fallback message or a single knowledge
 * base entry.
 *
 * The consequence for a new venue was narrow but real. The bot answered — it
 * falls back to general industry knowledge — but it knew nothing about THIS
 * business. Every question about opening hours, address, parking or prices
 * became "let me connect you with the team", and the widget's action buttons
 * stayed empty because the prompt forbids inventing a phone number or URL and
 * nothing supplied one.
 *
 * So a preset carries two different kinds of thing:
 *
 *   - Settled decisions (tone, goal, escalation policy, greeting, suggestion
 *     chips). The venue owner should never have to write these from a blank
 *     box, and the wizard applies them without asking.
 *
 *   - Fact templates (`starterFaq`). These are questions every venue is asked
 *     and only the venue can answer. The wizard collects a handful of plain
 *     facts and renders them into real knowledge base entries.
 *
 * @see ChatbotPresetService for the per-industry instances and rendering.
 */
final class ChatbotPreset
{
    public function __construct(
        public readonly string $industry,

        /** Replaces the hard-coded "Hotel Assistant" for all nine industries. */
        public readonly string $assistantName,

        /** ChatbotBehaviorConfig.tone — one of the tone chips the wizard offers. */
        public readonly string $tone,

        /** ChatbotBehaviorConfig.sales_style. */
        public readonly string $salesStyle,

        /** One sentence: what the assistant is FOR. Fills the `goal` box. */
        public readonly string $goal,

        /**
         * Plain-language rules, pre-ticked in the wizard.
         *
         * These exist because the settings UI offers five overlapping blank
         * prompt boxes (identity, goal, core rules, escalation policy, custom
         * instructions) that a venue owner cannot be expected to fill. A
         * checkbox list of concrete rules is answerable; "Core Rules" is not.
         *
         * @var list<string>
         */
        public readonly array $coreRules,

        /** What to do when the assistant cannot help. */
        public readonly string $escalationPolicy,

        /** Shown verbatim when the AI has nothing useful to say. */
        public readonly string $fallbackMessage,

        /** Widget greeting headline. */
        public readonly string $welcomeTitle,

        /** Widget greeting sub-line. */
        public readonly string $welcomeSubtitle,

        /**
         * Starter chips. The widget currently falls back to hard-coded English
         * hotel phrases when this is empty, which it always is.
         *
         * @var list<string>
         */
        public readonly array $suggestions,

        /**
         * Knowledge base templates. Each entry is
         * ['question' => string, 'answer' => string, 'keywords' => list<string>,
         *  'needs' => list<string>] where `needs` names the fact keys the answer
         * interpolates. An entry whose facts are missing is DROPPED rather than
         * published with an unfilled placeholder.
         *
         * @var list<array{question:string,answer:string,keywords:list<string>,needs:list<string>}>
         */
        public readonly array $starterFaq,
    ) {}
}
