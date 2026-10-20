<?php

namespace App\Services\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Promotions (spec 2026-10-20 §4): a press checked and planned, a batch's state as the portal reads it (a row whose job
 * died reads failed), stopping a batch, and the page a post promotes.
 */
final class ContentPromotions
{
    public const MAX_PAGES = 20;
    public const MAX_PER_PAGE = 15;
    public const MAX_POSTS = 200;
    public const MAX_DAYS = 183;
    public const MAX_PER_WEEK = 21;
    /** A page's job may run this long (its timeout is 600 s)… */
    public const RUN_SECONDS = 660;
    /** …and a batch may go this long without any progress before its queued pages read failed. */
    public const IDLE_SECONDS = 1800;
    /** A finished batch is shown this long. */
    public const RESULT_SECONDS = 3600;
    /** What "Remove draft posts" removes (spec §D12). */
    public const DRAFTS = ['idea', 'draft', 'needs_review', 'needs_visual'];
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /** Every channel but the blog (spec §D9). @return list<string> */
    public static function platforms(): array
    {
        return array_values(array_diff(ContentRules::PLATFORMS, ['blog']));
    }

    /**
     * The press checked (spec §4.5) and planned (§4.3); `plan.fit` below `plan.wanted` is the caller's to refuse.
     *
     * @return array{pages: list<ContentSitePage>, per_page: int, from: string, to: string, plan: array, use_picture: bool, instructions: ?string}
     */
    public static function prepare(Request $request, ContentPlannerProfile $profile, ContentSite $site): array
    {
        $data = $request->validate([
            'page_ids'       => 'required|array|min:1|max:' . self::MAX_PAGES,
            'page_ids.*'     => 'integer|distinct',
            'posts_per_page' => 'required|integer|min:1|max:' . self::MAX_PER_PAGE,
            'platforms'      => 'required|array|min:1',
            'platforms.*'    => ['string', 'distinct', Rule::in(self::platforms())],
            'from'           => 'required|date_format:Y-m-d',
            'to'             => 'required|date_format:Y-m-d|after_or_equal:from',
            'per_week'       => 'required|integer|min:1|max:' . self::MAX_PER_WEEK,
            'use_picture'    => 'sometimes|boolean',
            'instructions'   => 'nullable|string|max:2000',
        ]);
        $ids = array_map('intval', $data['page_ids']);
        $perPage = (int) $data['posts_per_page'];
        if (count($ids) * $perPage > self::MAX_POSTS) {
            throw new ContentRefused('too_many_posts', 'One promotion writes at most ' . self::MAX_POSTS . ' posts.', 422);
        }
        $from = max($data['from'], VenueClock::today((int) $profile->organization_id));
        if ($from > $data['to']) {
            throw new ContentRefused('range_in_past', 'These days are already over — choose days from today on.', 422);
        }
        if (ContentRules::days($from, $data['to']) > self::MAX_DAYS) {
            throw ValidationException::withMessages(['to' => 'The period can be at most ' . self::MAX_DAYS . ' days.']);
        }
        $found = ContentSitePage::where('site_id', $site->id)->whereIn('id', $ids)->get()->keyBy('id');
        if ($found->count() !== count($ids)) {
            throw new ContentRefused('page_not_found', 'One of these pages is no longer in the list. Reload the page.', 404);
        }
        $channels = self::channels($profile, $data['platforms']);
        if ($channels === []) {
            throw new ContentRefused('no_channels', 'None of these channels is active for this brand.', 422);
        }

        return [
            'pages'        => array_map(fn (int $id) => $found[$id], $ids),
            'per_page'     => $perPage,
            'from'         => $from,
            'to'           => $data['to'],
            'plan'         => PromotionSchedule::plan($ids, $perPage, $channels, $from, $data['to'], (int) $data['per_week'], self::taken($profile, $from, $data['to'])),
            'use_picture'  => $request->boolean('use_picture', true),
            'instructions' => isset($data['instructions']) && trim((string) $data['instructions']) !== '' ? trim((string) $data['instructions']) : null,
        ];
    }

    /**
     * The ticked channels that are active, in the ticked order, with their posting days and usual time.
     *
     * @param list<string> $platforms
     * @return list<array{platform: string, days: list<string>, time: ?string}>
     */
    private static function channels(ContentPlannerProfile $profile, array $platforms): array
    {
        $industry = Organization::find($profile->organization_id)?->resolved_industry;
        $active = ContentPlannerChannel::where('planner_profile_id', $profile->id)->where('active', true)
            ->whereIn('platform', $platforms)->orderBy('id')->get()->groupBy('platform');
        $out = [];
        foreach (array_values(array_unique($platforms)) as $platform) {
            $channel = $active->get($platform)?->first();
            if ($channel === null) {
                continue;
            }
            $days = [];
            foreach ((array) ($channel->frequency ?? []) as $day => $on) {
                $key = substr(strtolower((string) $day), 0, 3);
                if ($on && in_array($key, self::WEEKDAYS, true) && !in_array($key, $days, true)) {
                    $days[] = $key;
                }
            }
            $out[] = ['platform' => $platform, 'days' => $days, 'time' => BestTimes::usual($channel->post_time, $platform, $industry)];
        }

        return $out;
    }

