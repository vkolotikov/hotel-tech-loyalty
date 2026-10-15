<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;

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
        ];
    }

    /** Everything the post panel shows and edits. @return array<string, mixed> */
    public static function detail(ContentPlannerPost $post): array
    {
        $brief = $post->relationLoaded('visualBrief') ? $post->visualBrief : $post->visualBrief()->first();

        return self::card($post) + [
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

    /** PostgreSQL answers a time column as HH:MM:SS; the portal works in HH:MM. */
    private static function time(?string $value): ?string
    {
        return $value === null || $value === '' ? null : substr($value, 0, 5);
    }
}
