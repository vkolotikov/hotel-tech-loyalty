<?php

namespace App\Services;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * Generates platform-native post copy, hooks, CTAs, hashtags, engagement
 * mechanics, and visual briefs. Respects brand voice, platform rules,
 * weekday roles, engagement goals, and anti-repetition history.
 */
class ContentPostGenerationService
{
    public function __construct(
        protected AiClient $ai,
        protected ContextBuilder $context,
    ) {
    }

    /**
     * Generate full copy + visual brief for a specific post.
     */
    public function generate(ContentPlannerPost $post, ?string $instructions = null): array
    {
        $profile = $post->profile;

        $prompt = $this->buildPostPrompt($post, $profile, $instructions);

        $data = $this->ai->generateJson($profile, 'post_copy', $prompt, 6000);

        $sourceContext = is_array($post->source_context) ? $post->source_context : [];
        $sourceContext['hook_alternatives'] = is_array($data['hook_alternatives'] ?? null)
            ? $data['hook_alternatives']
            : [];

        $post->update([
            'hook' => isset($data['hook']) ? mb_substr((string) $data['hook'], 0, 500) : $post->hook,
            'main_copy' => $data['main_copy'] ?? $post->main_copy,
            'short_copy' => $data['short_copy'] ?? $post->short_copy,
            'cta' => $data['cta'] ?? $post->cta,
            'hashtags' => is_array($data['hashtags'] ?? null) ? $data['hashtags'] : [],
            'engagement_mechanic' => is_array($data['engagement_mechanic'] ?? null) ? $data['engagement_mechanic'] : null,
            'status' => 'needs_review',
            'source_context' => $sourceContext,
        ]);

        $this->upsertVisualBrief($post, is_array($data['visual_brief'] ?? null) ? $data['visual_brief'] : null);

        return [
            'post' => $post->fresh(['visualBrief']),
            'ai_response' => $data,
        ];
    }

    /**
     * Generate an alternative version of an existing post.
     */
    public function generateAlternatives(ContentPlannerPost $post, string $variation = 'alternative', ?string $instructions = null): array
    {
        $profile = $post->profile;

        $prompts = [
            'shorter' => 'Generate a MUCH shorter version (about 50% of the length) that still captures the main message.',
            'longer' => 'Expand this into a longer, more detailed version with concrete examples.',
            'professional' => 'Rewrite in a more professional, corporate tone.',
            'friendly' => 'Rewrite in a more casual, friendly, approachable tone.',
            'alternative' => 'Generate a completely different angle on the same topic.',
        ];

        $instruction = $prompts[$variation] ?? $prompts['alternative'];

        $extra = trim((string) $instructions);
        if ($extra !== '') {
            $instruction .= "\n\nEXTRA GUIDANCE FROM THE USER (follow this, without breaking the brand voice or inventing facts):\n" . mb_substr($extra, 0, 1000);
        }

        $aiOutput = $this->ai->generateText(
            $profile,
            'post_rewrite',
            $this->buildAlternativePrompt($post, $instruction),
            2000
        );

        $variationModel = $post->variations()->create([
            'variation_type' => $variation,
            'copy' => trim($aiOutput),
            'ai_output' => ['raw' => $aiOutput],
        ]);

        return [
            'variation' => $variationModel,
            'ai_response' => $aiOutput,
        ];
    }

