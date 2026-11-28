<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/** The publication metadata rule shared by create, save and Mark published. */
final class ContentPublication
{
    public static function prepare(ContentPlannerPost $post): void
    {
        if ($post->status === 'published') {
            if (!$post->published_at) $post->published_at = now();
        } elseif ($post->isDirty('status') && $post->getRawOriginal('status') === 'published') {
            $post->published_at = null;
            $post->published_url = null;
        }
    }

    /** Legacy rows: the saved planning day/time in the venue zone, otherwise the last saved instant. */
    public static function legacyInstant(object $post): ?string
    {
        if ($post->scheduled_date) {
            return CarbonImmutable::parse(substr((string) $post->scheduled_date, 0, 10) . ' ' . ($post->scheduled_time ?: '00:00:00'),
                VenueClock::zone((int) $post->organization_id))->utc()->format('Y-m-d H:i:s.u');
        }

        return $post->updated_at ?: $post->created_at;
    }
}
