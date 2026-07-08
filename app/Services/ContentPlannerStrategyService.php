<?php

namespace App\Services;

use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerStrategy;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Generates a complete, structured social media strategy using Claude AI.
 * Builds the prompt from the master strategy template, the full brand
 * context, and previous content history; persists the strategy, refreshes
 * content pillars, and backfills profile strategy inputs where empty.
 */
class ContentPlannerStrategyService
{
    public function __construct(
        protected AiClient $ai,
        protected ContextBuilder $context,
    ) {
    }

    /**
     * Generate a comprehensive social media strategy.
     *
     * Returns:
     * {
     *   "strategy": ContentPlannerStrategy model,
     *   "pillars": [ContentPlannerPillar models]
     * }
     */
    public function generate(ContentPlannerProfile $profile, array $params = []): array
    {
        $prompt = $this->buildStrategyPrompt($profile, $params);

        $data = $this->ai->generateJson($profile, 'strategy', $prompt, 16000);

        // Persist atomically: superseding the old strategy and deactivating
        // its pillars must roll back if any later insert fails, otherwise a
        // mid-sequence error leaves the profile with no active strategy at all.
        return DB::transaction(function () use ($profile, $data) {
            ContentPlannerStrategy::where('planner_profile_id', $profile->id)
                ->where('status', 'active')
                ->update(['status' => 'superseded']);

            $goals = $data['engagement_strategy']['primary_goals'] ?? null;

            if (!is_array($goals) || empty($goals)) {
                $goals = $profile->engagement_goals ?? [];
            }

            $title = is_string($data['title'] ?? null) ? $data['title'] : 'Social Media Strategy';

            $strategy = ContentPlannerStrategy::create([
                'organization_id' => $profile->organization_id,
                'brand_id' => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'title' => mb_substr($title, 0, 255),
                'summary' => is_string($data['brand_summary'] ?? null) ? $data['brand_summary'] : null,
                'goals' => $goals,
                'platform_strategy' => is_array($data['platform_strategy'] ?? null) ? $data['platform_strategy'] : [],
                'content_mix' => is_array($data['content_mix'] ?? null) ? $data['content_mix'] : [],
                'visual_direction' => is_string($data['visual_direction'] ?? null) ? $data['visual_direction'] : null,
                'ai_output' => $data,
                'status' => 'active',
                'created_by' => auth()->id(),
            ]);

            // Replace content pillars: deactivate old, create fresh from AI output.
            $profile->pillars()->where('active', true)->update(['active' => false]);

            $pillars = $this->createPillars($profile, $strategy, is_array($data['content_pillars'] ?? null) ? $data['content_pillars'] : []);

            // Backfill profile strategy inputs from the strategy where currently empty.
            $this->backfillProfile($profile, $data);

            return [
                'strategy' => $strategy,
                'pillars' => $pillars,
            ];
        });
    }

    /**
     * Build the master strategy prompt (spec §15) with full brand context,
     * recent content history, and the exact required output schema.
     */
    protected function buildStrategyPrompt(ContentPlannerProfile $profile, array $params): string
    {
        $context = $this->context->build($profile);
        $recentDigest = $this->context->recentPostsDigest($profile);
        $instructions = trim((string) ($params['instructions'] ?? ''));

        $prompt = <<<PROMPT
You are an elite social media strategist, brand strategist, audience psychologist, and platform-native content planner.

Your task is to create a long-term social media strategy that builds attention, trust, engagement, memorability, and soft conversion for the brand described below.

Do not create random content ideas. Build a coherent strategy based on:
- brand positioning
- USP
- values
- target audience psychology
- audience pains and desires
- platform behavior
- content pillars
- weekly rhythm
- brand voice
- previous content history
- engagement goals
- available FAQ / knowledge base information

Golden rules:
1. Audience first, brand second, promotion third.
2. Do not start content with "we offer" unless the post is intentionally promotional.
3. Every post must have a purpose.
4. Every post must connect to a content pillar.
5. Every platform needs native adaptation.
6. Avoid generic AI marketing language.
7. Do not invent proof, numbers, testimonials, or results. Mark every assumption explicitly in the "assumptions" array.
8. Prefer useful, specific, memorable content.
9. Mix education, proof, story, interaction, and soft promotion.
10. Create content people would want to save, share, comment on, or discuss.

# BRAND CONTEXT

{$context}
PROMPT;

        if ($recentDigest !== '') {
            $prompt .= "\n\n# CONTENT HISTORY\n\n" . $recentDigest;
        }

        if ($instructions !== '') {
            $prompt .= "\n\n# ADDITIONAL USER INSTRUCTIONS\n\n" . $instructions;
        }

        $prompt .= "\n\n" . $this->outputFormatBlock();

        return $prompt;
    }