    /** @return array<string, true> "Y-m-d|platform" of the brand's other posts in the period */
    private static function taken(ContentPlannerProfile $profile, string $from, string $to): array
    {
        $taken = [];
        ContentPlannerPost::where('planner_profile_id', $profile->id)->whereBetween('scheduled_date', [$from, $to])
            ->where('status', '!=', 'archived')->get(['scheduled_date', 'platform'])
            ->each(function (ContentPlannerPost $post) use (&$taken) {
                if ($post->scheduled_date !== null) {
                    $taken[$post->scheduled_date->format('Y-m-d') . '|' . $post->platform] = true;
                }
            });

        return $taken;
    }

    /** `GET promotions/current` (spec §4.5). */
    public static function describe(int $profileId): array
    {
        $batch = ContentPromotion::where('planner_profile_id', $profileId)->orderByDesc('id')->value('batch');
        if ($batch === null) {
            return ['status' => 'idle'];
        }
        $rows = ContentPromotion::with('page:id,title')->where('batch', $batch)->orderBy('id')->get();
        $last = $rows->map(fn (ContentPromotion $row) => $row->finished_at ?? $row->started_at ?? $row->created_at)->max();
        $running = false;
        $pages = [];
        foreach ($rows as $row) {
            [$status, $error] = self::statusOf($row, $last);
            $running = $running || in_array($status, ['queued', 'writing'], true);
            $pages[] = [
                'page_id'      => $row->site_page_id === null ? null : (int) $row->site_page_id,
                'title'        => $row->page?->title,
                'status'       => $status,
                'posts_wanted' => (int) $row->posts_wanted,
                'posts_made'   => (int) $row->posts_made,
                'error'        => $error,
            ];
        }
        $finished = $running ? null : ($rows->max('finished_at') ?? $last);
        if ($finished !== null && CarbonImmutable::parse($finished)->addSeconds(self::RESULT_SECONDS)->isPast()) {
            return ['status' => 'idle'];
        }

        return [
            'status'        => $running ? 'running' : 'finished',
            'batch'         => $batch,
            'pages'         => $pages,
            'created_count' => (int) $rows->sum('posts_made'),
            'wanted_count'  => (int) $rows->sum('posts_wanted'),
            'finished_at'   => $finished === null ? null : CarbonImmutable::parse($finished)->toISOString(),
        ];
    }

    public static function running(int $profileId): bool
    {
        return self::describe($profileId)['status'] === 'running';
    }

    /** Before a new batch: rows of earlier batches still queued or writing have lost their jobs (the batch is not running). */
    public static function markStale(int $profileId): void
    {
        ContentPromotion::where('planner_profile_id', $profileId)->whereIn('status', ['queued', 'writing'])
            ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
    }

    /** Stop: the latest batch's queued pages are not written; the page being written finishes. */
    public static function stop(int $profileId): void
    {
        $batch = ContentPromotion::where('planner_profile_id', $profileId)->orderByDesc('id')->value('batch');
        if ($batch !== null) {
            ContentPromotion::where('batch', $batch)->where('status', 'queued')->update(['status' => 'stopped', 'finished_at' => now()]);
        }
    }

    /** The page a post promotes, for the panel (spec §4.7); null for any other post. @return array{id: int, title: string, url: string}|null */
    public static function promotes(ContentPlannerPost $post): ?array
    {
        if (!$post->site_page_id) {
            return null;
        }
        $page = ContentSitePage::withoutGlobalScopes()->whereKey($post->site_page_id)->first(['id', 'title', 'url']);

        return $page === null ? null : ['id' => (int) $page->id, 'title' => (string) $page->title, 'url' => (string) $page->url];
    }

    /** @return array{0: string, 1: ?string} */
    private static function statusOf(ContentPromotion $row, mixed $last): array
    {
        // Alive while its deadline is still ahead, as a scan (ContentSites::scanning): at the deadline itself it is lost.
        if ($row->status === 'writing' && $row->started_at !== null && !$row->started_at->copy()->addSeconds(self::RUN_SECONDS)->isFuture()) {
            return ['failed', 'promotion_failed'];
        }
        if ($row->status === 'queued' && $last !== null && !CarbonImmutable::parse($last)->addSeconds(self::IDLE_SECONDS)->isFuture()) {
            return ['failed', 'promotion_failed'];
        }

        return [(string) $row->status, $row->error];
    }
}
