<?php

namespace App\Services\ContentPlanner;

use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\ContentKnowledgeService;

/**
 * Renders the full brand/audience/channel/strategy profile into a single
 * prompt-ready context string, plus the recent-posts anti-repetition digest.
 * Empty sections are skipped gracefully.
 */
final class ContextBuilder
{
    public function __construct(private ContentKnowledgeService $knowledge)
    {
    }

    /**
     * Build the complete, clearly-sectioned context block for AI prompts.
     */
    public function build(ContentPlannerProfile $profile): string
    {
        $sections = array_filter([
            $this->brandProfileSection($profile),
            $this->brandVoiceSection($profile),
            $this->audiencesSection($profile),
            $this->channelsSection($profile),
            $this->pillarsSection($profile),
            $this->contentMixSection($profile),
            $this->weeklyRhythmSection($profile),
            $this->engagementGoalsSection($profile),
            $this->visualStyleSection($profile),
            $this->trendModeSection($profile),
            $this->knowledgeSection($profile),
        ], fn ($section) => $section !== null && $section !== '');

        return implode("\n\n", $sections);
    }

    /**
     * Digest of the last $limit non-archived posts, newest first, so the AI
     * can avoid repeating topics/hooks/angles. Empty string if none.
     * Pass $excludePostId when generating/scoring a specific post so it is
     * never compared against itself (false self-repetition).
     */
    public function recentPostsDigest(ContentPlannerProfile $profile, int $limit = 30, ?int $excludePostId = null): string
    {
        $posts = $profile->posts()
            ->where('status', '!=', 'archived')
            ->when($excludePostId, fn ($q) => $q->where('id', '!=', $excludePostId))
            ->with('pillar')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        if ($posts->isEmpty()) {
            return '';
        }

        $lines = $posts->map(function ($post) {
            $topic = trim((string) ($post->topic ?: $post->title)) ?: 'Untitled';
            $hook = trim((string) $post->hook) ?: '-';
            $pillar = $post->pillar?->name ?: '-';
            $cta = trim((string) $post->cta) ?: '-';

            return '- [' . $post->platform . '] '
                . mb_substr($topic, 0, 120) . ' | '
                . mb_substr($hook, 0, 120) . ' | '
                . $pillar . ' | '
                . mb_substr($cta, 0, 80);
        })->implode("\n");

        return "RECENT CONTENT (do NOT repeat these topics/hooks/angles):\n" . $lines;
    }

    // ---------------------------------------------------------------------
    // Sections
    // ---------------------------------------------------------------------

    private function brandProfileSection(ContentPlannerProfile $profile): ?string
    {
        $org = Organization::find($profile->organization_id);

        $lines = [
            $this->kv('Brand profile name', $profile->name),
            $org ? $this->kv('Company', trim((string) $org->name . ($org->resolved_industry ? " ({$org->resolved_industry} industry)" : ''))) : null,
            $org ? $this->kv('Website', $org->website) : null,
            $this->kv('Default language', $profile->default_language),
            $this->kv('Default tone', $profile->default_tone),
            $this->kv('Primary goal', $profile->primary_goal),
            $this->kvList('Secondary goals', $profile->secondary_goals),
            $this->kv('Brand summary', $profile->brand_summary),
            $this->kv('USP', $profile->usp),
            $this->kv('Mission', $profile->mission),
            $this->kvList('Values', $profile->brand_values),
            $this->kv('Brand promise', $profile->brand_promise),
            $this->kv('Differentiators', $profile->differentiators),
            $this->kvList('Proof points', $profile->proof_points),
            $this->kv('Price position', $profile->price_position),
            $this->kv('Main CTA', $profile->main_cta),
            $this->kvList('Important links', $profile->important_links),
            $this->kvList('Key messages to repeat', $profile->key_messages),
        ];

        $positioning = is_array($profile->positioning) ? $profile->positioning : [];
        $positioningLines = array_filter([
            $this->kv('Old way (what is broken)', $positioning['old_way'] ?? null),
            $this->kv('New way (what we represent)', $positioning['new_way'] ?? null),
            $this->kvList('Beliefs to repeat', $positioning['beliefs'] ?? null),
            $this->kv('Promised transformation', $positioning['transformation'] ?? null),
        ]);

        if (!empty($positioningLines)) {
            $lines[] = "Positioning:\n  " . implode("\n  ", $positioningLines);
        }

        return $this->section('BRAND PROFILE', $lines);
    }

