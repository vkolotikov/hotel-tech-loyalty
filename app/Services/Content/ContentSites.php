<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Content\Web\UrlRules;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** A brand's website as the portal reads it (spec 2026-10-20 §3.7, §4.6, §6.2): its state, its pages and their numbers. */
final class ContentSites
{
    /** A scan may wait this long for the worker… */
    public const QUEUED_SECONDS = 1800;
    /** …and run this long once its job started (its timeout is 600 s). */
    public const RUN_SECONDS = 660;
    public const SCANS_PER_DAY = 20;

    /** What `GET site` reads of a page: everything it answers, never its text. */
    private const PAGE_COLUMNS = ['id', 'site_id', 'kind', 'url', 'title', 'description', 'image_url', 'picture_url', 'published_at', 'last_seen_at'];

    public static function of(int $profileId): ?ContentSite
    {
        return ContentSite::where('planner_profile_id', $profileId)->first();
    }

    public static function ensure(ContentPlannerProfile $profile): ContentSite
    {
        return self::of((int) $profile->id) ?? ContentSite::createOrFirst(
            ['planner_profile_id' => $profile->id],
            ['organization_id' => $profile->organization_id, 'brand_id' => $profile->brand_id],
        );
    }

    /** Is its scan still running: queued for at most QUEUED_SECONDS, or started at most RUN_SECONDS ago. */
    public static function scanning(ContentSite $site): bool
    {
        if ($site->status !== 'scanning') {
            return false;
        }
        if ($site->scan_started_at !== null) {
            return $site->scan_started_at->copy()->addSeconds(self::RUN_SECONDS)->isFuture();
        }

        return $site->scan_queued_at !== null && $site->scan_queued_at->copy()->addSeconds(self::QUEUED_SECONDS)->isFuture();
    }

    /** `GET site`: the site, the suggested address, its pages (articles newest first, then pages by rank). */
    public static function payload(?ContentSite $site): array
    {
        $suggested = Organization::find(ContentContext::orgId())?->website;
        if ($site === null) {
            return ['site' => null, 'suggested_url' => $suggested ?: null, 'pages' => []];
        }
        // Without `body`: the portal reads this every 4 s during a scan, and a page's text runs to 20,000 characters (final review).
        $pages = ContentSitePage::where('site_id', $site->id)->get(self::PAGE_COLUMNS)->sort(function (ContentSitePage $a, ContentSitePage $b) {
            if ($a->kind !== $b->kind) {
                return $a->kind === 'article' ? -1 : 1;
            }
            if ($a->kind === 'article') {
                return [$b->published_at?->getTimestamp() ?? PHP_INT_MIN, $a->id] <=> [$a->published_at?->getTimestamp() ?? PHP_INT_MIN, $b->id];
            }

            return [UrlRules::pageRank($a->url), strlen($a->url), $a->id] <=> [UrlRules::pageRank($b->url), strlen($b->url), $b->id];
        })->values();
        $stats = self::stats($pages->pluck('id')->map(fn ($id) => (int) $id)->all());

        return [
            'site'          => self::facts($site),
            'suggested_url' => $suggested ?: null,
            'pages'         => $pages->map(fn (ContentSitePage $page) => self::page($page, $stats[(int) $page->id] ?? null, $site))->all(),
        ];
    }

    /** The site as the portal shows it; a scan that lost its job reads as failed. */
    public static function facts(ContentSite $site): array
    {
        $lost = $site->status === 'scanning' && !self::scanning($site);

        return [
            'url'                => $site->url,
            'status'             => $lost ? 'failed' : (string) $site->status,
            'error'              => $lost ? 'scan_failed' : $site->error,
            'scanned_at'         => $site->scanned_at?->toISOString(),
            'articles_count'     => (int) $site->articles_count,
            'pages_count'        => (int) $site->pages_count,
            'summary'            => $site->summary,
            'summary_updated_at' => $site->summary_updated_at?->toISOString(),
            'summary_edited'     => (bool) $site->summary_edited,
            'summary_note'       => $site->summary_note,
        ];
    }

    /** @param array{posts: int, published: int, clicks: int, last_promoted_at: ?string}|null $stats */
    public static function page(ContentSitePage $page, ?array $stats, ContentSite $site): array
    {
        return [
            'id'               => (int) $page->id,
            'kind'             => (string) $page->kind,
            'url'              => (string) $page->url,
            'title'            => (string) $page->title,
            'description'      => $page->description,
            'image_url'        => $page->picture_url ?? $page->image_url,
            'published_at'     => $page->published_at?->toISOString(),
            'seen'             => $site->scanned_at === null || ($page->last_seen_at !== null && $page->last_seen_at->gte($site->scanned_at)),
            'posts'            => $stats['posts'] ?? 0,
            'published'        => $stats['published'] ?? 0,
            'clicks'           => $stats['clicks'] ?? 0,
            'last_promoted_at' => $stats['last_promoted_at'] ?? null,
        ];
    }

    /**
     * Each page's promotion posts (not archived), how many are published, their links' clicks, the newest one's date.
     *
     * @param list<int> $ids
     * @return array<int, array{posts: int, published: int, clicks: int, last_promoted_at: ?string}>
     */
    public static function stats(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $out = [];
        $blank = ['posts' => 0, 'published' => 0, 'clicks' => 0, 'last_promoted_at' => null];
        $rows = DB::table('content_planner_posts')->whereIn('site_page_id', $ids)->where('status', '!=', 'archived')
            ->groupBy('site_page_id')
            ->selectRaw("site_page_id, count(*) as posts, sum(case when status = 'published' then 1 else 0 end) as published, max(created_at) as last_at")
            ->get();
        foreach ($rows as $row) {
            $out[(int) $row->site_page_id] = [
                'posts'            => (int) $row->posts,
                'published'        => (int) $row->published,
                'clicks'           => 0,
                'last_promoted_at' => $row->last_at ? CarbonImmutable::parse($row->last_at)->toISOString() : null,
            ];
        }
        $clicks = DB::table('content_link_clicks')
            ->join('content_links', 'content_links.id', '=', 'content_link_clicks.link_id')
            ->join('content_planner_posts', 'content_planner_posts.id', '=', 'content_links.post_id')
            ->whereIn('content_planner_posts.site_page_id', $ids)
            ->groupBy('content_planner_posts.site_page_id')
            ->selectRaw('content_planner_posts.site_page_id as page_id, sum(content_link_clicks.clicks) as clicks')
            ->get();
        foreach ($clicks as $row) {
            $out[(int) $row->page_id] ??= $blank;
            $out[(int) $row->page_id]['clicks'] = (int) $row->clicks;
        }

        return $out;
    }
}
