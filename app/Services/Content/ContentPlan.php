<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use Illuminate\Database\Eloquent\Builder;

/** Reading a brand's posts for the Plan, the Posts list and Find (spec 2026-10-14 §4.2, §4.4, §4.7). */
final class ContentPlan
{
    /**
     * Posts whose title, topic, hook or copy hold the words, in any case:
     * LIKE is case-sensitive on PostgreSQL, so both sides are lower-cased.
     * The words are taken literally: %, _ and the escape character are
     * escaped. The escape character is "!", not a backslash: PDO before
     * PHP 8.4 reads \' as an escaped quote and loses its placeholders on
     * PostgreSQL (as app/Mcp/Support/CustomerBookingAccess.php does).
     */
    public static function search(Builder $query, string $words): Builder
    {
        $needle = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower(trim($words))) . '%';

        return $query->where(function (Builder $q) use ($needle) {
            foreach (['title', 'topic', 'hook', 'main_copy'] as $column) {
                $q->orWhereRaw("LOWER(COALESCE({$column}, '')) LIKE ? ESCAPE '!'", [$needle]);
            }
        });
    }

    /** @return list<array{date: string, platform: string}> */
    public static function openSlots(ContentPlannerProfile $profile, string $from, string $to, string $today): array
    {
        $channels = $profile->channels()->where('active', true)->get(['platform', 'frequency'])
            ->map(fn ($c) => ['platform' => (string) $c->platform, 'frequency' => (array) ($c->frequency ?? [])])
            ->all();
        $taken = [];
        foreach (self::datedPosts($profile, max($from, $today), $to)->get(['scheduled_date', 'platform']) as $post) {
            $taken[$post->scheduled_date->format('Y-m-d') . '|' . $post->platform] = true;
        }

        return ContentSlots::open($channels, $taken, $from, $to, $today);
    }

    /**
     * The Plan for a range (spec 2026-10-14 §4.2): its cards (archived ones
     * left out), the posts without a day, its open slots, and the figures of
     * the This week strip — planned (not skipped or archived), ready,
     * published, open slots.
     *
     * @return array{posts: list<array>, unscheduled: list<array>, unscheduled_total: int, slots: list<array>, figures: array{planned: int, ready: int, published: int, open_slots: int}}
     */
    public static function for(ContentPlannerProfile $profile, string $from, string $to, string $today): array
    {
        $posts = self::datedPosts($profile, $from, $to)->with('visualBrief')
            ->orderBy('scheduled_date')
            ->orderByRaw('CASE WHEN scheduled_time IS NULL THEN 0 ELSE 1 END')
            ->orderBy('scheduled_time')->orderBy('id')
            ->get();
        $unscheduled = ContentPlannerPost::with('visualBrief')
            ->where('planner_profile_id', $profile->id)
            ->whereNull('scheduled_date')->where('status', '!=', 'archived')
            ->orderByDesc('id')->limit(100)->get();
        // The tray lists the newest 100; the portal says when there are more (the same filter as Posts' Unscheduled).
        $unscheduledTotal = ContentPlannerPost::where('planner_profile_id', $profile->id)
            ->whereNull('scheduled_date')->where('status', '!=', 'archived')->count();
        $slots = self::openSlots($profile, $from, $to, $today);

        return [
            'posts'       => $posts->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()->all(),
            'unscheduled' => $unscheduled->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p))->values()->all(),
            'unscheduled_total' => $unscheduledTotal,
            'slots'       => $slots,
            'figures'     => [
                'planned'    => $posts->whereNotIn('status', ['skipped'])->count(),
                'ready'      => $posts->where('status', 'ready_to_publish')->count(),
                'published'  => $posts->where('status', 'published')->count(),
                'open_slots' => count($slots),
            ],
        ];
    }

    /** A brand's dated posts in a range, archived ones left out (whereDate: sqlite keeps the date as Y-m-d H:i:s). */
    private static function datedPosts(ContentPlannerProfile $profile, string $from, string $to): Builder
    {
        return ContentPlannerPost::query()
            ->where('planner_profile_id', $profile->id)
            ->whereNotNull('scheduled_date')
            ->whereDate('scheduled_date', '>=', $from)
            ->whereDate('scheduled_date', '<=', $to)
            ->where('status', '!=', 'archived');
    }
}
