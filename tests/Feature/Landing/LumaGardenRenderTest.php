<?php
namespace Tests\Feature\Landing;

use App\Landing\SectionType;
use App\Models\Brand;
use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Luma Garden — the second HOSPITALITY kit, rendered as a real template.
 *
 * The acceptance criterion for this template is not a number in this file: it
 * is that the page a tenant gets is the page the author drew, and that is
 * settled by the screenshot pair in the hospitality report. What THIS file is
 * for is everything a screenshot cannot see — that a hostile stored value
 * cannot take the page down or reach the DOM unescaped, that a band with
 * nothing in it does not render at all, that not one control on the page
 * points somewhere it cannot go, that the author's own stylesheet and
 * photographs are still the ones we ship, and that THERE IS NO TEAM BAND
 * anywhere on this design.
 *
 * Every hostile-value battery that protects the other five templates is
 * repeated here, because they are independent sets of Blade files and a guard
 * that only five of them make is a guard the sixth does not have.
 */
class LumaGardenRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/hospitality/02-luma-garden';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'restaurant'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'luma-garden',
            'template_key' => 'luma_garden', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Some evenings']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        // The rooms band is one of the author's ten but no industry seeds a
        // gallery row, so a page meant to look like his has to carry one —
        // exactly as a tenant adds it from the picker.
        if (isset($content['gallery_1'])) {
            $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 7]);
        }

        return $page;
    }

    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'Luma', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/luma-garden')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/luma-garden')->getStatusCode();
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing booking panel is gated to hotel until
     * phase 6 (`PageContent::count('booking')`), and this author writes five of
     * his strings in that band.
     */
    private function seedLikeTheKit(string $industry = 'restaurant'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Luma Garden',
            'phone' => '+371 20 000 212', 'email' => 'table@lumagarden.example',
            'address' => '12 Garden Lane', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Garden Lunch', 'A relaxed two- or three-course menu with market plates and a glass from the coast.', 42, null],
            ['Evening Menu', 'Five courses moving from the garden to the sea and finally to the open hearth.', 92, 150],
            ['Sunday Table', 'Large plates, chilled bottles and the pleasure of a long lunch without a schedule.', 68, null],
        ] as $i => [$name, $short, $price, $minutes]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Amelia S.', 5, 'It feels like a hidden courtyard somewhere much farther south. Beautiful produce, gracious service and a lunch that became an evening.'],
            ['Toms B.', 5, 'The garden menu is worth the trip on its own.'],
            ['Ilze R.', 5, 'Bright, generous cooking and a wine list with real character.'],
            ['Anders K.', 5, 'Unhurried, warm and beautifully judged.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'announcement' => [
                'text'      => 'The garden is open for late lunch ·',
                'cta_label' => 'Reserve a table',
            ],
            'hero' => [
                'kicker'          => 'Mediterranean light · Baltic season',
                'headline'        => "A table\nin the",
                'headline_accent' => 'light.',
                'subtext'         => 'Garden-grown herbs, coastal seafood and generous Mediterranean cooking, served beneath the olive trees from lunch into evening.',
                'cta_label'       => 'Reserve a table',
            ],
            'trust' => [
                'feature_1'         => 'Daily',
                'feature_1_caption' => 'garden harvest',
                'feature_2'         => '60',
                'feature_2_caption' => 'terrace places',
                'feature_3'         => '300+',
                'feature_3_caption' => 'Mediterranean wines',
            ],
            'services' => [
                'kicker'         => 'Choose the mood',
                'heading'        => "From bright lunch\nto golden hour.",
                'subtext'        => 'Each menu follows the garden and the coast: abundant produce, whole fish, open-fire cooking and desserts meant for sharing.',
                'price_prefix'   => 'From',
            ],
            'about' => [
                'kicker'  => 'The garden leads',
                'lead'    => "Picked nearby.\nFinished over fire.",
                'body'    => 'Chef Mara Ozola cooks with the brightness of the Mediterranean and the immediacy of Latvia’s short, vivid seasons. Plates are precise, generous and made to travel across the table.',
                'note_1'  => 'Produce from partner farms',
                'note_2'  => 'Daily Baltic catch',
                'note_3'  => 'Coastal and island wine list',
            ],
            'gallery_1' => [
                'kicker'         => 'Around the garden',
                'heading'        => "Every table catches\na different light.",
                'subtext'        => 'Come for an easy lunch, a celebration under the canopy or a private evening composed around your guests.',
                'caption_1'      => 'Terrace lunch',
                'caption_2'      => 'Golden-hour dinner',
            ],
            'reviews' => [
                'kicker' => 'A diner postcard',
            ],
            'faq' => [
                'kicker'  => 'Before your table',
                'heading' => 'A few useful things.',
                'q1' => 'Can you accommodate dietary requirements?',
                'a1' => 'Yes. Add them to your reservation and our team will confirm the best menu for your table.',
                'q2' => 'What happens when it rains?',
                'a2' => 'The garden is covered and heated when needed. In colder weather, service moves into our limestone dining room.',
                'q3' => 'Can we reserve for a larger group?',
                'a3' => 'Groups of eight or more are welcomed with a shared menu.',
            ],
            'booking' => [
                'kicker'          => 'Meet us in the light',
                'heading'         => "Your table in the garden\ncan start here.",
                'terms'           => 'Choose a date, service and party size to see live availability.',
                'cta_label'       => 'Reserve a table',
                'call_label'      => 'Groups of eight or more?',
            ],
            'contact' => [
                'descriptor'  => 'Mediterranean table · Riga',
                'email_label' => 'Email the restaurant',
                'legal_note'  => 'Fictional demonstration.',
            ],
        ], [], $industry);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/luma_garden/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/luma_garden/sections/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no section partials.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_it_ships_no_inline_script(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<script\b[^>]*>/i', $body, $matches);

        foreach ($matches[0] as $tag) {
            $this->assertTrue(str_contains($tag, 'src=') || str_contains($tag, 'application/ld+json'),
                "An inline <script> reached the page: {$tag}");
        }

        $this->assertDoesNotMatchRegularExpression('/\son[a-z]+\s*=/i', $body);
        $this->assertStringNotContainsString('javascript:', $body);
    }

    public function test_every_inline_style_block_carries_the_request_nonce(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent ───────────────────────────────────────────────────────

    /**
     * The tenant's colour is spent on the CLAY family — text and hairlines
     * everywhere this author uses it — and never on the pine, which is this
     * page's ink, nor on the sage, which is the story band's field. Both of
     * those carry type this page sets in white.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_a_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-clay:', $body);

        $this->assertStringNotContainsString('--color-pine:', $body);
        $this->assertStringNotContainsString('--color-sage:', $body);
        $this->assertStringNotContainsString('--color-sand:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own limestone page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-clay: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto a limestone page.');
    }

    // ─── No team band, anywhere ───────────────────────────────────────────

    /**
     * THE ONE STRUCTURAL DIFFERENCE FROM THE BEAUTY KITS, and the mechanism
     * that delivers it: no team.blade.php ships under this directory, so
     * `renders` — which is derived from the files on disk and never written
     * down — does not name it, and the editor's picker cannot offer it.
     */
    public function test_this_design_ships_no_team_partial_and_never_offers_the_band(): void
    {
        $this->assertFileDoesNotExist(resource_path('views/landing/luma_garden/sections/team.blade.php'));

        $renders = LandingOnboardingService::rendersFor('luma_garden');

        $this->assertNotContains('team', $renders, 'The catalogue offers a team band this design cannot draw.');
        $this->assertContains('services', $renders);
        $this->assertContains('gallery', $renders);
        $this->assertContains('text', $renders);

        $this->assertArrayNotHasKey('team', LandingOnboardingService::contentFieldsFor('luma_garden'));
        $this->assertNotContains('team', LandingOnboardingService::photoBlocksFor('luma_garden'));
    }

    /**
     * And a row that exists anyway — a page switched over from a design that
     * DID draw one — is silently dropped rather than 500ing or rendering an
     * empty band.
     */
    public function test_a_team_row_carried_over_from_another_design_renders_nothing(): void
    {
        $page = $this->seedLikeTheKit();
        $page->sections()->create(['key' => 'team', 'enabled' => true, 'sort' => 20]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('data-block="team"', $body);
    }

    /** A restaurant page created on this design is not seeded with the row either. */
    public function test_a_new_restaurant_page_on_this_design_is_not_seeded_with_a_team_row(): void
    {
        $seeded = LandingOnboardingService::seedSectionsFor(
            'luma_garden',
            \App\Landing\IndustryProfile::for('restaurant'),
        );

        $this->assertNotContains('team', $seeded);
        $this->assertContains('contact', $seeded, 'The footer hub band must still be seeded.');
        $this->assertSame(['hero', 'services', 'about', 'reviews', 'contact', 'announcement', 'trust', 'faq'], $seeded);
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'gallery', 'testimonials', 'faq', 'booking', 'footer', 'contact', 'assistant',
        ] as $block) {
            $this->assertStringContainsString('data-block="' . $block . '"', $body,
                "The kit's `{$block}` band is missing from the rendered page.");
        }
    }

    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement' => 'terrace-note',
            'header'       => 'garden-sticky',
            'hero'         => 'garden-split',
            'trust'        => 'garden-facts',
            'services'     => 'menu-cards',
            'story'        => 'ingredient-pairing',
            'gallery'      => 'dining-moments',
            'testimonials' => 'diner-postcard',
            'faq'          => 'table-questions',
            'booking'      => 'garden-invitation',
            'footer'       => 'garden-hub',
        ] as $block => $variant) {
            $this->assertStringContainsString(
                'data-block="' . $block . '" data-variant="' . $variant . '"',
                $body,
                "The author's `{$block}` variant is not the one rendered.",
            );
        }
    }

    public function test_a_bare_page_renders_the_designs_photographs_and_no_empty_bands(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/luma_garden/assets/hero-garden.webp', $body);
        $this->assertStringNotContainsString('hero--solo', $body);

        foreach (['data-block="story"', 'data-block="gallery"', 'data-block="testimonials"', 'data-block="faq"'] as $absent) {
            $this->assertStringNotContainsString($absent, $body);
        }
    }

    public function test_an_empty_page_ships_no_empty_heading(): void
    {
        $page = $this->published();
        $page->update(['content' => [], 'seo' => []]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertDoesNotMatchRegularExpression('/<h1[^>]*>\s*<\/h1>/', $body);
    }

    public function test_a_disabled_band_does_not_render(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->sections()->where('key', 'about')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="story"', $body);
        $this->assertStringNotContainsString('Finished over fire.', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Luma'],
            'text_1' => [
                'kicker'  => 'A note',
                'heading' => 'What we believe',
                'body'    => "One paragraph.\n\nAnd a second.",
                'caption' => 'The corner of the room',
            ],
        ]);
        $page->sections()->create(['key' => 'text_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="text"', $body);
        $this->assertStringContainsString('id="text_1"', $body);
        $this->assertStringContainsString('And a second.', $body);
    }

    // ─── The author's own strings ─────────────────────────────────────────

    /**
     * The hero's heading is Copy::heading()'s ORDINARY case — the break in the
     * middle and the emphasis as the tail of the second line, which is exactly
     * what this author draws: `A table<br>in the <em>light.</em>`. Kits 01 and
     * 03 put the emphasis on a line of its own; one primitive draws both.
     */
    public function test_the_hero_heading_emphasises_the_tail_of_the_second_line(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('A table<br>in the <em>light.</em>', $this->body());
    }

    public function test_the_authors_two_line_headings_break_where_he_breaks_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('From bright lunch<br>to golden hour.', $body);
        $this->assertStringContainsString('Picked nearby.<br>Finished over fire.', $body);
        $this->assertStringContainsString('Every table catches<br>a different light.', $body);
        $this->assertStringContainsString('Your table in the garden<br>can start here.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'A table',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The menu cards ───────────────────────────────────────────────────

    public function test_the_menu_cards_are_the_services_screens_own_and_carry_the_price_prefix(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h3>Garden Lunch</h3>', $body);
        $this->assertStringContainsString('A relaxed two- or three-course menu', $body);
        $this->assertStringContainsString('<strong>From €42</strong>', $body);
        $this->assertStringContainsString('<strong>From €92</strong>', $body);

        // The ordinal is derived, never stored — the author prints exactly
        // these two digits.
        $this->assertStringContainsString('<p class="menu-grid__number" aria-hidden="true">01</p>', $body);
        $this->assertStringContainsString('<p class="menu-grid__number" aria-hidden="true">03</p>', $body);
    }

    /**
     * His foam card is the SECOND of three, and the tint cycles from there:
     * every third card starting at the second. At his own length that is
     * exactly one tinted card in the middle.
     */
    public function test_the_featured_tint_falls_on_the_authors_own_card(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, 'class="menu-grid__featured"'));
        $this->assertMatchesRegularExpression(
            '#menu-grid__featured[^>]*>\s*<p class="menu-grid__number" aria-hidden="true">02</p>#',
            $body,
        );
    }

    /**
     * `duration_minutes` IS printed on this design, in the meta row where the
     * author writes a service window ("Wed–Sun · 12:00") the platform has no
     * field for. A menu with no duration leaves the cell empty rather than
     * dropping the row, because it is what holds the card's ruled bottom edge.
     */
    public function test_a_menu_with_a_duration_prints_it_and_one_without_keeps_its_rule(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<span>150 min</span>', $body);
        $this->assertStringContainsString('<span></span>', $body);
    }

    public function test_a_menu_with_no_price_prints_no_price(): void
    {
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Bar snacks',
            'sort_order' => 9, 'is_active' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h3>Bar snacks</h3>', $body);
        $this->assertSame(3, substr_count($body, '<strong>From €'));
    }

    public function test_the_card_grid_says_how_many_menus_it_has(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<div class="menu-grid" data-count="3">', $this->body());
    }

    // ─── The kitchen list ─────────────────────────────────────────────────

    public function test_the_story_draws_the_authors_ruled_list(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<li>Produce from partner farms</li>', $body);
        $this->assertStringContainsString('<li>Coastal and island wine list</li>', $body);
    }

    public function test_a_story_with_no_lines_draws_no_list(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'about' => ['body' => 'A garden room.']]);

        $this->assertStringNotContainsString('<ul>', $this->body());
    }

    /** This author draws no numbered ledger, so its leaves are not offered. */
    public function test_this_design_offers_no_numbered_ledger(): void
    {
        $fields = LandingOnboardingService::contentFieldsFor('luma_garden');

        $this->assertNotContains('fact_1', $fields['about']);
        $this->assertNotContains('fact_1_caption', $fields['about']);
        $this->assertContains('note_1', $fields['about']);
        $this->assertNotContains('note_label', $fields['about']);
    }

    // ─── The occasions band ───────────────────────────────────────────────

    /**
     * The one band that is not the author's composition: his cards are text
     * only and a `gallery` band on this platform IS its pictures. The card
     * frame, the ordinal and the caption-as-heading are his; the photograph is
     * the tenant's.
     */
    public function test_the_occasions_band_draws_the_tenants_photographs_in_the_authors_cards(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="occasion-list" data-count="2">', $body);
        $this->assertStringContainsString('landing/luma_garden/assets/hero-garden.webp', $body);
        $this->assertStringContainsString('<h3>Terrace lunch</h3>', $body);
        $this->assertStringContainsString('<h3>Golden-hour dinner</h3>', $body);
        $this->assertStringContainsString('<span aria-hidden="true">01</span>', $body);
    }

    public function test_a_tile_with_no_caption_draws_no_heading(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'gallery_1' => [
            'heading' => 'The garden',
            'image_1' => '/storage/one.webp',
            'image_2' => '/storage/two.webp',
            'caption_1' => 'The terrace',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<h3>The terrace</h3>', $body);
        $this->assertSame(1, substr_count($body, '<h3>'));
    }

    public function test_the_occasions_band_counts_only_readable_photographs(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'gallery_1' => [
            'heading' => 'The garden',
            'image_1' => '/storage/one.webp',
            'image_2' => 'javascript:alert(1)',
            'image_3' => ['nope'],
            'image_4' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Two tiles: the tenant's own readable one, and the design's own
        // photograph restored under the second slot (template fidelity 4.1).
        $this->assertStringContainsString('<div class="occasion-list" data-count="2">', $body);
        $this->assertStringContainsString('landing/luma_garden/assets/langoustine.webp', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    // ─── The diner postcard ───────────────────────────────────────────────

    public function test_the_postcard_draws_one_review_with_the_aggregate_beside_it(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('It feels like a hidden courtyard', $body);
        // ONE quote in the band, whatever the JSON-LD in <head> publishes.
        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('Amelia S.', $body);
    }

    public function test_a_restaurant_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Luma Garden', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Luma'], 'reviews' => ['kicker' => 'A diner postcard']]);
        $body = $this->body();

        $this->assertStringNotContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('Lovely.', $body);
    }

    /** The eyebrow IS this band's heading — the author draws no h2 here. */
    public function test_the_postcard_names_itself_with_its_eyebrow(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<h2 class="eyebrow">A diner postcard</h2>', $this->body());
    }

    // ─── The trust strip ──────────────────────────────────────────────────

    public function test_the_trust_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('<strong>5.0</strong><span>recent diner rating</span>', $body);
        $this->assertStringContainsString('data-count="4"', $body);
    }

    /**
     * A highlight with no caption is printed in the CAPTION's small type
     * rather than in the display face: `<strong>` here is a 2.25rem Newsreader
     * figure and a whole sentence set in it would break the strip.
     */
    public function test_a_highlight_with_no_caption_is_printed_small(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'trust' => [
            'feature_1' => 'Seasonal garden menus',
            'feature_2' => '60',
            'feature_2_caption' => 'terrace places',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<div><span>Seasonal garden menus</span></div>', $body);
        $this->assertStringContainsString('<div><strong>60</strong><span>terrace places</span></div>', $body);
    }

    public function test_a_page_with_no_rating_and_no_highlights_draws_no_strip(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']]);

        $this->assertStringNotContainsString('data-block="trust"', $this->body());
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

    /** This author opens NONE of his pairs, which is the opposite of kit 03-beauty. */
    public function test_no_faq_pair_starts_open(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<details>', $body);
        $this->assertStringNotContainsString('<details open', $body);
    }

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'faq' => [
            'heading' => 'The useful details.',
            'q1' => 'Is there a dress code?', 'a1' => 'No formal code.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Is there a dress code?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    /**
     * Template fidelity 6.6: a restaurant with nothing bookable on file
     * renders no band and no dead hook — the capability gate (PageContent::
     * bookingMode()), not the old industry gate. The Reserve controls dial
     * the phone instead and say so (6.4).
     */
    public function test_a_restaurant_page_with_nothing_bookable_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000212"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /** 6.1: a restaurant that can take a reservation online gets the band, on the appointment widget. */
    public function test_a_bookable_restaurant_page_wires_every_hook_to_the_appointment_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        \App\Models\ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'The garden', 'is_active' => true,
        ]);
        $this->seedBookableSchedule();

        $body = $this->body();

        $this->assertStringContainsString('data-block="booking"', $body);

        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/services-widget?', $tag);
            $this->assertStringContainsString('source=landing', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
            $this->assertStringNotContainsString('/booking-widget', $tag);
        }

        $this->assertStringContainsString('Reserve a table', $body);
        $this->assertStringNotContainsString('Call to book', $body);
    }

    public function test_a_hotel_page_wires_every_booking_hook_to_the_real_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('data-block="booking"', $body);

        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/booking-widget', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
        }
    }

    public function test_the_closing_panel_prints_the_authors_phone_line(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Groups of eight or more?', $body);
        $this->assertStringContainsString('href="tel:+37120000212"', $body);
        $this->assertStringContainsString('+371 20 000 212', $body);
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Diner notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
    }

    public function test_the_chat_launcher_mounts_in_the_reserved_slot(): void
    {
        ChatWidgetConfig::create([
            'organization_id' => 1, 'widget_key' => 'wk-123', 'is_enabled' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-ai-widget-slot', $body);
        $this->assertStringContainsString('class="ai-panel"', $body);
        $this->assertStringContainsString('class="ai-launcher"', $body);
        $this->assertStringContainsString('/chat-frame/wk-123', $body);
    }

    public function test_no_chat_widget_leaves_the_slot_reserved_and_empty(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-ai-widget-slot', $body);
        $this->assertStringNotContainsString('ai-panel', $body);
    }

    // ─── The footer hub ───────────────────────────────────────────────────

    public function test_the_hub_says_how_many_columns_it_really_has(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('footer-hub footer-hub--2', $this->body());
    }

    public function test_a_named_social_destination_opens_the_follow_column(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => ['social_instagram' => 'https://instagram.com/lumagarden'],
        ])]);

        $body = $this->body();

        $this->assertStringContainsString('footer-hub--3', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
    }

    public function test_a_social_leaf_that_is_not_a_web_address_draws_no_icon(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => ['social_facebook' => 'instagram.com/us'],
        ])]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-social-platform', $body);
        $this->assertStringNotContainsString('footer-hub__social', $body);
    }

    public function test_the_legal_line_carries_the_tenants_own_note(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Luma Garden. Fictional demonstration.', $body);
        $this->assertStringNotContainsString('>Privacy<', $body);
        $this->assertStringNotContainsString('>Accessibility<', $body);
    }

    // ─── The lockup ───────────────────────────────────────────────────────

    /**
     * THE TAIL EMPHASIS, and it belongs to this design alone. The author
     * writes `Luma <em>Garden</em>` in his header and again in his footer,
     * with the last word set in his clay accent; Copy::wordmark() derives it
     * from the business's own name, out of escaped fragments.
     */
    public function test_the_wordmark_sets_the_last_word_in_the_authors_em(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<strong>Luma <em>Garden</em></strong>'),
            'The tail emphasis is missing from the header lockup, the footer lockup, or both.');
    }

    /** A one-word name is not italicised whole — that is a slanted name. */
    public function test_a_one_word_business_name_gets_no_emphasis(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Luma', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Luma']]);
        $body = $this->body();

        $this->assertStringContainsString('<strong>Luma</strong>', $body);
        $this->assertStringNotContainsString('<em>', $body);
    }

    /** And an ampersand still wins: it is the more specific signal. */
    public function test_a_conjunction_beats_the_tail(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Hart & Bloom', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Hart']]);
        $body = $this->body();

        $this->assertStringContainsString('<strong>Hart <em>&amp;</em> Bloom</strong>', $body);
        $this->assertStringNotContainsString('<em>Bloom</em>', $body);
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Luma <script>x</script>', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Luma']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('Luma <em>&lt;script&gt;x&lt;/script&gt;</em>', $body);
    }

    public function test_the_brands_own_logo_replaces_the_monogram(): void
    {
        $this->makeBrand('/storage/brand/luma.svg');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('<span aria-hidden="true"><img src="/storage/brand/luma.svg"', $body);
        $this->assertStringNotContainsString('aria-hidden="true">L</span>', $body);
    }

    public function test_a_hostile_brand_logo_never_reaches_the_page(): void
    {
        $this->makeBrand('javascript:alert(1)');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringContainsString('aria-hidden="true">L</span>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Luma']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'gallery_1' => 'not an array']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Luma', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Luma'], 'faq' => [
            'q1' => '<script>alert(1)</script>',
            'a1' => '<img src=x onerror=alert(1)>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $body);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $body);
    }

    /** The leaves only this design draws, held to the same rule as every other. */
    public function test_the_leaves_only_this_design_draws_are_escaped(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, [
            'about'    => ['note_1' => '<b>line</b>'],
            'services' => ['price_prefix' => '<b>prefix</b>'],
            'booking'  => ['call_label' => '<b>call</b>'],
            'contact'  => ['descriptor' => '<b>descriptor</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        foreach (['line', 'prefix', 'call', 'descriptor'] as $needle) {
            $this->assertStringNotContainsString('<b>' . $needle . '</b>', $body);
            $this->assertStringContainsString('&lt;b&gt;' . $needle . '&lt;/b&gt;', $body);
        }
    }

    /** @return array<string, array{0: mixed, 1: ?string}> */
    public static function hostileImages(): array
    {
        return [
            'javascript uri'     => ['javascript:alert(1)', 'javascript:'],
            'attribute breakout' => ['"><script>', '"><script>'],
            'protocol relative'  => ['//evil.example/x.jpg', 'evil.example'],
            'array'              => [['/storage/a.jpg'], null],
            'number'             => [12345, null],
            'oversized'          => ['/storage/' . str_repeat('a', 3000) . '.jpg', null],
        ];
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_hero_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published(['hero' => ['headline' => 'Luma', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/luma_garden/assets/hero-garden.webp', $body);
        $this->assertStringNotContainsString('hero--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Luma'],
            'about' => ['body' => 'A garden room.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/luma_garden/assets/langoustine.webp', $body);
        $this->assertStringNotContainsString('story--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    // ─── Share image, assets, fonts and cache busting ─────────────────────

    public function test_the_page_publishes_a_share_image(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('property="og:image"', $body);
        $this->assertMatchesRegularExpression('#og:image" content="https?://#', $body);
    }

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/luma_garden\.css\?v=[0-9a-f]{10}#', $body);
        $this->assertMatchesRegularExpression('#landing/kit\.js\?v=[0-9a-f]{10}#', $body);
    }

    public function test_the_rendered_head_names_no_google_fonts_host(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertStringNotContainsString('fonts.googleapis.com', $body);
        $this->assertStringNotContainsString('fonts.gstatic.com', $body);
    }

    public function test_every_font_face_is_same_origin_relative_and_on_disk(): void
    {
        $css = file_get_contents(public_path('landing/luma_garden.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; the ITALIC AXIS SHIPS (it
     * is what sets the last word of this design's wordmark, and the author's
     * own <link> asks for it); the BODY face carries Cyrillic and the DISPLAY
     * face does not, because Google publishes Newsreader as latin, latin-ext
     * and vietnamese only — pinned as a FACT rather than left as an omission.
     *
     * AND THE DECLARED RANGES ARE THE AUTHOR'S OWN. His <link> asks for
     * Newsreader pinned at 400 and Manrope capped at 600; four elements on
     * this page set no weight at all (or ask for <strong>'s 700), so a wider
     * declared range here would render them heavier than his page does.
     */
    public function test_every_font_face_declares_a_unicode_range_and_the_authors_own_weights(): void
    {
        $css = file_get_contents(public_path('landing/luma_garden.css'));

        preg_match_all('/@font-face\{(.+?)\}/s', $css, $matches);

        $this->assertNotEmpty($matches[1]);

        foreach ($matches[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face,
                'A @font-face declares no unicode-range.');
        }

        $this->assertMatchesRegularExpression(
            '/@font-face\{font-family:Newsreader;font-style:italic;font-weight:400;/',
            $css,
            'The italic axis this design cannot do without is not declared.',
        );

        $this->assertMatchesRegularExpression(
            '/@font-face\{font-family:Manrope;font-style:normal;font-weight:400 600;[^}]+U\+0400-045F/s',
            $css,
            'The body face declares no Cyrillic subset, or not at the weight the author asks for.',
        );

        $this->assertDoesNotMatchRegularExpression(
            '/@font-face\{font-family:Newsreader[^}]+U\+0400-045F/s',
            $css,
            'A Cyrillic Newsreader face was declared; Google publishes none.',
        );

        // And this template adds no font FILE at all: every face it declares is
        // one organic_wellness.css already ships.
        $this->assertSame(0, substr_count($css, "url('fonts/playfair"));
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/luma_garden/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/luma_garden/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/luma_garden.css'));

        preg_match('/:root\s*\{(.+?)\n\}/s', $kit, $kitRoot);
        $this->assertNotEmpty($kitRoot[1] ?? null);

        foreach (explode("\n", trim($kitRoot[1])) as $line) {
            $line = trim($line);

            if ($line === '' || !str_starts_with($line, '--')) {
                continue;
            }

            $this->assertStringContainsString($line, $css,
                "The author's token `{$line}` is not in the shipped stylesheet verbatim.");
        }
    }

    /**
     * And the rest of the file, rule for rule — which on this kit means every
     * byte of it. Two documented changes: the font block prepended, the tenant
     * states appended. Nothing in between.
     */
    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/luma_garden.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    /**
     * A thumbnail per band this design draws — and NONE for the one it does
     * not, which is the same fact `renders` publishes, told to the picker's
     * collapsed section headers.
     */
    public function test_the_template_ships_a_thumbnail_for_every_band_it_draws(): void
    {
        foreach (LandingOnboardingService::rendersFor('luma_garden') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/luma_garden/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/luma_garden/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/luma_garden/team.svg'));
    }

    public function test_the_page_publishes_local_business_markup(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('application/ld+json', $body);
        $this->assertStringContainsString('"@type":"Restaurant"', str_replace(' ', '', $body));
    }
}
