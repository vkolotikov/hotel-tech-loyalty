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
 * Ember Table — the third HOSPITALITY kit, rendered as a real template.
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
class EmberTableRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/hospitality/03-ember-table';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'restaurant'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'ember-table',
            'template_key' => 'ember_table', 'industry' => $industry, 'status' => 'published',
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Ember', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/ember-table')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/ember-table')->getStatusCode();
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ember Table',
            'phone' => '+371 20 000 346', 'email' => 'table@ember.example',
            'address' => '14 Miera iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['À la carte', 'Bright plates, the hearth lit, room for another glass.', null],
            ['Four courses', 'A concise seasonal menu with choices at every course.', 82],
            ['Kitchen tasting', 'Eight seats facing the fire. One menu, served by the cooks.', 138],
        ] as $i => [$name, $short, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short,
                'price' => $price, 'currency' => 'EUR',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Elise R.', 5, 'Confident cooking without the theatre. Every plate made sense, and the room made us want to order one more bottle.'],
            ['Toms B.', 5, 'The counter is the best seat in the city.'],
            ['Ilze R.', 5, 'Smoke, salt and a wine list with nothing predictable on it.'],
            ['Anders K.', 5, 'Unhurried and quietly excellent.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'announcement' => [
                'text'      => 'Autumn tasting menu · Wednesday to Saturday ·',
                'cta_label' => 'Reserve',
            ],
            'hero' => [
                'kicker'          => 'Open hearth · 18 seats · Riga',
                'headline'        => "Come hungry.\n",
                'headline_accent' => 'Leave slowly.',
                'subtext'         => 'An intimate dining room shaped by flame, nearby farms and a cellar chosen for character rather than convention.',
                'cta_label'       => 'Find a table',
                'proof'           => 'Dinner Wed–Sat · Lunch Fri–Sun',
            ],
            'trust' => [
                'feature_1' => '18-seat dining room',
                'feature_2' => 'Vegetarian tasting available',
                'feature_3' => 'Private table for 8',
            ],
            'services' => [
                'kicker'       => 'Choose the pace',
                'heading'      => "Three ways\nto join us.",
                'subtext'      => 'Menus move with the market and the weather. These are the shapes of service; the plates change often.',
                'price_prefix' => 'From',
            ],
            'about' => [
                'kicker' => 'From the kitchen',
                'lead'   => "Smoke is an ingredient.\nRestraint is another.",
                'body'   => 'Our menu begins with nearby growers, whole animals and the rhythm of the season. The hearth brings depth; careful hands keep everything clear.',
                'note_1' => 'Farm-led produce',
                'note_2' => 'Low-intervention wine',
                'note_3' => 'Daily-baked bread',
            ],
            'gallery_1' => [
                'kicker'    => 'Around the table',
                'heading'   => "An evening with\nmore than one mood.",
                'caption_1' => 'The dining room',
                'caption_2' => 'The wine bar',
            ],
            'reviews' => [
                'kicker' => 'Guest notes',
            ],
            'faq' => [
                'kicker'  => 'Good to know',
                'heading' => "Before\nthe table.",
                'q1' => 'Can you accommodate dietary requirements?',
                'a1' => 'Yes. Tell us when reserving and we will confirm what the kitchen can prepare.',
                'q2' => 'What is your cancellation policy?',
                'a2' => 'Tables may be changed or cancelled up to 24 hours ahead.',
                'q3' => 'Do you welcome walk-ins?',
                'a3' => 'Always, when space allows. The wine bar keeps several places unreserved each evening.',
            ],
            'booking' => [
                'kicker'          => 'Your table, held',
                'heading'         => "Choose an evening.\nWe’ll light the fire.",
                'terms'           => 'Live reservations show the next available tables. For groups of seven or more, call us.',
                'cta_label'       => 'Reserve a table',
            ],
            'contact' => [
                'descriptor'  => 'Restaurant · Wine bar',
                'email_label' => 'Email the restaurant',
                'legal_note'  => 'Fictional demonstration.',
            ],
        ], [], $industry);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/ember_table/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/ember_table/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Ember']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent ───────────────────────────────────────────────────────

    /**
     * The tenant's colour is spent on the GOLD label family and on the accent
     * an em takes on a light ground, and never on the ember, which is a
     * surface this page sets its type in night on, nor on the night itself.
     */
    public function test_a_tenant_colour_lands_on_the_accents_and_never_on_a_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-gold:', $body);
        $this->assertStringContainsString('--color-accent-ink:', $body);

        $this->assertStringNotContainsString('--color-ember:', $body);
        $this->assertStringNotContainsString('--color-night:', $body);
        $this->assertStringNotContainsString('--color-cream:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /**
     * The accent is re-resolved against THIS kit's own NEAR-BLACK page, which is
     * the opposite direction from the other two hospitality kits: a very dark
     * hex is the one that has to move here, and a pale one is left alone.
     */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']], ['brand_color' => '#101010']);
        $body = $this->body();

        preg_match('/--color-gold: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#101010', strtolower($m[1]),
            'A near-black accent was painted unchanged onto a near-black page.');
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
        $this->assertFileDoesNotExist(resource_path('views/landing/ember_table/sections/team.blade.php'));

        $renders = LandingOnboardingService::rendersFor('ember_table');

        $this->assertNotContains('team', $renders, 'The catalogue offers a team band this design cannot draw.');
        $this->assertContains('services', $renders);
        $this->assertContains('gallery', $renders);
        $this->assertContains('text', $renders);

        $this->assertArrayNotHasKey('team', LandingOnboardingService::contentFieldsFor('ember_table'));
        $this->assertNotContains('team', LandingOnboardingService::photoBlocksFor('ember_table'));
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
            'ember_table',
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
            'announcement' => 'service-note',
            'header'       => 'night-bar',
            'hero'         => 'cinematic-service',
            'trust'        => 'restaurant-facts',
            'services'     => 'menu-ledger',
            'story'        => 'dish-manifesto',
            'gallery'      => 'service-moments',
            'testimonials' => 'critic-note',
            'faq'          => 'dining-questions',
            'booking'      => 'evening-invitation',
            'footer'       => 'restaurant-hub',
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
        $this->assertStringContainsString('landing/ember_table/assets/hero-dining.webp', $body);
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
        $this->assertStringNotContainsString('Restraint is another.', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Ember'],
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

        $this->assertStringContainsString('Come hungry.<br><em>Leave slowly.</em>', $this->body());
    }

    public function test_the_authors_two_line_headings_break_where_he_breaks_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Three ways<br>to join us.', $body);
        $this->assertStringContainsString('Smoke is an ingredient.<br>Restraint is another.', $body);
        $this->assertStringContainsString('An evening with<br>more than one mood.', $body);
        $this->assertStringContainsString('Before<br>the table.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Come hungry.',
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

        $this->assertStringContainsString('<h3>Kitchen tasting</h3>', $body);
        $this->assertStringContainsString('Eight seats facing the fire.', $body);
        $this->assertStringContainsString('<strong>From €82</strong>', $body);
        $this->assertStringContainsString('<strong>From €138</strong>', $body);

        // The ordinal is derived, never stored — the author prints exactly
        // these two digits, and the WORD he writes after them has no leaf.
        $this->assertStringContainsString('<p aria-hidden="true">01</p>', $body);
        $this->assertStringContainsString('<p aria-hidden="true">03</p>', $body);
    }

    /**
     * A menu with no price prints no value column at all rather than an empty
     * one — the author writes a service WINDOW there ("Fri–Sun · 12:00") and a
     * Service row has no such field. Named in the task report rather than
     * invented here.
     */
    public function test_a_menu_with_no_price_prints_no_value_column(): void
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Counter',
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
        $this->published(['hero' => ['headline' => 'Ember'], 'services' => ['heading' => 'Menus']]);
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

    // ─── The kitchen pills ────────────────────────────────────────────────

    public function test_the_story_draws_the_authors_outlined_pills(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<span>Farm-led produce</span>', $body);
        $this->assertStringContainsString('<span>Daily-baked bread</span>', $body);
    }

    public function test_a_story_with_no_lines_draws_no_pills(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'about' => ['body' => 'A dining room.']]);

        $this->assertStringNotContainsString('Farm-led produce', $this->body());
    }

    /** This author draws no numbered ledger, so its leaves are not offered. */
    public function test_this_design_offers_no_numbered_ledger(): void
    {
        $fields = LandingOnboardingService::contentFieldsFor('ember_table');

        $this->assertNotContains('fact_1', $fields['about']);
        $this->assertNotContains('fact_1_caption', $fields['about']);
        $this->assertContains('note_1', $fields['about']);
        $this->assertNotContains('note_label', $fields['about']);
    }

    // ─── The experience band ──────────────────────────────────────────────

    /**
     * The one band that is not the author's composition: his cards are text
     * only and a `gallery` band on this platform IS its pictures. The card
     * frame, the ordinal and the caption-as-heading are his; the photograph is
     * the tenant's.
     */
    public function test_the_experience_band_draws_the_tenants_photographs_in_the_authors_cards(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="experience-grid" data-count="2">', $body);
        $this->assertStringContainsString('landing/ember_table/assets/hero-dining.webp', $body);
        $this->assertStringContainsString('<h3>The dining room</h3>', $body);
        $this->assertStringContainsString('<h3>The wine bar</h3>', $body);
        $this->assertStringContainsString('<span aria-hidden="true">01</span>', $body);
    }

    /** His header is an eyebrow and a heading at opposite ends of one row. */
    public function test_this_design_offers_no_gallery_intro_paragraph(): void
    {
        $this->assertNotContains(
            'subtext',
            LandingOnboardingService::contentFieldsFor('ember_table')['gallery'],
        );
    }

    public function test_a_tile_with_no_caption_draws_no_heading(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'gallery_1' => [
            'heading' => 'The rooms',
            'image_1' => '/storage/one.webp',
            'image_2' => '/storage/two.webp',
            'caption_1' => 'The bar',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<h3>The bar</h3>', $body);
        $this->assertSame(1, substr_count($body, '<h3>'));
    }

    public function test_the_experience_band_counts_only_readable_photographs(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'gallery_1' => [
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
        $this->assertStringContainsString('<div class="experience-grid" data-count="2">', $body);
        $this->assertStringContainsString('landing/ember_table/assets/seasonal-dish.webp', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    // ─── The guest note ───────────────────────────────────────────────────

    public function test_the_guest_note_draws_one_review_with_the_aggregate_beside_it(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Confident cooking without the theatre', $body);
        // ONE quote in the band, whatever the JSON-LD in <head> publishes.
        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('5.0 / 5 · recent diners', $body);
        $this->assertStringContainsString('Elise R.', $body);
    }

    public function test_a_restaurant_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ember Table', 'is_active' => true]);

        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Ember'], 'reviews' => ['kicker' => 'Guest notes']]);
        $body = $this->body();

        $this->assertStringNotContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('Lovely.', $body);
    }

    /** The eyebrow IS this band's heading — the author draws no h2 here. */
    public function test_the_guest_note_names_itself_with_its_eyebrow(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<h2 class="eyebrow">Guest notes</h2>', $this->body());
    }

    // ─── The trust strip ──────────────────────────────────────────────────

    public function test_the_trust_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('<strong>5.0</strong>diner rating', $body);
        $this->assertStringContainsString('data-count="4"', $body);
    }

    /**
     * A highlight with no caption is printed FLAT rather than in the display
     * face: `<strong>` is the figure the author sizes at 2.2rem Italiana, and a
     * whole sentence there would break the strip.
     */
    public function test_a_highlight_with_no_caption_is_printed_flat(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'trust' => [
            'feature_1' => '18-seat dining room',
            'feature_2' => '8',
            'feature_2_caption' => 'counter seats',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<p>18-seat dining room</p>', $body);
        $this->assertStringContainsString('<p><strong>8</strong>counter seats</p>', $body);
    }

    /** And the star glyph is the author's, on the rating cell only. */
    public function test_only_the_rating_cell_carries_the_star(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $strip = substr($body, strpos($body, 'data-block="trust"'), 1400);

        $this->assertSame(1, substr_count($strip, 'm12 3 2.7 5.5'));
    }

    public function test_a_page_with_no_rating_and_no_highlights_draws_no_strip(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']]);

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
        $this->published(['hero' => ['headline' => 'Ember'], 'faq' => [
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
        $this->published(['hero' => ['headline' => 'Ember'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    public function test_a_restaurant_page_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringContainsString('href="#site-footer"', $body);
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

    public function test_the_closing_panel_prints_the_authors_bare_phone_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('href="tel:+37120000346"', $body);
        $this->assertStringContainsString('+371 20 000 346', $body);
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
            'contact' => ['social_instagram' => 'https://instagram.com/embertable'],
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

        $this->assertStringContainsString('Ember Table. Fictional demonstration.', $body);
        $this->assertStringNotContainsString('>Privacy<', $body);
        $this->assertStringNotContainsString('>Accessibility<', $body);
    }

    // ─── The lockup ───────────────────────────────────────────────────────

    /**
     * THE TWO-LETTER MARK. This author's disc reads `E/T` — the initials of
     * both words of his name joined by a slash — where the other four kit
     * templates draw a single letter. It is derived from the same $brandName
     * chain, in the header and again in the footer.
     */
    public function test_the_mark_is_the_first_two_initials_joined(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">E/T</span>'));
    }

    /** A one-word business gets one letter, which is what four kits draw. */
    public function test_a_one_word_business_gets_a_single_letter_mark(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ember', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ember']]);

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">E</span>'));
    }

    public function test_the_wordmark_sets_a_conjunction_in_the_shared_primitives_em(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ember & Vine', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ember']]);

        $this->assertSame(2, substr_count($this->body(), '<strong>Ember <em>&amp;</em> Vine</strong>'),
            'The infix emphasis is missing from the header lockup, the footer lockup, or both.');
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Table', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ember']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Table', $body);
    }

    public function test_the_brands_own_logo_replaces_the_monogram(): void
    {
        $this->makeBrand('/storage/brand/ember.svg');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('<span aria-hidden="true"><img src="/storage/brand/ember.svg"', $body);
        $this->assertStringNotContainsString('aria-hidden="true">E/T</span>', $body);
    }

    public function test_a_hostile_brand_logo_never_reaches_the_page(): void
    {
        $this->makeBrand('javascript:alert(1)');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringContainsString('aria-hidden="true">E/T</span>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ember']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'gallery_1' => 'not an array']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ember', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Ember'], 'faq' => [
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
            'hero'     => ['proof' => '<b>proof</b>'],
            'about'    => ['note_1' => '<b>line</b>'],
            'services' => ['price_prefix' => '<b>prefix</b>'],
            'booking'  => ['call_label' => '<b>call</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        foreach (['proof', 'line', 'prefix', 'call'] as $needle) {
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
        $this->published(['hero' => ['headline' => 'Ember', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/ember_table/assets/hero-dining.webp', $body);
        $this->assertStringNotContainsString('hero--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Ember'],
            'about' => ['body' => 'A dining room by the fire.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/ember_table/assets/seasonal-dish.webp', $body);
        $this->assertStringNotContainsString('kitchen--solo', $body);

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

        $this->assertMatchesRegularExpression('#landing/ember_table\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/ember_table.css'));

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
    public function test_every_font_face_declares_a_unicode_range_and_the_authors_own_weights(): void
    {
        $css = file_get_contents(public_path('landing/ember_table.css'));

        preg_match_all('/@font-face\{(.+?)\}/s', $css, $matches);

        $this->assertNotEmpty($matches[1]);

        foreach ($matches[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face,
                'A @font-face declares no unicode-range.');
        }

        // The BODY face carries Cyrillic and stops at 600, which is where the
        // author's own <link> stops it.
        $this->assertMatchesRegularExpression(
            '/@font-face\{font-family:Inter;font-style:normal;font-weight:400 600;[^}]+U\+0400-045F/s',
            $css,
            'The body face declares no Cyrillic subset, or not at the weights the author asks for.',
        );

        // The MONO ships one weight, which is the only one the kit uses.
        $this->assertSame(2, substr_count($css, "@font-face{font-family:'DM Mono';font-style:normal;font-weight:400;"));

        // Italiana publishes ONE subset and no more; a Cyrillic display face
        // here would be an invention.
        $this->assertSame(1, substr_count($css, '@font-face{font-family:Italiana;'));
        $this->assertDoesNotMatchRegularExpression(
            '/@font-face\{font-family:Italiana[^}]+U\+0400-045F/s',
            $css,
            'A Cyrillic Italiana face was declared; Google publishes none.',
        );
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/ember_table/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/ember_table/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/ember_table.css'));

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
        $css = file_get_contents(public_path('landing/ember_table.css'));

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
        foreach (LandingOnboardingService::rendersFor('ember_table') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/ember_table/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/ember_table/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/ember_table/team.svg'));
    }

    public function test_the_page_publishes_local_business_markup(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('application/ld+json', $body);
        $this->assertStringContainsString('"@type":"Restaurant"', str_replace(' ', '', $body));
    }
}
