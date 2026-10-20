<?php

namespace App\Services\Content\Web;

/**
 * What the scan keeps from an HTML page (spec 2026-10-20 §3.3, §3.4): title, description, picture (https), date,
 * language, whether it says it is an article, its main text, its links and its feeds.
 */
final class PageReader
{
    public const TEXT_MAX = 20000;

    private const ARTICLE_TYPES = ['article', 'blogposting', 'newsarticle', 'techarticle', 'report'];
    private const DROP = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'aside', 'form'];
    private const BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'dd', 'figcaption'];

    /**
     * @return array{title: ?string, description: ?string, image: ?string, published_at: ?string, language: ?string,
     *     article: bool, text: string, links: list<string>, feeds: list<string>}
     */
    public static function read(string $html, string $url, string $contentType = ''): array
    {
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8">' . self::utf8($html, $contentType), LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $xpath = new \DOMXPath($doc);

        $base = $url;
        $baseHref = self::first($xpath, '//base[@href]')?->getAttribute('href');
        if ($baseHref !== null && $baseHref !== '') {
            $base = Urls::absolute($baseHref, $url) ?? $url;
        }
        $meta = [];
        foreach ($xpath->query('//meta[@content]') ?: [] as $node) {
            $key = strtolower(trim($node->getAttribute('property') ?: $node->getAttribute('name')));
            if ($key !== '' && !isset($meta[$key])) {
                $meta[$key] = trim($node->getAttribute('content'));
            }
        }
        $ld = self::jsonLd($xpath);

        $title = self::fold($meta['og:title'] ?? null, 300)
            ?? self::fold(self::first($xpath, '//title')?->textContent, 300)
            ?? self::fold(self::first($xpath, '//h1')?->textContent, 300)
            ?? self::fold($ld['headline'], 300);
        $image = null;
        foreach ([$meta['og:image'] ?? null, $meta['og:image:url'] ?? null, $meta['twitter:image'] ?? null, $ld['image']] as $candidate) {
            $absolute = is_string($candidate) && trim($candidate) !== '' ? Urls::absolute($candidate, $base) : null;
            if ($absolute !== null && str_starts_with($absolute, 'https://')) {
                $image = $absolute;
                break;
            }
        }
        $links = [];
        foreach ($xpath->query('//a[@href]') ?: [] as $node) {
            $link = Urls::absolute($node->getAttribute('href'), $base);
            if ($link !== null && !in_array($link, $links, true)) {
                $links[] = $link;
            }
            if (count($links) >= 300) {
                break;
            }
        }
        $feeds = [];
        foreach ($xpath->query('//link[@href]') ?: [] as $node) {
            $rel = strtolower($node->getAttribute('rel'));
            $type = strtolower($node->getAttribute('type'));
            if (str_contains($rel, 'alternate') && in_array($type, ['application/rss+xml', 'application/atom+xml'], true)) {
                $feed = Urls::absolute($node->getAttribute('href'), $base);
                if ($feed !== null && !in_array($feed, $feeds, true)) {
                    $feeds[] = $feed;
                }
            }
        }

        return [
            'title'        => $title,
            'description'  => self::fold($meta['og:description'] ?? $meta['description'] ?? null, 1000),
            'image'        => $image,
            'published_at' => SitemapReader::date($meta['article:published_time'] ?? null)
                ?? SitemapReader::date($ld['date'])
                ?? SitemapReader::date(self::first($xpath, '//time[@datetime]')?->getAttribute('datetime')),
            'language'     => self::fold(self::first($xpath, '//html[@lang]')?->getAttribute('lang'), 12),
            'article'      => strtolower($meta['og:type'] ?? '') === 'article' || isset($meta['article:published_time']) || $ld['article'],
            'text'         => self::text($doc, $xpath),
            'links'        => $links,
            'feeds'        => $feeds,
        ];
    }

    /** The page as UTF-8, its own charset declaration rewritten so libxml cannot decode it twice. */
    private static function utf8(string $html, string $contentType): string
    {
        $charset = '';
        if (preg_match('/charset=["\']?([\w-]+)/i', $contentType, $m) === 1) {
            $charset = $m[1];
        } elseif (preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($html, 0, 4096), $m) === 1) {
            $charset = $m[1];
        }
        $charset = strtoupper($charset);
        if ($charset !== '' && !in_array($charset, ['UTF-8', 'UTF8'], true)
            && in_array($charset, array_map('strtoupper', mb_list_encodings()), true)) {
            $converted = @mb_convert_encoding($html, 'UTF-8', $charset);
            $html = is_string($converted) ? $converted : $html;
        }

        return (string) preg_replace('/(<meta[^>]+charset=["\']?)[\w-]+/i', '${1}utf-8', $html, 1);
    }

    private static function first(\DOMXPath $xpath, string $query): ?\DOMElement
    {
        $node = $xpath->query($query)?->item(0);

        return $node instanceof \DOMElement ? $node : null;
    }

    private static function fold(?string $value, int $max): ?string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', (string) $value));

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /** @return array{article: bool, date: ?string, image: ?string, headline: ?string} */
    private static function jsonLd(\DOMXPath $xpath): array
    {
        $out = ['article' => false, 'date' => null, 'image' => null, 'headline' => null];
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $node) {
            $stack = [json_decode(trim($node->textContent), true)];
            while ($stack !== []) {
                $item = array_pop($stack);
                if (!is_array($item)) {
                    continue;
                }
                if (array_is_list($item)) {
                    array_push($stack, ...$item);
                    continue;
                }
                if (isset($item['@graph'])) {
                    $stack[] = $item['@graph'];
                }
                $types = array_map(fn ($type) => strtolower((string) $type), (array) ($item['@type'] ?? []));
                if (array_intersect($types, self::ARTICLE_TYPES) === []) {
                    continue;
                }
                $out['article'] = true;
                $out['date'] ??= is_string($item['datePublished'] ?? null) ? $item['datePublished'] : null;
                $out['headline'] ??= is_string($item['headline'] ?? null) ? $item['headline'] : null;
                $image = $item['image'] ?? null;
                if (is_array($image)) {
                    $image = array_is_list($image) ? ($image[0] ?? null) : ($image['url'] ?? null);
                }
                if (is_array($image)) {
                    $image = $image['url'] ?? null;
                }
                $out['image'] ??= is_string($image) ? $image : null;
            }
        }

        return $out;
    }

    /** The `<article>` (the longest), else `<main>`, else the body, without navigation, header, footer, aside, forms or scripts. */
    private static function text(\DOMDocument $doc, \DOMXPath $xpath): string
    {
        foreach (self::DROP as $tag) {
            foreach (iterator_to_array($doc->getElementsByTagName($tag)) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }
        $root = null;
        $best = -1;
        foreach ($xpath->query('//article') ?: [] as $node) {
            $length = mb_strlen(trim($node->textContent));
            if ($length > $best) {
                $best = $length;
                $root = $node;
            }
        }
        $root ??= self::first($xpath, '//main') ?? self::first($xpath, '//*[@role="main"]') ?? self::first($xpath, '//body');
        if ($root === null) {
            return '';
        }
        $blocks = './/' . implode('|.//', self::BLOCKS);
        $parts = [];
        foreach ($xpath->query($blocks, $root) ?: [] as $node) {
            // A block holding other blocks (li > p) is read through them, once.
            if (($xpath->query($blocks, $node)?->length ?? 0) > 0) {
                continue;
            }
            $line = self::fold($node->textContent, self::TEXT_MAX);
            if ($line !== null) {
                $parts[] = $line;
            }
        }
        $text = $parts === [] ? (string) self::fold($root->textContent, self::TEXT_MAX) : implode("\n", $parts);

        return mb_substr($text, 0, self::TEXT_MAX);
    }
}
