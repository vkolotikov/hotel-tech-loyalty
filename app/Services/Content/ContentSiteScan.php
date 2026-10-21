<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\Urls;
use App\Services\Content\Web\WebFetcher;
use App\Services\ContentKnowledgeService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * One scan (spec 2026-10-20 §3.2–§3.6): finds the candidates, reads them one at a time for up to READ_SECONDS (pages
 * before articles), replaces the site's list, writes the company summary when asked, and records the outcome — only
 * while `$token` is still the site's scan, so a late job never writes over a newer one.
 */
class ContentSiteScan
{
    public const MAX_ARTICLES = 100;
    public const MAX_PAGES = 30;
    /** Addresses read in one scan, at most (spec §3.3): key pages, then articles, then the others. */
    public const MAX_READS = 130;
    public const READ_SECONDS = 420;
    public const SUMMARY_CHARS = 12000;
    public const SUMMARY_MAX = 6000;

    /** Seconds, for tests; the wall clock otherwise. */
    public ?\Closure $clock = null;

    public function __construct(
        private ContentSiteDiscovery $discovery,
        private WebFetcher $web,
        private ContentSiteSummarizer $summarizer,
        private ContentAiGate $gate,
    ) {
    }

    public function run(ContentSite $site, string $token, bool $updateSummary): void
    {
        $started = $this->now();
        $found = $this->discovery->find((string) $site->url);
        if ($found['failure'] !== null) {
            self::write($site, $token, ['status' => 'failed', 'error' => $found['failure']]);

            return;
        }
        $home = $found['home'];
        $homeUrl = $home === null ? null : Urls::normalize($home->url);
        $rows = [];
        foreach ($found['candidates'] as $candidate) {
            if ($this->now() - $started > self::READ_SECONDS) {
                break;
            }
            if (!$found['robots']->allows(Urls::pathAndQuery($candidate['url']))) {
                continue;
            }
            $response = $home !== null && $candidate['url'] === $homeUrl
                ? $home
                : $this->web->get($candidate['url'], WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
            // A page that ended on another site (a redirect to a booking provider), or where robots.txt says no, is not
            // the site's: its words never reach the list or the company summary (final review).
            if ($response === null || !UrlRules::sameSite($response->url, $found['site_host'])
                || !$found['robots']->allows(Urls::pathAndQuery($response->url))) {
                continue;
            }
            $rows[] = self::row($candidate, PageReader::read($response->body, $response->url, $response->contentType));
        }
        if ($rows === []) {
            self::write($site, $token, ['status' => 'failed', 'error' => 'nothing_found']);

            return;
        }
        if (!self::current($site, $token)) {
            return;
        }
        $now = CarbonImmutable::now()->startOfSecond();
        $counts = DB::transaction(fn () => self::save($site, $rows, $now));
        // The new list is the site's from here: its day and numbers are written now, so a scan stopped during the summary
        // call keeps them (ScanContentWebsite::fail reads it as ready), and the note says why the summary did not change
        // until the summary has its answer (final review, 6-1).
        self::write($site, $token, [
            'scanned_at' => $now, 'articles_count' => $counts['articles'], 'pages_count' => $counts['pages'],
            'summary_note' => $updateSummary ? 'ai_failed' : null,
        ]);
        [$summary, $note] = $updateSummary ? $this->summary($site, $rows) : [[], null];
        self::write($site, $token, [
            'status' => 'ready', 'error' => null, 'scanned_at' => $now,
            'articles_count' => $counts['articles'], 'pages_count' => $counts['pages'], 'summary_note' => $note,
        ] + $summary);
    }

    private function now(): float
    {
        return $this->clock !== null ? (float) ($this->clock)() : microtime(true);
    }

    /**
     * @param array{url: string, kind: string, date: ?string} $candidate
     * @param array<string, mixed> $read
     * @return array<string, mixed>
     */
    private static function row(array $candidate, array $read): array
    {
        $isHome = Urls::path($candidate['url']) === '/';

        return [
            'url'          => $candidate['url'],
            'kind'         => !$isHome && ($candidate['kind'] === 'article' || $read['article']) ? 'article' : 'page',
            'title'        => $read['title'] ?? UrlRules::lastPart($candidate['url']),
            'description'  => $read['description'],
            'image_url'    => $read['image'],
            'published_at' => $read['published_at'] ?? $candidate['date'],
            'language'     => $read['language'],
            'body'         => $read['text'] === '' ? null : $read['text'],
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array{articles: int, pages: int}
     */
    private static function save(ContentSite $site, array $rows, CarbonImmutable $now): array
    {
        $kept = [];
        foreach ($rows as $row) {
            $page = ContentSitePage::withoutGlobalScopes()->firstOrNew(['site_id' => $site->id, 'url_hash' => hash('sha256', $row['url'])]);
            $page->fill($row + ['organization_id' => $site->organization_id, 'brand_id' => $site->brand_id, 'last_seen_at' => $now])->save();
            $kept[] = (int) $page->id;
        }
        // Not found again: removed, unless posts promote them (spec §3.4).
        ContentSitePage::withoutGlobalScopes()->where('site_id', $site->id)->whereNotIn('id', $kept)
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('content_planner_posts')
                ->whereColumn('content_planner_posts.site_page_id', 'content_site_pages.id'))
            ->delete();
        $articles = count(array_filter($rows, fn (array $row) => $row['kind'] === 'article'));

        return ['articles' => $articles, 'pages' => count($rows) - $articles];
    }

    /**
     * The new summary fields (and the empty brand fields filled), or why there are none (spec §3.6).
     *
     * @param list<array<string, mixed>> $rows
     * @return array{0: array<string, mixed>, 1: ?string}
     */
    private function summary(ContentSite $site, array $rows): array
    {
        $pages = [];
        $left = self::SUMMARY_CHARS;
        foreach ($rows as $row) {
            if ($row['kind'] !== 'page' || $row['body'] === null || $left <= 0) {
                continue;
            }
            $text = mb_substr((string) $row['body'], 0, $left);
            $pages[] = ['url' => (string) $row['url'], 'title' => (string) $row['title'], 'text' => $text];
            $left -= mb_strlen($text);
        }
        if ($pages === []) {
            return [[], null];
        }
        try {
            $this->gate->allow(Organization::findOrFail($site->organization_id));
        } catch (ContentRefused) {
            return [[], 'ai_budget_used_up'];
        }
        $profile = ContentPlannerProfile::withoutGlobalScopes()->findOrFail($site->planner_profile_id);
        try {
            $answer = $this->summarizer->summarize($profile, $pages);
        } catch (\Throwable $e) {
            report($e);

            return [[], 'ai_failed'];
        }
        $fill = [];
        foreach (['brand_summary', 'usp', 'mission'] as $field) {
            if (trim((string) $profile->{$field}) === '' && ($answer[$field] ?? null) !== null) {
                $fill[$field] = $answer[$field];
            }
        }
        if ($fill !== []) {
            $profile->update($fill);
            app(ContentKnowledgeService::class)->readinessFor($profile);
        }

        return [['summary' => mb_substr($answer['summary'], 0, self::SUMMARY_MAX), 'summary_updated_at' => now(), 'summary_edited' => false], null];
    }

    private static function current(ContentSite $site, string $token): bool
    {
        return ContentSite::withoutGlobalScopes()->whereKey($site->id)->value('scan_token') === $token;
    }

    /**
     * Fields on the site, only while this scan is its scan and still running.
     *
     * @param array<string, mixed> $fields
     */
    private static function write(ContentSite $site, string $token, array $fields): void
    {
        ContentSite::withoutGlobalScopes()->whereKey($site->id)->where('scan_token', $token)->where('status', 'scanning')->update($fields);
    }
}
