<?php

namespace App\Services\Crm;

use App\Services\Content\ContentSiteDiscovery;
use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\PublicAddress;
use App\Services\Content\Web\RobotsRules;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\Urls;
use App\Services\Content\Web\WebFetcher;
use App\Services\Content\Web\WebResponse;

/** A bounded read of company pages using the same public address checks as Content Planner. */
final class SalesCaptureWebsite
{
    private const MAX_PAGES = 24;

    public function __construct(private readonly WebFetcher $web, private readonly ContentSiteDiscovery $discovery) {}

    public static function clean(mixed $value): ?string
    {
        $url = PublicAddress::clean($value);

        return $url === null ? null : BusinessProfile::publicUrl(Urls::normalize(explode('?', $url, 2)[0]));
    }

    public function pages(string $url): array
    {
        $started = microtime(true);
        $site = UrlRules::siteHost($url);
        $robots = $this->web->get(Urls::origin($url).'/robots.txt', 512 * 1024, [], $why);
        if (($robots && ! UrlRules::sameSite($robots->url, $site))
            || (! $robots && ! in_array($why, ['not_found', 'refused', 'unexpected'], true))) {
            return [];
        }
        $rules = $robots ? RobotsRules::parse($robots->body, WebFetcher::AGENT) : RobotsRules::allowAll();
        $entry = $this->page($url, $site, $rules);
        if (! $entry) {
            return [];
        }
        $read = PageReader::read($entry->body, $entry->url, $entry->contentType);
        $origin = (string) Urls::origin($entry->url);
        $sitemap = $this->discovery->sitemaps($origin, $rules->sitemaps ?: [$origin.'/sitemap.xml'], $site, $rules, $started + 25);
        $pending = [];
        $pages = [$entry->url => $this->evidence($entry, $read)];
        $visited = [$url => true, $entry->url => true];
        $links = [...$read['links'], ...array_column($sitemap, 'url')];
        for ($attempt = 0; $attempt < 40 && count($pages) < self::MAX_PAGES && microtime(true) - $started < 90; $attempt++) {
            foreach ($links as $link) {
                if (! isset($visited[$link]) && ! isset($pending[$link])
                    && UrlRules::sameSite($link, $site) && ! UrlRules::skipped($link) && $rules->allows(Urls::pathAndQuery($link))) {
                    $rank = UrlRules::pageRank($link);
                    if (UrlRules::looksLikeArticle($link, null)) {
                        $rank += 40;
                    }
                    $language = UrlRules::languagePrefix($link);
                    if ($language && $language !== UrlRules::languagePrefix($entry->url)) {
                        $rank += 30;
                    }
                    $pending[$link] = $rank;
                }
            }
            if (! $pending) {
                break;
            }
            asort($pending, SORT_NUMERIC);
            $link = array_key_first($pending);
            unset($pending[$link]);
            $visited[$link] = true;
            $links = [];
            $page = $this->page($link, $site, $rules);
            if ($page && ! isset($pages[$page->url])) {
                $visited[$page->url] = true;
                $parsed = PageReader::read($page->body, $page->url, $page->contentType);
                $pages[$page->url] = $this->evidence($page, $parsed);
                $links = $parsed['links'];
            }
        }

        return array_values(array_filter($pages, fn ($page) => $page['text'] !== ''));
    }

    private function page(string $url, string $site, RobotsRules $rules): ?WebResponse
    {
        if (! $rules->allows(Urls::pathAndQuery($url))) {
            return null;
        }
        $page = $this->web->get($url, WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);

        return $page && UrlRules::sameSite($page->url, $site) && $rules->allows(Urls::pathAndQuery($page->url)) ? $page : null;
    }

    private function evidence(WebResponse $page, array $read): array
    {
        return [
            'type' => 'website', 'title' => $read['title'] ?? $page->url, 'url' => $page->url,
            'text' => mb_substr(trim(($read['description'] ?? '')."\n".$read['text']), 0, 6500),
        ];
    }
}
