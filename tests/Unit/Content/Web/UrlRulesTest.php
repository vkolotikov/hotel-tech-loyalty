<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\UrlRules;
use PHPUnit\Framework\TestCase;

/** Which addresses belong to the site, which are articles, which are never kept (spec 2026-10-20 §3.3). */
class UrlRulesTest extends TestCase
{
    public function test_the_site_is_its_host_with_or_without_www(): void
    {
        $this->assertSame('ex.com', UrlRules::siteHost('https://www.Ex.com/a'));
        $this->assertTrue(UrlRules::sameSite('https://ex.com/x', 'ex.com'));
        $this->assertTrue(UrlRules::sameSite('https://www.ex.com/x', 'ex.com'));
        $this->assertFalse(UrlRules::sameSite('https://blog.ex.com/x', 'ex.com'));
        $this->assertFalse(UrlRules::sameSite('https://ex.com.evil.io/x', 'ex.com'));
    }

    public function test_lists_feeds_admin_shop_pages_files_and_queries_are_never_kept(): void
    {
        foreach (['/tag/x', '/category/news', '/author/ann', '/blog/page/2', '/feed', '/wp-json/wp/v2', '/cart', '/my-account',
            '/file.pdf', '/img/photo.JPG', '/sitemap.xml', '/a?utm_source=x', '/search'] as $path) {
            $this->assertTrue(UrlRules::skipped('https://ex.com' . $path), $path);
        }
        foreach (['/blog/how-to', '/?p=12', '/?page_id=4', '/services', '/'] as $path) {
            $this->assertFalse(UrlRules::skipped('https://ex.com' . $path), $path);
        }
    }

    public function test_articles_sit_below_a_blog_folder_or_under_a_year_and_month(): void
    {
        foreach (['/blog/how-to', '/en/blog/how-to', '/news/2024-update', '/2024/05/my-post', '/Блог/статья'] as $path) {
            $this->assertSame($path !== '/Блог/статья', UrlRules::looksLikeArticle('https://ex.com' . $path, null), $path);
        }
        foreach (['/blog', '/2024/05/', '/services/hair', '/insights-hub/x'] as $path) {
            $this->assertFalse(UrlRules::looksLikeArticle('https://ex.com' . $path, null), $path);
        }
        $this->assertTrue(UrlRules::looksLikeArticle('https://ex.com/stuff/post-1', '/stuff'));
        $this->assertFalse(UrlRules::looksLikeArticle('https://ex.com/stuff', '/stuff'));
        $this->assertTrue(UrlRules::looksLikeArticle('https://ex.com/a/b/c', '/a/b'));
    }

    public function test_the_blog_page_itself_is_not_an_article(): void
    {
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/blog', null));
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/en/blog/', null));
        $this->assertFalse(UrlRules::isBlogIndex('https://ex.com/blog/how-to', null));
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/stuff', '/stuff'));
        $this->assertFalse(UrlRules::isBlogIndex('https://ex.com/', null));
    }

    public function test_a_child_sitemap_says_what_it_holds_by_its_name(): void
    {
        $hints = [
            'post-sitemap.xml' => 'article', 'page-sitemap.xml' => 'page', 'wp-sitemap-posts-post-1.xml' => 'article',
            'wp-sitemap-posts-page-1.xml' => 'page', 'wp-sitemap-taxonomies-category-1.xml' => 'skip', 'wp-sitemap-users-1.xml' => 'skip',
            'category-sitemap.xml' => 'skip', 'sitemap-news.xml' => 'article', 'sitemap-pages.xml' => 'page',
            'product_cat-sitemap.xml' => 'skip', 'product-sitemap.xml' => null, 'sitemap.xml' => null,
        ];
        foreach ($hints as $name => $hint) {
            $this->assertSame($hint, UrlRules::sitemapHint('https://ex.com/' . $name), $name);
        }
    }

    public function test_pages_rank_home_then_key_pages_then_shallow_ones(): void
    {
        $this->assertSame(0, UrlRules::pageRank('https://ex.com/'));
        $this->assertSame(0, UrlRules::pageRank('https://ex.com/fr/'));
        $this->assertSame(11, UrlRules::pageRank('https://ex.com/about-us'));
        $this->assertSame(12, UrlRules::pageRank('https://ex.com/services/hair-colour'));
        $this->assertSame(11, UrlRules::pageRank('https://ex.com/o-nas'));
        $this->assertSame(26, UrlRules::pageRank('https://ex.com/some/deep/page'));
        $this->assertLessThan(UrlRules::pageRank('https://ex.com/gallery'), UrlRules::pageRank('https://ex.com/kontakt'));
    }

    public function test_a_language_folder_is_known_by_its_code(): void
    {
        $this->assertSame('fr', UrlRules::languagePrefix('https://ex.com/fr/about'));
        $this->assertSame('pt-br', UrlRules::languagePrefix('https://ex.com/pt-BR/'));
        $this->assertNull(UrlRules::languagePrefix('https://ex.com/about'));
        $this->assertNull(UrlRules::languagePrefix('https://ex.com/'));
        $this->assertNull(UrlRules::languagePrefix('https://ex.com/xx/page'));
    }

    public function test_a_page_without_a_title_is_named_by_its_address(): void
    {
        $this->assertSame('How to choose colour', UrlRules::lastPart('https://ex.com/blog/how-to-choose_colour.html'));
        $this->assertSame('ex.com', UrlRules::lastPart('https://ex.com/'));
    }
}
