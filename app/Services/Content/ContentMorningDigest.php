<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\MeController;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * The morning email's words (spec 2026-10-19 §4.5): for each brand the person can use, today's posts the reminders
 * give them, each with a link that opens it in Content on its brand, and a line counting the ones not marked as
 * posted. Null when there is nothing to say. Every word is asked for in the person's language explicitly, so nothing
 * depends on the worker's own locale. The organisation is bound by the caller.
 */
final class ContentMorningDigest
{
    public const MAX_POSTS = 50;

    /** @return array<string, mixed>|null */
    public static function build(User $user, int $orgId, CarbonImmutable $venueNow): ?array
    {
        $locale = in_array($user->language, MeController::SUPPORTED_LANGUAGES, true) ? (string) $user->language : 'en';
        $t = fn (string $key, array $replace = []) => __("content_morning.{$key}", $replace, $locale);
        $base = rtrim((string) config('app.url'), '/');
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brands = [];
        try {
            foreach (ContentContext::brandsFor($user) as $brand) {
                // Profiles and posts are brand-scoped: read each brand under its own binding.
                app()->instance('current_brand_id', (int) $brand->id);
                $profile = ContentPlannerProfile::where('brand_id', $brand->id)->first();
                if (!$profile) {
                    continue;
                }
                $audience = ContentReminders::audience($user, $profile);
                $posts = ContentReminders::today($user, $profile, $venueNow, true, $audience)
                    ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 0 ELSE 1 END')->orderBy('scheduled_time')->orderBy('id')
                    ->limit(self::MAX_POSTS)->get();
                $missed = ContentReminders::missed($user, $profile, $venueNow, $audience)->count();
                if ($posts->isEmpty() && $missed === 0) {
                    continue;
                }
                $brands[] = [
                    'name'   => (string) $brand->name,
                    'posts'  => $posts->map(fn (ContentPlannerPost $post) => [
                        'time'     => $post->scheduled_time ? substr((string) $post->scheduled_time, 0, 5) : $t('any_time'),
                        'platform' => $t("platform.{$post->platform}"),
                        'title'    => (string) ($post->title ?: ($post->hook ?: ($post->topic ?: $t('untitled')))),
                        'status'   => $t("status.{$post->status}"),
                        'url'      => "{$base}/content/posts/{$post->id}?brand_id={$brand->id}",
                    ])->values()->all(),
                    'missed' => $missed > 0 ? $t('missed', ['count' => $missed]) : null,
                ];
            }
        } finally {
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
        if ($brands === []) {
            return null;
        }
        $date = $venueNow->locale($locale)->isoFormat($t('date_format'));

        return [
            'locale'   => $locale,
            'subject'  => $t('subject', ['date' => $date]),
            'eyebrow'  => $t('eyebrow'),
            'heading'  => $date,
            'greeting' => $t('greeting', ['name' => (string) $user->name]),
            'intro'    => $t('intro'),
            'brands'   => $brands,
            'open'     => $t('open'),
            'openUrl'  => "{$base}/content",
            'footer'   => $t('footer'),
        ];
    }
}
