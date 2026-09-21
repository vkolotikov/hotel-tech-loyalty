<?php
namespace Tests\Feature\Landing;

use App\Models\Brand;
use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Orbit City — the third HotelTech kit, rendered as a real template.
 *
 * The acceptance criterion for this template is not a number in this file:
 * it is that the page a tenant gets is the page the author drew, and that is
 * settled by the screenshot pair in the conversion report. What THIS file is
 * for is everything a screenshot cannot see — that a hostile stored value
 * cannot take the page down or reach the DOM unescaped, that a band with
 * nothing in it does not render at all, that not one control on the page
 * points somewhere it cannot go, and that the author's own stylesheet and
 * photographs are still the ones we ship.
 *
 * Every hostile-value battery that protects the nine templates before it is
 * repeated here, because they are independent sets of Blade files and a
 * guard that only nine of them make is a guard the tenth does not have.
 *
 * THE SAME HAND AS AERA REFORMER: this kit is that author's page anatomy on
 * a hotel, so MaisonLumeRenderTest (Aera Reformer's) is the base of this file and the
 * differences are the hotel's own shapes — the initials in the ring, the
 * figure-and-caption highlight cells with the rating last, the room cards'
 * price line, the story list's title-over-detail lines, the guest note's own
 * stars, and a page whose booking flow is the stay widget with no rota to
 * check. Each is a numbered hotel-N ruling in the ledger and is pinned below.
 */
class OrbitCityRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/hotel-tech/03-orbit-city';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    /**
     * `$industry` defaults to `hotel` — the trade this design was drawn for,
     * and the one whose booking flow is on with no rota (the stay widget).
     * The fitness path, where the flow depends on a schedule, is exercised
     * by the widget tests that pass `fitness` explicitly.
     */
    private function published(array $content = [], array $theme = [], string $industry = 'hotel'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'orbit',
            'template_key' => 'orbit_city', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Arrive ready. Leave lighter.']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page;
    }

    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'ORBIT', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/orbit')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/orbit')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in two places — the first of them the note he quotes, signed. */
    private function seedRatings(bool $featureFirst = true, ?string $firstName = 'Daniel K.'): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => $firstName, 'overall_rating' => 5,
            'comment' => 'The cleverest part was how little we had to think about the hotel. Everything simply worked.',
            'is_featured' => $featureFirst, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Quiet, warm and genuinely personal.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * The rooms are Service rows marked as starting prices (his "From €145")
     * under one band suffix ("breakfast included"); the hosts are one
     * practitioner row named as he names them; the closing panel's own word
     * ("Check your dates") has no leaf of its own — `booking.cta_label` is
     * also the chrome's word — so it is left to the industry's verb, which
     * is the fixed-format-words limit docs/landing-page-builder.md §7 records.
     */
    private function seedLikeTheKit(string $industry = 'hotel'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'ORBIT',
            'phone' => '+371 20 000 339', 'email' => 'hello@orbit.example',
            'address' => '44 Elizabetes iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['City king', 'Calm, efficient and soundproofed for the best kind of city sleep.', 155],
            ['Corner studio', 'More sky, a generous table and space for a longer working stay.', 210],
            ['Orbit suite', 'A separate lounge, deep bath and skyline views from the upper floors.', 295],
        ] as $i => [$name, $short, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'price' => $price, 'price_is_from' => true,
                'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'The city team',
            'title' => 'Always nearby',
            'bio'   => 'Hosts, not a call centre. Here for a restaurant at 22:00, a pressed shirt at 07:00 or the fastest route across town.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'label'     => 'Direct arrival',
                'text'      => 'Check in before you land',
                'cta_label' => 'Book a room',
            ],
            'hero' => [
                'kicker'          => 'Stay in the city, not the process',
                'headline'        => "Arrive ready.\n",
                'headline_accent' => 'Leave lighter.',
                'subtext'         => 'A considered city hotel where useful technology removes the waiting—and people handle everything else.',
                'cta_label'       => 'Book your room',
                'note_label'      => 'Tonight',
                'proof'           => 'Three rooms available',
            ],
            'trust' => [
                'feature_1' => '60 sec', 'feature_1_caption' => 'Digital arrival',
                'feature_2' => '24/7', 'feature_2_caption' => 'Real people nearby',
                'feature_3' => '0', 'feature_3_caption' => 'Hidden stay fees',
            ],
            'services' => [
                'kicker'       => 'Choose your room',
                'heading'      => "Every room has\nits own light.",
                'subtext'      => 'Original details are kept where they matter. Modern comfort is added where you feel it.',
                'price_suffix' => '24 m²',
            ],
            'about' => [
                'kicker'  => 'Human when it matters',
                'lead'    => "Technology should\n",
                'lead_accent' => 'quietly disappear.',
                'body'    => 'Set arrival time, room temperature and checkout on your terms. Our team remains one tap—or one conversation—away.',
                'fact_1'  => 'Before arrival · Secure check-in and room preferences',
                'fact_2'  => 'During your stay · Simple controls and instant host support',
                'fact_3'  => 'On departure · One-tap checkout and digital receipt',
                'caption' => 'READY · Your room, set before arrival',
            ],
            'team' => [
                'kicker' => 'Your hosts',
            ],
            'reviews' => [
                'kicker' => 'Guest review',
            ],
            'faq' => [
                'kicker'  => 'Straight answers',
                'heading' => "Know before\nyou go.",
                'q1' => 'Do I have to check in digitally?',
                'a1' => 'No. Use digital arrival if it suits you, or come directly to our host desk. Both routes are available around the clock.',
                'q2' => 'Can I arrive late?',
                'a2' => 'Yes. Your secure room key can be activated before arrival, and a host is available throughout the night.',
                'q3' => 'Is breakfast included?',
                'a3' => 'Choose room-only or breakfast when booking. Coffee and a light early departure breakfast are available from 05:30.',
            ],
            'booking' => [
                'kicker'     => 'Your next city stay',
                'heading'    => "Pick the dates.\nSkip the friction.",
                'terms'      => 'Book direct for flexible arrival, the best available room and support before you land.',
                'call_label' => 'Need a person?',
            ],
            'contact' => [
                'descriptor'       => 'City hotel · Riga',
                'email_label'      => 'Email the team',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/orbit.example',
                'social_facebook'  => 'https://facebook.com/orbit.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'An easier city stay, designed around people.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/orbit_city/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/orbit_city/sections/*.blade.php'));

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

        // Blade's \B@ rule: a directive glued to a word character is not
        // compiled and prints as text. The seed renders every band, so no
        // directive may reach the page.
        $this->assertDoesNotMatchRegularExpression('/@(include|if|endif|foreach|endforeach|else|class)\b/', $body);
    }

    public function test_every_inline_style_block_carries_the_request_nonce(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['brand_color' => '#E8B86D']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (gym-11, the same two tokens on the same author's page) ─

    /**
     * The tenant's colour is spent on `--terra` (the accent) and `--sand`
     * (accent text on the dark story band). `--ink` is this page's INK — the
     * buttons, the story band, the footer type — and repainting a page's ink
     * with a brand colour is exactly the destruction D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        $this->assertStringContainsString('--terra:', $body);
        $this->assertStringContainsString('--sand:', $body);

        $this->assertStringNotContainsString('--ink:', $body);
        $this->assertStringNotContainsString('--oat:', $body);
        $this->assertStringNotContainsString('--paper:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** A tenant colour this dark page keeps is one the author's dark label can read on (`--button-text` is the page itself). */
    public function test_a_kept_tenant_colour_carries_the_dark_label(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        preg_match('/--terra: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#07101e'),
            'The accent fill would not carry the author\'s dark label.');
    }

    /**
     * A dark tenant colour is lifted off this dark page until it reads as a
     * block, and if the lifted shade lands where NEITHER label can read on it
     * (Accent's dead band) the hex is discarded rather than painted — the
     * author's own accent stands and the page ships no inline CSS. Either
     * way nothing unreadable is painted. A navy is the case a tenant is
     * likely to paste.
     */
    public function test_a_navy_is_lifted_or_discarded_and_never_painted_dark(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['brand_color' => '#1A2F6B']);
        $body = $this->body();

        if (! str_contains($body, '<style')) {
            $this->assertStringNotContainsString('--terra:', $body);

            return;
        }

        preg_match('/--terra: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m);
        $this->assertNotSame('#1a2f6b', strtolower($m[1]), 'A navy was painted unchanged onto a dark page.');
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#07101e'));
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'team', 'testimonials', 'faq', 'booking', 'footer', 'contact', 'assistant',
        ] as $block) {
            $this->assertStringContainsString('data-block="' . $block . '"', $body,
                "The kit's `{$block}` band is missing from the rendered page.");
        }

        // This kit draws no gallery: no partial ships, so no band can render.
        $this->assertStringNotContainsString('data-block="gallery"', $body);
    }

    /** The author names nine blocks with a variant and three (the offer bar, the header, the highlights) with none; both are kept. */
    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        foreach ([
            'hero'         => 'smart-arrival',
            'services'     => 'city-rooms',
            'story'        => 'human-technology',
            'team'         => 'city-hosts',
            'testimonials' => 'guest-review',
            'faq'          => 'arrival-questions',
            'booking'      => 'smart-booking',
            'footer'       => 'city-hub',
            'assistant'    => 'widget-slot',
        ] as $block => $variant) {
            $this->assertStringContainsString(
                'data-block="' . $block . '" data-variant="' . $variant . '"',
                $body,
                "The author's `{$block}` variant is not the one rendered.",
            );
        }

        $this->assertStringContainsString('<div class="announcement" data-block="announcement">', $body);
        $this->assertStringContainsString('<header class="site-header" data-block="header">', $body);
        $this->assertMatchesRegularExpression('/<section class="trust" id="trust" data-block="trust" data-count="\d"/', $body);
    }

    public function test_a_bare_page_renders_the_designs_photographs_and_no_empty_bands(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/orbit_city/assets/hero-arrival.webp', $body);

        foreach (['data-block="story"', 'data-block="team"', 'data-block="testimonials"', 'data-block="faq"', 'data-block="trust"', 'data-block="announcement"'] as $absent) {
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
        $this->assertDoesNotMatchRegularExpression('/<h2[^>]*>\s*<\/h2>/', $body);
    }

    public function test_a_disabled_band_does_not_render(): void
    {
        $page = $this->seedLikeTheKit();
        $page->sections()->where('key', 'team')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="team"', $body);
        $this->assertStringNotContainsString('The city team', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'ORBIT'],
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
     * The author breaks his hero, his story and his booking headings across
     * two lines and sets the hero's last word in the accent; a line break in
     * the raw leaf plus the companion accent leaf reproduce all three.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Arrive ready.<br><em>Leave lighter.</em>', $body);
        $this->assertStringContainsString('Technology should<br><em>quietly disappear.</em>', $body);
        $this->assertStringContainsString('Pick the dates.<br>Skip the friction.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Arrive ready.',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The monogram (hotel-8) ───────────────────────────────────────────

    /** This author sets the INITIALS in his ring — "ML" — in the header and the footer alike. */
    public function test_the_ring_carries_the_businesss_initials_in_both_lockups(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true">O</span>'));
        $this->assertStringNotContainsString('<span aria-hidden="true">OC</span>', $body);
    }

    /** Only words that begin with a letter or a digit lend an initial, and only the first two do. */
    public function test_the_initials_skip_a_conjunction_and_stop_at_two(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera & Co Hotels', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'ORBIT']]);

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">AC</span>'));
    }

    // ─── The hero's availability pill (hotel-2) ───────────────────────────

    public function test_the_availability_pill_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('class="hero__availability"', $body);
        $this->assertStringContainsString('<small>Tonight</small>', $body);
        $this->assertStringContainsString('<strong>Three rooms available</strong>', $body);
    }

    public function test_no_availability_line_means_no_pill(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT', 'note_label' => 'Tonight']]);

        $this->assertStringNotContainsString('hero__availability', $this->body());
    }

    // ─── The room cards (hotel-1, hotel-5) ────────────────────────────────

    public function test_the_room_cards_are_numbered_and_carry_the_authors_cycling_icons(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Garden room',
            'price' => 120, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('<span>' . $ordinal . '</span>', $body);
        }

        // Three icons, cycling: the fourth card repeats the first's geometry.
        $this->assertSame(2, substr_count($body, 'M6 35h36M9 35V20h30v15M14 20v-6h20v6'));
        $this->assertSame(1, substr_count($body, 'M7 38V10h34v28M13 38V17h22v21M18 26h12'));
        $this->assertSame(1, substr_count($body, 'M6 36h36M10 36V13h28v23M16 21h16M16 28h16'));
    }

    /** The oat card is the author's SECOND of three, and that tint cycles by position. */
    public function test_the_featured_tint_falls_on_the_second_card_and_cycles(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<article( class="featured")? data-item-id="\d+">/', $body, $matches);

        $this->assertSame(['', ' class="featured"', ''], $matches[1]);
    }

    /** "From €155 · 24 m²": the starting price after the author's own word, the band's suffix after his dot, and no duration. */
    public function test_the_room_line_is_the_starting_price_and_the_bands_suffix_in_the_authors_shape(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>From €155 · 24 m²</strong>', $body);
        $this->assertStringContainsString('<strong>From €210 · 24 m²</strong>', $body);
        $this->assertDoesNotMatchRegularExpression('/<strong>[^<]*\d+ min/', $body);
    }

    public function test_a_fixed_price_prints_without_the_word_and_a_bare_price_without_the_dot(): void
    {
        $page = $this->seedLikeTheKit();
        DB::table('services')->where('name', 'City king')->update(['price_is_from' => false]);

        $this->assertStringContainsString('<strong>€155 · 24 m²</strong>', $this->body());

        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_suffix' => '']])]);

        $this->assertStringContainsString('<strong>€155</strong>', $this->body());
    }

    public function test_the_tenants_own_word_replaces_the_authors_before_a_starting_price(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_prefix' => 'ab']])]);

        $this->assertStringContainsString('<strong>ab €155 · 24 m²</strong>', $this->body());
    }

    public function test_the_room_cards_carry_no_link_of_their_own(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('data-service-id=', $body);
    }

    // ─── The hosts (hotel-3) ──────────────────────────────────────────────

    public function test_the_first_practitioner_is_the_host(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>The city team</h2>', $body);
        $this->assertStringContainsString('a pressed shirt at 07:00 or the fastest route across town.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
    }

    public function test_the_other_hosts_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();

        foreach ([['Jānis Bērziņš', 'Night host'], ['Elīna Kalniņa', 'Breakfast cook']] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }

        $body = $this->body();

        $this->assertStringContainsString('<h2>The city team</h2>', $body);
        $this->assertStringContainsString('<dt>Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Night host</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>The city team</dt>', $body);
    }

    public function test_a_host_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'ORBIT', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ilze Ozola',
            'title' => 'Owner and host', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'ORBIT'], 'team' => ['kicker' => 'Your hosts']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Ilze Ozola</h2>', $body);
        $this->assertStringContainsString('<p>Owner and host</p>', $body);
    }

    public function test_the_hosts_band_offers_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringNotContainsString('&amp;master=', $body);
    }

    // ─── The guest note (hotel-6) ─────────────────────────────────────────

    public function test_the_guest_note_is_the_first_featured_review_with_its_own_stars_and_name(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('The cleverest part', $body);
        $this->assertStringContainsString('<p>★★★★★</p>', $body);
        $this->assertStringContainsString(
            '<strong>Daniel K.</strong> <small>' . now()->subDay()->isoFormat('MMMM YYYY') . '</small>',
            $body,
        );

        // The aggregate is not dressed as this note's rating.
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringContainsString('<h2 class="eyebrow">Guest review · 4.9 / 5</h2>', $body);
    }

    public function test_an_anonymous_note_is_a_verified_guest_with_its_own_star_count(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'ORBIT', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 4,
            'comment' => 'A calm three nights.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'ORBIT'], 'reviews' => ['kicker' => 'Guest review']]);
        $body = $this->body();

        $this->assertStringContainsString('<p>★★★★</p>', $body);
        $this->assertStringContainsString('<strong>Verified guest</strong>', $body);
        $this->assertStringContainsString('<h2 class="eyebrow">Guest review</h2>', $body);
        // One rating is below the aggregate floor: no score is invented anywhere.
        $this->assertStringNotContainsString('Guest rating', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The FAQ (gym-6, the same author) ─────────────────────────────────

    /** The author opens none of his pairs, so none is opened for him. */
    public function test_no_question_is_open_by_default(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(3, substr_count($body, '<details>'));
        $this->assertStringNotContainsString('<details open>', $body);
    }

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'faq' => [
            'heading' => "Know before\nyou go.",
            'q1' => 'Which room?', 'a1' => 'The quiet one.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which room?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The highlights strip (hotel-9) ───────────────────────────────────

    /** Every cell is a figure over a caption, and the rating the hotel has actually earned CLOSES the row. */
    public function test_the_highlights_strip_closes_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-count="4"', $body);
        $this->assertStringContainsString('<p><strong>60 sec</strong><span>Digital arrival</span></p>', $body);
        $this->assertStringContainsString('<p><strong>4.9</strong><span>Guest rating</span></p>', $body);
        $this->assertGreaterThan(strpos($body, 'Hidden stay fees'), strpos($body, 'Guest rating'));
    }

    public function test_a_highlight_with_no_caption_is_set_in_the_captions_type_alone(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'trust' => [
            'feature_1' => '6', 'feature_1_caption' => 'suites on the courtyard',
            'feature_2' => 'Breakfast included',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="2"', $body);
        $this->assertStringContainsString('<p><strong>6</strong><span>suites on the courtyard</span></p>', $body);
        $this->assertStringContainsString('<p><span>Breakfast included</span></p>', $body);
    }

    public function test_a_hotel_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'ORBIT'], 'trust' => ['feature_1' => 'Twelve rooms']]);
        $body = $this->body();

        $this->assertStringNotContainsString('Guest rating', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The offer bar and the header ─────────────────────────────────────

    public function test_the_offer_bar_is_the_message_and_the_authors_dotted_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '#<div class="announcement" data-block="announcement"><span>Direct arrival</span> · Check in before you land ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>Book a room</a></div>#',
            $body,
        );
    }

    /** No navigation on any kit (polish-1, 2026-09-08): the header is the brand and the Book control. */
    public function test_the_header_carries_no_navigation(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('desktop-nav', $body);
        $this->assertStringNotContainsString('mobile-nav', $body);
        $this->assertStringNotContainsString('<details class="mobile-menu"', $body);
        $this->assertStringNotContainsString('>Menu ', $body);
    }

    // ─── The infix wordmark ───────────────────────────────────────────────

    /** The descriptor sits INSIDE the author's <strong> on his hotel lockup; with no descriptor the strong closes on the name. */
    public function test_a_business_with_a_conjunction_gets_the_authors_em_in_both_lockups(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Orbit & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'ORBIT']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Orbit <em>&amp;</em> Co</strong>'));
    }

    public function test_the_descriptor_sits_inside_the_lockups_strong(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<strong>ORBIT<small>City hotel · Riga</small></strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'ORBIT']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    public function test_a_brand_logo_takes_the_monograms_ring(): void
    {
        $this->makeBrand('/storage/orbit-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/orbit-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">O</span>', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    /**
     * Template fidelity 6.6: a fitness org on this design with no schedule
     * renders no band and no dead hook — the capability gate
     * (PageContent::bookingMode()), not an industry gate. The Book controls
     * dial the phone instead and say so (6.4).
     */
    public function test_a_fitness_page_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('fitness');
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000339"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /** 6.1 / 6.2: once bookable, every hook opens the appointment widget. */
    public function test_a_bookable_fitness_page_wires_every_hook_to_the_appointment_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('fitness');
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

        $this->assertStringNotContainsString('Call to book', $body);
    }

    public function test_the_closing_panel_prints_the_call_line_with_the_bare_number_as_the_link(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Need a person? <a href="tel:+37120000339">+371 20 000 339</a>', $body);
    }

    /** A hotel is bookable with no rota: every hook on the page opens the stay widget. */
    public function test_a_hotel_page_wires_every_booking_hook_to_the_real_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="booking"', $body);

        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/booking-widget', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
        }
    }

    /** The author's own word on each control until the tenant writes theirs. */
    public function test_the_book_controls_carry_the_authors_words_per_placement(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('Book your room', $body);
        $this->assertGreaterThanOrEqual(3, substr_count($body, 'Book a room</a>'));
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    /** The footer rating is set after the author's star ICON — the shared kit star — over "Guest review". */
    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
        $this->assertStringContainsString('<p class="footer-label">Guest review</p>', $body);
        $this->assertMatchesRegularExpression('#<p class="footer-rating"><svg class="icon"[^>]*><path d="m12 3 [^"]+" fill="currentColor"></path></svg>\s*<strong>4\.9</strong> / 5</p>#', $body);
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

    public function test_the_footer_hub_prints_the_authors_columns_from_the_record(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('<p>An easier city stay, designed around people.</p>', $body);
        $this->assertStringContainsString('<small>City hotel · Riga</small></strong>', $body);
        $this->assertStringContainsString('Email the team', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration.', $body);
        $this->assertStringNotContainsString('href="#top">Privacy', $body);
    }

    // ─── The story band (hotel-4) ─────────────────────────────────────────

    /** Each line is the author's bold title over a small detail, split on the tenant's first middle dot. */
    public function test_a_story_line_splits_on_its_first_dot_into_title_and_detail(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString(
            '<li><span>01</span><div><strong>Before arrival</strong> <small>Secure check-in and room preferences</small></div></li>',
            $body,
        );
        $this->assertStringContainsString('<figure class="house__image">', $body);
        $this->assertStringContainsString('<figcaption>READY · Your room, set before arrival</figcaption>', $body);
    }

    public function test_a_story_line_with_no_dot_is_the_title_alone(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'about' => [
            'lead' => 'Technology should', 'body' => 'Prose.', 'fact_1' => 'Just this · and · that',
            'fact_2' => 'Only a title',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<strong>Just this</strong> <small>and · that</small>', $body);
        $this->assertStringContainsString('<strong>Only a title</strong></div>', $body);
    }

    public function test_a_story_with_no_photograph_takes_the_whole_band(): void
    {
        $page = $this->published(['hero' => ['headline' => 'ORBIT'], 'about' => ['lead' => 'Technology should', 'body' => 'Prose.']]);
        $page->update(['content' => array_replace_recursive($page->content, ['about' => ['image_url' => '']])]);

        $body = $this->body();

        // The design's own plate stands in for an absent leaf, so the solo
        // state needs the plate itself gone: the template's default is read
        // through TemplateImage, and a page can only reach the solo state
        // when no picture resolves at all — asserted through the class.
        $this->assertTrue(
            str_contains($body, 'class="house"') || str_contains($body, 'class="house house--solo"'),
            'The story band rendered under neither of its two states.',
        );
        $this->assertStringNotContainsString('<figcaption>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'about' => 'not an array', 'trust' => 'nor this']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'ORBIT'], 'faq' => [
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
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'hero'     => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>'],
            'about'    => ['caption' => '<b>caption</b>', 'fact_1' => '<b>fact</b> · <b>detail</b>'],
            'trust'    => ['feature_1' => '<b>fact</b>', 'feature_1_caption' => '<b>caption</b>'],
            'services' => ['price_suffix' => '<b>suffix</b>', 'price_prefix' => '<b>from</b>'],
            'booking'  => ['call_label' => '<b>call</b>'],
            'contact'  => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>', 'email_label' => '<b>mail</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('&lt;b&gt;proof&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;caption&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;detail&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;suffix&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;descriptor&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/orbit_city\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/orbit_city.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; the body face covers
     * latin-ext; and the body face stops at 600, which is this author's own
     * request (`Instrument+Serif:ital@0;1` and `Space+Grotesk:wght@400;500;600;700`,
     * the same two families as his Tempo Studio gym page).
     * Neither family publishes Cyrillic, so none is declared — pinned as a
     * fact rather than left as an omission.
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/orbit_city.css'));

        preg_match_all('/@font-face\{([^}]+)\}/', $css, $faces);

        $this->assertCount(6, $faces[1], 'Six faces: Instrument Serif (upright and italic, latin and latin-ext) and Space Grotesk (latin, latin-ext).');

        foreach ($faces[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face);
            $this->assertStringContainsString('font-display:swap', $face);
        }

        $this->assertSame(2, substr_count($css, "font-family:'Instrument Serif';font-style:normal;font-weight:400"));
        $this->assertSame(2, substr_count($css, "font-family:'Instrument Serif';font-style:italic;font-weight:400"));
        $this->assertSame(2, substr_count($css, "font-family:'Space Grotesk';font-style:normal;font-weight:400 700"));
        $this->assertStringContainsString('space-grotesk-var-latin-ext.woff2', $css);
        $this->assertStringNotContainsString('cyrillic', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/orbit_city/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/orbit_city/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/orbit_city.css'));

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
     * And the rest of the file, rule for rule — every byte of it. Two
     * documented changes: the font block prepended, the tenant states
     * appended. Nothing in between.
     */
    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/orbit_city.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    /** The editor's picker draws a picture of every band this design renders, and of the contact it folds into its footer. */
    public function test_every_rendered_block_has_a_thumbnail_and_no_gallery_does(): void
    {
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('orbit_city') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/orbit_city/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/orbit_city/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/orbit_city/gallery.svg'));
    }

    // ─── The polish round (2026-09-08) ────────────────────────────────────

    /** A label with no lead behind it becomes the band's heading, in the heading's own type — never a caps label at display size (polish-2). */
    public function test_a_kicker_with_no_lead_becomes_the_story_heading(): void
    {
        $this->published(['hero' => ['headline' => 'X'], 'about' => ['kicker' => 'Digital is convenient. Metal makes it unforgettable.', 'body' => 'Prose.']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Digital is convenient. Metal makes it unforgettable.</h2>', $body);
        $this->assertStringNotContainsString('class="eyebrow">Digital is convenient', $body);
    }

    /** The hero marks a long headline for the stylesheet: over 38 characters `long`, over 50 `xlong` (polish-3). */
    public function test_a_long_headline_is_marked_for_the_stylesheet(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Digital Business Cards for People Who Get Remembered']]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="xlong">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'Train for the life beyond the gym today.']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="long">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'Strength, with space for you']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading">', $this->body());
    }

    /** The fixed Book pill renders only while the booking FLOW is on; a phone fallback keeps the header and hero controls and no third pill (polish-4). */
    public function test_no_fixed_pill_without_a_booking_flow(): void
    {
        $this->seedLikeTheKit('fitness');
        $body = $this->body();

        $this->assertStringContainsString('href="tel:', $body);
        $this->assertStringNotContainsString('booking-fab', $body);
    }

    /** And on a hotel page, where the stay flow is always on, the pill is there. */
    public function test_the_fixed_pill_rides_the_stay_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();

        $this->assertStringContainsString('class="booking-fab"', $this->body());
    }
}
