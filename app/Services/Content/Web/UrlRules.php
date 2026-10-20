<?php

namespace App\Services\Content\Web;

/** The scan's rules for addresses (spec 2026-10-20 §3.3): the site, what is never kept, articles vs pages, ranking. */
final class UrlRules
{
    /** Folders whose children are articles. */
    public const BLOG_FOLDERS = [
        'blog', 'news', 'articles', 'article', 'posts', 'post', 'insights', 'stories', 'journal', 'magazine', 'guides',
        'resources', 'aktuelles', 'nachrichten', 'noticias', 'actualites', 'articulos', 'novosti', 'stati',
    ];

    private const NEVER = [
        'tag', 'tags', 'category', 'categories', 'author', 'authors', 'search', 'feed', 'rss', 'wp-json', 'wp-admin',
        'wp-content', 'wp-includes', 'wp-login.php', 'cart', 'basket', 'checkout', 'account', 'my-account', 'login', 'signin',
        'sign-in', 'register', 'signup', 'sign-up', 'cdn-cgi',
    ];

    private const FILES = '/\.(pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|avi|webm|mp3|wav|zip|rar|gz|tgz|7z|xml|json|txt|csv|docx?|xlsx?|pptx?)$/i';

    /** Pages a company summary needs first: about, services, prices, contact, team, FAQ, products, booking. */
    private const KEY_PAGES = [
        'about', 'about-us', 'services', 'service', 'pricing', 'prices', 'price', 'contact', 'contacts', 'contact-us', 'team',
        'faq', 'products', 'booking', 'book', 'menu',
        'o-nas', 'onas', 'uslugi', 'ceny', 'tseny', 'kontakty', 'komanda',
        'ueber-uns', 'uber-uns', 'leistungen', 'preise', 'kontakt',
        'a-propos', 'apropos', 'tarifs', 'prestations', 'equipe',
        'sobre-nosotros', 'servicios', 'precios', 'contacto', 'equipo', 'reservas',
    ];

    /** Language folders (ISO 639-1 codes), as multilingual sites name them: `fr`, `pt-br`. */
    private const LANGUAGES = [
        'en', 'fr', 'de', 'it', 'es', 'ru', 'pt', 'nl', 'pl', 'uk', 'lv', 'lt', 'et', 'fi', 'sv', 'da', 'no', 'nb', 'cs', 'sk',
        'hu', 'ro', 'bg', 'el', 'tr', 'ar', 'he', 'ja', 'zh', 'ko', 'hr', 'sl', 'sr', 'ka', 'hy', 'az', 'kk', 'be', 'ca', 'ga',
    ];

    private const SKIP_SITEMAPS =['category', 'categories', 'tag', 'tags', 'author', 'authors', 'attachment', 'attachments', 'format', 'formats', 'taxonomy', 'taxonomies', 'user', 'users'];
    private const PAGE_SITEMAPS = ['page', 'pages'];
    private const ARTICLE_SITEMAPS = ['post', 'posts', 'blog', 'blogs', 'article', 'articles', 'news', 'journal', 'story', 'stories', 'insights'];

    public static function siteHost(string $url): string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    public static function sameSite(string $url, string $siteHost): bool
    {
        return $siteHost !== '' && self::siteHost($url) === $siteHost;
    }

    /** Tag, category, author, search and paginated lists; feeds and admin; shop accounts; files; queries other than a page id. */
    public static function skipped(string $url): bool
    {
        $query = (string) parse_url($url, PHP_URL_QUERY);
        if ($query !== '' && preg_match('/^(p|page_id)=\d+$/', $query) !== 1) {
            return true;
        }
        if (preg_match(self::FILES, (string) parse_url($url, PHP_URL_PATH)) === 1) {
            return true;
        }
        $segments = self::segments($url);
        foreach ($segments as $i => $segment) {
            if (in_array($segment, self::NEVER, true)) {
                return true;
            }
            if ($segment === 'page' && isset($segments[$i + 1]) && ctype_digit($segments[$i + 1])) {
                return true;
            }
        }

        return false;
    }

