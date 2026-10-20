<?php

namespace App\Services\Content\Web;

/**
 * Sitemaps, sitemap indexes, RSS and Atom feeds (spec 2026-10-20 §3.2): addresses with their dates (UTC), and for feeds
 * their titles and plain descriptions. Gzip is read; a document declaring entities is not (no entity expansion).
 */
final class SitemapReader
{
    public const MAX_ENTRIES = 5000;

    /** @return array{kind: string, entries: list<array{url: string, date: ?string, title: ?string, description: ?string}>} */
    public static function read(string $body): array
    {
        $none = ['kind' => 'none', 'entries' => []];
        if (str_starts_with($body, "\x1f\x8b")) {
            // Broken gzip warns; the warning is not news here (an unreadable file is simply no sitemap).
            set_error_handler(static fn () => true);
            try {
                $decoded = function_exists('gzdecode') ? gzdecode($body, 10_485_760) : false;
            } finally {
                restore_error_handler();
            }
            $body = is_string($decoded) ? $decoded : '';
        }
        if (str_starts_with($body, "\xEF\xBB\xBF")) {
            $body = substr($body, 3);
        }
        $body = trim($body);
        if ($body === '' || stripos($body, '<!ENTITY') !== false) {
            return $none;
        }
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $ok = $doc->loadXML($body, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$ok || $doc->documentElement === null) {
            return $none;
        }

        return match (strtolower($doc->documentElement->localName)) {
            'sitemapindex' => ['kind' => 'index', 'entries' => self::locations($doc, 'sitemap')],
            'urlset'       => ['kind' => 'urlset', 'entries' => self::locations($doc, 'url')],
            'rss', 'rdf'   => ['kind' => 'feed', 'entries' => self::rss($doc)],
            'feed'         => ['kind' => 'feed', 'entries' => self::atom($doc)],
            default        => $none,
        };
    }

    /** @return list<array{url: string, date: ?string, title: null, description: null}> */
    private static function locations(\DOMDocument $doc, string $item): array
    {
        $out = [];
        foreach (self::elements($doc, $item) as $node) {
            $url = trim((string) self::child($node, 'loc'));
            if ($url !== '') {
                $out[] = ['url' => $url, 'date' => self::date(self::child($node, 'lastmod')), 'title' => null, 'description' => null];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    /** @return list<array{url: string, date: ?string, title: ?string, description: ?string}> */
    private static function rss(\DOMDocument $doc): array
    {
        $out = [];
        foreach (self::elements($doc, 'item') as $node) {
            $url = trim((string) self::child($node, 'link'));
            if ($url !== '') {
                $out[] = [
                    'url'         => $url,
                    'date'        => self::date(self::child($node, 'pubDate') ?? self::child($node, 'date')),
                    'title'       => self::plain(self::child($node, 'title'), 300),
                    'description' => self::plain(self::child($node, 'description'), 1000),
                ];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    /** @return list<array{url: string, date: ?string, title: ?string, description: ?string}> */
    private static function atom(\DOMDocument $doc): array
    {
        $out = [];
        foreach (self::elements($doc, 'entry') as $node) {
            $url = null;
            foreach ($node->childNodes as $child) {
                if ($child instanceof \DOMElement && $child->localName === 'link' && in_array($child->getAttribute('rel'), ['', 'alternate'], true)) {
                    $url = trim($child->getAttribute('href'));
                    break;
                }
            }
            if ($url !== null && $url !== '') {
                $out[] = [
                    'url'         => $url,
                    'date'        => self::date(self::child($node, 'published') ?? self::child($node, 'updated')),
                    'title'       => self::plain(self::child($node, 'title'), 300),
                    'description' => self::plain(self::child($node, 'summary') ?? self::child($node, 'content'), 1000),
                ];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    private static function child(\DOMElement $node, string $name): ?string
    {
        foreach ($node->childNodes as $child) {
            if ($child instanceof \DOMElement && $child->localName === $name) {
                return $child->textContent;
            }
        }

        return null;
    }

    private static function plain(?string $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /** A date as UTC ATOM, or null when it is not one. */
    public static function date(?string $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        try {
            // A date without its own offset is UTC, whatever the server's zone.
            return (new \DateTimeImmutable($value, new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('UTC'))->format(DATE_ATOM);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return \Generator<\DOMElement> the elements with this local name, in any namespace or none */
    private static function elements(\DOMDocument $doc, string $name): \Generator
    {
        foreach ($doc->getElementsByTagName('*') as $node) {
            if ($node instanceof \DOMElement && $node->localName === $name) {
                yield $node;
            }
        }
    }
}
