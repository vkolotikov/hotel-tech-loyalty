<?php

namespace App\Services;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Services\ContentPlanner\AiClient;

/**
 * Generates a practical visual brief for a post (spec §18):
 * visual type, scene, mood, composition, text overlay, what to avoid,
 * plus stock idea + design notes stored in metadata.
 */
class ContentVisualBriefService
{
    public function __construct(protected AiClient $ai) {}

    /**
     * Generate (or regenerate) the visual brief for a post.
     */
    public function generateFor(ContentPlannerPost $post): ContentPlannerVisualBrief
    {
        $profile = $post->profile;
        if (!$profile) {
            throw new \RuntimeException('Post has no planner profile.');
        }

        $data = $this->ai->generateJson($profile, 'visual_brief', $this->buildPrompt($post, $profile), 3000);

        // Clamp values to their varchar column limits — the AI writes prose
        // and Postgres rejects over-long rows AFTER the paid API call.
        return ContentPlannerVisualBrief::updateOrCreate(
            ['post_id' => $post->id],
            [
                'visual_type' => $this->str($data['visual_type'] ?? null, 50),
                'aspect_ratio' => $this->str($data['aspect_ratio'] ?? null, 20),
                'style' => $this->str($data['style'] ?? null, 255),
                'description' => $this->str($data['description'] ?? null),
                'scene' => $this->str($data['scene'] ?? null),
                'mood' => $this->str($data['mood'] ?? null, 100),
                'composition' => $this->str($data['composition'] ?? null),
                'text_overlay' => $this->str($data['text_overlay'] ?? null, 255),
                'avoid' => $this->str($data['avoid'] ?? null),
                'video_script' => $this->str($data['video_script'] ?? null),
                'metadata' => [
                    'stock_idea' => $this->str($data['stock_idea'] ?? null),
                    'design_notes' => $this->str($data['design_notes'] ?? null),
                ],
            ]
        );
    }

    /**
     * Build the master visual brief prompt (spec §18).
     */
    private function buildPrompt(ContentPlannerPost $post, $profile): string
    {
        $visualStyle = $profile->visual_style
            ? json_encode($profile->visual_style)
            : 'No explicit visual style configured — keep it clean, on-brand and practical.';

        $hashtags = is_array($post->hashtags) ? implode(' ', $post->hashtags) : '';
        $topic = (string) $post->topic;
        $hook = (string) $post->hook;
        $mainCopy = (string) $post->main_copy;
        $cta = (string) $post->cta;
        $platform = (string) $post->platform;

        return <<<PROMPT
You are a creative director for social media content.

Create a visual brief for this post. The visual must support the message, match the brand style, and be practical for manual creation (no AI image generation assumed).

## BRAND VISUAL STYLE
{$visualStyle}

## PLATFORM
{$platform}

## POST
Topic: {$topic}
Hook: {$hook}
Copy:
{$mainCopy}
CTA: {$cta}
Hashtags: {$hashtags}

Decide the visual type, aspect ratio (platform-native), scene/concept, mood, composition, text overlay suggestion, colors/style direction, what to avoid, a stock image idea if relevant, and design notes. Include a short video scene plan ONLY if the visual should be a video — otherwise video_script must be null.

Return ONLY valid JSON wrapped in ```json fences, exactly this shape:
```json
{"visual_type":"image","aspect_ratio":"1:1","style":"...","description":"...","scene":"...","mood":"...","composition":"...","text_overlay":"...","avoid":"...","video_script":null,"stock_idea":"...","design_notes":"..."}
```
PROMPT;
    }

    /**
     * Coerce an AI-returned value into a trimmed string or null,
     * clamped to $max characters when the target column is a varchar.
     */
    private function str(mixed $value, ?int $max = null): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_array($value)) {
            $value = json_encode($value);
        }
        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        return $max !== null ? mb_substr($value, 0, $max) : $value;
    }
}
