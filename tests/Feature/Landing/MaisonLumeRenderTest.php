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
 * Maison Lume — the first HotelTech kit, rendered as a real template.
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
 * a hotel, so AeraReformerRenderTest is the base of this file and the
 * differences are the hotel's own shapes — the initials in the ring, the
 * figure-and-caption highlight cells with the rating last, the room cards'
 * price line, the story list's title-over-detail lines, the guest note's own
 * stars, and a page whose booking flow is the stay widget with no rota to
 * check. Each is a numbered hotel-N ruling in the ledger and is pinned below.
 */
class MaisonLumeRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/hotel-tech/01-maison-lume';

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
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'maison',
            'template_key' => 'maison_lume', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Stay somewhere that feels kept.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Maison Lume', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/maison')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/maison')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in two places — the first of them the note he quotes, signed. */
    private function seedRatings(bool $featureFirst = true, ?string $firstName = 'Sofia M.'): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => $firstName, 'overall_rating' => 5,
            'comment' => 'It felt less like checking in and more like someone had quietly prepared the city for us.',
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Lume',
            'phone' => '+371 20 000 114', 'email' => 'stay@maisonlume.example',
            'address' => '17 Mazā Pils iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Courtyard room', 'Quiet and intimate, with limewashed walls and morning light.', 145],
            ['Old-city suite', 'More room to settle in, with rooftop views and a separate sitting area.', 220],
            ['House apartment', 'A private floor for longer stays, with a kitchen and dining table.', 285],
        ] as $i => [$name, $short, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'price' => $price, 'price_is_from' => true,
                'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ilze & Martins',
            'title' => 'Your hosts',
            'bio'   => 'Born in Riga, returned after years abroad, and always ready with the right table, gallery or quiet street.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'Direct bookings include breakfast and flexible checkout',
                'cta_label' => 'Check your dates',
            ],
            'hero' => [
                'kicker'          => 'A quieter address in the old city',
                'headline'        => "Stay somewhere\nthat feels",
                'headline_accent' => 'kept.',
                'subtext'         => 'Twelve rooms in a restored townhouse, with thoughtful mornings, local recommendations and space to arrive slowly.',
                'cta_label'       => 'Check availability',
                'note_label'      => 'Next available weekend',
                'proof'           => '18–20 September',
            ],
            'trust' => [
                'feature_1' => '12',    'feature_1_caption' => 'Individual rooms',
                'feature_2' => '08–11', 'feature_2_caption' => 'Breakfast, unhurried',
                'feature_3' => '24 h',  'feature_3_caption' => 'Personal arrival support',
            ],
            'services' => [
                'kicker'       => 'Choose your room',
                'heading'      => "Every room has\nits own light.",
                'subtext'      => 'Original details are kept where they matter. Modern comfort is added where you feel it.',
                'price_suffix' => 'breakfast included',
            ],
            'about' => [
                'kicker'  => 'Life at the house',
                'lead'    => "Small details.\nRemembered well.",
                'body'    => 'We keep the experience simple: a good room, a generous breakfast and a host who can point you toward the city you actually came to see.',
                'fact_1'  => 'Breakfast your way · Courtyard, room or packed for an early train',
                'fact_2'  => 'Local, not generic · Personal maps for food, art and neighbourhood walks',
                'fact_3'  => 'Arrive with ease · Flexible self-arrival or a welcome at the door',
                'caption' => 'Breakfast follows the morning, not the clock.',
            ],
            'team' => [
                'kicker' => 'Your hosts',
            ],
            'reviews' => [
                'kicker' => 'Guest note',
            ],
            'faq' => [
                'kicker'  => 'Before you arrive',
                'heading' => 'Good to know.',
                'q1' => 'What time is check-in?',
                'a1' => 'Rooms are ready from 15:00. If you arrive earlier, leave your bags and begin exploring; late self-arrival is always available.',
                'q2' => 'Is breakfast included?',
                'a2' => 'Yes, when booking directly. Breakfast is served from 08:00–11:00, with early takeaway available by request.',
                'q3' => 'Can you arrange airport transfer?',
                'a3' => 'Yes. Add your flight details when booking and we will confirm a private transfer.',
            ],
            'booking' => [
                'kicker'     => 'Your room in Riga',
                'heading'    => "Choose the dates.\nWe will make it yours.",
                'terms'      => 'Book direct for breakfast, flexible checkout when available and personal arrival support.',
                'call_label' => 'Prefer to call?',
            ],
            'contact' => [
                'descriptor'       => 'Townhouse hotel · Riga',
                'email_label'      => 'Email the house',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/maisonlume.example',
                'social_facebook'  => 'https://facebook.com/maisonlume.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Twelve considered rooms in the old city.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/maison_lume/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/maison_lume/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['brand_color' => '#8E2A5B']);

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
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['brand_color' => '#8E2A5B']);
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
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own ivory page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--terra: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto an ivory page.');
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
            'hero'         => 'townhouse-suite',
            'services'     => 'room-collection',
            'story'        => 'hosted-house',
            'team'         => 'house-hosts',
            'testimonials' => 'guest-note',
            'faq'          => 'stay-questions',
            'booking'      => 'direct-booking',
            'footer'       => 'hotel-hub',
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
        $this->assertStringContainsString('landing/maison_lume/assets/hero-suite.webp', $body);

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
        $this->assertStringNotContainsString('Ilze &amp; Martins', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Maison Lume'],
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

        $this->assertStringContainsString('Stay somewhere<br>that feels <em>kept.</em>', $body);
        $this->assertStringContainsString('Small details.<br>Remembered well.', $body);
        $this->assertStringContainsString('Choose the dates.<br>We will make it yours.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Stay somewhere that feels',
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

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true">ML</span>'));
        $this->assertStringNotContainsString('<span aria-hidden="true">M</span>', $body);
    }

    /** Only words that begin with a letter or a digit lend an initial, and only the first two do. */
    public function test_the_initials_skip_a_conjunction_and_stop_at_two(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera & Co Hotels', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Maison Lume']]);

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">AC</span>'));
    }

    // ─── The hero's availability pill (hotel-2) ───────────────────────────

    public function test_the_availability_pill_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('class="hero__availability"', $body);
        $this->assertStringContainsString('<small>Next available weekend</small>', $body);
        $this->assertStringContainsString('<strong>18–20 September</strong>', $body);
    }

    public function test_no_availability_line_means_no_pill(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume', 'note_label' => 'Next available weekend']]);

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
        $this->assertSame(2, substr_count($body, 'M6 34h36M9 34V20h30v14M13 20v-6h22v6M9 39v-5m30 5v-5'));
        $this->assertSame(1, substr_count($body, 'M7 38V10h34v28M12 38V17h24v21M18 17v21m12-21v21'));
        $this->assertSame(1, substr_count($body, 'M8 36h32M12 36V14h24v22M18 14V9h12v5M17 24h14'));
    }

    /** The oat card is the author's SECOND of three, and that tint cycles by position. */
    public function test_the_featured_tint_falls_on_the_second_card_and_cycles(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<article( class="featured")? data-item-id="\d+">/', $body, $matches);

        $this->assertSame(['', ' class="featured"', ''], $matches[1]);
    }

    /** "From €145 · breakfast included": the starting price after the author's own word, the band's suffix after his dot, and no duration. */
    public function test_the_room_line_is_the_starting_price_and_the_bands_suffix_in_the_authors_shape(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>From €145 · breakfast included</strong>', $body);
        $this->assertStringContainsString('<strong>From €220 · breakfast included</strong>', $body);
        $this->assertDoesNotMatchRegularExpression('/<strong>[^<]*\d+ min/', $body);
    }

    public function test_a_fixed_price_prints_without_the_word_and_a_bare_price_without_the_dot(): void
    {
        $page = $this->seedLikeTheKit();
        DB::table('services')->where('name', 'Courtyard room')->update(['price_is_from' => false]);

        $this->assertStringContainsString('<strong>€145 · breakfast included</strong>', $this->body());

        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_suffix' => '']])]);

        $this->assertStringContainsString('<strong>€145</strong>', $this->body());
    }

    public function test_the_tenants_own_word_replaces_the_authors_before_a_starting_price(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_prefix' => 'ab']])]);

        $this->assertStringContainsString('<strong>ab €145 · breakfast included</strong>', $this->body());
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

        $this->assertStringContainsString('<h2>Ilze &amp; Martins</h2>', $body);
        $this->assertStringContainsString('always ready with the right table, gallery or quiet street.', $body);
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

        $this->assertStringContainsString('<h2>Ilze &amp; Martins</h2>', $body);
        $this->assertStringContainsString('<dt>Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Night host</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>Ilze &amp; Martins</dt>', $body);
    }

    public function test_a_host_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Lume', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ilze Ozola',
            'title' => 'Owner and host', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Maison Lume'], 'team' => ['kicker' => 'Your hosts']]);
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
        $this->assertStringContainsString('It felt less like checking in', $body);
        $this->assertStringContainsString('<p>★★★★★</p>', $body);
        $this->assertStringContainsString(
            '<strong>Sofia M.</strong> <small>' . now()->subDay()->isoFormat('MMMM YYYY') . '</small>',
            $body,
        );

        // The aggregate is not dressed as this note's rating.
        $this->assertStringNotContainsString('class="rating"', $body);
    }

    public function test_an_anonymous_note_is_a_verified_guest_with_its_own_star_count(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Lume', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 4,
            'comment' => 'A calm three nights.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Maison Lume'], 'reviews' => ['kicker' => 'Guest note']]);
        $body = $this->body();

        $this->assertStringContainsString('<p>★★★★</p>', $body);
        $this->assertStringContainsString('<strong>Verified guest</strong>', $body);
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
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'faq' => [
            'heading' => 'Good to know.',
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
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'faq' => [
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
        $this->assertStringContainsString('<p><strong>12</strong><span>Individual rooms</span></p>', $body);
        $this->assertStringContainsString('<p><strong>4.9</strong><span>Guest rating</span></p>', $body);
        $this->assertGreaterThan(strpos($body, 'Personal arrival support'), strpos($body, 'Guest rating'));
    }

    public function test_a_highlight_with_no_caption_is_set_in_the_captions_type_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'trust' => [
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

        $this->published(['hero' => ['headline' => 'Maison Lume'], 'trust' => ['feature_1' => 'Twelve rooms']]);
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
            '/<div class="announcement" data-block="announcement">Direct bookings include breakfast and flexible checkout ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>Check your dates<\/a><\/div>/',
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Maison Lume']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Maison <em>&amp;</em> Co</strong>'));
    }

    public function test_the_descriptor_sits_inside_the_lockups_strong(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<strong>Maison Lume<small>Townhouse hotel · Riga</small></strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Maison Lume']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    public function test_a_brand_logo_takes_the_monograms_ring(): void
    {
        $this->makeBrand('/storage/maison-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/maison-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">ML</span>', $body);
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
        $this->assertStringContainsString('href="tel:+37120000114"', $body);
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

        $this->assertStringContainsString('Prefer to call? <a href="tel:+37120000114">+371 20 000 114</a>', $body);
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

        $this->assertStringContainsString('Check availability', $body);
        $this->assertGreaterThanOrEqual(3, substr_count($body, 'Book your stay</a>'));
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
        $this->assertStringContainsString('<p>Twelve considered rooms in the old city.</p>', $body);
        $this->assertStringContainsString('<small>Townhouse hotel · Riga</small></strong>', $body);
        $this->assertStringContainsString('Email the house', $body);
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
            '<li><span>01</span><div><strong>Breakfast your way</strong> <small>Courtyard, room or packed for an early train</small></div></li>',
            $body,
        );
        $this->assertStringContainsString('<figure class="house__image">', $body);
        $this->assertStringContainsString('<figcaption>Breakfast follows the morning, not the clock.</figcaption>', $body);
    }

    public function test_a_story_line_with_no_dot_is_the_title_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'about' => [
            'lead' => 'Small details.', 'body' => 'Prose.', 'fact_1' => 'Just this · and · that',
            'fact_2' => 'Only a title',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<strong>Just this</strong> <small>and · that</small>', $body);
        $this->assertStringContainsString('<strong>Only a title</strong></div>', $body);
    }

    public function test_a_story_with_no_photograph_takes_the_whole_band(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Maison Lume'], 'about' => ['lead' => 'Small details.', 'body' => 'Prose.']]);
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
        $this->published(['hero' => ['headline' => 'Maison Lume']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'about' => 'not an array', 'trust' => 'nor this']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Maison Lume'], 'faq' => [
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

        $this->assertMatchesRegularExpression('#landing/maison_lume\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/maison_lume.css'));

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
     * request (`DM+Sans:wght@400;500;600`, the same pair as his gym page).
     * Neither family publishes Cyrillic, so none is declared — pinned as a
     * fact rather than left as an omission.
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/maison_lume.css'));

        preg_match_all('/@font-face\{([^}]+)\}/', $css, $faces);

        $this->assertCount(3, $faces[1], 'Three faces: DM Sans (latin, latin-ext) and Italiana (latin).');

        foreach ($faces[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face);
            $this->assertStringContainsString('font-display:swap', $face);
        }

        $this->assertSame(2, substr_count($css, "font-family:'DM Sans';font-style:normal;font-weight:400 600"));
        $this->assertStringContainsString('dm-sans-var-latin-ext.woff2', $css);
        $this->assertStringContainsString('font-family:Italiana;font-style:normal;font-weight:400', $css);
        $this->assertStringNotContainsString('cyrillic', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/maison_lume/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/maison_lume/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/maison_lume.css'));

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
        $css = file_get_contents(public_path('landing/maison_lume.css'));

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
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('maison_lume') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/maison_lume/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/maison_lume/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/maison_lume/gallery.svg'));
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