    /** One level or more below a blog folder (or the address's own path, spec §3.1), or under /yyyy/mm/. */
    public static function looksLikeArticle(string $url, ?string $blogPath): bool
    {
        if (preg_match('#/(19|20)\d{2}/(0[1-9]|1[0-2])/[^/]+#', (string) parse_url($url, PHP_URL_PATH)) === 1) {
            return true;
        }
        $segments = self::segments($url);
        $prefix = self::folder($blogPath);
        if ($prefix !== [] && array_slice($segments, 0, count($prefix)) === $prefix && count($segments) > count($prefix)) {
            return true;
        }
        foreach ($segments as $i => $segment) {
            if (in_array($segment, self::BLOG_FOLDERS, true) && count($segments) > $i + 1) {
                return true;
            }
        }

        return false;
    }

    /** The blog page itself: its last part is a blog folder, or it is the address's own path. */
    public static function isBlogIndex(string $url, ?string $blogPath): bool
    {
        $segments = self::segments($url);
        $prefix = self::folder($blogPath);
        if ($prefix !== [] && $segments === $prefix) {
            return true;
        }

        return $segments !== [] && in_array($segments[count($segments) - 1], self::BLOG_FOLDERS, true);
    }

    /** What a child sitemap holds, by its file name: `skip` (taxonomies, users), `page`, `article`, or null (unknown). */
    public static function sitemapHint(string $url): ?string
    {
        $name = strtolower(basename((string) parse_url($url, PHP_URL_PATH)));
        if (str_contains($name, 'product_cat') || str_contains($name, 'product_tag')) {
            return 'skip';
        }
        $tokens = preg_split('/[-_.]+/', $name) ?: [];
        foreach ([[self::SKIP_SITEMAPS, 'skip'], [self::PAGE_SITEMAPS, 'page'], [self::ARTICLE_SITEMAPS, 'article']] as [$words, $hint]) {
            if (array_intersect($tokens, $words) !== []) {
                return $hint;
            }
        }

        return null;
    }

    /** Lower is read first: the home page, then key pages, then the shallowest. */
    public static function pageRank(string $url): int
    {
        $segments = self::segments($url);
        // A language folder alone (`/fr/`) is that language's home page.
        if ($segments === [] || (count($segments) === 1 && self::languagePrefix($url) !== null)) {
            return 0;
        }
        foreach ($segments as $segment) {
            if (in_array($segment, self::KEY_PAGES, true)) {
                return 10 + count($segments);
            }
        }

        return 20 + 2 * count($segments);
    }

    /** The address's language folder (its first path part, `xx` or `xx-yy`), lowercased; null for none (spec §3.3). */
    public static function languagePrefix(string $url): ?string
    {
        $first = self::segments($url)[0] ?? null;
        if ($first === null || preg_match('/^([a-z]{2})(?:[-_][a-z]{2,4})?$/', $first, $m) !== 1) {
            return null;
        }

        return in_array($m[1], self::LANGUAGES, true) ? $first : null;
    }

    /** The address's last part as words, for a page without a title; the host for the home page. */
    public static function lastPart(string $url): string
    {
        $host = (string) parse_url($url, PHP_URL_HOST);
        $segments = self::segments($url);
        if ($segments === []) {
            return $host;
        }
        $last = (string) preg_replace('/\.(html?|php|aspx?)$/i', '', $segments[count($segments) - 1]);
        $words = trim((string) preg_replace('/[-_]+/', ' ', $last));

        return $words === '' ? $host : mb_strtoupper(mb_substr($words, 0, 1)) . mb_substr($words, 1);
    }

    /** @return list<string> the path's parts, decoded and lowercased */
    private static function segments(string $url): array
    {
        $parts = array_map(fn (string $s) => mb_strtolower(rawurldecode($s)), explode('/', (string) parse_url($url, PHP_URL_PATH)));

        return array_values(array_filter($parts, fn (string $s) => $s !== ''));
    }

    /** @return list<string> */
    private static function folder(?string $blogPath): array
    {
        return $blogPath === null ? [] : self::segments('http://x' . $blogPath);
    }
}