    /**
     * Build the master post generation prompt (spec §17): full brand context,
     * platform rules, post strategy fields, engagement goal mechanics, and
     * anti-repetition digest, with the exact required output schema.
     */
    protected function buildPostPrompt(ContentPlannerPost $post, ContentPlannerProfile $profile, ?string $instructions = null): string
    {
        $context = $this->context->build($profile);
        $recentDigest = $this->context->recentPostsDigest($profile, 30, $post->id);
        $platformRules = $this->getPlatformRules($post->platform);
        $engagementGuidance = $this->engagementGuidance(
            is_array($profile->engagement_goals) ? $profile->engagement_goals : []
        );

        $details = array_filter([
            'Platform' => $post->platform,
            'Topic' => $post->topic,
            'Title' => $post->title,
            'Goal' => $post->goal,
            'Strategic reason' => $post->strategic_reason,
            'Content pillar' => $post->pillar?->name,
            'Target audience segment' => $post->audience?->name,
            'Weekday role' => $post->weekday_role,
            'Post type' => $post->post_type,
            'Funnel stage' => $post->funnel_stage,
            'Format' => $post->format,
            'Language' => $post->language ?: $profile->default_language,
        ], fn ($value) => trim((string) $value) !== '');

        $detailLines = [];

        foreach ($details as $label => $value) {
            $detailLines[] = "{$label}: {$value}";
        }

        $detailBlock = implode("\n", $detailLines);

        $prompt = <<<PROMPT
You are a platform-native social media copywriter and engagement strategist.

Create ONE post for the platform and audience described below.

Rules:
- One post = one idea.
- The first line must stop attention immediately (relevance or curiosity, no clickbait).
- Speak to the audience's problem, desire, belief, or situation — never start with "we offer".
- Connect naturally to the brand USP or values without sounding like an ad.
- Avoid generic AI marketing language and empty claims ("revolutionary", "game-changing", "unlock your potential").
- Do not invent statistics, testimonials, case studies, or results. List any assumptions in the "assumptions" array.
- Include clear, specific value for the reader.
- Include a suitable CTA (soft by default; direct only if the post is intentionally promotional).
- Include a practical visual direction.
- Include one engagement mechanism tuned to the brand's engagement goals.
- Adapt fully to the platform's native style and rules below.

# THIS POST
{$detailBlock}

# PLATFORM RULES ({$post->platform})
{$platformRules}
PROMPT;

        if ($engagementGuidance !== '') {
            $prompt .= "\n\n# ENGAGEMENT GOAL MECHANICS\nDesign the engagement mechanic around the brand's priority goals:\n" . $engagementGuidance;
        }

        $prompt .= "\n\n# BRAND CONTEXT\n\n" . $context;

        if ($recentDigest !== '') {
            $prompt .= "\n\n# ANTI-REPETITION\n\n" . $recentDigest;
        }

        $extra = trim((string) $instructions);
        if ($extra !== '') {
            $prompt .= "\n\n# EXTRA GUIDANCE FROM THE USER\n"
                . "Follow this specific direction for this post. It refines the task but must NOT override the golden rules above "
                . "(brand voice, no invented facts, platform rules still apply):\n"
                . mb_substr($extra, 0, 1000);
        }

        $prompt .= "\n\n" . $this->outputFormatBlock();

        return $prompt;
    }

