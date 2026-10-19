<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\User;
use Carbon\CarbonImmutable;

/** The shapes HexaTech Content sends for a post (spec 2026-10-14 §4). */
final class ContentPostPresenter
{
    /**
     * What a calendar card, a list row and Find draw. `updated_at` is the
     * version the portal sends back with a save or a move (F3).
     *
     * @return array<string, mixed>
     */
    public static function card(ContentPlannerPost $post): array
    {
        $brief = $post->relationLoaded('visualBrief') ? $post->visualBrief : $post->visualBrief()->first();

        return [
            'id'             => (int) $post->id,
            'platform'       => (string) $post->platform,
            'scheduled_date' => $post->scheduled_date?->format('Y-m-d'),
            'scheduled_time' => self::time($post->scheduled_time),
            'status'         => (string) $post->status,
            'title'          => $post->title,
            'hook'           => $post->hook,
            'topic'          => $post->topic,
            'pillar_id'      => $post->pillar_id ? (int) $post->pillar_id : null,
            'image_url'      => $brief?->image_status === 'ready' ? $brief->image_url : null,
            'updated_at'     => $post->updated_at?->toISOString(),
            // Spec 2026-10-16 §6.3, §7.1 (read in the list's query by withReview(); asked here otherwise).
            'comments_count' => (int) ($post->comments_count ?? $post->comments()->count()),
            'sent_back'      => self::sentBack($post),
            // Spec 2026-10-19 §3.4: the posts in its group of versions, from 2 (read in the list's query by withReview()).
            'group_size'     => self::groupSize($post),
            // Who posts it as stored (spec 2026-10-19 §4.1); the panel's `poster` says whether they are still on the team.
            'poster_id'      => $post->poster_id === null ? null : (int) $post->poster_id,
        ];
    }

    /** How many posts share its group; 0 for none and for a group of one. */
    private static function groupSize(ContentPlannerPost $post): int
    {
        if (!$post->group_id) {
            return 0;
        }
        $size = array_key_exists('group_size', $post->getAttributes())
            ? (int) $post->getAttribute('group_size')
            : ContentPlannerPost::where('group_id', $post->group_id)->count();

        return $size >= 2 ? $size : 0;
    }

    /** A draft whose latest approval step is a send-back, with no change to the post after it (spec 2026-10-16 §6.3). */
    public static function sentBack(ContentPlannerPost $post): bool
    {
        if ($post->status !== 'draft') {
            return false;
        }
        if (array_key_exists('last_event_kind', $post->getAttributes())) {
            $kind = $post->getAttribute('last_event_kind');
            $at = $post->getAttribute('last_event_at');
        } else {
            $last = $post->events()->orderByDesc('id')->first();
            $kind = $last?->kind;
            $at = $last?->created_at;
        }
        if ($kind !== 'sent_back' || $at === null || $post->updated_at === null) {
            return false;
        }

        return $post->updated_at->getTimestamp() <= CarbonImmutable::parse($at)->getTimestamp();
    }

    /** Everything the post panel shows and edits. @return array<string, mixed> */
    public static function detail(ContentPlannerPost $post): array
    {
        $brief = $post->relationLoaded('visualBrief') ? $post->visualBrief : $post->visualBrief()->first();

        return self::card($post) + [
            // Who wrote it (spec 2026-10-16 §7.1): only a post a person wrote here. A calendar post keeps who pressed
            // Generate in created_by, a repeat copy who repeated it: neither wrote it, so they show none (final review).
            'author'            => $post->generated_by === 'manual' && $post->created_by ? $post->createdBy?->name : null,
            'language'          => $post->language,
            'goal'              => $post->goal,
            'format'            => $post->format,
            'main_copy'         => $post->main_copy,
            'short_copy'        => $post->short_copy,
            'cta'               => $post->cta,
            'hashtags'          => array_values((array) ($post->hashtags ?? [])),
            'audience_id'       => $post->audience_id ? (int) $post->audience_id : null,
            'campaign_id'       => $post->campaign_id ? (int) $post->campaign_id : null,
            'weekday_role'      => $post->weekday_role,
            'funnel_stage'      => $post->funnel_stage,
            'post_type'         => $post->post_type,
            'strategic_reason'  => $post->strategic_reason,
            'quality'           => $post->quality_score,
            'published_url'     => $post->published_url,
            'published_at'      => $post->published_at?->toISOString(),
            'generated_by'      => $post->generated_by,
            // A repeated post and its copies (spec 2026-10-15 §8): how the series runs, for the panel's line.
            'series_id'         => $post->series_id ? (int) $post->series_id : null,
            'series'            => ContentRepeat::describe($post),
            // Its versions for other platforms (spec 2026-10-19 §3.4), for the panel's Versions section.
            'group'             => ContentVersions::describe($post),
            // Who posts it: a member of the brand's team, or nobody (spec 2026-10-19 §4.1).
            'poster'            => ContentTeam::poster($post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id),
            'hook_alternatives' => array_values((array) data_get($post->source_context, 'hook_alternatives', [])),
            'visual_brief'      => $brief ? [
                'visual_type'  => $brief->visual_type,
                'aspect_ratio' => $brief->aspect_ratio,
                'style'        => $brief->style,
                'description'  => $brief->description,
                'scene'        => $brief->scene,
                'mood'         => $brief->mood,
                'composition'  => $brief->composition,
                'text_overlay' => $brief->text_overlay,
                'avoid'        => $brief->avoid,
                'image_url'    => $brief->image_url,
                'image_status' => $brief->image_status,
                'image_error'  => $brief->image_error,
            ] : null,
        ];
    }

    /** The post as its panel opens it: everything, with its comments and approval steps (spec 2026-10-16 §7.1). @return array<string, mixed> */
    public static function panel(ContentPlannerPost $post, ?User $viewer): array
    {
        return self::detail($post) + ['timeline' => ContentTimeline::for($post, $viewer)];
    }

    /** PostgreSQL answers a time column as HH:MM:SS; the portal works in HH:MM. */
    private static function time(?string $value): ?string
    {
        return $value === null || $value === '' ? null : substr($value, 0, 5);
    }
}
