<?php

namespace App\Services\Content;

use App\Models\ContentPlannerSnippet;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * The values HexaTech Content accepts, in one place (spec 2026-10-14). The
 * bootstrap sends the lists to the portal, so the screens never keep a copy.
 */
final class ContentRules
{
    public const PLATFORMS = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'];

    public const STATUSES = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'];

    public const FUNNEL_STAGES = ['awareness', 'consideration', 'conversion', 'retention'];

    /** The five rewrites ContentPostGenerationService::generateAlternatives knows. */
    public const REWRITES = ['shorter', 'longer', 'professional', 'friendly', 'alternative'];

    /** The longest range a plan read or a generation may cover, in days, both ends included. */
    public const MAX_RANGE_DAYS = 62;

    /** Days in a range, both ends included. */
    public static function days(string $from, string $to): int
    {
        return (int) abs(CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to))) + 1;
    }

    /** An id that must belong to this organisation AND the brand this call works on (spec 2026-10-14 §7, F2). */
    public static function owned(string $table): Exists
    {
        return Rule::exists($table, 'id')
            ->where('organization_id', ContentContext::orgId())
            ->where('brand_id', ContentContext::brandId());
    }

    /**
     * A post's editable fields, each optional, with the limits PostgreSQL's
     * columns enforce (sqlite does not, so these rules are the only guard).
     *
     * @return array<string, mixed>
     */
    public static function postFields(): array
    {
        return [
            'platform'         => ['sometimes', Rule::in(self::PLATFORMS)],
            'scheduled_date'   => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'scheduled_time'   => ['sometimes', 'nullable', 'date_format:H:i'],
            'status'           => ['sometimes', Rule::in(self::STATUSES)],
            'pillar_id'        => ['sometimes', 'nullable', 'integer', self::owned('content_planner_pillars')],
            'audience_id'      => ['sometimes', 'nullable', 'integer', self::owned('content_planner_audiences')],
            'campaign_id'      => ['sometimes', 'nullable', 'integer', self::owned('content_planner_campaigns')],
            'language'         => ['sometimes', 'string', 'max:10'],
            'topic'            => ['sometimes', 'nullable', 'string', 'max:255'],
            'title'            => ['sometimes', 'nullable', 'string', 'max:255'],
            'goal'             => ['sometimes', 'nullable', 'string', 'max:255'],
            'format'           => ['sometimes', 'nullable', 'string', 'max:50'],
            'hook'             => ['sometimes', 'nullable', 'string', 'max:500'],
            'main_copy'        => ['sometimes', 'nullable', 'string', 'max:20000'],
            'short_copy'       => ['sometimes', 'nullable', 'string', 'max:5000'],
            'cta'              => ['sometimes', 'nullable', 'string', 'max:255'],
            'hashtags'         => ['sometimes', 'nullable', 'array', 'max:30'],
            'hashtags.*'       => ['string', 'max:100'],
            'weekday_role'     => ['sometimes', 'nullable', 'string', 'max:50'],
            // The calendar stores the AI's own funnel words, so any short string, not only FUNNEL_STAGES.
            'funnel_stage'     => ['sometimes', 'nullable', 'string', 'max:50'],
            'post_type'        => ['sometimes', 'nullable', 'string', 'max:50'],
            'strategic_reason' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ];
    }

    /** The brand profile's sections, each field optional (spec §4.6), with PostgreSQL's limits. @return array<string, mixed> */
    public static function profileFields(): array
    {
        $text = ['sometimes', 'nullable', 'string', 'max:5000'];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'name' => ['sometimes', 'string', 'max:255'], 'default_language' => ['sometimes', 'string', 'max:10'],
            'default_tone' => ['sometimes', 'nullable', 'string', 'max:100'], 'primary_goal' => $text,
            'secondary_goals' => $list, 'content_rules' => $list, 'brand_summary' => $text, 'usp' => $text,
            'mission' => $text, 'brand_values' => $list, 'brand_promise' => $text, 'differentiators' => $text,
            'proof_points' => $list, 'price_position' => ['sometimes', 'nullable', 'string', 'max:50'],
            'main_cta' => $text, 'important_links' => $list, 'positioning' => $list, 'key_messages' => $list,
            'content_mix' => $list, 'weekly_rhythm' => $list, 'engagement_goals' => $list, 'visual_style' => $list,
            'trend_mode' => ['sometimes', 'string', 'max:50'], 'setup_step' => ['sometimes', 'integer', 'min:0', 'max:20'],
        ];
    }

    /** @return array<string, mixed> */
    public static function voiceFields(): array
    {
        $short = fn (int $max) => ['sometimes', 'nullable', 'string', "max:{$max}"];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'tone' => $short(100), 'style' => $short(100), 'formality_level' => $short(50), 'emoji_policy' => $short(50),
            'hashtag_policy' => $short(50), 'sentence_style' => $short(50), 'point_of_view' => $short(50),
            'preferred_words' => $list, 'forbidden_words' => $list, 'claims_to_avoid' => $list,
            'example_good_posts' => $list, 'example_bad_posts' => $list,
        ];
    }

    /** @return array<string, mixed> */
    public static function audienceFields(bool $creating): array
    {
        // Text columns since the July widening: AI-joined lists ("a, b, c") run past 255.
        $text = ['sometimes', 'nullable', 'string', 'max:5000'];
        $list = ['sometimes', 'nullable', 'array'];

        return [
            'name' => $creating ? ['required', 'string', 'max:255'] : ['sometimes', 'string', 'max:255'],
            'description' => $text, 'industry' => $text, 'country' => $text,
            'business_size' => $text, 'job_role' => $text, 'preferred_tone' => $text,
            'language' => ['sometimes', 'nullable', 'string', 'max:10'],
            'pain_points' => $list, 'goals' => $list, 'fears' => $list, 'objections' => $list, 'buying_triggers' => $list,
            'emotional_triggers' => $list, 'rational_triggers' => $list, 'questions' => $list, 'preferred_platforms' => $list,
            'content_they_trust' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'desired_transformation' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'is_ai_assumed' => ['sometimes', 'boolean'],
        ];
    }

    /** A hashtag group or a text snippet (spec 2026-10-15 §6); its kind is fixed once made. */
    public static function snippetFields(bool $creating): array
    {
        return [
            'kind' => $creating ? ['required', Rule::in(ContentPlannerSnippet::KINDS)] : ['prohibited'],
            'name' => $creating ? ['required', 'string', 'max:60'] : ['sometimes', 'string', 'max:60'],
            'body' => $creating ? ['required', 'string', 'max:2000'] : ['sometimes', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, mixed> */
    public static function channelFields(bool $creating): array
    {
        // url stays varchar(255); goal, role, cta_style, visual_style, link_policy and tone_override are text since July.
        $text = ['sometimes', 'nullable', 'string', 'max:5000'];
        $fields = [
            'platform' => $creating ? ['required', Rule::in(self::PLATFORMS)] : ['sometimes', Rule::in(self::PLATFORMS)],
            'label' => $creating ? ['required', 'string', 'max:255'] : ['sometimes', 'string', 'max:255'],
            'url' => ['sometimes', 'nullable', 'string', 'max:255'], 'goal' => $text, 'role' => $text, 'cta_style' => $text,
            'visual_style' => $text, 'link_policy' => $text, 'tone_override' => $text,
            'default_language' => ['sometimes', 'nullable', 'string', 'max:10'],
            'emoji_policy' => ['sometimes', 'nullable', 'string', 'max:50'], 'hashtag_policy' => ['sometimes', 'nullable', 'string', 'max:50'],
            'posts_per_week' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:21'],
            'preferred_formats' => ['sometimes', 'nullable', 'array'],
            'audience_id' => ['sometimes', 'nullable', 'integer', self::owned('content_planner_audiences')],
            'active' => ['sometimes', 'boolean'],
            'frequency' => ['sometimes', 'nullable', 'array'],
            // The usual posting time (spec 2026-10-15 §5): two-digit HH:MM; an empty value reaches here as null and clears it.
            'post_time' => ['sometimes', 'nullable', 'date_format:H:i'],
        ];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $day) {
            $fields["frequency.{$day}"] = ['sometimes', 'boolean'];
        }

        return $fields;
    }
}
