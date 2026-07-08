<?php

namespace App\Services\ContentPlanner;

use App\Models\ContentPlannerProfile;
use App\Services\ContentKnowledgeService;

/**
 * Quick Start: builds a complete Content Planner profile payload from
 * minimal user input (name, goal, platforms, posting intensity) plus the
 * company's existing knowledge (FAQ, chatbot config, services, org info).
 *
 * One AI call fills the expert fields a non-marketing user can't answer:
 * brand summary, USP, positioning narrative, audience psychology, brand
 * voice. Everything AI-derived is marked as an assumption so the user can
 * review and correct it later in the Advanced setup.
 */
class ProfileBootstrapService
{
    /** Posting intensity → posts/week + weekday pattern per platform. */
    private const INTENSITY = [
        'light'    => ['posts_per_week' => 2, 'days' => ['tue', 'thu']],
        'standard' => ['posts_per_week' => 3, 'days' => ['mon', 'wed', 'fri']],
        'active'   => ['posts_per_week' => 5, 'days' => ['mon', 'tue', 'wed', 'thu', 'fri']],
    ];

    private const DEFAULT_RHYTHM = [
        'monday'    => ['role' => 'problem_insight', 'notes' => ''],
        'tuesday'   => ['role' => 'educational', 'notes' => ''],
        'wednesday' => ['role' => 'proof', 'notes' => ''],
        'thursday'  => ['role' => 'behind_the_scenes', 'notes' => ''],
        'friday'    => ['role' => 'soft_conversion', 'notes' => ''],
        'saturday'  => ['role' => 'community', 'notes' => ''],
        'sunday'    => ['role' => 'reflection', 'notes' => ''],
    ];

    public function __construct(
        protected AiClient $ai,
        protected ContentKnowledgeService $knowledge,
    ) {
    }

    /**
     * Generate the full wizard-shaped payload for the given profile.
     *
     * @param array{name?: string, default_language?: string, primary_goal?: string, platforms: string[], intensity?: string} $input
     * @return array{payload: array, assumptions: array}
     */
    public function bootstrap(ContentPlannerProfile $profile, array $input): array
    {
        $knowledgeSummary = $this->knowledge->summarizeForAi($profile->organization_id, $profile->brand_id);

        $language = $input['default_language'] ?? 'en';
        $goal = $input['primary_goal'] ?? 'Increase brand awareness';
        $platforms = array_values(array_unique($input['platforms'] ?? []));

        $data = $this->ai->generateJson($profile, 'profile_bootstrap', $this->buildPrompt($knowledgeSummary, $goal, $platforms, $language), 8000);

        $audience = is_array($data['audience'] ?? null) ? $data['audience'] : [];
        $voice = is_array($data['brand_voice'] ?? null) ? $data['brand_voice'] : [];
        $assumptions = is_array($data['assumptions'] ?? null) ? $data['assumptions'] : [];

        $intensity = self::INTENSITY[$input['intensity'] ?? 'standard'] ?? self::INTENSITY['standard'];
        $frequency = array_fill_keys(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], false);
        foreach ($intensity['days'] as $d) {
            $frequency[$d] = true;
        }

        $payload = [
            'name' => $input['name'] ?? $profile->name,
            'default_language' => $language,
            'default_tone' => $this->str($voice['tone'] ?? null) ?? 'professional',
            'primary_goal' => $goal,
            'secondary_goals' => [],
            'knowledge_sources' => ['use_faq' => true, 'use_knowledge_base' => true, 'use_company_settings' => true, 'use_services' => true],
            'use_existing_knowledge' => true,
            'brand_summary' => $this->str($data['brand_summary'] ?? null),
            'usp' => $this->str($data['usp'] ?? null),
            'mission' => $this->str($data['mission'] ?? null),
            'brand_values' => $this->arr($data['brand_values'] ?? null),
            'brand_promise' => $this->str($data['brand_promise'] ?? null),
            'differentiators' => $this->str($data['differentiators'] ?? null),
            'proof_points' => $this->arr($data['proof_points'] ?? null),
            'price_position' => $this->str($data['price_position'] ?? null) ?? 'mid_market',
            'main_cta' => $this->str($data['main_cta'] ?? null),
            'important_links' => [],
            'positioning' => is_array($data['positioning'] ?? null) ? $data['positioning'] : null,
            'key_messages' => $this->arr($data['key_messages'] ?? null),
            // Content mix stays empty on purpose: strategy generation fills it
            // with an AI-recommended split for this specific brand.
            'content_mix' => null,
            'weekly_rhythm' => self::DEFAULT_RHYTHM,
            'engagement_goals' => $this->arr($data['engagement_goals'] ?? null) ?: ['comments', 'saves'],
            'visual_style' => ['style' => 'premium', 'image_types' => [], 'avoid' => [], 'aspect_ratios' => [], 'colors' => []],
            'trend_mode' => 'evergreen',
            'setup_step' => 8,
            'brand_voice' => [
                'tone' => $this->str($voice['tone'] ?? null) ?? 'professional',
                'formality_level' => $this->str($voice['formality_level'] ?? null) ?? 'balanced',
                'emoji_policy' => $this->str($voice['emoji_policy'] ?? null) ?? 'light',
                'hashtag_policy' => $this->str($voice['hashtag_policy'] ?? null) ?? 'minimal',
                'sentence_style' => $this->str($voice['sentence_style'] ?? null) ?? 'balanced',
                'point_of_view' => $this->str($voice['point_of_view'] ?? null) ?? 'brand',
                'preferred_words' => $this->arr($voice['preferred_words'] ?? null),
                'forbidden_words' => $this->arr($voice['forbidden_words'] ?? null),
                'claims_to_avoid' => $this->arr($voice['claims_to_avoid'] ?? null),
            ],
            'audiences' => empty($audience) ? [] : [[
                'name' => $this->str($audience['name'] ?? null) ?? 'Primary audience',
                'job_role' => $this->str($audience['job_role'] ?? null),
                'industry' => $this->str($audience['industry'] ?? null),
                'country' => $this->str($audience['country'] ?? null),
                'language' => $language,
                'business_size' => $this->str($audience['business_size'] ?? null),
                'pain_points' => $this->arr($audience['pain_points'] ?? null),
                'goals' => $this->arr($audience['goals'] ?? null),
                'fears' => $this->arr($audience['fears'] ?? null),
                'objections' => $this->arr($audience['objections'] ?? null),
                'buying_triggers' => $this->arr($audience['buying_triggers'] ?? null),
                'emotional_triggers' => $this->arr($audience['emotional_triggers'] ?? null),
                'rational_triggers' => $this->arr($audience['rational_triggers'] ?? null),
                'questions' => $this->arr($audience['questions'] ?? null),
                'content_they_trust' => $this->str($audience['content_they_trust'] ?? null),
                'desired_transformation' => $this->str($audience['desired_transformation'] ?? null),
                'preferred_platforms' => $platforms,
                'is_ai_assumed' => true,
            ]],
            'channels' => array_map(fn (string $p) => [
                'platform' => $p,
                'label' => ucfirst($p),
                'audience_index' => empty($audience) ? null : 0,
                'posts_per_week' => $intensity['posts_per_week'],
                'frequency' => $frequency,
                'preferred_formats' => [],
                'emoji_policy' => $this->str($voice['emoji_policy'] ?? null) ?? 'light',
                'hashtag_policy' => $this->str($voice['hashtag_policy'] ?? null) ?? 'minimal',
                'active' => true,
            ], $platforms),
        ];

