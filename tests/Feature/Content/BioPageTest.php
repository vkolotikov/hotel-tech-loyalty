<?php

namespace Tests\Feature\Content;

use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Services\Content\ContentLinks;
use App\Support\LandingSlug;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\Concerns\WritesHotelSettings;
use Tests\TestCase;

/** A brand's link-in-bio page on the public host (spec 2026-10-19 §6.1–§6.3). Today is Monday 5 October 2026, 06:00 UTC. */
class BioPageTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, WritesHotelSettings;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function page(array $fields = []): ContentBioPage
    {
        return ContentBioPage::create($fields + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'slug' => 'lumiere', 'is_on' => true]);
    }

    /** A button; a null address makes one whose code is switched off (a removed button). */
    private function button(ContentBioPage $page, string $label, ?string $destination, int $position): ContentBioButton
    {
        $link = ContentLinks::make($this->org->id, $this->brandId, null, $destination ?? 'https://lumiere.example/old', ContentLinks::BUTTON_TAGS);
        if ($destination === null) {
            $link->update(['destination' => null]);
        }

        return ContentBioButton::create(['bio_page_id' => $page->id, 'link_id' => $link->id, 'label' => $label, 'position' => $position]);
    }

    /** A published post, with a live Link unless told not to. */
    private function published(array $fields, ?string $destination = 'https://lumiere.example/post'): ContentPlannerPost
    {
        $post = $this->makePost($fields + ['status' => 'published', 'published_at' => now()]);
        if ($destination !== null) {
            ContentLinks::set($post, $destination);
        }

        return $post;
    }

    private function visit(string $name)
    {
        return $this->get('http://' . config('landing.host') . '/links/' . $name);
    }

    public function test_an_off_page_or_an_unknown_name_is_the_hosts_404(): void
    {
        $this->page(['is_on' => false]);
        $this->visit('lumiere')->assertNotFound();
        $this->visit('nobody-here')->assertNotFound();
        $this->visit('Lumiere')->assertNotFound();
        $this->visit('lumiere/more')->assertNotFound();
        $this->assertTrue(LandingSlug::isReserved('links'), '"links" is a reserved landing name (spec D9)');
    }

    public function test_an_on_page_shows_its_head_and_live_buttons_in_order_and_is_cached_for_five_minutes(): void
    {
        $page = $this->page(['title' => 'Lumière', 'line' => 'Hair & colour in Riga']);
        $this->button($page, 'Gift cards', 'https://lumiere.example/gifts', 1);
        $this->button($page, 'Book now', 'https://lumiere.example/book', 0);
        $this->button($page, 'Old offer', null, 2);

        $response = $this->visit('lumiere')->assertOk()
            ->assertSee('<title>Lumière</title>', false)
            ->assertSee('<meta name="description" content="Hair &amp; colour in Riga">', false)
            ->assertSee('<meta property="og:title" content="Lumière">', false)
            ->assertSeeInOrder(['Book now', 'Gift cards'])
            ->assertDontSee('Old offer')
            ->assertDontSee('<script', false)
            ->assertDontSee('style="', false)
            ->assertSee('/landing/content-public.css?v=', false);
        $book = ContentLink::whereKey(ContentBioButton::where('label', 'Book now')->value('link_id'))->value('code');
        $response->assertSee('href="' . route('content.go', ['code' => $book]) . '"', false);
        $cache = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('public', $cache);
        $this->assertStringContainsString('max-age=300', $cache);
        $this->assertSame([], $response->headers->getCookies());
        $this->assertStringContainsString("default-src 'self'", (string) $response->headers->get('Content-Security-Policy'));

        // The title is the brand's name until a manager writes one.
        $page->update(['title' => null]);
        $this->visit('lumiere')->assertSee('<title>Lumière Salon</title>', false);
    }

    public function test_the_buttons_take_the_brand_colour_with_readable_text_through_the_nonce(): void
    {
        $this->page();
        $style = function (string $brand, string $on): void {
            $response = $this->visit('lumiere')->assertOk();
            preg_match("/'nonce-([^']+)'/", (string) $response->headers->get('Content-Security-Policy'), $m);
            $response->assertSee('<style nonce="' . $m[1] . '">:root{--cp-brand: ' . $brand . ';--cp-on-brand: ' . $on . ';}</style>', false);
        };
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => '#1D4ED8']);
        $style('#1d4ed8', '#ffffff');
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => '#f5d90a']);
        $style('#f5d90a', '#14161a');
        // No brand colour: Content's accent, then the platform's own.
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => null]);
        DB::table('hotel_settings')->insert($this->settingRow(['organization_id' => $this->org->id, 'key' => 'primary_color', 'value' => '#7c3aed', 'group' => 'appearance', 'created_at' => now(), 'updated_at' => now()]));
        $style('#7c3aed', '#ffffff');
        DB::table('hotel_settings')->where('key', 'primary_color')->delete();
        $style('#2d6a4f', '#ffffff');
    }

    public function test_the_logo_is_the_brands_then_the_organisations_then_initials(): void
    {
        $this->page();
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => 'https://cdn.example/brand.png']);
        DB::table('organizations')->where('id', $this->org->id)->update(['logo_url' => 'https://cdn.example/org.png']);
        $this->visit('lumiere')
            ->assertSee('<img class="cp-logo" src="https://cdn.example/brand.png" alt="Lumière Salon logo" width="88" height="88">', false)
            ->assertSee('<meta property="og:image" content="https://cdn.example/brand.png">', false);
        // A picture the page's policy would block (not https) is passed over.
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => 'http://insecure.example/brand.png']);
        $this->visit('lumiere')->assertSee('src="https://cdn.example/org.png"', false)->assertDontSee('insecure.example', false);
        DB::table('organizations')->where('id', $this->org->id)->update(['logo_url' => null]);
        $this->visit('lumiere')->assertSee('<span class="cp-logo cp-initials" aria-hidden="true">LS</span>', false)->assertDontSee('og:image', false);
    }

    public function test_latest_posts_show_one_tile_per_version_group_and_only_published_posts_with_a_live_link(): void
    {
        $this->page();
        $original = $this->published(['title' => 'Autumn on Instagram', 'published_at' => now()->subDays(3)]);
        $this->published(['title' => 'Autumn on LinkedIn', 'platform' => 'linkedin', 'group_id' => $original->id, 'published_at' => now()->subDay()]);
        $original->forceFill(['group_id' => $original->id])->save();
        $cleared = $this->published(['title' => 'Cleared link', 'published_at' => now()->subHours(2)]);
        ContentLinks::set($cleared, null);
        $draft = $this->makePost(['status' => 'draft', 'title' => 'A draft']);
        ContentLinks::set($draft, 'https://lumiere.example/draft');
        $this->published(['title' => 'No link at all'], null);
        $pictured = $this->published(['title' => 'Gift cards are here', 'published_at' => now()->subHour()]);
        ContentPlannerVisualBrief::create(['post_id' => $pictured->id, 'image_url' => 'https://cdn.example/gift.jpg', 'image_status' => 'ready']);
        [$secondBrand, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $secondBrand, 'platform' => 'instagram', 'status' => 'published', 'title' => 'Second brand post', 'published_at' => now()]);
        ContentLinks::set($theirs, 'https://second.example/');

        $response = $this->visit('lumiere')->assertOk()
            ->assertSee('Latest posts')
            ->assertSeeInOrder(['Gift cards are here', 'Autumn on LinkedIn'])
            ->assertDontSee('Autumn on Instagram')->assertDontSee('Cleared link')->assertDontSee('A draft')
            ->assertDontSee('No link at all')->assertDontSee('Second brand post')
            ->assertSee('<img src="https://cdn.example/gift.jpg" alt="Gift cards are here" loading="lazy">', false)
            ->assertSee('<time datetime="2026-10-04">4 Oct 2026</time>', false);
        $response->assertSee('href="' . route('content.go', ['code' => ContentLinks::ofPost($pictured)->code, 'via' => 'bio']) . '"', false);
    }

    public function test_at_most_twelve_tiles_and_none_when_latest_posts_are_switched_off(): void
    {
        $page = $this->page();
        foreach (range(1, 13) as $n) {
            $this->published(['title' => "Post number {$n}", 'published_at' => now()->subMinutes(100 - $n)]);
        }
        $response = $this->visit('lumiere')->assertOk();
        $this->assertSame(12, substr_count((string) $response->getContent(), 'class="cp-tile"'));
        $response->assertSee('>Post number 13<', false)->assertDontSee('>Post number 1<', false);

        $page->update(['show_posts' => false]);
        $this->visit('lumiere')->assertOk()->assertDontSee('Latest posts')->assertDontSee('Post number 13');
    }

    public function test_the_words_are_in_the_brands_content_language(): void
    {
        $page = $this->page();
        $this->button($page, 'Записаться', 'https://lumiere.example/book', 0);
        $this->published(['title' => 'Осень']);
        $this->profile->update(['default_language' => 'ru']);
        $this->visit('lumiere')->assertSee('<html lang="ru">', false)->assertSee('Последние публикации')->assertSee('aria-label="Ссылки"', false);
        $this->profile->update(['default_language' => 'it']);
        $this->visit('lumiere')->assertSee('<html lang="en">', false)->assertSee('Latest posts');
    }

    // 5B-1 review: og:image must be absolute for a logo stored as a path (a preview robot cannot resolve a path).
    public function test_a_logo_stored_as_a_path_gives_an_absolute_og_image(): void
    {
        $this->page();
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => '/storage/logos/brand.png']);
        $this->visit('lumiere')
            ->assertSee('src="/storage/logos/brand.png"', false)
            ->assertSee('<meta property="og:image" content="http://' . config('landing.host') . '/storage/logos/brand.png">', false);
    }

    // 5B-1 review (test gaps): HEAD and robots get the page as people do; the page allocates no session.
    public function test_head_and_robots_get_the_page_and_no_session_is_made(): void
    {
        $this->page();
        $this->call('HEAD', 'http://' . config('landing.host') . '/links/lumiere')->assertOk();
        $this->withHeaders(['User-Agent' => 'facebookexternalhit/1.1'])->get('http://' . config('landing.host') . '/links/lumiere')->assertOk()->assertSee('og:title', false);
        $this->flushHeaders();
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);
        try {
            $response = $this->visit('lumiere')->assertOk();
            $this->assertSame([], $response->headers->getCookies());
            $this->assertSame([], array_values(array_diff(scandir($dir), ['.', '..'])), 'the bio page allocated a session');
        } finally {
            array_map('unlink', glob($dir . '/*'));
            @rmdir($dir);
        }
    }
}
