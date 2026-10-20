<?php

namespace App\Services\Content;

use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Repeat posts (spec 2026-10-15 §8): copies of a post on the matching future dates, linked by `series_id` (the
 * original's id). Each copy is an ordinary post afterwards: editing one changes only it.
 */
final class ContentRepeat
{
    public const EVERY = ['week', '2weeks', 'month'];
    public const MAX_COPIES = 26;
    public const MAX_MONTHS = 12;
    public const MAX_AI_COPIES = 12;

    /** What a copy takes from its original — who posts it too: the same post on another day (spec 2026-10-19 §4.1). */
    public const COPIED = [
        'platform', 'scheduled_time', 'main_copy', 'short_copy', 'hashtags', 'cta', 'pillar_id', 'audience_id', 'campaign_id',
        'strategy_id', 'language', 'topic', 'title', 'hook', 'goal', 'format', 'weekday_role', 'funnel_stage', 'post_type', 'strategic_reason',
        'poster_id',
    ];

    /**
     * The copies' days after `$from`, up to `$until` included, from `$today` on: the same weekday every week or every
     * two weeks, or the same day of the month (the month's last day when it is shorter).
     *
     * @return list<string>
     */
    public static function dates(string $from, string $every, string $until, string $today): array
    {
        $start = CarbonImmutable::parse($from);
        $dates = [];
        for ($k = 1; $k <= 400; $k++) {
            if ($every === 'month') {
                $month = $start->startOfMonth()->addMonthsNoOverflow($k);
                $date = $month->setDate($month->year, $month->month, min($start->day, $month->daysInMonth));
            } else {
                $date = $start->addWeeks($every === '2weeks' ? 2 * $k : $k);
            }
            $day = $date->toDateString();
            if ($day > $until) {
                break;
            }
            if ($day >= $today) {
                $dates[] = $day;
            }
        }

        return $dates;
    }

    /**
     * The copies, made in one transaction; the original joins its own series. A published or archived original gives
     * draft copies; any other keeps its status — unless `$status` is given (copies the AI rewords while approvals are
     * on wait for approval: spec 2026-10-16 §6.2).
     *
     * @param list<string> $dates
     * @return Collection<int, ContentPlannerPost>
     */
    public static function copy(ContentPlannerPost $original, array $dates, ?int $userId, ?string $status = null): Collection
    {
        $status ??= in_array($original->status, ['published', 'archived'], true) ? 'draft' : (string) $original->status;

        return DB::transaction(function () use ($original, $dates, $status, $userId) {
            // Joining a series is not an edit (as joining a group of versions is not): the post's version stays.
            ContentPlannerPost::whereKey($original->id)->toBase()->update(['series_id' => $original->id]);
            $original->series_id = $original->id;
            $original->syncOriginalAttribute('series_id');

            $copies = collect($dates)->map(fn (string $date) => ContentPlannerPost::create($original->only(self::COPIED) + [
                'planner_profile_id' => $original->planner_profile_id,
                'brand_id'           => $original->brand_id,
                'scheduled_date'     => $date,
                'status'             => $status,
                'series_id'          => $original->id,
                'generated_by'       => 'repeat',
                'created_by'         => $userId,
            ]));
            // Each copy gets its own short link to the same address (spec 2026-10-19 §5.1).
            ContentLinks::copyTo($original, $copies);

            return $copies;
        });
    }

    /** Stop a series: its future unpublished copies go; what stays (the original, published copies) is no longer a series. */
    public static function stop(int $seriesId, string $today): int
    {
        return DB::transaction(function () use ($seriesId, $today) {
            $removed = self::removable($seriesId, $today)->delete();
            // Leaving a series is not an edit, as joining one is not: the posts' versions stay (final review).
            ContentPlannerPost::where('series_id', $seriesId)->toBase()->update(['series_id' => null]);

            return $removed;
        });
    }

    /** What Stop repeating removes: the series' unpublished copies from today on (never the original). */
    private static function removable(int $seriesId, string $today): Builder
    {
        return ContentPlannerPost::where('series_id', $seriesId)->where('id', '!=', $seriesId)
            ->where('status', '!=', 'published')->whereDate('scheduled_date', '>=', $today);
    }

    /**
     * What the panel says about a post's series: how often (from the smallest gap between its days, so a copy removed
     * by hand or an original long before today does not change the answer), until when, how many unpublished copies
     * are still ahead after this post (from the venue's today on), how many Stop repeating would remove (its own rule),
     * and whether the AI is still rewording it.
     *
     * @return array{id: int, every: string, until: ?string, more: int, removable: int, rewriting: bool}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        if (!$post->series_id) {
            return null;
        }
        $days = ContentPlannerPost::where('series_id', $post->series_id)->whereNotNull('scheduled_date')
            ->orderBy('scheduled_date')->pluck('scheduled_date')
            ->map(fn ($day) => CarbonImmutable::parse($day)->toDateString())->unique()->values();
        $gaps = [];
        for ($i = 1; $i < $days->count(); $i++) {
            $gaps[] = (int) round(CarbonImmutable::parse($days[$i - 1])->diffInDays(CarbonImmutable::parse($days[$i])));
        }
        $gap = $gaps === [] ? 7 : min($gaps);
        $mine = $post->scheduled_date?->format('Y-m-d');
        $today = VenueClock::today((int) $post->organization_id);

        return [
            'id'        => (int) $post->series_id,
            'every'     => $gap <= 7 ? 'week' : ($gap <= 14 ? '2weeks' : 'month'),
            'until'     => $days->last(),
            'more'      => ContentPlannerPost::where('series_id', $post->series_id)->where('status', '!=', 'published')
                ->whereDate('scheduled_date', '>=', $today)
                ->when($mine, fn ($q) => $q->whereDate('scheduled_date', '>', $mine))->count(),
            'removable' => self::removable((int) $post->series_id, $today)->count(),
            'rewriting' => Cache::has(self::rewritingKey((int) $post->series_id)),
        ];
    }

    /** Set while the AI rewords a series (Task 15). */
    public static function rewritingKey(int $seriesId): string
    {
        return "content:repeat-rewrite:{$seriesId}";
    }
}
