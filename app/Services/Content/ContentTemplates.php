<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerTemplate;

/** A brand's templates as the portal reads them (spec 2026-10-16 §5), in the order they were made. */
final class ContentTemplates
{
    /** @return list<array<string, mixed>> */
    public static function list(ContentPlannerProfile $profile): array
    {
        return $profile->templates()->orderBy('id')->get()
            ->map(fn (ContentPlannerTemplate $template) => self::one($template))->values()->all();
    }

    /** @return array{id: int, name: string, platform: ?string, pillar_name: ?string, topic: ?string, hook: ?string, main_copy: ?string, cta: ?string, hashtags: list<string>} */
    public static function one(ContentPlannerTemplate $template): array
    {
        return [
            'id'          => (int) $template->id,
            'name'        => (string) $template->name,
            'platform'    => $template->platform,
            'pillar_name' => $template->pillar_name,
            'topic'       => $template->topic,
            'hook'        => $template->hook,
            'main_copy'   => $template->main_copy,
            'cta'         => $template->cta,
            'hashtags'    => array_values(array_map('strval', (array) ($template->hashtags ?? []))),
        ];
    }

    /** One of this brand's templates; another brand's does not exist here. */
    public static function find(ContentPlannerProfile $profile, int $id): ContentPlannerTemplate
    {
        return $profile->templates()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This template no longer exists.', 404);
    }
}
