<?php

namespace App\Services;

use App\Models\ContentPlannerPost;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * Strict content quality critic (spec §19).
 * Scores a post 1-10 across brand/audience/platform fit, clarity, originality,
 * engagement potential, CTA strength, repetition risk and sales pressure,
 * then persists the result to the post's quality_score column.
 */
class ContentQualityService
{
    public function __construct(
        protected AiClient $ai,
        protected ContextBuilder $contextBuilder,
    ) {}

    /**
     * Run the quality check, save the result on the post and return it.
     *
     * @return array{scores: array, overall: float, flags: array, improvements: array, verdict: string}
     */
    public function check(ContentPlannerPost $post): array
    {
        $profile = $post->profile;
        if (!$profile) {
            throw new \RuntimeException('Post has no planner profile.');
        }

        $context = $this->contextBuilder->build($profile);
        $digest = $this->contextBuilder->recentPostsDigest($profile, 30, $post->id);

        $result = $this->ai->generateJson($profile, 'quality_check', $this->buildPrompt($post, $context, $digest), 3000);

        $post->quality_score = $result;
        $post->save();

        return $result;
    }

    /**
     * Build the master quality checker prompt (spec §19).
     */
    private function buildPrompt(ContentPlannerPost $post, string $context, string $digest): string
    {
        $hashtags = is_array($post->hashtags) ? implode(' ', $post->hashtags) : '';
        $platform = (string) $post->platform;
        $topic = (string) $post->topic;
        $hook = (string) $post->hook;
        $mainCopy = (string) $post->main_copy;
        $cta = (string) $post->cta;
        $postType = (string) $post->post_type;
        $funnelStage = (string) $post->funnel_stage;
        $audienceName = (string) ($post->audience?->name ?? 'not specified');
        $pillarName = (string) ($post->pillar?->name ?? 'not specified');

        return <<<PROMPT
You are a strict social media content quality critic.

Review the post below against the brand context and recent content history. Be honest and demanding — average content scores 5-6, only truly excellent content scores 9-10.

## BRAND CONTEXT
{$context}

{$digest}

## POST UNDER REVIEW
Platform: {$platform}
Topic: {$topic}
Post type: {$postType}
Funnel stage: {$funnelStage}
Target audience: {$audienceName}
Content pillar: {$pillarName}
Hook: {$hook}
Copy:
{$mainCopy}
CTA: {$cta}
Hashtags: {$hashtags}

Score each dimension 1-10. For repetition_risk and sales_pressure LOWER is BETTER (1 = no repetition / no pushy selling, 10 = heavily repeated / aggressive selling). Use the recent content history above to judge repetition_risk.

Flag concrete problems such as: too generic, too promotional, weak hook, unclear audience, platform mismatch, repeated idea, unrealistic claim, vague CTA, poor visual direction. Give specific, actionable improvement recommendations.

verdict must be exactly one of: good, needs_work, weak.

Return ONLY valid JSON wrapped in ```json fences, exactly this shape:
```json
{"scores":{"brand_fit":8,"audience_fit":7,"platform_fit":9,"clarity":8,"originality":6,"engagement_potential":7,"cta_strength":6,"repetition_risk":2,"sales_pressure":3},"overall":7.2,"flags":["..."],"improvements":["..."],"verdict":"good"}
```
PROMPT;
    }
}
