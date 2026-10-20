<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentSiteScan;
use App\Services\Content\ContentSiteSummarizer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The scan end to end (spec 2026-10-20 §3.2–§3.6): DNS and HTTP faked, the AI replaced. */
class SiteScanTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private const SITE = 'https://lumiere.example';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function site(string $url = self::SITE, string $token = 'token-1'): ContentSite
    {
        return ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => $url,
            'status' => 'scanning', 'scan_token' => $token, 'scan_queued_at' => now()]);
    }

    private function scan(ContentSite $site, bool $summary = false, string $token = 'token-1', ?\Closure $clock = null): ContentSite
    {
        $scan = app(ContentSiteScan::class);
        $scan->clock = $clock;
        $scan->run($site, $token, $summary);

        return $site->fresh();
    }

    /** @return list<string> */
    private function listed(ContentSite $site, string $kind): array
    {
        return ContentSitePage::where('site_id', $site->id)->where('kind', $kind)->orderBy('id')->pluck('url')->all();
    }

    private function fakeSummary(?array $answer = null, ?\Throwable $error = null): object
    {
        $fake = new class($answer, $error) extends ContentSiteSummarizer {
            /** @var list<array> */
            public array $calls = [];

            public function __construct(private ?array $answer, private ?\Throwable $error)
            {
            }

            public function summarize(ContentPlannerProfile $profile, array $pages): array
            {
                $this->calls[] = $pages;
                if ($this->error !== null) {
                    throw $this->error;
                }

                return $this->answer ?? ['summary' => 'Lumière is a salon.', 'brand_summary' => null, 'usp' => null, 'mission' => null];
            }
        };
        $this->app->instance(ContentSiteSummarizer::class, $fake);

        return $fake;
    }

    private static function html(string $title, string $body = '<p>Text</p>', array $meta = []): string
    {
        $tags = '';
        foreach ($meta as $property => $content) {
            $tags .= '<meta property="' . $property . '" content="' . $content . '">';
        }

        return '<html lang="en"><head><title>' . $title . '</title>' . $tags . '</head><body><main>' . $body . '</main></body></html>';
    }

    /** @param array<string, ?string> $urls address => lastmod */
    private static function urlset(array $urls): string
    {
        $out = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($urls as $url => $date) {
            $out .= '<url><loc>' . $url . '</loc>' . ($date ? '<lastmod>' . $date . '</lastmod>' : '') . '</url>';
        }

        return $out . '</urlset>';
    }

    /** @param list<string> $sitemaps */
    private static function index(array $sitemaps): string
    {
        return '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            . implode('', array_map(fn (string $url) => '<sitemap><loc>' . $url . '</loc></sitemap>', $sitemaps)) . '</sitemapindex>';
    }

    private function wordpressSite(): void
    {
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => "User-agent: *\nDisallow: /blog/secret\nSitemap: " . self::SITE . '/sitemap_index.xml',
            self::SITE . '/' => self::html('Lumière Salon', '<p>Hair and colour in Riga.</p>'),
            self::SITE . '/sitemap_index.xml' => self::index([self::SITE . '/post-sitemap.xml', self::SITE . '/page-sitemap.xml', self::SITE . '/category-sitemap.xml']),
            self::SITE . '/post-sitemap.xml' => self::urlset([self::SITE . '/autumn-colours/' => '2026-09-01', self::SITE . '/blog/secret/x' => '2026-09-02', self::SITE . '/winter-care/' => '2026-09-20']),
            self::SITE . '/page-sitemap.xml' => self::urlset([self::SITE . '/' => null, self::SITE . '/services/' => null]),
            self::SITE . '/autumn-colours/' => self::html('Autumn colours', '<p>Copper suits warm skin.</p>', ['og:image' => self::SITE . '/a.jpg']),
            self::SITE . '/winter-care/' => self::html('Winter care'),
            self::SITE . '/services/' => self::html('Services', '<p>Cuts and colour.</p>'),
        ]);
    }

    public function test_a_sitemap_site_lists_its_articles_newest_first_and_its_pages(): void
    {
        $this->wordpressSite();
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertNull($site->error);
        $this->assertSame(2, $site->articles_count);
        $this->assertSame(2, $site->pages_count);
        $this->assertNotNull($site->scanned_at);
        $this->assertSame([self::SITE . '/', self::SITE . '/services/'], $this->listed($site, 'page'));
        $this->assertEqualsCanonicalizing([self::SITE . '/autumn-colours/', self::SITE . '/winter-care/'], $this->listed($site, 'article'));
        $autumn = ContentSitePage::where('url', self::SITE . '/autumn-colours/')->first();
        $this->assertSame('Autumn colours', $autumn->title);
        $this->assertSame(self::SITE . '/a.jpg', $autumn->image_url);
        $this->assertSame('2026-09-01', $autumn->published_at->format('Y-m-d'));
        $this->assertSame('Copper suits warm skin.', $autumn->body);
        $this->assertSame($this->org->id, (int) $autumn->organization_id);
        // The category sitemap is never asked for; robots.txt keeps the disallowed article out.
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'category-sitemap'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/blog/secret'));
    }

    public function test_a_site_with_only_a_feed_lists_the_feeds_articles(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => '<html><head><title>Lumière</title><link rel="alternate" type="application/rss+xml" href="/feed/"></head><body><a href="/prices">Prices</a></body></html>',
            self::SITE . '/feed/' => '<?xml version="1.0"?><rss version="2.0"><channel><item><title>Autumn</title><link>' . self::SITE . '/2026/09/autumn/</link><pubDate>Tue, 01 Sep 2026 10:00:00 +0000</pubDate></item></channel></rss>',
            self::SITE . '/2026/09/autumn/' => self::html('Autumn colours'),
            self::SITE . '/prices' => self::html('Prices'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertSame([self::SITE . '/2026/09/autumn/'], $this->listed($site, 'article'));
        $this->assertSame([self::SITE . '/', self::SITE . '/prices'], $this->listed($site, 'page'));
    }

    public function test_a_site_with_only_a_blog_page_lists_the_articles_it_links(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog">Blog</a> <a href="/about">About</a></p>'),
            self::SITE . '/blog' => self::html('Blog', '<p><a href="/blog/a">A</a> <a href="/blog/b">B</a> <a href="/blog/page/2">Older</a></p>'),
            self::SITE . '/blog/a' => self::html('Post A'),
            self::SITE . '/blog/b' => self::html('Post B'),
            self::SITE . '/about' => self::html('About us'),
        ]);
        $site = $this->scan($this->site());

        $this->assertEqualsCanonicalizing([self::SITE . '/blog/a', self::SITE . '/blog/b'], $this->listed($site, 'article'));
        $this->assertSame([self::SITE . '/', self::SITE . '/about'], $this->listed($site, 'page'));
    }

    public function test_html_answered_for_robots_and_sitemap_is_not_taken_for_them(): void
    {
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => ['<html><body>Welcome</body></html>', 200, ['Content-Type' => 'text/html']],
            self::SITE . '/sitemap.xml' => ['<html><body>Welcome</body></html>', 200, ['Content-Type' => 'text/html']],
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A</a></p>'),
            self::SITE . '/blog/a' => self::html('Post A'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertSame([self::SITE . '/blog/a'], $this->listed($site, 'article'));
    }

    public function test_the_redirected_home_host_is_the_site(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => ['', 301, ['Location' => 'https://www.lumiere.example/']],
            'https://www.lumiere.example/' => self::html('Lumière', '<p><a href="/blog/a">A</a> <a href="https://other.example/blog/x">X</a></p>'),
            'https://www.lumiere.example/blog/a' => self::html('Post A'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame(['https://www.lumiere.example/blog/a'], $this->listed($site, 'article'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'other.example'));
    }

    public function test_a_site_that_forbids_robots_is_blocked_and_nothing_else_is_asked(): void
    {
        $this->fakeWebsite([self::SITE . '/robots.txt' => "User-agent: *\nDisallow: /"]);
        $site = $this->scan($this->site());

        $this->assertSame('failed', $site->status);
        $this->assertSame('site_blocked', $site->error);
        Http::assertSentCount(1);
    }

    public function test_a_host_that_does_not_answer_is_unreachable_and_a_private_one_a_bad_address(): void
    {
        $this->fakeWebsite([], ['lumiere.example' => []]);
        $this->assertSame('site_unreachable', $this->scan($this->site())->error);

        $this->fakeWebsite([], ['private.example' => ['10.0.0.5']]);
        $site = ContentSite::where('planner_profile_id', $this->profile->id)->first();
        $site->forceFill(['url' => 'https://private.example', 'status' => 'scanning'])->save();
        $this->assertSame('bad_address', $this->scan($site)->error);
    }

    public function test_a_site_where_nothing_can_be_read_has_nothing_found(): void
    {
        $this->fakeWebsite([self::SITE . '/sitemap.xml' => self::urlset([self::SITE . '/tag/hair' => null])]);
        $site = $this->scan($this->site());

        $this->assertSame('failed', $site->status);
        $this->assertSame('nothing_found', $site->error);
    }

    public function test_at_most_the_hundred_newest_articles_and_thirty_pages(): void
    {
        $articles = [];
        $pages = [self::SITE . '/' => self::html('Home')];
        $entries = [];
        for ($i = 0; $i < 150; $i++) {
            $url = self::SITE . "/blog/p{$i}";
            $entries[$url] = date('Y-m-d', strtotime('2026-01-01 +' . $i . ' days'));
            $articles[$url] = self::html("Post {$i}");
        }
        $pageEntries = [];
        for ($i = 0; $i < 40; $i++) {
            $pageEntries[self::SITE . "/page-{$i}"] = null;
            $pages[self::SITE . "/page-{$i}"] = self::html("Page {$i}");
        }
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => 'Sitemap: ' . self::SITE . '/sitemap_index.xml',
            self::SITE . '/sitemap_index.xml' => self::index([self::SITE . '/post-sitemap.xml', self::SITE . '/page-sitemap.xml']),
            self::SITE . '/post-sitemap.xml' => self::urlset($entries),
            self::SITE . '/page-sitemap.xml' => self::urlset($pageEntries),
        ] + $articles + $pages);
        $site = $this->scan($this->site());

        $listed = $this->listed($site, 'article');
        $this->assertCount(ContentSiteScan::MAX_ARTICLES, $listed);
        $this->assertContains(self::SITE . '/blog/p149', $listed);
        $this->assertNotContains(self::SITE . '/blog/p49', $listed);
        $this->assertCount(ContentSiteScan::MAX_PAGES, $this->listed($site, 'page'));
        $this->assertContains(self::SITE . '/', $this->listed($site, 'page'));
    }

    public function test_a_new_scan_replaces_the_list_but_keeps_promoted_pages(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A</a> <a href="/blog/b">B</a> <a href="/blog/d">D</a></p>'),
            self::SITE . '/blog/a' => self::html('A'), self::SITE . '/blog/b' => self::html('B'), self::SITE . '/blog/d' => self::html('D'),
        ]);
        $site = $this->scan($this->site());
        $b = ContentSitePage::where('url', self::SITE . '/blog/b')->first();
        $this->makePost(['site_page_id' => $b->id]);

        $this->travel(1)->days();
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A again</a> <a href="/blog/c">C</a></p>'),
            self::SITE . '/blog/a' => self::html('A, updated'), self::SITE . '/blog/c' => self::html('C'),
        ]);
        $site->forceFill(['status' => 'scanning', 'scan_token' => 'token-2'])->save();
        $site = $this->scan($site, false, 'token-2');

        $this->assertEqualsCanonicalizing([self::SITE . '/blog/a', self::SITE . '/blog/b', self::SITE . '/blog/c'], $this->listed($site, 'article'));
        $this->assertSame('A, updated', ContentSitePage::where('url', self::SITE . '/blog/a')->value('title'));
        $this->assertTrue($b->fresh()->last_seen_at->lt($site->scanned_at));
        $this->assertSame(2, $site->articles_count);
    }

    public function test_the_summary_is_written_and_fills_only_empty_brand_fields(): void
    {
        $this->wordpressSite();
        $this->profile->update(['usp' => 'Our own USP']);
        $fake = $this->fakeSummary(['summary' => 'Lumière cuts and colours hair in Riga.', 'brand_summary' => 'A salon in Riga.', 'usp' => 'Colour experts', 'mission' => null]);
        $site = $this->scan($this->site(), true);

        $this->assertSame('Lumière cuts and colours hair in Riga.', $site->summary);
        $this->assertNotNull($site->summary_updated_at);
        $this->assertFalse($site->summary_edited);
        $this->assertNull($site->summary_note);
        $this->assertSame('A salon in Riga.', $this->profile->fresh()->brand_summary);
        $this->assertSame('Our own USP', $this->profile->fresh()->usp);
        // The pages, home first; never the articles.
        $this->assertSame([self::SITE . '/', self::SITE . '/services/'], array_column($fake->calls[0], 'url'));
        $this->assertSame('Hair and colour in Riga.', $fake->calls[0][0]['text']);
    }

    public function test_a_used_up_budget_or_a_failing_ai_keeps_the_list_and_says_why(): void
    {
        $this->wordpressSite();
        $this->setAiCap(100, 100);
        $fake = $this->fakeSummary();
        $site = $this->scan($this->site(), true);
        $this->assertSame('ready', $site->status);
        $this->assertSame('ai_budget_used_up', $site->summary_note);
        $this->assertSame([], $fake->calls);

        $this->setAiCap(100000, 0);
        $this->fakeSummary(null, new \RuntimeException('provider down'));
        $site->forceFill(['status' => 'scanning'])->save();
        $this->assertSame('ai_failed', $this->scan($site, true)->summary_note);
    }

    public function test_without_update_summary_the_ai_is_not_asked(): void
    {
        $this->wordpressSite();
        $fake = $this->fakeSummary();
        $site = $this->scan($this->site(), false);

        $this->assertSame([], $fake->calls);
        $this->assertNull($site->summary);
    }

    public function test_the_reading_stops_after_its_time(): void
    {
        $pages = [self::SITE . '/' => self::html('Home')];
        foreach (['about', 'services', 'prices', 'contact', 'team'] as $page) {
            $pages[self::SITE . '/' . $page] = self::html(ucfirst($page));
        }
        $this->fakeWebsite([self::SITE . '/sitemap.xml' => self::urlset(array_fill_keys(array_keys($pages), null))] + $pages);
        $seconds = 0;
        $site = $this->scan($this->site(), false, 'token-1', function () use (&$seconds) {
            return $seconds += 100;
        });

        $this->assertSame(4, $site->pages_count);
    }

    public function test_language_copies_are_skipped_and_untyped_addresses_say_what_they_are(): void
    {
        $article = self::html('How to reduce no-shows', '<p>Remind people.</p>', ['og:type' => 'article', 'article:published_time' => '2026-07-10']);
        $this->fakeWebsite([
            self::SITE . '/sitemap.xml' => self::urlset([
                self::SITE . '/' => '2026-09-04', self::SITE . '/about-us' => '2026-10-02', self::SITE . '/how-to-reduce-no-shows' => '2026-09-04',
                self::SITE . '/fr/' => '2026-09-04', self::SITE . '/fr/about-us' => '2026-10-02', self::SITE . '/fr/how-to-reduce-no-shows' => '2026-09-04',
            ]),
            self::SITE . '/' => self::html('Lumière'),
            self::SITE . '/about-us' => self::html('About us'),
            self::SITE . '/how-to-reduce-no-shows' => $article,
        ]);
        $site = $this->scan($this->site());

        $this->assertSame([self::SITE . '/how-to-reduce-no-shows'], $this->listed($site, 'article'));
        $this->assertSame('2026-07-10', ContentSitePage::where('url', self::SITE . '/how-to-reduce-no-shows')->first()->published_at->format('Y-m-d'));
        $this->assertSame([self::SITE . '/', self::SITE . '/about-us'], $this->listed($site, 'page'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/fr/'));
    }

    public function test_an_address_naming_a_language_scans_that_language(): void
    {
        $this->fakeWebsite([
            self::SITE . '/sitemap.xml' => self::urlset([self::SITE . '/' => null, self::SITE . '/about-us' => null, self::SITE . '/fr/' => null, self::SITE . '/fr/about-us' => null]),
            self::SITE . '/' => self::html('Lumière'),
            self::SITE . '/fr/' => self::html('Lumière FR'),
            self::SITE . '/fr/about-us' => self::html('À propos'),
        ]);
        $site = $this->scan($this->site(self::SITE . '/fr/'));

        $this->assertSame([self::SITE . '/fr/', self::SITE . '/fr/about-us'], $this->listed($site, 'page'));
        $this->assertSame([], $this->listed($site, 'article'));
    }

    public function test_untyped_addresses_fill_the_reads_left_after_pages_and_articles(): void
    {
        $pages = [self::SITE . '/' => self::html('Home')];
        $entries = [self::SITE . '/' => null];
        for ($i = 0; $i < 140; $i++) {
            $url = self::SITE . "/note-{$i}";
            $entries[$url] = date('Y-m-d', strtotime('2026-01-01 +' . $i . ' days'));
            $pages[$url] = self::html("Note {$i}");
        }
        $this->fakeWebsite([self::SITE . '/sitemap.xml' => self::urlset($entries)] + $pages);
        $site = $this->scan($this->site());

        $listed = $this->listed($site, 'page');
        $this->assertCount(ContentSiteScan::MAX_READS, $listed);
        $this->assertContains(self::SITE . '/note-139', $listed);
        $this->assertNotContains(self::SITE . '/note-0', $listed);
    }

    /** Final review: a page that redirects to another site (a booking provider) must not feed that site's words to the AI. */
    public function test_a_page_that_redirects_off_the_site_is_not_kept(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/book">Book</a> <a href="/about">About</a></p>'),
            self::SITE . '/book' => ['', 302, ['Location' => 'https://booking.example/lumiere']],
            'https://booking.example/lumiere' => self::html('BookingCo', '<p>The best booking software.</p>'),
            self::SITE . '/about' => self::html('About us'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame([self::SITE . '/', self::SITE . '/about'], $this->listed($site, 'page'));
    }

    public function test_a_scan_whose_token_is_no_longer_the_sites_writes_nothing(): void
    {
        $this->wordpressSite();
        $site = $this->site(self::SITE, 'token-2');
        $this->scan($site, false, 'token-1');

        $this->assertSame(0, ContentSitePage::where('site_id', $site->id)->count());
        $this->assertSame('scanning', $site->fresh()->status);
        $this->assertSame('token-2', $site->fresh()->scan_token);
    }
}