        return ['payload' => $payload, 'assumptions' => $assumptions];
    }

    private function buildPrompt(string $knowledge, string $goal, array $platforms, string $language): string
    {
        $platformList = implode(', ', $platforms) ?: 'not specified';

        return <<<PROMPT
You are a senior brand strategist. A small-business user wants a social media content plan but cannot answer expert marketing questions. Build their brand profile FROM THE COMPANY KNOWLEDGE BELOW.

Primary goal: {$goal}
Platforms they will use: {$platformList}
Content language: {$language}

# COMPANY KNOWLEDGE
{$knowledge}

Rules:
- Base everything on the knowledge above. Where you must infer, keep it plausible for this business and list the inference in "assumptions" (plain sentences the user can review).
- No hype words ("revolutionary", "game-changing"). No invented statistics or testimonials.
- The audience must be the most likely PRIMARY customer of this business, with realistic pains/goals/objections.
- Write in simple, concrete language.

Return ONLY valid JSON wrapped in ```json fences, exactly this shape:
```json
{
  "brand_summary": "2-3 sentences: what the company does, for whom, and why it matters",
  "usp": "the one thing competitors can't easily claim",
  "mission": "one sentence",
  "brand_values": ["value1", "value2", "value3"],
  "brand_promise": "one sentence",
  "differentiators": "1-2 sentences",
  "proof_points": ["only real, defensible points from the knowledge"],
  "price_position": "budget|mid_market|premium|luxury",
  "main_cta": "the most natural call to action for this business",
  "positioning": {"old_way": "what's broken in how this is usually done", "new_way": "what this brand represents instead", "beliefs": ["belief1", "belief2"], "transformation": "the change customers experience"},
  "key_messages": ["message worth repeating 1", "message 2", "message 3"],
  "audience": {"name": "...", "job_role": "...", "industry": "...", "country": "...", "business_size": "...", "pain_points": [], "goals": [], "fears": [], "objections": [], "buying_triggers": [], "emotional_triggers": [], "rational_triggers": [], "questions": [], "content_they_trust": "...", "desired_transformation": "..."},
  "brand_voice": {"tone": "professional|friendly|luxury|bold|expert|warm|direct|educational|premium|playful", "formality_level": "casual|balanced|formal", "emoji_policy": "none|light|medium|expressive", "hashtag_policy": "none|minimal|standard|broad", "sentence_style": "short|balanced|storytelling", "point_of_view": "brand|founder|expert|customer", "preferred_words": [], "forbidden_words": [], "claims_to_avoid": []},
  "engagement_goals": ["pick 2-3 from: comments, saves, shares, dms, profile_visits, link_clicks, demo_requests, trial_signups, bookings, email_replies"],
  "assumptions": ["plain-language list of everything you inferred rather than found in the knowledge"]
}
```
PROMPT;
    }

    private function str(mixed $v): ?string
    {
        if (is_array($v)) {
            $v = implode(', ', array_filter($v, 'is_string'));
        }
        $v = trim((string) ($v ?? ''));

        return $v !== '' ? $v : null;
    }

    private function arr(mixed $v): array
    {
        if (!is_array($v)) {
            return [];
        }

        return array_values(array_filter(array_map(fn ($x) => is_string($x) ? trim($x) : null, $v)));
    }
}