    private function brandVoiceSection(ContentPlannerProfile $profile): ?string
    {
        $voice = $profile->brandVoices()->active()->first();

        if (!$voice) {
            return null;
        }

        return $this->section('BRAND VOICE', [
            $this->kv('Tone', $voice->tone),
            $this->kv('Style', $voice->style),
            $this->kv('Formality', $voice->formality_level),
            $this->kv('Emoji policy', $voice->emoji_policy),
            $this->kv('Hashtag policy', $voice->hashtag_policy),
            $this->kv('Sentence style', $voice->sentence_style),
            $this->kv('Point of view', $voice->point_of_view),
            $this->kvList('Preferred words', $voice->preferred_words),
            $this->kvList('Forbidden words', $voice->forbidden_words),
            $this->kvList('Claims to avoid', $voice->claims_to_avoid),
        ]);
    }

    private function audiencesSection(ContentPlannerProfile $profile): ?string
    {
        $audiences = $profile->audiences()->active()->get();

        if ($audiences->isEmpty()) {
            return null;
        }

        $blocks = [];

        foreach ($audiences as $audience) {
            $header = '### Audience: ' . ($audience->name ?: 'Unnamed segment')
                . ($audience->is_ai_assumed ? ' (contains AI-assumed details — do not state them as facts)' : '');

            $lines = array_filter([
                $this->kv('Role / customer type', $audience->job_role),
                $this->kv('Description', $audience->description),
                $this->kv('Industry', $audience->industry),
                $this->kv('Country', $audience->country),
                $this->kv('Language', $audience->language),
                $this->kv('Business size', $audience->business_size),
                $this->kvList('Pain points', $audience->pain_points),
                $this->kvList('Desires / goals', $audience->goals),
                $this->kvList('Fears', $audience->fears),
                $this->kvList('Objections', $audience->objections),
                $this->kvList('Buying triggers', $audience->buying_triggers),
                $this->kvList('Emotional triggers', $audience->emotional_triggers),
                $this->kvList('Rational triggers', $audience->rational_triggers),
                $this->kvList('Questions before buying', $audience->questions),
                $this->kv('Content they trust', $audience->content_they_trust),
                $this->kv('Desired transformation', $audience->desired_transformation),
                $this->kvList('Preferred platforms', $audience->preferred_platforms),
                $this->kv('Preferred tone', $audience->preferred_tone),
            ]);

            $blocks[] = $header . (empty($lines) ? '' : "\n" . implode("\n", $lines));
        }

        return "## AUDIENCE SEGMENTS\n" . implode("\n\n", $blocks);
    }

    private function channelsSection(ContentPlannerProfile $profile): ?string
    {
        $channels = $profile->channels()->active()->get();

        if ($channels->isEmpty()) {
            return null;
        }

        $blocks = [];

        foreach ($channels as $channel) {
            $header = '### Channel: ' . $channel->platform
                . ($channel->label ? " ({$channel->label})" : '');

            $lines = array_filter([
                $this->kv('Purpose / goal', $channel->goal),
                $this->kv('Platform role', $channel->role),
                $channel->posts_per_week ? $this->kv('Posts per week', (string) $channel->posts_per_week) : null,
                $this->kv('Posting days', $this->frequencyDays($channel->frequency)),
                $this->kvList('Preferred formats', $channel->preferred_formats),
                $this->kv('Emoji policy', $channel->emoji_policy),
                $this->kv('Hashtag policy', $channel->hashtag_policy),
                $channel->max_length ? $this->kv('Max length', $channel->max_length . ' characters') : null,
                $this->kv('CTA style', $channel->cta_style),
                $this->kv('Visual style', $channel->visual_style),
                $this->kv('Link policy', $channel->link_policy),
                $this->kv('Tone override', $channel->tone_override),
                $this->kv('Language', $channel->default_language),
                $this->kv('URL', $channel->url),
            ]);

            $blocks[] = $header . (empty($lines) ? '' : "\n" . implode("\n", $lines));
        }

        return "## ACTIVE CHANNELS\n" . implode("\n\n", $blocks);
    }

