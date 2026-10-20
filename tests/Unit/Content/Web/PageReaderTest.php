<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\PageReader;
use PHPUnit\Framework\TestCase;

/** What the scan keeps from a page (spec 2026-10-20 §3.3, §3.4). */
class PageReaderTest extends TestCase
{
    private const ARTICLE = <<<'HTML'
<!doctype html><html lang="en-GB"><head><title>Autumn colours | Lumière</title>
<meta property="og:title" content="  Autumn   colours ">
<meta property="og:description" content="Three warm tones for October.">
<meta property="og:image" content="/img/autumn.jpg">
<meta property="og:type" content="article">
<meta property="article:published_time" content="2026-09-01T10:00:00+02:00">
<link rel="alternate" type="application/rss+xml" href="/feed/">
</head><body>
<nav><a href="/">Home</a><a href="/services#top">Services</a></nav>
<header>Site header</header>
<article><h1>Autumn colours</h1><p>Copper suits warm skin.</p><ul><li><p>Chestnut</p></li><li>Honey</li></ul>
<script>var tracking = 1;</script><a href="mailto:hi@lumiere.example">Mail us</a><a href="https://other.example/x">Other</a></article>
<footer>© Lumière</footer></body></html>
HTML;

    public function test_an_article_gives_its_title_description_picture_date_language_and_kind(): void
    {
        $read = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn');

        $this->assertSame('Autumn colours', $read['title']);
        $this->assertSame('Three warm tones for October.', $read['description']);
        $this->assertSame('https://lumiere.example/img/autumn.jpg', $read['image']);
        $this->assertSame('2026-09-01T08:00:00+00:00', $read['published_at']);
        $this->assertSame('en-GB', $read['language']);
        $this->assertTrue($read['article']);
        $this->assertSame(['https://lumiere.example/feed/'], $read['feeds']);
    }

    public function test_the_text_is_the_article_without_navigation_scripts_or_repeats(): void
    {
        $text = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn')['text'];

        $this->assertSame("Autumn colours\nCopper suits warm skin.\nChestnut\nHoney", $text);
    }

    public function test_links_are_absolute_without_fragments_or_mail(): void
    {
        $links = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn')['links'];

        $this->assertSame(['https://lumiere.example/', 'https://lumiere.example/services', 'https://other.example/x'], $links);
    }

    public function test_a_plain_page_falls_back_to_title_h1_meta_description_and_its_body(): void
    {
        $read = PageReader::read('<html><head><meta name="description" content="Prices"></head><body><h1>Our prices</h1><main><p>Cut 40 €</p></main></body></html>', 'https://lumiere.example/prices');

        $this->assertSame('Our prices', $read['title']);
        $this->assertSame('Prices', $read['description']);
        $this->assertFalse($read['article']);
        $this->assertNull($read['image']);
        $this->assertNull($read['published_at']);
        $this->assertSame('Cut 40 €', $read['text']);
    }

    public function test_json_ld_marks_an_article_with_its_date_and_picture(): void
    {
        $html = '<html><head><title>T</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},'
            . '{"@type":["BlogPosting"],"datePublished":"2026-08-30","image":{"url":"https://cdn.example/p.jpg"},"headline":"H"}]}</script></head><body><p>x</p></body></html>';
        $read = PageReader::read($html, 'https://lumiere.example/a');

        $this->assertTrue($read['article']);
        $this->assertSame('2026-08-30T00:00:00+00:00', $read['published_at']);
        $this->assertSame('https://cdn.example/p.jpg', $read['image']);
    }

    public function test_a_picture_must_be_https_and_a_time_element_gives_the_date(): void
    {
        $read = PageReader::read('<html><head><meta property="og:image" content="http://lumiere.example/a.jpg"></head><body><time datetime="2026-07-01">1 July</time></body></html>', 'https://lumiere.example/x');

        $this->assertNull($read['image']);
        $this->assertSame('2026-07-01T00:00:00+00:00', $read['published_at']);
    }

    public function test_a_windows_1251_page_is_read_as_utf8(): void
    {
        $html = (string) mb_convert_encoding('<html><head><meta charset="windows-1251"><title>Привет, осень</title></head><body><p>Тёплые тона</p></body></html>', 'Windows-1251', 'UTF-8');
        $read = PageReader::read($html, 'https://lumiere.example/ru');

        $this->assertSame('Привет, осень', $read['title']);
        $this->assertSame('Тёплые тона', $read['text']);
    }

    public function test_a_base_element_moves_relative_addresses_and_text_is_cut(): void
    {
        $html = '<html><head><base href="https://cdn.lumiere.example/site/"></head><body><a href="page">P</a><p>' . str_repeat('word ', 6000) . '</p></body></html>';
        $read = PageReader::read($html, 'https://lumiere.example/');

        $this->assertSame(['https://cdn.lumiere.example/site/page'], $read['links']);
        $this->assertSame(PageReader::TEXT_MAX, mb_strlen($read['text']));
    }
}
