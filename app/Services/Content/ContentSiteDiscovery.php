<?php

namespace App\Services\Content;

use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\RobotsRules;
use App\Services\Content\Web\SitemapReader;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\Urls;
use App\Services\Content\Web\WebFetcher;
use App\Services\Content\Web\WebResponse;

/**
 * Finding a site's articles and pages (spec 2026-10-20 §3.2, §3.3): robots.txt, then the sitemaps it names (else the
 * usual addresses), else the home page's feed, its links and its blog page. Answers the candidates to read — pages
 * first (the home page first), then articles newest first — or why there are none.
 */
class ContentSiteDiscovery
{
    public const MAX_SITEMAPS = 12;
    private const DEFAULT_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];

    public function __construct(private WebFetcher $web)
    {
    }

    /** The folder the address names (spec §3.1): `https://ex.com/blog` → `/blog`; none for the bare site. */
    public static function blogPath(string $address): ?string
    {
        $path = rtrim(Urls::path($address), '/');
        // A language folder alone (`/ru/`) names the site's language, not where its blog lives (spec §3.3).
        $language = UrlRules::languagePrefix($address);
        if ($path === '' || ($language !== null && strtolower(trim($path, '/')) === $language)) {
            return null;
        }

        return $path;
    }

    /**
     * @return array{failure: ?string, robots: RobotsRules, home: ?WebResponse, site_host: string, blog_path: ?string,
     *     candidates: list<array{url: string, kind: string, date: ?string}>}
     */
    public function find(string $address): array
    {
        $origin = (string) Urls::origin($address);
        $blogPath = self::blogPath($address);
        $result = ['failure' => null, 'robots' => RobotsRules::allowAll(), 'home' => null, 'site_host' => UrlRules::siteHost($origin), 'blog_path' => $blogPath, 'candidates' => []];

        $why = null;
        $robotsFile = $this->web->get($origin . '/robots.txt', 512 * 1024, [], $why);
        if ($robotsFile === null && $why === 'bad_address') {
            return ['failure' => 'bad_address'] + $result;
        }
        $robots = $robotsFile !== null ? RobotsRules::parse($robotsFile->body, WebFetcher::AGENT) : RobotsRules::allowAll();
        $result['robots'] = $robots;
        if (!$robots->allows('/')) {
            return ['failure' => 'site_blocked'] + $result;
        }

        $home = $this->web->get($origin . '/', WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
        $siteHost = UrlRules::siteHost($home?->url ?? $origin);
        $result['home'] = $home;
        $result['site_host'] = $siteHost;

        $entries = $this->sitemaps($origin, $robots->sitemaps, $siteHost);
        if ($entries === [] && $home !== null) {
            $entries = $this->fromHome($home, $siteHost, $blogPath, $robots);
        }
        if ($entries === [] && $home === null) {
            return ['failure' => 'site_unreachable'] + $result;
        }
        $result['candidates'] = self::classify($entries, $siteHost, $blogPath, $home === null ? null : Urls::normalize($home->url), UrlRules::languagePrefix($address));

        return $result;
    }

    /**
     * @param list<string> $named the sitemaps robots.txt names
     * @return list<array{url: string, date: ?string, hint: ?string}>
     */
    private function sitemaps(string $origin, array $named, string $siteHost): array
    {
        $queue = [];
        foreach ($named as $url) {
            $absolute = Urls::absolute($url, $origin . '/');
            if ($absolute !== null && UrlRules::sameSite($absolute, $siteHost)) {
                $queue[] = [$absolute, UrlRules::sitemapHint($absolute), false];
            }
        }
        if ($queue === []) {
            foreach (self::DEFAULT_SITEMAPS as $path) {
                $queue[] = [$origin . $path, null, true];
            }
        }
        $entries = [];
        $seen = [];
        $files = 0;
        $defaultFound = false;
        while ($queue !== [] && $files < self::MAX_SITEMAPS && count($entries) < SitemapReader::MAX_ENTRIES) {
            [$url, $hint, $isDefault] = array_shift($queue);
            if (isset($seen[$url]) || ($isDefault && $defaultFound)) {
                continue;
            }
            $seen[$url] = true;
            $files++;
            $file = $this->web->get($url, WebFetcher::XML_BYTES);
            $read = $file === null ? ['kind' => 'none', 'entries' => []] : SitemapReader::read($file->body);
            if ($read['kind'] === 'none') {
                continue;
            }
            $defaultFound = $defaultFound || $isDefault;
            foreach ($read['entries'] as $entry) {
                if ($read['kind'] === 'index') {
                    $childHint = UrlRules::sitemapHint($entry['url']);
                    if ($childHint !== 'skip' && UrlRules::sameSite($entry['url'], $siteHost)) {
                        $queue[] = [$entry['url'], $childHint ?? $hint, false];
                    }
                    continue;
                }
                $entries[] = ['url' => $entry['url'], 'date' => $entry['date'], 'hint' => $read['kind'] === 'feed' ? 'article' : $hint];
            }
        }

        return array_slice($entries, 0, SitemapReader::MAX_ENTRIES);
    }

    /** @return list<array{url: string, date: ?string, hint: ?string}> */
    private function fromHome(WebResponse $home, string $siteHost, ?string $blogPath, RobotsRules $robots): array
    {
        $page = PageReader::read($home->body, $home->url, $home->contentType);
        $entries = [];
        foreach (array_slice($page['feeds'], 0, 2) as $feedUrl) {
            if (!UrlRules::sameSite($feedUrl, $siteHost) || !$robots->allows(Urls::pathAndQuery($feedUrl))) {
                continue;
            }
            $feed = $this->web->get($feedUrl, WebFetcher::XML_BYTES);
            $read = $feed === null ? ['kind' => 'none', 'entries' => []] : SitemapReader::read($feed->body);
            if ($read['kind'] === 'feed') {
                foreach ($read['entries'] as $entry) {
                    $entries[] = ['url' => $entry['url'], 'date' => $entry['date'], 'hint' => 'article'];
                }
            }
        }
        foreach ($page['links'] as $link) {
            $entries[] = ['url' => $link, 'date' => null, 'hint' => null];
        }
        $blog = $blogPath !== null ? Urls::origin($home->url) . $blogPath : null;
        if ($blog === null) {
            foreach ($page['links'] as $link) {
                if (UrlRules::sameSite($link, $siteHost) && UrlRules::isBlogIndex($link, null)) {
                    $blog = $link;
                    break;
                }
            }
        }
        if ($blog !== null && $robots->allows(Urls::pathAndQuery($blog))) {
            $index = $this->web->get($blog, WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
            if ($index !== null) {
                $folder = rtrim(Urls::path($index->url), '/');
                foreach (PageReader::read($index->body, $index->url, $index->contentType)['links'] as $link) {
                    if (UrlRules::looksLikeArticle($link, $folder === '' ? null : $folder)) {
                        $entries[] = ['url' => $link, 'date' => null, 'hint' => 'article'];
                    }
                }
            }
        }

        return $entries;
    }

    /**
     * @param list<array{url: string, date: ?string, hint: ?string}> $entries
     * @return list<array{url: string, kind: string, date: ?string}>
     */
    private static function classify(array $entries, string $siteHost, ?string $blogPath, ?string $homeUrl, ?string $language): array
    {
        $entries = self::oneLanguage($entries, $language);
        $articles = [];
        $pages = [];
        $seen = [];
        $hasHome = false;
        foreach ($entries as $entry) {
            $url = Urls::normalize($entry['url']);
            if ($url === null || isset($seen[$url]) || !UrlRules::sameSite($url, $siteHost) || UrlRules::skipped($url)) {
                continue;
            }
            $seen[$url] = true;
            $isHome = Urls::path($url) === '/';
            if ($isHome && $hasHome) {
                continue;
            }
            $hasHome = $hasHome || $isHome;
            if (!$isHome && UrlRules::isBlogIndex($url, $blogPath)) {
                continue;
            }
            if (!$isHome && ($entry['hint'] === 'article' || UrlRules::looksLikeArticle($url, $blogPath))) {
                $articles[] = ['url' => $url, 'kind' => 'article', 'date' => $entry['date']];
            } else {
                $pages[] = ['url' => $url, 'kind' => 'page', 'date' => $entry['date']];
            }
        }
        // The bare site's home page; a scan of one language folder reads that folder's own home from its list.
        if ($homeUrl !== null && !$hasHome && $language === null) {
            $pages[] = ['url' => $homeUrl, 'kind' => 'page', 'date' => null];
        }
        // Newest first; undated last, in the file's order (usort is stable).
        $newest = fn (array $a, array $b) => [$b['date'] !== null, (string) $b['date']] <=> [$a['date'] !== null, (string) $a['date']];
        usort($articles, $newest);
        usort($pages, fn (array $a, array $b) => [UrlRules::pageRank($a['url']), strlen($a['url'])] <=> [UrlRules::pageRank($b['url']), strlen($b['url'])]);
        // The home and key pages first, then the newest articles, then the other addresses newest first in the reads left
        // (spec §3.3): an address the sitemap did not type says what it is once read (the owner's articles sit at the root).
        $key = array_slice(array_values(array_filter($pages, fn (array $page) => UrlRules::pageRank($page['url']) < 20)), 0, ContentSiteScan::MAX_PAGES);
        $other = array_values(array_filter($pages, fn (array $page) => UrlRules::pageRank($page['url']) >= 20));
        usort($other, $newest);
        $articles = array_slice($articles, 0, ContentSiteScan::MAX_ARTICLES);
        $left = max(0, ContentSiteScan::MAX_READS - count($key) - count($articles));

        return array_merge($key, $articles, array_slice($other, 0, $left));
    }

    /**
     * One language (spec §3.3): the addresses in the given address's language folder; for the bare site, those without a
     * language folder — when it has any besides the home page (a site with every language in a folder keeps them all).
     *
     * @param list<array{url: string, date: ?string, hint: ?string}> $entries
     * @return list<array{url: string, date: ?string, hint: ?string}>
     */
    private static function oneLanguage(array $entries, ?string $language): array
    {
        $kept = array_values(array_filter($entries, fn (array $entry) => UrlRules::languagePrefix($entry['url']) === $language));
        if ($language !== null) {
            return $kept === [] ? $entries : $kept;
        }
        $beyondHome = array_filter($kept, fn (array $entry) => Urls::path($entry['url']) !== '/');

        return $beyondHome === [] ? $entries : $kept;
    }
}
