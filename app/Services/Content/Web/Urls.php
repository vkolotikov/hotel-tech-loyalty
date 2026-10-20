<?php

namespace App\Services\Content\Web;

/** Addresses as the scan compares them (spec 2026-10-20 §3): absolute, http(s), without #fragment, in one normal form. */
final class Urls
{
    /** An absolute http(s) address for $href found on $base, without its #fragment; null for other schemes or none. */
    public static function absolute(string $href, string $base): ?string
    {
        $href = trim(html_entity_decode($href, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($href === '' || str_starts_with($href, '#')) {
            return null;
        }
        $href = explode('#', $href, 2)[0];
        if (preg_match('#^([a-z][a-z0-9+.-]*):#i', $href, $m) === 1) {
            return in_array(strtolower($m[1]), ['http', 'https'], true) ? self::normalize($href) : null;
        }
        $b = parse_url($base);
        if ($b === false || !isset($b['scheme'], $b['host'])) {
            return null;
        }
        $scheme = strtolower($b['scheme']);
        if (str_starts_with($href, '//')) {
            return self::normalize($scheme . ':' . $href);
        }
        $origin = $scheme . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        $basePath = $b['path'] ?? '/';
        if (str_starts_with($href, '?')) {
            return self::normalize($origin . $basePath . $href);
        }
        if (str_starts_with($href, '/')) {
            return self::normalize($origin . $href);
        }
        $dir = substr($basePath, 0, (int) strrpos($basePath, '/') + 1);

        return self::normalize($origin . ($dir === '' ? '/' : $dir) . $href);
    }

    /** Lowercase scheme and host, no default port, no fragment, dot segments resolved, an empty path as "/". */
    public static function normalize(string $url): ?string
    {
        $p = parse_url(trim($url));
        if ($p === false || !isset($p['scheme'], $p['host']) || $p['host'] === '') {
            return null;
        }
        $scheme = strtolower($p['scheme']);
        if (!in_array($scheme, ['http', 'https'], true)) {
            return null;
        }
        $port = isset($p['port']) && !(($scheme === 'http' && $p['port'] === 80) || ($scheme === 'https' && $p['port'] === 443))
            ? ':' . $p['port'] : '';
        $query = isset($p['query']) && $p['query'] !== '' ? '?' . $p['query'] : '';

        return $scheme . '://' . strtolower($p['host']) . $port . self::dots($p['path'] ?? '/') . $query;
    }

    public static function origin(string $url): ?string
    {
        $normal = self::normalize($url);
        if ($normal === null) {
            return null;
        }
        $p = parse_url($normal);

        return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    }

    public static function path(string $url): string
    {
        $path = (string) parse_url($url, PHP_URL_PATH);

        return $path === '' ? '/' : $path;
    }

    /** What robots.txt rules are matched against. */
    public static function pathAndQuery(string $url): string
    {
        $query = (string) parse_url($url, PHP_URL_QUERY);

        return self::path($url) . ($query === '' ? '' : '?' . $query);
    }

    private static function dots(string $path): string
    {
        $out = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '..') {
                if (count($out) > 1) {
                    array_pop($out);
                }
                continue;
            }
            if ($segment !== '.') {
                $out[] = $segment;
            }
        }
        $result = implode('/', $out);
        if (str_ends_with($path, '/..') || str_ends_with($path, '/.')) {
            $result .= '/';
        }
        if ($result === '') {
            return '/';
        }

        return str_starts_with($result, '/') ? $result : '/' . $result;
    }
}
