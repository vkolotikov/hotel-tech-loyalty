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
 * Ardea Aesthetics — the first MedTech kit, rendered as a real template.
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
 * Every hostile-value battery that protects the twelve templates before it
 * is repeated here, because they are independent sets of Blade files and a
 * guard that only twelve of them make is a guard the thirteenth does not
 * have.
 *
 * The rulings this design needed of its own (med-1..N in the ledger) are
 * each pinned below: the gallery marker that is not printed, the
 * availability card and the note line under it, the numbered treatment
 * cards with the author's cycling icons and his "From" price line, the
 * single-physician composition, the one patient note with his star icon,
 * the four-cell fact strip, and the accent that lands on his copper and his
 * sand and never on his ink.
 */
class ArdeaAestheticsRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/med-tech/01-ardea-aesthetics';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'medical'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'ardea',
            'template_key' => 'ardea_aesthetics', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Care that begins by listening.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Ardea', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/ardea')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/ardea')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in three places. */
    private function seedRatings(bool $featureFirst = true): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 5,
            'comment' => 'Nothing was rushed. I understood every option, including the choice to wait. The result feels entirely like me.',
            'is_featured' => $featureFirst, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Calm, precise and genuinely careful.', 'is_featured' => false,
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
     * page at once; the medical path is exercised by the widget tests below.
     */
    private function seedLikeTheKit(string $industry = 'medical'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ardea',
            'phone' => '+371 20 000 412', 'email' => 'care@ardea.example',
            'address' => '18 Antonijas iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Expression care', 'Consultation-led options for expression lines and facial balance.', 45, 190],
            ['Skin quality', 'Peels, hydration protocols and regenerative skin consultations.', 60, 120],
            ['Device treatments', 'Non-surgical options selected around skin condition and downtime.', 30, null],
        ] as $i => [$name, $short, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        // The author's "From €190" and "From €120": the row's starting-price mark.
        DB::table('services')->whereIn('name', ['Expression care', 'Skin quality'])->update(['price_is_from' => true]);

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Mara Vītola',
            'title' => 'Aesthetic physician',
            'bio'   => 'Aesthetic physician with a special interest in facial assessment, skin quality and conservative treatment planning.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'Thursday consultations now available',
                'cta_label' => 'View appointments',
            ],
            'hero' => [
                'kicker'          => 'Physician-led · Consultation first',
                'headline'        => "Care that begins\nby",
                'headline_accent' => 'listening.',
                'subtext'         => 'Considered aesthetic medicine for people who want to look like themselves—rested, balanced and never overdone.',
                'cta_label'       => 'Book a consultation',
                'note_label'      => 'Next consultation',
                'proof'           => 'Thu · 16:30',
                'edition'         => 'Private appointments · Tue–Sat',
            ],
            'trust' => [
                'feature_1' => 'Doctor-led planning',
                'feature_2' => 'Evidence-informed care',
                'feature_3' => 'Private city studio',
            ],
            'services' => [
                'kicker'  => 'Treatment menu',
                'heading' => "A precise plan,\nmade personal.",
                'subtext' => 'Every appointment begins with assessment and a conversation about suitability, expectations and alternatives.',
            ],
            'about' => [
                'kicker'  => 'The Ardea approach',
                'lead'    => "Enough information\nto decide well.",
                'body'    => 'We explain what a treatment can reasonably address, what it cannot, and when doing nothing is the better choice. No packages before assessment. No pressure after it.',
                'fact_1'  => 'Listen and assess',
                'fact_2'  => 'Build a measured plan',
                'fact_3'  => 'Review and refine',
                'caption' => 'Assessment before treatment',
            ],
            'team' => [
                'kicker' => 'Your physician',
            ],
            'reviews' => [
                'kicker' => 'Patient note',
            ],
            'faq' => [
                'kicker'  => 'Before you book',
                'heading' => "Clear answers,\nbefore treatment.",
                'q1' => 'Do I need a consultation first?',
                'a1' => 'Yes. Suitability, expected outcomes, alternatives and fees are discussed before any medical treatment is scheduled.',
                'q2' => 'Will I be advised about downtime?',
                'a2' => 'Yes. Your plan includes preparation, aftercare and the likely recovery window for the selected treatment.',
                'q3' => 'Are results guaranteed?',
                'a3' => 'No medical outcome can be guaranteed. Individual response varies, and your physician will explain realistic expectations.',
            ],
            'booking' => [
                'kicker'     => 'Start with a conversation',
                'heading'    => "Your consultation,\nat your pace.",
                'terms'      => 'Choose an available appointment with Dr. Vītola. Treatments are scheduled only after assessment.',
                'cta_label'  => 'Book consultation',
                'call_label' => 'Prefer to call?',
            ],
            'contact' => [
                'descriptor'       => 'Aesthetic medicine · Riga',
                'email_label'      => 'Email the clinic',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/ardea.example',
                'social_facebook'  => 'https://facebook.com/ardea.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Private, physician-led aesthetic care with consultation at its centre.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/ardea_aesthetics/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/ardea_aesthetics/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Ardea']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (med-4) ───────────────────────────────────────────────

    /**
     * The tenant's colour is spent on `--color-copper` (the accent) and
     * `--color-blue` (the author's name for the sand that sets the hero's
     * <em> and the story band's eyebrow on ink). `--color-ink` is this
     * page's INK — the buttons, the story band, the footer type — and
     * repainting a page's ink with a brand colour is exactly the destruction
     * D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-copper:', $body);
        $this->assertStringContainsString('--color-blue:', $body);

        $this->assertStringNotContainsString('--color-ink:', $body);
        $this->assertStringNotContainsString('--color-chalk:', $body);
        $this->assertStringNotContainsString('--color-paper:', $body);
        $this->assertStringNotContainsString('--color-stone:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own chalk page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-copper: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto a chalk page.');
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

        // med-1: the author's gallery marker sits on the story's three-line
        // list, which has no room for a picture. It is not printed and no
        // gallery partial ships, so no band can render.
        $this->assertStringNotContainsString('data-block="gallery"', $body);
    }

    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement' => 'consultation-note',
            'header'       => 'quiet-overlay',
            'hero'         => 'consultation-editorial',
            'trust'        => 'clinical-facts',
            'services'     => 'treatment-cards',
            'story'        => 'clinical-manifesto',
            'team'         => 'single-practitioner',
            'testimonials' => 'patient-note',
            'faq'          => 'consultation-questions',
            'booking'      => 'consultation-panel',
            'footer'       => 'clinic-hub',
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
        $this->assertStringContainsString('landing/ardea_aesthetics/assets/hero-consultation.webp', $body);

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
        $this->assertStringNotContainsString('Dr. Mara Vītola', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Ardea'],
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
     * The author breaks his hero, story, treatments, FAQ and booking
     * headings across two lines and sets the hero's last word in sand; a
     * line break in the raw leaf plus the companion accent leaf reproduce
     * all of them.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Care that begins<br>by <em>listening.</em>', $body);
        $this->assertStringContainsString('A precise plan,<br>made personal.', $body);
        $this->assertStringContainsString('Enough information<br>to decide well.', $body);
        $this->assertStringContainsString('Clear answers,<br>before treatment.', $body);
        $this->assertStringContainsString('Your consultation,<br>at your pace.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Care that begins by',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The hero's availability card and note line (med-2, med-3) ────────

    public function test_the_availability_card_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('class="hero__availability"', $body);
        $this->assertStringContainsString('<span class="availability__pulse" aria-hidden="true"></span>', $body);
        $this->assertStringContainsString('<small>Next consultation</small>', $body);
        $this->assertStringContainsString('<strong>Thu · 16:30</strong>', $body);
    }

    public function test_no_availability_line_means_no_card(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea', 'note_label' => 'Next consultation']]);

        $this->assertStringNotContainsString('hero__availability', $this->body());
    }

    /** The small uppercase line under the card is the hero's `edition` — the one hero leaf with no fixed meaning. */
    public function test_the_note_line_is_the_heros_small_mark(): void
    {
        $this->seedLikeTheKit('hotel');

        $this->assertStringContainsString('<p class="hero__note">Private appointments · Tue–Sat</p>', $this->body());
    }

    public function test_no_small_mark_means_no_note_line(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea', 'proof' => 'Thu · 16:30']]);

        $this->assertStringNotContainsString('hero__note', $this->body());
    }

    // ─── The treatment cards (med-5) ──────────────────────────────────────

    public function test_the_treatment_cards_are_numbered_and_carry_the_authors_cycling_icons(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Review visit',
            'price' => 60, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('class="treatment-grid" data-count="4"', $body);

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('<span>' . $ordinal . '</span>', $body);
        }

        // Three icons, cycling: the fourth card repeats the first's face.
        $this->assertSame(2, substr_count($body, 'M24 5c9 0 15 7 15 17 0 12-7 21-15 21S9 34 9 22C9 12 15 5 24 5Z'));
        $this->assertSame(1, substr_count($body, 'M24 5c-2 9-13 12-13 23a13 13 0 0 0 26 0C37 17 26 14 24 5Z'));
        $this->assertSame(1, substr_count($body, '<circle cx="24" cy="24" r="15" fill="none" stroke="currentColor"></circle>'));
    }

    /** This author tints no card: every treatment is the same paper card. */
    public function test_no_card_is_tinted_as_featured(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('class="featured"', $this->body());
    }

    /** "From €190": the starting-price mark prints the author's word before the price, and no duration anywhere. */
    public function test_the_price_line_is_the_authors_from_and_never_a_duration(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>From €190</strong>', $body);
        $this->assertStringContainsString('<strong>From €120</strong>', $body);
        $this->assertDoesNotMatchRegularExpression('/<strong>[^<]*\d+ min/', $body);
        $this->assertStringNotContainsString('45 min', $body);
    }

    public function test_a_fixed_price_prints_bare_and_no_price_prints_nothing(): void
    {
        $this->seedLikeTheKit();
        DB::table('services')->where('name', 'Skin quality')->update(['price_is_from' => false]);

        $body = $this->body();

        $this->assertStringContainsString('<strong>€120</strong>', $body);

        // The third treatment has no price: the card ends on its line.
        $this->assertMatchesRegularExpression('#<h3>Device treatments</h3>\s*<p>Non-surgical options selected around skin condition and downtime\.</p>\s*</article>#', $body);
    }

    public function test_the_tenants_own_word_replaces_from(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_prefix' => 'Starting at']])]);

        $this->assertStringContainsString('<strong>Starting at €190</strong>', $this->body());
    }

    public function test_the_treatment_cards_carry_no_link_of_their_own(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringNotContainsString('data-service-id=', $body);
    }

    // ─── The physician (med-6) ────────────────────────────────────────────

    public function test_the_first_practitioner_is_the_physician(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Mara Vītola</h2>', $body);
        $this->assertStringContainsString('special interest in facial assessment, skin quality and conservative treatment planning.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
    }

    public function test_the_other_practitioners_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();

        foreach ([['Dr. Jānis Bērziņš', 'Dermatologist'], ['Elīna Kalniņa', 'Clinical nurse']] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }

        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Mara Vītola</h2>', $body);
        $this->assertStringContainsString('<dt>Dr. Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Dermatologist</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>Dr. Mara Vītola</dt>', $body);
    }

    public function test_a_practitioner_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ardea', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Mara Vītola',
            'title' => 'Aesthetic physician', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ardea'], 'team' => ['kicker' => 'Your physician']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Mara Vītola</h2>', $body);
        $this->assertStringContainsString('<p>Aesthetic physician</p>', $body);
    }

    public function test_the_physician_band_offers_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();

        $body = $this->body();

        $this->assertStringNotContainsString('&amp;master=', $body);
    }

    // ─── The patient note ─────────────────────────────────────────────────

    public function test_the_patient_note_is_the_first_featured_review_with_the_clinics_rating(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('Nothing was rushed.', $body);
        // The author's star is an ICON on this page, not a glyph.
        $this->assertMatchesRegularExpression('#<p class="rating"><svg class="icon"[^>]*><path d="m12 3 [^"]+" fill="currentColor"></path></svg>\s*4\.9 / 5</p>#', $body);
        $this->assertStringContainsString('Verified patient · Riga', $body);
    }

    public function test_a_named_patient_is_credited_by_name(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ardea', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Anna K.', 'overall_rating' => 5,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Ardea'], 'reviews' => ['kicker' => 'Patient note']]);
        $body = $this->body();

        $this->assertStringContainsString('Anna K. · Riga', $body);
        // One rating is below the aggregate floor: no score is invented.
        $this->assertStringNotContainsString('class="rating"', $body);
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

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
        $this->published(['hero' => ['headline' => 'Ardea'], 'faq' => [
            'heading' => 'Clear answers.',
            'q1' => 'Which treatment?', 'a1' => 'The one the assessment supports.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which treatment?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The fact strip ───────────────────────────────────────────────────

    public function test_the_fact_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-variant="clinical-facts" data-count="4"', $body);
        $this->assertStringContainsString('<p><strong>4.9</strong> patient rating</p>', $body);
        $this->assertStringContainsString('<p>Doctor-led planning</p>', $body);
    }

    public function test_a_paired_highlight_sets_its_value_in_the_authors_strong(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea'], 'trust' => [
            'feature_1' => '11 yrs', 'feature_1_caption' => 'clinical experience',
            'feature_2' => 'Evidence-informed care',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="2"', $body);
        $this->assertStringContainsString('<p><strong>11 yrs</strong> clinical experience</p>', $body);
        $this->assertStringContainsString('<p>Evidence-informed care</p>', $body);
    }

    public function test_a_clinic_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Ardea'], 'trust' => ['feature_1' => 'Doctor-led planning']]);
        $body = $this->body();

        $this->assertStringNotContainsString('patient rating', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The offer bar and the header ─────────────────────────────────────

    public function test_the_offer_bar_is_the_message_and_the_authors_dotted_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<p>Thursday consultations now available ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>View appointments<\/a>/',
            $body,
        );
    }

    /** No navigation on any kit (polish-1, 2026-09-08): the header is the brand and the Book control. */
    public function test_the_header_carries_no_navigation(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringNotContainsString('desktop-nav', $body);
        $this->assertStringNotContainsString('mobile-nav', $body);
        $this->assertStringNotContainsString('<details class="mobile-menu"', $body);
        $this->assertStringNotContainsString('>Menu ', $body);
    }

    // ─── The infix wordmark ───────────────────────────────────────────────

    public function test_a_business_with_a_conjunction_gets_the_authors_em_in_both_lockups(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ardea & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ardea']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Ardea <em>&amp;</em> Co</strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Ardea']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    /** The monogram is ONE letter, as the author sets it ("A"), in both lockups. */
    public function test_the_monogram_is_the_first_letter_of_the_business(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">A</span>'));
    }

    public function test_a_brand_logo_takes_the_monograms_ring(): void
    {
        $this->makeBrand('/storage/ardea-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/ardea-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">A</span>', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    /**
     * Template fidelity 6.6: a clinic with no schedule renders no band and
     * no dead hook — the capability gate (PageContent::bookingMode()), not
     * an industry gate. The Book controls dial the phone instead and say so
     * (6.4).
     */
    public function test_a_clinic_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000412"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /** 6.1 / 6.2: once bookable, every hook opens the appointment widget. */
    public function test_a_bookable_clinic_wires_every_hook_to_the_appointment_flow(): void
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

        $this->assertStringContainsString('<p class="booking__phone">Prefer to call? <a href="tel:+37120000412">+371 20 000 412</a></p>', $body);
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

        // The hero's own word, then his chrome word on the header, the
        // footer lockup and the fixed pill.
        $this->assertStringContainsString('Book a consultation</a>', $body);
        $this->assertGreaterThanOrEqual(3, substr_count($body, 'Book consultation</a>'));
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Patient notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
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
            'organization_id' => 1, 'name' => 'Patient notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('<p>Private, physician-led aesthetic care with consultation at its centre.</p>', $body);
        $this->assertStringContainsString('<small>Aesthetic medicine · Riga</small>', $body);
        $this->assertStringContainsString('Email the clinic', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration.', $body);
        $this->assertStringNotContainsString('href="#top">Privacy', $body);
        $this->assertStringNotContainsString('Accessibility</a>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea'], 'about' => 'not an array', 'trust' => 'nor this']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Ardea'], 'faq' => [
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
            'hero'     => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>', 'edition' => '<b>edition</b>'],
            'about'    => ['caption' => '<b>caption</b>', 'fact_1' => '<b>fact</b>'],
            'trust'    => ['feature_1' => '<b>fact</b>', 'feature_1_caption' => '<b>caption</b>'],
            'services' => ['price_prefix' => '<b>from</b>'],
            'booking'  => ['call_label' => '<b>call</b>'],
            'contact'  => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>', 'email_label' => '<b>mail</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('&lt;b&gt;proof&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;edition&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;caption&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;descriptor&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/ardea_aesthetics\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/ardea_aesthetics.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; both families cover
     * Cyrillic and latin-ext; the display face is the ONE weight the author
     * set (`Cormorant+Garamond:ital,wght@0,500;1,500`) in both styles, and
     * the body face stops at 600, which is his own request
     * (`Manrope:wght@400;500;600`).
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/ardea_aesthetics.css'));

        preg_match_all('/@font-face\{([^}]+)\}/', $css, $faces);

        $this->assertCount(9, $faces[1], 'Nine faces: Cormorant Garamond upright and italic (cyrillic, latin-ext, latin) and Manrope (the same three).');

        foreach ($faces[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face);
            $this->assertStringContainsString('font-display:swap', $face);
        }

        $this->assertSame(3, substr_count($css, "font-family:'Cormorant Garamond';font-style:normal;font-weight:500;"));
        $this->assertSame(3, substr_count($css, "font-family:'Cormorant Garamond';font-style:italic;font-weight:500;"));
        $this->assertSame(3, substr_count($css, 'font-family:Manrope;font-style:normal;font-weight:400 600;'));
        $this->assertStringContainsString('cormorant-garamond-var-cyrillic.woff2', $css);
        $this->assertStringContainsString('manrope-var-cyrillic.woff2', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/ardea_aesthetics/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/ardea_aesthetics/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/ardea_aesthetics.css'));

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
        $css = file_get_contents(public_path('landing/ardea_aesthetics.css'));

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
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('ardea_aesthetics') as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/ardea_aesthetics/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/ardea_aesthetics/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/ardea_aesthetics/gallery.svg'));
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

        $page->update(['content' => ['hero' => ['headline' => 'Care that begins by listening.']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading">', $this->body());
    }

    /** The fixed Book pill renders only while the booking FLOW is on; a phone fallback keeps the header and hero controls and no third pill (polish-4). */
    public function test_no_fixed_pill_without_a_booking_flow(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('href="tel:', $body);
        $this->assertStringNotContainsString('booking-fab', $body);
    }
}
