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
 * Maison Vela — the first HOSPITALITY kit, rendered as a real template.
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
 * Every hostile-value battery that protects the other four templates is
 * repeated here, because they are independent sets of Blade files and a guard
 * that only four of them make is a guard the fifth does not have.
 */
class MaisonVelaRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/hospitality/01-maison-vela';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'restaurant'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'maison-vela',
            'template_key' => 'maison_vela', 'industry' => $industry, 'status' => 'published',
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Maison', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/maison-vela')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/maison-vela')->getStatusCode();
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Vela',
            'phone' => '+371 20 000 181', 'email' => 'table@maisonvela.example',
            'address' => '21 Elizabetes iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Le Déjeuner', 'Two or three courses · Friday to Sunday · 12:00–15:00', 48],
            ['À la carte', 'Shellfish, seasonal plates and brasserie signatures · Tuesday to Saturday', null],
            ['Menu Vela', 'Six courses chosen by the kitchen · optional cellar pairing', 125],
        ] as $i => [$name, $short, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short,
                'price' => $price, 'currency' => 'EUR',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Clara M.', 5, 'A room with real glamour and a kitchen with the confidence to keep every plate beautifully clear.'],
            ['Toms B.', 5, 'Faultless service and a cellar worth the detour.'],
            ['Ilze R.', 5, 'The tasting menu was the best meal we have had this year.'],
            ['Anders K.', 5, 'Warm, polished and never rushed.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'announcement' => [
                'text'      => 'Lunch returns Friday —',
                'cta_label' => 'reserve the first table',
            ],
            'hero' => [
                'kicker'          => 'European classics · Modern appetite',
                'headline'        => "Some evenings\n",
                'headline_accent' => 'deserve ceremony.',
                'subtext'         => 'Oysters over ice, sauces made properly and a dining room that still believes in occasion.',
                'cta_label'       => 'Reserve a table',
                'proof'           => 'Lunch Fri–Sun · Dinner Tue–Sat · Bar from 17:00',
            ],
            'trust' => [
                'feature_1'         => 'Seasonal grand classics',
                'feature_2'         => '700-reference cellar',
                'feature_3'         => 'Private salon for 12',
            ],
            'services' => [
                'kicker'         => 'At the table',
                'heading'        => "Three menus.\nOne sense of occasion.",
                'subtext'        => 'Classic technique, exceptional produce and enough flexibility to make lunch feel easy or dinner last all evening.',
                'price_prefix'   => 'From',
            ],
            'about' => [
                'kicker'         => 'The pleasure of doing things properly',
                'lead'           => 'Luxury is attention,',
                'lead_accent'    => 'not excess.',
                'body'           => 'Our kitchen returns to the foundations—stocks, sauces, fire and patience—then lets the best market produce lead. Service is polished, warm and never rehearsed.',
                'fact_1'         => '26',
                'fact_1_caption' => 'growers and makers',
                'fact_2'         => '700',
                'fact_2_caption' => 'wines in the cellar',
                'fact_3'         => '12',
                'fact_3_caption' => 'seats in the salon',
            ],
            'gallery_1' => [
                'kicker'         => 'Beyond the main room',
                'heading'        => 'A table for every kind of evening.',
                'subtext'        => 'Begin at the marble bar, settle into the dining room or take the private salon for a celebration shaped entirely around your guests.',
                'caption_1'      => 'The grand room',
                'caption_2'      => 'The marble bar',
            ],
            'reviews' => [
                'kicker' => 'Diner note',
            ],
            'faq' => [
                'kicker'  => 'Before your table',
                'heading' => 'The useful details.',
                'q1' => 'Can you accommodate dietary requirements?',
                'a1' => 'Yes. Please share them while reserving so the kitchen can prepare with care.',
                'q2' => 'Is there a dress code?',
                'a2' => 'There is no formal code. We simply invite guests to dress for an evening they would like to remember.',
                'q3' => 'What is the cancellation policy?',
                'a3' => 'Reservations may be changed up to 24 hours ahead.',
            ],
            'booking' => [
                'kicker'          => 'Your table, prepared',
                'heading'         => "Make an evening\nof it.",
                'terms'           => 'Choose your date, service and party size to see live availability.',
                'cta_label'       => 'Reserve a table',
                'call_label'      => 'Groups of seven or more?',
            ],
            'contact' => [
                'descriptor'  => 'Grand Brasserie · Riga',
                'email_label' => 'Email the restaurant',
                'legal_note'  => 'Fictional demonstration.',
            ],
        ], [], $industry);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/maison_vela/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/maison_vela/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Vela']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent ───────────────────────────────────────────────────────

    /**
     * The tenant's colour is spent on the two ACCENT TEXT families and never
     * on the oxblood, which is a surface with white type on it, nor on the
     * ink, which is this page's ink.
     */
    public function test_a_tenant_colour_lands_on_the_accents_and_never_on_a_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-brass:', $body);
        $this->assertStringContainsString('--color-accent-ink:', $body);

        $this->assertStringNotContainsString('--color-wine:', $body);
        $this->assertStringNotContainsString('--color-ink:', $body);
        $this->assertStringNotContainsString('--color-paper:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own ivory page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-accent-ink: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto an ivory page.');
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
        $this->assertFileDoesNotExist(resource_path('views/landing/maison_vela/sections/team.blade.php'));

        $renders = LandingOnboardingService::rendersFor('maison_vela');

        $this->assertNotContains('team', $renders, 'The catalogue offers a team band this design cannot draw.');
        $this->assertContains('services', $renders);
        $this->assertContains('gallery', $renders);
        $this->assertContains('text', $renders);

        $this->assertArrayNotHasKey('team', LandingOnboardingService::contentFieldsFor('maison_vela'));
        $this->assertNotContains('team', LandingOnboardingService::photoBlocksFor('maison_vela'));
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
            'maison_vela',
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
            'announcement' => 'quiet-offer',
            'header'       => 'heritage-overlay',
            'hero'         => 'grand-brasserie',
            'trust'        => 'press-line',
            'services'     => 'menu-ledger',
            'story'        => 'image-manifesto',
            'gallery'      => 'private-dining',
            'testimonials' => 'single-guest-note',
            'faq'          => 'dining-essentials',
            'booking'      => 'table-panel',
            'footer'       => 'maitre-d-hub',
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
        $this->assertStringContainsString('landing/maison_vela/assets/hero-brasserie.webp', $body);
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
        $this->assertStringNotContainsString('not excess.', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Vela'],
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
     * The hero's heading is Copy::heading()'s BREAK-BEFORE-THE-ACCENT case,
     * which is exactly what this author draws:
     * `Some evenings<br><em>deserve ceremony.</em>`. A trailing line break on
     * the headline is how a tenant asks for it.
     */
    public function test_the_hero_heading_puts_the_emphasis_on_its_own_line(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('Some evenings<br><em>deserve ceremony.</em>', $this->body());
    }

    public function test_the_authors_two_line_headings_break_where_he_breaks_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Three menus.<br>One sense of occasion.', $body);
        $this->assertStringContainsString('Make an evening<br>of it.', $body);
        $this->assertStringContainsString('Luxury is attention, <em>not excess.</em>', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Some evenings',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The menu ledger ──────────────────────────────────────────────────

    public function test_the_menu_rows_are_the_services_screens_own_and_carry_the_price_prefix(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h3>Le Déjeuner</h3>', $body);
        $this->assertStringContainsString('Two or three courses · Friday to Sunday · 12:00–15:00', $body);
        $this->assertStringContainsString('<strong>From €48</strong>', $body);
        $this->assertStringContainsString('<strong>From €125</strong>', $body);

        // The ordinal is derived, never stored.
        $this->assertStringContainsString('<span aria-hidden="true">01</span>', $body);
        $this->assertStringContainsString('<span aria-hidden="true">03</span>', $body);
    }

    /**
     * A menu with no price prints no price column at all rather than an empty
     * one — the author writes a service WINDOW there ("Evenings") and a
     * Service row has no such field. Named in the task report rather than
     * invented here.
     */
    public function test_a_menu_with_no_price_prints_no_price_column(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h3>À la carte</h3>', $body);
        $this->assertSame(2, substr_count($body, '<strong>From €'));
    }

    /** And no duration is printed anywhere: it is a treatment's field. */
    public function test_a_menu_row_never_prints_a_duration(): void
    {
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Chef table',
            'duration_minutes' => 120, 'price' => 180, 'currency' => 'EUR',
            'sort_order' => 9, 'is_active' => true,
        ]);

        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('120 min', $this->body());
    }

    /**
     * The section header emits all three of its cells whatever the tenant
     * wrote, because `.section-heading` is a fixed three-track grid and its
     * intro is styled with `> p:last-child`.
     */
    public function test_the_menu_header_always_emits_its_three_cells(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'services' => ['heading' => 'Menus']]);
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Lunch',
            'price' => 20, 'currency' => 'EUR', 'sort_order' => 0, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '#<header class="section-heading">\s*<p class="eyebrow">[^<]*</p>\s*<h2>.*?</h2>\s*<p></p>\s*</header>#s',
            $body,
            'The menus header dropped one of its three grid cells.',
        );
    }

    // ─── The kitchen ledger ───────────────────────────────────────────────

    public function test_the_story_ledger_draws_the_authors_value_and_caption_pairs(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<dl data-count="3">', $body);
        $this->assertStringContainsString('<dt>26</dt><dd>growers and makers</dd>', $body);
        $this->assertStringContainsString('<dt>700</dt><dd>wines in the cellar</dd>', $body);
    }

    public function test_a_ledger_line_with_no_caption_prints_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'about' => [
            'body'   => 'A dining room.',
            'fact_1' => 'Open since 1998',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<dl data-count="1">', $body);
        $this->assertStringContainsString('<dt>Open since 1998</dt></div>', $body);
        $this->assertStringNotContainsString('<dd></dd>', $body);
    }

    public function test_a_story_with_no_ledger_lines_draws_no_ledger(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'about' => ['body' => 'A dining room.']]);

        $this->assertStringNotContainsString('<dl', $this->body());
    }

    // ─── The rooms band ───────────────────────────────────────────────────

    /**
     * The one band that is not the author's composition: his cards are text
     * only and a `gallery` band on this platform IS its pictures. The card
     * frame, the ordinal and the caption-as-heading are his; the photograph is
     * the tenant's.
     */
    public function test_the_rooms_band_draws_the_tenants_photographs_in_the_authors_cards(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="salon__cards" data-count="2">', $body);
        $this->assertStringContainsString('landing/maison_vela/assets/hero-brasserie.webp', $body);
        $this->assertStringContainsString('<h3>The grand room</h3>', $body);
        $this->assertStringContainsString('<h3>The marble bar</h3>', $body);
    }

    public function test_a_tile_with_no_caption_draws_no_heading(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'gallery_1' => [
            'heading' => 'The rooms',
            'image_1' => '/storage/one.webp',
            'image_2' => '/storage/two.webp',
            'caption_1' => 'The bar',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<h3>The bar</h3>', $body);
        $this->assertSame(1, substr_count($body, '<h3>'));
    }

    public function test_the_rooms_band_counts_only_readable_photographs(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'gallery_1' => [
            'heading' => 'The rooms',
            'image_1' => '/storage/one.webp',
            'image_2' => 'javascript:alert(1)',
            'image_3' => ['nope'],
            'image_4' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Two tiles: the tenant's own readable one, and the design's own
        // photograph restored under the second slot (template fidelity 4.1).
        // The third and fourth have no default and are simply absent.
        $this->assertStringContainsString('<div class="salon__cards" data-count="2">', $body);
        $this->assertStringContainsString('landing/maison_vela/assets/oysters.webp', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    // ─── The diner note ───────────────────────────────────────────────────

    public function test_the_diner_note_draws_one_review_with_the_aggregate_beside_it(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('A room with real glamour', $body);
        // ONE quote in the band, whatever the JSON-LD in <head> publishes.
        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('Clara M.', $body);
    }

    public function test_a_restaurant_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Vela', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Vela'], 'reviews' => ['kicker' => 'Diner note']]);
        $body = $this->body();

        $this->assertStringNotContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('Lovely.', $body);
    }

    /** The eyebrow IS this band's heading — the author draws no h2 here. */
    public function test_the_diner_note_names_itself_with_its_eyebrow(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<h2 class="eyebrow">Diner note</h2>', $this->body());
    }

    // ─── The trust strip ──────────────────────────────────────────────────

    public function test_the_trust_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('<strong>5.0</strong>from recent diners', $body);
        $this->assertStringContainsString('data-count="4"', $body);
    }

    /**
     * A highlight with no caption is printed FLAT rather than in the display
     * face: `<strong>` is the figure the author sizes at 2rem Playfair, and a
     * whole sentence there would break the strip.
     */
    public function test_a_highlight_with_no_caption_is_printed_flat(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'trust' => [
            'feature_1' => 'Seasonal grand classics',
            'feature_2' => '700',
            'feature_2_caption' => 'wines',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<p>Seasonal grand classics</p>', $body);
        $this->assertStringContainsString('<p><strong>700</strong>wines</p>', $body);
    }

    public function test_a_page_with_no_rating_and_no_highlights_draws_no_strip(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']]);

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
        $this->published(['hero' => ['headline' => 'Vela'], 'faq' => [
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
        $this->published(['hero' => ['headline' => 'Vela'], 'faq' => [
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
        $this->assertStringContainsString('href="tel:+37120000181"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /**
     * 6.1: a restaurant that CAN take a reservation online — a bookable
     * service with a seating section and hours — gets the band, pointed at
     * the appointment widget (which speaks "Booking / Section" for this
     * industry). The author's own wording stays on every control.
     */
    public function test_a_bookable_restaurant_page_wires_every_hook_to_the_appointment_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        \App\Models\ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'The main room', 'is_active' => true,
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

        $this->assertStringContainsString('Groups of seven or more?', $body);
        $this->assertStringContainsString('href="tel:+37120000181"', $body);
        $this->assertStringContainsString('+371 20 000 181', $body);
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
            'contact' => ['social_instagram' => 'https://instagram.com/maisonvela'],
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

        $this->assertStringContainsString('Maison Vela. Fictional demonstration.', $body);
        $this->assertStringNotContainsString('>Privacy<', $body);
        $this->assertStringNotContainsString('>Accessibility<', $body);
    }

    // ─── The lockup ───────────────────────────────────────────────────────

    public function test_the_wordmark_sets_a_conjunction_in_the_shared_primitives_em(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ember & Vine', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Vela']]);

        $this->assertSame(2, substr_count($this->body(), '<strong>Ember <em>&amp;</em> Vine</strong>'),
            'The infix emphasis is missing from the header lockup, the footer lockup, or both.');
    }

    public function test_a_business_with_no_conjunction_gets_a_plain_lockup(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>Maison Vela</strong>', $body);
        $this->assertStringNotContainsString('<em>&amp;</em>', $body);
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Vela', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Vela']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Vela', $body);
    }

    public function test_the_brands_own_logo_replaces_the_monogram(): void
    {
        $this->makeBrand('/storage/brand/vela.svg');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('<span aria-hidden="true"><img src="/storage/brand/vela.svg"', $body);
        $this->assertStringNotContainsString('aria-hidden="true">M</span>', $body);
    }

    public function test_a_hostile_brand_logo_never_reaches_the_page(): void
    {
        $this->makeBrand('javascript:alert(1)');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringContainsString('aria-hidden="true">M</span>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Vela']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'gallery_1' => 'not an array']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Vela', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Vela'], 'faq' => [
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
            'hero'  => ['proof' => '<b>proof</b>'],
            'about' => ['fact_1' => '<b>fact</b>', 'fact_1_caption' => '<b>caption</b>'],
            'services' => ['price_prefix' => '<b>prefix</b>'],
            'booking'  => ['call_label' => '<b>call</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        foreach (['proof', 'fact', 'caption', 'prefix', 'call'] as $needle) {
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
        $this->published(['hero' => ['headline' => 'Vela', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/maison_vela/assets/hero-brasserie.webp', $body);
        $this->assertStringNotContainsString('hero--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Vela'],
            'about' => ['body' => 'A dining room.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/maison_vela/assets/oysters.webp', $body);
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

        $this->assertMatchesRegularExpression('#landing/maison_vela\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/maison_vela.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; the ITALIC AXIS SHIPS
     * (this design's one two-tone heading treatment is an <em>, which is
     * italic by default and which the author's own <link> asks for); the
     * DISPLAY face carries Cyrillic — the first kit template whose does — and
     * the BODY face does not, because Google publishes DM Sans as latin and
     * latin-ext only. That last one is pinned as a FACT rather than left as an
     * omission: a Russian tenant's running copy falls through to the author's
     * own declared stack (Arial), exactly as it does on his page.
     */
    public function test_every_font_face_declares_a_unicode_range_and_the_italic_axis_ships(): void
    {
        $css = file_get_contents(public_path('landing/maison_vela.css'));

        preg_match_all('/@font-face\{(.+?)\}/s', $css, $matches);

        $this->assertNotEmpty($matches[1]);

        foreach ($matches[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face,
                'A @font-face declares no unicode-range.');
        }

        $this->assertMatchesRegularExpression(
            "/@font-face\{font-family:'Playfair Display';font-style:italic/",
            $css,
            'The italic axis this design cannot do without is not declared.',
        );

        $this->assertMatchesRegularExpression(
            "/@font-face\{font-family:'Playfair Display';font-style:normal[^}]+U\+0400-045F/s",
            $css,
            'The display face declares no Cyrillic subset, though Google publishes one.',
        );

        $this->assertDoesNotMatchRegularExpression(
            "/@font-face\{font-family:'DM Sans'[^}]+U\+0400-045F/s",
            $css,
            'A Cyrillic DM Sans face was declared; Google publishes none.',
        );
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/maison_vela/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/maison_vela/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/maison_vela.css'));

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
        $css = file_get_contents(public_path('landing/maison_vela.css'));

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
        foreach (LandingOnboardingService::rendersFor('maison_vela') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/maison_vela/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/maison_vela/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/maison_vela/team.svg'));
    }

    public function test_the_page_publishes_local_business_markup(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('application/ld+json', $body);
        $this->assertStringContainsString('"@type":"Restaurant"', str_replace(' ', '', $body));
    }
}