    /**
     * The exact JSON schema the post generation must follow (contract schema).
     */
    protected function outputFormatBlock(): string
    {
        $schema = <<<'JSON'
{
  "hook": "First line that stops the scroll",
  "main_copy": "Full platform-native post copy, including the hook as the first line",
  "short_copy": "Condensed short version of the post",
  "cta": "The call to action used",
  "hashtags": ["#tag1", "#tag2"],
  "hook_alternatives": ["Alternative hook 1", "Alternative hook 2", "Alternative hook 3"],
  "engagement_mechanic": {"type": "comments", "instruction": "How this post invites the interaction"},
  "visual_brief": {
    "visual_type": "image",
    "aspect_ratio": "1:1",
    "scene": "What the visual shows",
    "mood": "Mood/atmosphere",
    "composition": "Layout and focal point",
    "text_overlay": "On-image text suggestion or empty string",
    "style": "Style direction matching the brand",
    "avoid": "What the visual must avoid",
    "video_script": null
  },
  "quality_notes": "One short self-review: why this post works and any weak spot",
  "assumptions": []
}
JSON;

        return <<<PROMPT
# OUTPUT FORMAT

Return a single ```json code block matching EXACTLY this structure. Every field is required — use empty strings/arrays when not applicable, never omit keys:

```json
{$schema}
```

Additional output rules:
- hashtags must respect the platform hashtag policy (empty array if the policy is "none").
- engagement_mechanic.type comes from: comments, saves, shares, dms, profile_visits, link_clicks, demo_requests, trial_signups, bookings, email_replies.
- visual_brief.visual_type is one of: image, carousel, video, graphic, screenshot, photo.
- visual_brief.video_script is null unless the visual is a video — then give a short scene-by-scene script.
- Write all copy in the post's language.
PROMPT;
    }

    /**
     * Build prompt for alternative/rewrite versions.
     */
    protected function buildAlternativePrompt(ContentPlannerPost $post, string $instruction): string
    {
        return <<<PROMPT
You are a platform-native social media copywriter.

The original {$post->platform} post is:
"""
{$post->main_copy}
"""

{$instruction}

Keep the same topic, goal, and platform. Maintain the brand voice but try a different angle. Do not invent statistics, testimonials, or results.

Output ONLY the new post copy — no JSON, no commentary, no surrounding quotes.
PROMPT;
    }

    /**
     * Enriched platform-specific rules (spec §8).
     */
    protected function getPlatformRules(string $platform): string
    {
        $rules = [
            'linkedin' => 'Purpose: B2B trust, authority, thought leadership, founder credibility, education, soft lead generation. '
                . 'Best content types: founder/expert insights, industry lessons, case studies, customer problems, transformation stories, practical frameworks, contrarian-but-useful opinions, company updates with a human angle. '
                . 'Rules: strong first line (the first ~200 characters show before "see more" — make them count); professional tone; no excessive emojis; no generic motivational fluff; use specific business examples; soft CTA; create comments through thoughtful questions; keep under ~1300 characters; 3-5 relevant hashtags maximum.',
            'instagram' => 'Purpose: brand awareness, visual trust, education through visuals, aesthetic memory, social proof; Reels drive reach and discovery. '
                . 'Best content types: carousels (use carousel logic when teaching, with a strong cover slide concept), short captions, educational graphics, behind-the-scenes photos, before/after, product/service visuals, lifestyle content; for Reels: short tips, myth-busting, process videos, quick demos, relatable business problems. '
                . 'Rules: the visual comes first — the caption supports it; front-load the first ~125 caption characters; keep captions clear (max 2200 characters); use save/share mechanics; do not overcrowd images with text; Reels are vertical 9:16, must hook in the first 1-3 seconds, one idea per video, with on-screen captions; hashtags per brand policy (5-15 relevant, never spammy).',
            'tiktok' => 'Purpose: discovery, attention, relatable education, trend adaptation, fast creative testing. '
                . 'Best content types: native short videos, problem/solution videos, POV content, founder speaking to camera, quick examples, reactions to trends, simple storytelling. '
                . 'Rules: TikTok-first content, never repurposed corporate ads; vertical 9:16 video; strong opening hook in the first 1-3 seconds; natural human tone; use trends only when genuinely relevant to the audience; avoid polished corporate stiffness; short punchy caption (max ~150 characters).',
            'facebook' => 'Purpose: community, local trust, offers, relationship building, existing customer engagement. '
                . 'Best content types: updates, offers, stories, community questions, event posts, helpful tips, customer-friendly posts. '
                . 'Rules: more conversational and easier language than LinkedIn; great for community-style engagement; use questions and relatable situations; longer captions are OK (up to ~1000 characters) but lead with the point; minimal hashtags.',
            'x' => 'Purpose: short insights, opinions, industry commentary, thought fragments, traffic to deeper content. '
                . 'Best content types: sharp one-liners, short threads, opinions, trend reactions, mini frameworks. '
                . 'Rules: maximum 280 characters per post; concise with a clear point of view; avoid generic corporate language; one strong idea; 0-2 hashtags; threads work well for frameworks.',
            'youtube' => 'Purpose: discovery, education, searchable short-form and long-form video, repurposed expertise. '
                . 'Best content types: quick explainers, mini tutorials, mistake lists, before/after, short demos, question-answer format. '
                . 'Rules: hook in the first seconds; clear curiosity-driven title (60-70 characters); one topic per video; strong retention structure (promise → deliver → payoff); end with a simple CTA; keyword-rich description; Shorts are vertical 9:16.',
            'blog' => 'Purpose: deeper education, SEO, long-term trust, lead nurturing. '
                . 'Best content types: guides, explainers, case studies, product education, trend articles, FAQ articles. '
                . 'Rules: useful structure with clear H2/H3 headers; practical examples; SEO-optimized title; meta description of 150-160 characters; write so sections can be repurposed into multiple social posts; internal links where natural.',
            'email' => 'Purpose: nurture, direct relationship, replies and conversions from an owned audience. '
                . 'Best content types: newsletters, value tips, story-driven lessons, soft offers, event/product updates. '
                . 'Rules: subject line 45-50 characters with a curiosity or value hook; preheader ~100 characters; write like one person emailing another (conversational, no corporate bulk tone); mobile-first formatting with short paragraphs; primary CTA above the fold; 2-3 CTAs maximum; no hashtags.',
            'default' => 'Professional yet approachable. One clear idea, clear messaging, a strong first line, specific value, and a clear CTA. Relevant hashtags only if the platform uses them.',
        ];

        return $rules[$platform] ?? $rules['default'];
    }

    /**
     * Engagement mechanics guidance by goal (spec §20).
     */
    protected function engagementGuidance(array $goals): string
    {
        $map = [
            'comments' => 'Comments: end with an opinion-based question ("Which one is the bigger problem for your team?", "Do you agree or disagree?", "What would you add to this list?").',
            'saves' => 'Saves: package value as a checklist, framework, step-by-step guide, mistake list, comparison, or quick reference worth keeping.',
            'shares' => 'Shares: state an industry truth, relatable pain, myth-bust, useful template, or strong opinion people would send to their team.',
            'dms' => 'DMs: invite a direct message ("Message us \'AI\' and we\'ll send the checklist.", "DM us if you want the setup example.").',
            'profile_visits' => 'Profile visits: tease deeper value available on the profile without clickbait.',
            'link_clicks' => 'Link clicks: one clear, low-friction link CTA tied directly to the value of the post.',
            'demo_requests' => 'Demo requests: pair concrete proof with an easy, low-pressure demo invitation.',
            'trial_signups' => 'Trial signups: show the outcome first, then a low-friction free-trial CTA.',
            'bookings' => 'Bookings: make the next step a simple consultation or booking prompt.',
            'email_replies' => 'Email replies: ask one specific question the reader can answer in one line.',
        ];

        $lines = [];

        foreach ($goals as $goal) {
            if (is_string($goal) && isset($map[$goal])) {
                $lines[] = '- ' . $map[$goal];
            }
        }

        return implode("\n", $lines);
    }

    /**
     * Upsert the visual brief row for the post from the AI visual_brief object.
     */
    protected function upsertVisualBrief(ContentPlannerPost $post, ?array $brief): void
    {
        if (empty($brief)) {
            return;
        }

        ContentPlannerVisualBrief::updateOrCreate(
            ['post_id' => $post->id],
            [
                'visual_type' => $this->briefText($brief['visual_type'] ?? null),
                'aspect_ratio' => $this->briefText($brief['aspect_ratio'] ?? null),
                'style' => $this->briefText($brief['style'] ?? null),
                'description' => $this->briefText($brief['description'] ?? ($brief['scene'] ?? null)),
                'scene' => $this->briefText($brief['scene'] ?? null),
                'mood' => $this->briefText($brief['mood'] ?? null),
                'composition' => $this->briefText($brief['composition'] ?? null),
                'text_overlay' => $this->briefText($brief['text_overlay'] ?? null),
                'avoid' => $this->briefText($brief['avoid'] ?? null),
                'video_script' => $this->briefText($brief['video_script'] ?? null),
            ]
        );
    }

    /**
     * Normalize an AI brief value (string or array) to nullable text.
     */
    protected function briefText($value): ?string
    {
        if (is_array($value)) {
            $value = implode('; ', array_filter(array_map(
                fn ($item) => is_scalar($item) ? trim((string) $item) : null,
                $value
            )));
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
