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
 * Aera Reformer — the first GymTech kit, rendered as a real template.
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
 * Every hostile-value battery that protects the six templates before it is
 * repeated here, because they are independent sets of Blade files and a
 * guard that only six of them make is a guard the seventh does not have.
 *
 * The rulings this design needed of its own (gym-1..19 in the ledger) are
 * each pinned below: the availability pill, the numbered session cards with
 * the author's cycling icons and tint, the lead-coach composition, the
 * single member note, the four-cell fact strip, and a FAQ that opens nothing.
 */
class AeraReformerRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/gym-tech/01-aera-reformer';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'fitness'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'aera',
            'template_key' => 'aera_reformer', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Strength, with space.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Aera', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/aera')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/aera')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in three places. */
    private function seedRatings(bool $featureFirst = true): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 5,
            'comment' => 'I never felt behind. Every adjustment made sense, and after a month I could feel the difference outside the studio too.',
            'is_featured' => $featureFirst, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Member ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Calm, precise and genuinely welcoming.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing panel is gated on capability
     * (`PageContent::bookingMode()`): a hotel is bookable through the stay
     * widget with no rota, which is the cheap way to get every band on the
     * page at once; the fitness path is exercised by the widget tests below.
     */
    private function seedLikeTheKit(string $industry = 'fitness'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera',
            'phone' => '+371 20 000 711', 'email' => 'hello@aera.example',
            'address' => '14 Miera iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Private foundation', 'One-to-one assessment, equipment orientation and a plan shaped around you.', 55, 65],
            ['Small-group reformer', 'Progressive full-body sessions with individual cues and six places only.', 50, 24],
            ['Restore & mobility', 'A slower class for control, range and better recovery between busy weeks.', 50, 22],
        ] as $i => [$name, $short, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Mara Ozola',
            'title' => 'Comprehensive Pilates instructor',
            'bio'   => 'Comprehensive Pilates instructor focused on clear cueing, sustainable strength and welcoming first sessions.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'Introductory private sessions now available',
                'cta_label' => 'View times',
            ],
            'hero' => [
                'kicker'          => 'Move with attention',
                'headline'        => "Strength,\nwith",
                'headline_accent' => 'space.',
                'subtext'         => 'Private and small-group reformer Pilates for steadier movement, practical strength and a body you understand better.',
                'cta_label'       => 'Book your first session',
                'note_label'      => 'Next private session',
                'proof'           => 'Thursday · 17:30',
            ],
            'trust' => [
                'feature_1' => 'Maximum 6 per class',
                'feature_2' => 'First-timer friendly',
                'feature_3' => 'LV / EN coaching',
            ],
            'services' => [
                'kicker'  => 'Choose your session',
                'heading' => 'Start where you are.',
                'subtext' => 'Every format is coached closely. Begin privately if you want more time, or join a small class at the right level.',
            ],
            'about' => [
                'kicker'  => 'The Aera approach',
                'lead'    => "Precise does not\nmean intimidating.",
                'body'    => 'We explain the machine, the purpose and the sensation we are looking for. Progress comes from repeatable movement—not performing for the room.',
                'fact_1'  => 'Learn the setup',
                'fact_2'  => 'Build useful strength',
                'fact_3'  => 'Progress with clarity',
                'caption' => 'One cue at a time',
            ],
            'team' => [
                'kicker' => 'Your lead coach',
            ],
            'reviews' => [
                'kicker' => 'Member note',
            ],
            'faq' => [
                'kicker'  => 'Before your first class',
                'heading' => 'Come as you are.',
                'q1' => 'Do I need Pilates experience?',
                'a1' => 'No. New members can begin with a private foundation session or an introductory small-group class.',
                'q2' => 'What should I wear?',
                'a2' => 'Comfortable fitted movement clothing and grip socks. Everything else is provided.',
                'q3' => 'Can I join with an injury?',
                'a3' => 'Tell us before booking. We will discuss whether a private session or clearance from your clinician is appropriate.',
            ],
            'booking' => [
                'kicker'     => 'Your first hour',
                'heading'    => "Begin with\ngood attention.",
                'terms'      => 'Choose a private foundation or an introductory class. We will help with the rest.',
                'cta_label'  => 'Book a session',
                'call_label' => 'Prefer to call?',
            ],
            'contact' => [
                'descriptor'       => 'Reformer studio · Riga',
                'email_label'      => 'Email the studio',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/aera.example',
                'social_facebook'  => 'https://facebook.com/aera.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Thoughtful reformer Pilates in a calm small-group studio.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/aera_reformer/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/aera_reformer/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Aera']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (gym-11) ──────────────────────────────────────────────

    /**
     * The tenant's colour is spent on `--terra` (the accent) and `--sand`
     * (accent text on the dark story band). `--ink` is this page's INK — the
     * buttons, the story band, the footer type — and repainting a page's ink
     * with a brand colour is exactly the destruction D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'Aera']], ['brand_color' => '#8E2A5B']);
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
        $this->published(['hero' => ['headline' => 'Aera']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Aera']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own ivory page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Aera']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--terra: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto an ivory page.');
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
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

    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement' => 'studio-note',
            'header'       => 'floating-calm',
            'hero'         => 'reformer-editorial',
            'trust'        => 'studio-facts',
            'services'     => 'session-cards',
            'story'        => 'coached-movement',
            'team'         => 'lead-coach',
            'testimonials' => 'member-note',
            'faq'          => 'first-session',
            'booking'      => 'first-session-cta',
            'footer'       => 'studio-hub',
            'assistant'    => 'widget-slot',
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
        $this->assertStringContainsString('landing/aera_reformer/assets/hero-reformer.webp', $body);

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
        $page = $this->seedLikeTheKit('hotel');
        $page->sections()->where('key', 'team')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="team"', $body);
        $this->assertStringNotContainsString('Mara Ozola', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Aera'],
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
     * The author breaks his hero and his story and booking headings across
     * two lines and sets the hero's last word in the accent; a line break in
     * the raw leaf plus the companion accent leaf reproduce all three.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Strength,<br>with <em>space.</em>', $body);
        $this->assertStringContainsString('Precise does not<br>mean intimidating.', $body);
        $this->assertStringContainsString('Begin with<br>good attention.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Strength, with',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The hero's availability pill (gym-1) ─────────────────────────────

    public function test_the_availability_pill_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('class="hero__availability"', $body);
        $this->assertStringContainsString('<small>Next private session</small>', $body);
        $this->assertStringContainsString('<strong>Thursday · 17:30</strong>', $body);
    }

    public function test_no_availability_line_means_no_pill(): void
    {
        $this->published(['hero' => ['headline' => 'Aera', 'note_label' => 'Next private session']]);

        $this->assertStringNotContainsString('hero__availability', $this->body());
    }

    // ─── The session cards (gym-2) ────────────────────────────────────────

    public function test_the_session_cards_are_numbered_and_carry_the_authors_cycling_icons(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Open studio',
            'price' => 18, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('<span>' . $ordinal . '</span>', $body);
        }

        // Three icons, cycling: the fourth card repeats the first's geometry.
        $this->assertSame(2, substr_count($body, 'M13 14V9m22 5V9M13 39v-5m22 5v-5'));
        $this->assertSame(1, substr_count($body, 'M7 39c1-8 5-12 10-12s9 4 10 12'));
        $this->assertSame(1, substr_count($body, 'M24 5c-3 10-13 13-13 24a13 13 0 0 0 26 0C37 18 27 15 24 5Z'));
    }

    /** The oat card is the author's SECOND of three, and that tint cycles by position. */
    public function test_the_featured_tint_falls_on_the_second_card_and_cycles(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<article( class="featured")? data-item-id="\d+">/', $body, $matches);

        $this->assertSame(['', ' class="featured"', ''], $matches[1]);
    }

    public function test_the_session_meta_line_is_minutes_and_price_in_the_authors_shape(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>55 min · €65</strong>', $body);
        $this->assertStringContainsString('<strong>50 min · €24</strong>', $body);
    }

    public function test_a_starting_price_prints_the_word_before_it(): void
    {
        $this->seedLikeTheKit();
        DB::table('services')->where('name', 'Private foundation')->update(['price_is_from' => true]);

        $this->assertStringContainsString('<strong>55 min · from €65</strong>', $this->body());
    }

    public function test_the_session_cards_carry_no_link_of_their_own(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringNotContainsString('data-service-id=', $body);
    }

    // ─── The lead coach (gym-4) ───────────────────────────────────────────

    public function test_the_first_practitioner_is_the_lead_coach(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>Mara Ozola</h2>', $body);
        $this->assertStringContainsString('focused on clear cueing, sustainable strength and welcoming first sessions.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
    }

    public function test_the_other_coaches_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();

        foreach ([['Jānis Bērziņš', 'Strength coach'], ['Elīna Kalniņa', 'Mobility specialist']] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }

        $body = $this->body();

        $this->assertStringContainsString('<h2>Mara Ozola</h2>', $body);
        $this->assertStringContainsString('<dt>Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Strength coach</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>Mara Ozola</dt>', $body);
    }

    public function test_a_coach_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Mara Ozola',
            'title' => 'Comprehensive Pilates instructor', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Aera'], 'team' => ['kicker' => 'Your lead coach']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Mara Ozola</h2>', $body);
        $this->assertStringContainsString('<p>Comprehensive Pilates instructor</p>', $body);
    }

    public function test_the_coach_band_offers_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();

        $body = $this->body();

        $this->assertStringNotContainsString('&amp;master=', $body);
    }

    // ─── The member note (gym-5) ──────────────────────────────────────────

    public function test_the_member_note_is_the_first_featured_review_with_the_studios_rating(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('I never felt behind.', $body);
        $this->assertStringContainsString('<p class="rating">★ 4.9 / 5</p>', $body);
        $this->assertStringContainsString('Verified member · Riga', $body);
    }

    public function test_a_named_member_is_credited_by_name(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Anna K.', 'overall_rating' => 5,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Aera'], 'reviews' => ['kicker' => 'Member note']]);
        $body = $this->body();

        $this->assertStringContainsString('Anna K. · Riga', $body);
        // One rating is below the aggregate floor: no score is invented.
        $this->assertStringNotContainsString('class="rating"', $body);
    }

    // ─── The FAQ (gym-6) ──────────────────────────────────────────────────

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
        $this->published(['hero' => ['headline' => 'Aera'], 'faq' => [
            'heading' => 'Come as you are.',
            'q1' => 'Which session?', 'a1' => 'The closest one.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which session?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Aera'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The fact strip (gym-7) ───────────────────────────────────────────

    public function test_the_fact_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-variant="studio-facts" data-count="4"', $body);
        $this->assertStringContainsString('<p><strong>4.9</strong> member rating</p>', $body);
        $this->assertStringContainsString('<p>Maximum 6 per class</p>', $body);
    }

    public function test_a_paired_highlight_sets_its_value_in_the_authors_strong(): void
    {
        $this->published(['hero' => ['headline' => 'Aera'], 'trust' => [
            'feature_1' => '6', 'feature_1_caption' => 'places per class',
            'feature_2' => 'First-timer friendly',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="2"', $body);
        $this->assertStringContainsString('<p><strong>6</strong> places per class</p>', $body);
        $this->assertStringContainsString('<p>First-timer friendly</p>', $body);
    }

    public function test_a_studio_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Member ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Aera'], 'trust' => ['feature_1' => 'Small classes']]);
        $body = $this->body();

        $this->assertStringNotContainsString('member rating', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The offer bar and the header (gym-8) ─────────────────────────────

    public function test_the_offer_bar_is_the_message_and_the_authors_dotted_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<p>Introductory private sessions now available ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>View times<\/a>/',
            $body,
        );
    }

    public function test_the_header_links_only_to_bands_that_render(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->sections()->where('key', 'team')->update(['enabled' => false]);

        $body = $this->body();

        preg_match('/<nav class="desktop-nav"[^>]*>(.*?)<\/nav>/s', $body, $nav);

        $this->assertNotEmpty($nav, 'The desktop nav is missing.');
        $this->assertStringNotContainsString('href="#team"', $nav[1]);
        $this->assertStringContainsString('href="#services"', $nav[1]);
        $this->assertLessThanOrEqual(4, substr_count($nav[1], '<a '));
    }

    // ─── The infix wordmark ───────────────────────────────────────────────

    public function test_a_business_with_a_conjunction_gets_the_authors_em_in_both_lockups(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Aera & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Aera']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Aera <em>&amp;</em> Co</strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Aera']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    public function test_a_brand_logo_takes_the_monograms_ring(): void
    {
        $this->makeBrand('/storage/aera-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/aera-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">A</span>', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    /**
     * Template fidelity 6.6: a fitness org with no schedule renders no band
     * and no dead hook — the capability gate (PageContent::bookingMode()),
     * not an industry gate. The Book controls dial the phone instead and say
     * so (6.4).
     */
    public function test_a_fitness_page_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000711"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /** 6.1 / 6.2: once bookable, every hook opens the appointment widget. */
    public function test_a_bookable_fitness_page_wires_every_hook_to_the_appointment_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
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
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Prefer to call? <a href="tel:+37120000711">+371 20 000 711</a>', $body);
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

    /** The author's own word on each control until the tenant writes theirs. */
    public function test_the_book_controls_carry_the_authors_words_per_placement(): void
    {
        $this->seedWidgetOrganization();
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, ['booking' => ['cta_label' => '']])]);

        $body = $this->body();

        $this->assertStringContainsString('Book your first session</a>', $body);
        $this->assertGreaterThanOrEqual(4, substr_count($body, 'Book a session</a>'));
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Member notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
        $this->assertStringContainsString('<p class="footer-rating">★ <strong>4.9</strong> / 5</p>', $body);
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

    // ─── The footer hub (gym-10) ──────────────────────────────────────────

    public function test_the_footer_hub_prints_the_authors_columns_from_the_record(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Member notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('<p>Thoughtful reformer Pilates in a calm small-group studio.</p>', $body);
        $this->assertStringContainsString('<small>Reformer studio · Riga</small>', $body);
        $this->assertStringContainsString('Email the studio', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration.', $body);
        $this->assertStringNotContainsString('href="#top">Privacy', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Aera']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Aera'], 'about' => 'not an array', 'trust' => 'nor this']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Aera', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Aera'], 'faq' => [
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
            'hero'    => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>'],
            'about'   => ['caption' => '<b>caption</b>', 'fact_1' => '<b>fact</b>'],
            'trust'   => ['feature_1' => '<b>fact</b>', 'feature_1_caption' => '<b>caption</b>'],
            'booking' => ['call_label' => '<b>call</b>'],
            'contact' => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>', 'email_label' => '<b>mail</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('&lt;b&gt;proof&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;caption&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;descriptor&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/aera_reformer\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/aera_reformer.css'));

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
     * request (`DM+Sans:wght@400;500;600`). Neither family publishes
     * Cyrillic, so none is declared — pinned as a fact rather than left as
     * an omission.
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/aera_reformer.css'));

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
        $shipped = glob(public_path('landing/aera_reformer/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/aera_reformer/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/aera_reformer.css'));

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
        $css = file_get_contents(public_path('landing/aera_reformer.css'));

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
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('aera_reformer') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/aera_reformer/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/aera_reformer/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/aera_reformer/gallery.svg'));
    }
}