    private function pillarsSection(ContentPlannerProfile $profile): ?string
    {
        $pillars = $profile->pillars()->active()->orderByDesc('frequency_weight')->get();

        if ($pillars->isEmpty()) {
            return null;
        }

        $lines = [];

        foreach ($pillars as $pillar) {
            $line = '- ' . $pillar->name . ' (weight ' . (int) $pillar->frequency_weight . '%)';
            $purpose = trim((string) ($pillar->purpose ?: $pillar->description));

            if ($purpose !== '') {
                $line .= ': ' . $purpose;
            }

            if (!empty($pillar->example_topics)) {
                $topics = array_filter(array_map(
                    fn ($topic) => is_scalar($topic) ? trim((string) $topic) : null,
                    $pillar->example_topics
                ));

                if (!empty($topics)) {
                    $line .= ' Example topics: ' . implode('; ', $topics) . '.';
                }
            }

            $lines[] = $line;
        }

        return $this->section('CONTENT PILLARS', $lines);
    }

    private function contentMixSection(ContentPlannerProfile $profile): ?string
    {
        $mix = $profile->content_mix;

        if (empty($mix) || !is_array($mix)) {
            return null;
        }

        $lines = [];

        foreach ($mix as $category => $percent) {
            if (is_scalar($percent)) {
                $lines[] = "- {$category}: {$percent}%";
            }
        }

        return $this->section('CONTENT MIX', $lines);
    }

    private function weeklyRhythmSection(ContentPlannerProfile $profile): ?string
    {
        $rhythm = $profile->weekly_rhythm;

        if (empty($rhythm) || !is_array($rhythm)) {
            return null;
        }

        $order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        $lines = [];

        foreach ($order as $day) {
            if (!isset($rhythm[$day]) || !is_array($rhythm[$day])) {
                continue;
            }

            $role = trim((string) ($rhythm[$day]['role'] ?? ''));
            $notes = trim((string) ($rhythm[$day]['notes'] ?? ''));

            if ($role === '' && $notes === '') {
                continue;
            }

            $line = '- ' . $day . ': ' . ($role !== '' ? $role : 'unspecified');

            if ($notes !== '') {
                $line .= ' — ' . $notes;
            }

            $lines[] = $line;
        }

        return $this->section('WEEKLY RHYTHM', $lines);
    }

    private function engagementGoalsSection(ContentPlannerProfile $profile): ?string
    {
        $goals = $profile->engagement_goals;

        if (empty($goals) || !is_array($goals)) {
            return null;
        }

        return $this->section('ENGAGEMENT GOALS', [
            $this->kvList('Priority engagement types', $goals),
        ]);
    }

    private function visualStyleSection(ContentPlannerProfile $profile): ?string
    {
        $visual = $profile->visual_style;

        if (empty($visual) || !is_array($visual)) {
            return null;
        }

        return $this->section('VISUAL STYLE', [
            $this->kv('Style', $visual['style'] ?? null),
            $this->kvList('Image types', $visual['image_types'] ?? null),
            $this->kvList('Avoid', $visual['avoid'] ?? null),
            $this->kvList('Aspect ratios', $visual['aspect_ratios'] ?? null),
            $this->kvList('Brand colors', $visual['colors'] ?? null),
        ]);
    }

    private function trendModeSection(ContentPlannerProfile $profile): ?string
    {
        return $this->section('TREND MODE', [
            $this->kv('Trend approach', $profile->trend_mode),
        ]);
    }

    private function knowledgeSection(ContentPlannerProfile $profile): ?string
    {
        $summary = trim($this->knowledge->summarizeForAi(
            $profile->organization_id,
            $profile->brand_id
        ));

        if ($summary === '') {
            return null;
        }

        return "## COMPANY KNOWLEDGE (from FAQ / services / company settings)\n" . $summary;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private function section(string $title, array $lines): ?string
    {
        $lines = array_values(array_filter($lines));

        if (empty($lines)) {
            return null;
        }

        return "## {$title}\n" . implode("\n", $lines);
    }

    private function kv(string $label, $value): ?string
    {
        if (is_array($value)) {
            return $this->kvList($label, $value);
        }

        $value = trim((string) $value);

        return $value === '' ? null : "{$label}: {$value}";
    }

    private function kvList(string $label, $items): ?string
    {
        if (!is_array($items)) {
            return $this->kv($label, $items);
        }

        $clean = [];

        foreach ($items as $item) {
            $text = is_scalar($item) ? trim((string) $item) : trim((string) json_encode($item));

            if ($text !== '' && $text !== 'null') {
                $clean[] = $text;
            }
        }

        return empty($clean) ? null : "{$label}: " . implode('; ', $clean);
    }

    private function frequencyDays($frequency): ?string
    {
        if (!is_array($frequency)) {
            return null;
        }

        $days = [];

        foreach ($frequency as $day => $enabled) {
            if ($enabled) {
                $days[] = $day;
            }
        }

        return empty($days) ? null : implode(', ', $days);
    }
}
