<?php

namespace App\Services\Crm;

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
    public function __construct(private readonly WebFetcher $web) {}

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
        $known = array_filter($read['links'], fn ($link) => UrlRules::sameSite($link, $site) && ! UrlRules::skipped($link)
            && ! UrlRules::looksLikeArticle($link, null));
        usort($known, fn (string $a, string $b) => UrlRules::pageRank($a) <=> UrlRules::pageRank($b));
        $pages = [$entry->url => $this->evidence($entry, $read)];
        foreach (array_slice(array_diff(array_unique($known), [$url, $entry->url]), 0, 4) as $link) {
            if (microtime(true) - $started > 50) {
                break;
            }
            if (($page = $this->page($link, $site, $rules)) && ! isset($pages[$page->url])) {
                $pages[$page->url] = $this->evidence($page, PageReader::read($page->body, $page->url, $page->contentType));
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
            'text' => mb_substr(trim(($read['description'] ?? '')."\n".$read['text']), 0, 5400),
        ];
    }
}
