<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\SitemapReader;
use PHPUnit\Framework\TestCase;

/** Sitemaps, sitemap indexes and feeds (spec 2026-10-20 §3.2). */
class SitemapReaderTest extends TestCase
{
    private const URLSET = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        . '<url><loc>https://ex.com/blog/a</loc><lastmod>2026-09-01</lastmod></url>'
        . '<url><loc> https://ex.com/about </loc></url></urlset>';

    public function test_a_urlset_lists_its_addresses_with_their_dates_in_utc(): void
    {
        $read = SitemapReader::read(self::URLSET);

        $this->assertSame('urlset', $read['kind']);
        $this->assertSame([
            ['url' => 'https://ex.com/blog/a', 'date' => '2026-09-01T00:00:00+00:00', 'title' => null, 'description' => null],
            ['url' => 'https://ex.com/about', 'date' => null, 'title' => null, 'description' => null],
        ], $read['entries']);
    }

    public function test_an_index_lists_its_sitemaps(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ex.com/post-sitemap.xml</loc><lastmod>2026-09-02T10:00:00+02:00</lastmod></sitemap></sitemapindex>');

        $this->assertSame('index', $read['kind']);
        $this->assertSame('https://ex.com/post-sitemap.xml', $read['entries'][0]['url']);
        $this->assertSame('2026-09-02T08:00:00+00:00', $read['entries'][0]['date']);
    }

    public function test_a_gzip_sitemap_and_a_byte_order_mark_are_read(): void
    {
        $this->assertSame('urlset', SitemapReader::read((string) gzencode(self::URLSET))['kind']);
        $this->assertSame('urlset', SitemapReader::read("\xEF\xBB\xBF" . self::URLSET)['kind']);
    }

    public function test_an_rss_feed_gives_titles_dates_and_plain_descriptions(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>'
            . '<item><title> Autumn colours </title><link>https://ex.com/blog/autumn</link><pubDate>Tue, 01 Sep 2026 10:00:00 +0200</pubDate>'
            . '<description>&lt;p&gt;Three &lt;b&gt;warm&lt;/b&gt; tones&lt;/p&gt;</description></item></channel></rss>');

        $this->assertSame('feed', $read['kind']);
        $this->assertSame(['url' => 'https://ex.com/blog/autumn', 'date' => '2026-09-01T08:00:00+00:00', 'title' => 'Autumn colours', 'description' => 'Three warm tones'], $read['entries'][0]);
    }

    public function test_an_atom_feed_gives_its_alternate_links(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Post</title>'
            . '<link rel="edit" href="https://ex.com/edit/1"/><link rel="alternate" href="https://ex.com/blog/post"/>'
            . '<published>2026-09-03T09:00:00Z</published><summary>Short</summary></entry></feed>');

        $this->assertSame('feed', $read['kind']);
        $this->assertSame('https://ex.com/blog/post', $read['entries'][0]['url']);
        $this->assertSame('2026-09-03T09:00:00+00:00', $read['entries'][0]['date']);
        $this->assertSame('Short', $read['entries'][0]['description']);
    }

    public function test_html_entities_and_garbage_are_not_a_sitemap(): void
    {
        $this->assertSame('none', SitemapReader::read('<html><body>Not found</body></html>')['kind']);
        $this->assertSame('none', SitemapReader::read('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><urlset><url><loc>&a;</loc></url></urlset>')['kind']);
        $this->assertSame('none', SitemapReader::read('')['kind']);
        $this->assertSame('none', SitemapReader::read("\x1f\x8bnot gzip")['kind']);
    }

    public function test_at_most_five_thousand_entries(): void
    {
        $urls = str_repeat('<url><loc>https://ex.com/p</loc></url>', 5100);
        $this->assertCount(SitemapReader::MAX_ENTRIES, SitemapReader::read('<urlset>' . $urls . '</urlset>')['entries']);
    }
}