    /**
     * The exact JSON schema the strategy must follow (contract schema).
     */
    protected function outputFormatBlock(): string
    {
        $schema = <<<'JSON'
{
  "title": "Strategy title",
  "brand_summary": "2-3 paragraph summary of the brand, its positioning, and what this strategy will achieve",
  "positioning_narrative": {
    "old_way": "What old way is broken",
    "new_way": "What new way the brand represents",
    "beliefs": ["Belief the brand repeats", "Another belief"],
    "key_messages": ["Message to repeat again and again", "Another key message"]
  },
  "audience_map": [
    {
      "name": "Segment name",
      "pains": ["Pain point"],
      "desires": ["Desire"],
      "objections": ["Objection"],
      "emotional_triggers": ["Trigger"],
      "content_they_engage_with": ["Content type they save/share/comment on"]
    }
  ],
  "content_pillars": [
    {
      "name": "Pillar name",
      "description": "What this pillar covers",
      "purpose": "Strategic purpose of this pillar",
      "frequency_weight": 30,
      "recommended_platforms": ["linkedin", "instagram"],
      "example_topics": ["Topic idea", "Topic idea"],
      "cta_examples": ["CTA example"],
      "visual_direction": "Visual approach for this pillar"
    }
  ],
  "content_mix": {"education": 30, "problem_awareness": 20, "thought_leadership": 15, "social_proof": 10, "behind_the_scenes": 10, "community": 5, "soft_promotion": 5, "direct_conversion": 5},
  "weekly_rhythm": {
    "monday": {"role": "problem_insight", "description": "Start the week with a strategic problem or perspective shift", "platforms": ["linkedin"], "pillars": ["Pillar name"]},
    "tuesday": {"role": "educational", "description": "...", "platforms": [], "pillars": []},
    "wednesday": {"role": "proof", "description": "...", "platforms": [], "pillars": []},
    "thursday": {"role": "behind_the_scenes", "description": "...", "platforms": [], "pillars": []},
    "friday": {"role": "soft_conversion", "description": "...", "platforms": [], "pillars": []},
    "saturday": {"role": "community", "description": "...", "platforms": [], "pillars": []},
    "sunday": {"role": "reflection", "description": "...", "platforms": [], "pillars": []}
  },
  "platform_strategy": {
    "linkedin": {
      "role": "Platform role e.g. authority building",
      "formats": ["text post", "carousel"],
      "tone": "professional",
      "frequency": "3x/week",
      "post_types": ["founder_opinion", "case_study"],
      "cta_style": "soft question CTA",
      "engagement_mechanics": ["thoughtful question at the end"],
      "visual_style": "clean, professional"
    }
  },
  "engagement_strategy": {
    "primary_goals": ["comments", "saves"],
    "mechanics": [{"goal": "comments", "tactic": "End posts with an opinion-based question"}]
  },
  "conversion_strategy": {
    "approach": "How soft conversion works in this strategy",
    "soft_cta_examples": ["Want the checklist?", "Book a free consultation."]
  },
  "visual_direction": "Overall visual style direction across platforms",
  "monthly_themes": ["Theme for month 1", "Theme for month 2"],
  "campaign_ideas": [{"name": "Campaign name", "goal": "Campaign goal", "description": "What it involves"}],
  "example_posts": [{"platform": "linkedin", "post_type": "founder_opinion", "hook": "First line of the post", "summary": "What the post covers"}],
  "risks": ["Content risk to avoid"],
  "opportunities": ["Content opportunity"],
  "missing_information": ["Information the user should provide to improve results"],
  "assumptions": ["Assumption made because information was missing"],
  "next_actions": ["First concrete step to implement this strategy"]
}
JSON;

        return <<<PROMPT
# OUTPUT FORMAT

Return the strategy as a single ```json code block matching EXACTLY this structure. Every field is required — use empty arrays or empty strings when you have nothing to say, never omit keys:

```json
{$schema}
```

Additional output rules:
- content_mix keys MUST come from this list only: education, problem_awareness, myths, product_explanation, behind_the_scenes, social_proof, thought_leadership, faq_answers, case_studies, community, soft_promotion, direct_conversion. Percentages must be integers summing to 100.
- weekly_rhythm MUST cover all seven days (monday through sunday), each with a role such as: problem_insight, educational, proof, behind_the_scenes, soft_conversion, community, reflection.
- content_pillars: 4-7 pillars; frequency_weight is a percentage between 1 and 100 and should roughly follow the content mix.
- platform_strategy: include ONLY the brand's active channel platforms.
- example_posts: 3-6 concrete examples spread across the active platforms.
- funnel-relevant post_types come from: problem_aware, myth_busting, how_to, checklist, mistakes, comparison, story, before_after, faq_answer, behind_the_scenes, case_study, soft_offer, founder_opinion, trend_reaction, poll_question, carousel, video_script, product_demo.
PROMPT;
    }

    /**
     * Create fresh content pillar records from the strategy output.
     */
    protected function createPillars(ContentPlannerProfile $profile, ContentPlannerStrategy $strategy, array $pillarsData): array
    {
        $pillars = [];

        foreach ($pillarsData as $pillarData) {
            if (!is_array($pillarData)) {
                continue;
            }

            $weight = (int) ($pillarData['frequency_weight'] ?? 10);
            $weight = max(1, min(100, $weight));

            $pillars[] = ContentPlannerPillar::create([
                'organization_id' => $profile->organization_id,
                'brand_id' => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'strategy_id' => $strategy->id,
                'name' => mb_substr(is_string($pillarData['name'] ?? null) ? $pillarData['name'] : 'Untitled Pillar', 0, 255),
                'description' => is_string($pillarData['description'] ?? null) ? $pillarData['description'] : null,
                'purpose' => is_string($pillarData['purpose'] ?? null) ? $pillarData['purpose'] : null,
                'frequency_weight' => $weight,
                'recommended_platforms' => is_array($pillarData['recommended_platforms'] ?? null) ? $pillarData['recommended_platforms'] : [],
                'example_topics' => is_array($pillarData['example_topics'] ?? null) ? $pillarData['example_topics'] : [],
                'cta_examples' => is_array($pillarData['cta_examples'] ?? null) ? $pillarData['cta_examples'] : [],
                'visual_direction' => $pillarData['visual_direction'] ?? null,
                'active' => true,
            ]);
        }

        return $pillars;
    }

    /**
     * Backfill profile content_mix and weekly_rhythm from the strategy output
     * ONLY where the profile fields are currently empty.
     */
    protected function backfillProfile(ContentPlannerProfile $profile, array $data): void
    {
        $updates = [];

        if (empty($profile->content_mix) && is_array($data['content_mix'] ?? null) && !empty($data['content_mix'])) {
            $updates['content_mix'] = $data['content_mix'];
        }

        if (empty($profile->weekly_rhythm) && is_array($data['weekly_rhythm'] ?? null) && !empty($data['weekly_rhythm'])) {
            $rhythm = [];

            foreach ($data['weekly_rhythm'] as $day => $info) {
                if (!is_array($info)) {
                    continue;
                }

                $rhythm[strtolower((string) $day)] = [
                    'role' => $info['role'] ?? null,
                    'notes' => $info['description'] ?? '',
                ];
            }

            if (!empty($rhythm)) {
                $updates['weekly_rhythm'] = $rhythm;
            }
        }

        if (!empty($updates)) {
            $profile->update($updates);
        }
    }
}
