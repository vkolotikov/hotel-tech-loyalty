<?php
namespace Tests\Feature\Landing;

use App\Models\Brand;
use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Models\ServiceMaster;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Numa Skin Lab — the third MedTech kit, the dark one, rendered as a real
 * template.
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
 * Every hostile-value battery that protects the fourteen templates before it
 * is repeated here, because they are independent sets of Blade files and a
 * guard that only fourteen of them make is a guard the fifteenth does not
 * have.
 *
 * The rulings this design needed of its own (med-1..N in the ledger) are
 * each pinned below: the scan card and the meta line, the star-led fact
 * strip, the mono ledger with the category after the ordinal, the fact
 * chips, the method cards that carry the tenant's photographs with the
 * tenant's word before the ordinal (med-2), the specialist record, the
 * bare phone number in the closing band, and the accent that lands on his
 * blues, lifted for this black, and never on the ink or the ice.
 */
class NumaSkinLabRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/med-tech/03-numa-skin-lab';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'medical'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'numa',
            'template_key' => 'numa_skin_lab', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'See the skin. Plan beyond it.']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        if (isset($content['gallery_1'])) {
            $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 3]);
        }

        return $page;
    }

    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'Numa', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/numa')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/numa')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in three places. The first is his named patient. */
    private function seedRatings(bool $featureFirst = true, ?string $name = 'Laura K.'): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => $name, 'overall_rating' => 5,
            'comment' => 'The analysis changed the plan completely—and that gave me confidence. Every step had a reason.',
            'is_featured' => $featureFirst, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Measured, clear and genuinely careful.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing band is gated on capability
     * (`PageContent::bookingMode()`): a hotel is bookable through the stay
     * widget with no rota, which is the cheap way to get every band on the
     * page at once; the medical path is exercised by the widget tests below.
     */
    private function seedLikeTheKit(string $industry = 'medical'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Numa Skin Lab',
            'phone' => '+371 20 000 634', 'email' => 'hello@numaskin.example',
            'address' => '7 Dzirnavu iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Resurfacing protocols', 'Options for tone, visible texture and post-blemish marks.', 45, null, 'Texture'],
            ['Redness & vessels', 'Assessment-led device care for suitable vascular concerns.', 30, 160, 'Vascular'],
            ['Laser hair reduction', 'Individual settings, patch testing and planned treatment intervals.', 30, 70, 'Hair'],
        ] as $i => [$name, $short, $minutes, $price, $category]) {
            // The word after the ordinal is the treatment's own category off
            // the Services screen — the author's "Texture", "Vascular", "Hair".
            $group = ServiceCategory::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $category, 'sort_order' => $i, 'is_active' => true,
            ]);

            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'category_id' => $group->id,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        // The author's "From €160" and "From €70": the row's starting-price mark.
        DB::table('services')->whereIn('name', ['Redness & vessels', 'Laser hair reduction'])->update(['price_is_from' => true]);

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Nora Kļava',
            'title' => 'Physician',
            'bio'   => 'Physician focused on device-based dermatology, skin assessment and careful long-term treatment sequencing.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'Skin analysis consultations · Tuesday to Saturday',
                'cta_label' => 'Book',
            ],
            'hero' => [
                'kicker'          => 'Analyse first · Treat precisely',
                'headline'        => "See the skin.\n",
                'headline_accent' => 'Plan beyond it.',
                'subtext'         => 'Diagnostic-led skin and laser care in a private specialist studio. Every protocol begins with assessment, not assumptions.',
                'cta_label'       => 'Book skin analysis',
                'note_label'      => 'Analysis protocol',
                'proof'           => '45 min · Assessment first',
                'edition'         => 'Private studio / Riga / LV–EN',
            ],
            'trust' => [
                'feature_1' => 'Imaging-led assessment',
                'feature_2' => 'Device-specific protocols',
                'feature_3' => 'Review built into every plan',
            ],
            'services' => [
                'kicker'  => 'Treatment protocols',
                'heading' => "One concern.\nMore than one layer.",
                'subtext' => 'We assess skin condition, history and tolerance before selecting a device, setting or sequence.',
            ],
            'about' => [
                'kicker'  => 'Technology with judgement',
                'lead'    => "The device matters.\nThe operator matters more.",
                'body'    => 'Settings, sequence and timing shape every protocol. We document your plan, explain expected recovery and adjust only after reviewing response.',
                'fact_1'  => 'Calibrated devices',
                'fact_2'  => 'Individual parameters',
                'fact_3'  => 'Documented follow-up',
                'caption' => 'Protocol calibrated / 01',
            ],
            'gallery_1' => [
                'kicker'          => 'The Numa method',
                'heading'         => "A measured sequence,\nnot a treatment trend.",
                'image_1'         => '/storage/method-one.webp',
                'caption_1'       => 'Map the concern',
                'caption_1_note'  => 'History, visual assessment and imaging where relevant.',
                'caption_1_label' => 'SCAN',
                'image_2'         => '/storage/method-two.webp',
                'caption_2'       => 'Choose the protocol',
                'caption_2_note'  => 'Suitability, alternatives, downtime and cost discussed clearly.',
                'caption_2_label' => 'PLAN',
                'image_3'         => '/storage/method-three.webp',
                'caption_3'       => 'Read the response',
                'caption_3_note'  => 'Follow-up before the plan is repeated or changed.',
                'caption_3_label' => 'REVIEW',
            ],
            'team' => [
                'kicker' => 'Clinical lead',
            ],
            'reviews' => [
                'kicker' => 'Patient signal',
            ],
            'faq' => [
                'kicker'  => 'Protocol notes',
                'heading' => "Before\nthe device.",
                'q1' => 'Why is a consultation required?',
                'a1' => 'Skin type, medical history, current products and recent exposure can affect suitability and settings. Assessment comes first.',
                'q2' => 'How much downtime should I expect?',
                'a2' => 'It varies by protocol and individual response. We explain the likely range and aftercare before you decide to proceed.',
                'q3' => 'Can a specific result be guaranteed?',
                'a3' => 'No. Response varies between patients. We set realistic goals, document progress and change course when appropriate.',
            ],
            'booking' => [
                'kicker'    => 'Your baseline matters',
                'heading'   => "Start with\nskin analysis.",
                'terms'     => 'Book a focused consultation before selecting a device treatment or package.',
                'cta_label' => 'Book skin analysis',
            ],
            'contact' => [
                'descriptor'       => 'Skin lab · Riga',
                'email_label'      => 'Email the studio',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/numa.example',
                'social_facebook'  => 'https://facebook.com/numa.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Diagnostic-led skin and device care in one private specialist studio.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/numa_skin_lab/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/numa_skin_lab/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Numa']], ['brand_color' => '#E8B86D']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (med-4, on a dark page) ───────────────────────────────

    /**
     * The tenant's colour is spent on `--color-blue` (the accent, text on
     * dark) and `--color-blue-dark` (its deeper sibling). `--color-ink`,
     * `--color-black`, `--color-graphite` and `--color-ice` are this page's
     * ink and its surfaces — repainting a page's ink with a brand colour is
     * exactly the destruction D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        $this->assertStringContainsString('--color-blue:', $body);
        $this->assertStringContainsString('--color-blue-dark:', $body);

        $this->assertStringNotContainsString('--color-ink:', $body);
        $this->assertStringNotContainsString('--color-black:', $body);
        $this->assertStringNotContainsString('--color-graphite:', $body);
        $this->assertStringNotContainsString('--color-ice:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** A kept colour is emitted readable against THIS kit's own black. */
    public function test_a_kept_tenant_colour_carries_the_dark_label(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['brand_color' => '#E8B86D']);

        preg_match('/--color-blue: (#[0-9a-fA-F]{6});/', $this->body(), $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#090d11'));
    }

    /** A navy on a near-black page is lifted until it reads, or discarded — never painted as the author's bright blue. */
    public function test_a_navy_is_lifted_or_discarded_and_never_painted_dark(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['brand_color' => '#1A2F6B']);
        $body = $this->body();

        if (! str_contains($body, '<style')) {
            $this->assertStringNotContainsString('--color-blue:', $body);

            return;
        }

        preg_match('/--color-blue: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m);
        $this->assertNotSame('#1a2f6b', strtolower($m[1]));
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#090d11'));
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story', 'gallery',
            'team', 'testimonials', 'faq', 'booking', 'footer', 'contact', 'assistant',
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
            'announcement' => 'lab-note',
            'header'       => 'dark-overlay',
            'hero'         => 'diagnostic-cinematic',
            'trust'        => 'lab-facts',
            'services'     => 'protocol-ledger',
            'story'        => 'device-manifesto',
            'gallery'      => 'method-grid',
            'team'         => 'specialist-record',
            'testimonials' => 'patient-signal',
            'faq'          => 'protocol-questions',
            'booking'      => 'analysis-invitation',
            'footer'       => 'lab-hub',
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
        $this->assertStringContainsString('landing/numa_skin_lab/assets/hero-analysis.webp', $body);

        foreach (['data-block="story"', 'data-block="gallery"', 'data-block="team"', 'data-block="testimonials"', 'data-block="faq"', 'data-block="trust"', 'data-block="announcement"'] as $absent) {
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
        $this->assertStringNotContainsString('Dr. Nora Kļava', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Numa'],
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
     * The author breaks his hero (the whole second line in blue), his
     * ledger, technology, method, FAQ and booking headings across two lines;
     * a line break in the raw leaf plus the companion accent leaf reproduce
     * all of them.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('See the skin.<br><em>Plan beyond it.</em>', $body);
        $this->assertStringContainsString('One concern.<br>More than one layer.', $body);
        $this->assertStringContainsString('The device matters.<br>The operator matters more.', $body);
        $this->assertStringContainsString('A measured sequence,<br>not a treatment trend.', $body);
        $this->assertStringContainsString('Before<br>the device.', $body);
        $this->assertStringContainsString('Start with<br>skin analysis.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'See the skin.',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The hero's scan card and meta line (med-2, med-3) ────────────────

    public function test_the_scan_card_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('class="hero__scan-card"', $body);
        $this->assertStringContainsString('<span class="scan-card__signal" aria-hidden="true"></span><span><small>Analysis protocol</small><strong>45 min · Assessment first</strong></span>', $body);
    }

    public function test_no_protocol_line_means_no_scan_card(): void
    {
        $this->published(['hero' => ['headline' => 'Numa', 'note_label' => 'Analysis protocol']]);

        $this->assertStringNotContainsString('hero__scan-card', $this->body());
    }

    /** The mono line at the bottom left is the hero's `edition` — the one hero leaf with no fixed meaning. */
    public function test_the_meta_line_is_the_heros_small_mark(): void
    {
        $this->seedLikeTheKit('hotel');

        $this->assertStringContainsString('<p class="hero__meta">Private studio / Riga / LV–EN</p>', $this->body());
    }

    public function test_no_small_mark_means_no_meta_line(): void
    {
        $this->published(['hero' => ['headline' => 'Numa', 'proof' => '45 min']]);

        $this->assertStringNotContainsString('hero__meta', $this->body());
    }

    // ─── The protocol ledger (med-5) ──────────────────────────────────────

    /** "01 / Texture": the ordinal, a slash and the row's category; the ordinal alone where the row has none. */
    public function test_the_ledger_tags_each_row_with_its_ordinal_and_category(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Review visit',
            'price' => 60, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('class="protocol-list" data-count="4"', $body);
        $this->assertStringContainsString('<p>01 / Texture</p>', $body);
        $this->assertStringContainsString('<p>02 / Vascular</p>', $body);
        $this->assertStringContainsString('<p>03 / Hair</p>', $body);
        $this->assertStringContainsString('<p>04</p>', $body);
        $this->assertStringContainsString('<h3>Redness &amp; vessels</h3>', $body);
    }

    /** "From €160": the starting-price mark prints the author's word before the price; no price prints nothing, and never a duration. */
    public function test_the_price_line_is_the_authors_from_and_never_a_duration(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>From €160</strong>', $body);
        $this->assertStringContainsString('<strong>From €70</strong>', $body);
        $this->assertMatchesRegularExpression('#<h3>Resurfacing protocols</h3>\s*<p>[^<]+</p>\s*</div>\s*</article>#', $body);
        $this->assertStringNotContainsString('45 minutes', $body);
        $this->assertStringNotContainsString('30 minutes', $body);
    }

    public function test_the_tenants_own_word_replaces_from(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_prefix' => 'Starting at']])]);

        $this->assertStringContainsString('<strong>Starting at €160</strong>', $this->body());
    }

    public function test_the_ledger_rows_carry_no_link_of_their_own(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringNotContainsString('data-service-id=', $body);
    }

    // ─── The technology band ──────────────────────────────────────────────

    /** The tenant's facts are the author's mono chips, and the caption keeps his glowing dot. */
    public function test_the_facts_are_the_authors_chips_and_the_caption_keeps_his_dot(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression('#<div>\s*<span>Calibrated devices</span>\s*<span>Individual parameters</span>\s*<span>Documented follow-up</span>\s*</div>#', $body);
        $this->assertStringContainsString('<p><span aria-hidden="true"></span> Protocol calibrated / 01</p>', $body);
    }

    // ─── The method cards: this design's gallery (med-2) ──────────────────

    /**
     * His band is three ruled cards with a mono tag, a name and a line of
     * prose and NO photograph; a `gallery` band on this platform IS its
     * pictures. The card, the tag and the caption-as-heading are his; the
     * photograph and the word before the ordinal are the tenant's.
     */
    public function test_the_method_cards_carry_the_tenants_photographs_and_words(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="method-grid" data-count="3">', $body);
        $this->assertSame(3, substr_count($body, '<article class="method__photo">'));
        $this->assertStringContainsString('/storage/method-one.webp', $body);
        $this->assertStringContainsString('<span aria-hidden="true">SCAN / 01</span>', $body);
        $this->assertStringContainsString('<span aria-hidden="true">REVIEW / 03</span>', $body);
        $this->assertMatchesRegularExpression('#<h3>Map the concern</h3>\s*<p>History, visual assessment and imaging where relevant\.</p>#', $body);
        $this->assertStringContainsString('A measured sequence,<br>not a treatment trend.', $body);
    }

    public function test_a_card_with_no_word_prints_the_ordinal_alone_and_a_hostile_word_is_escaped(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'gallery_1' => [
            'heading'         => 'The method',
            'image_1'         => '/storage/one.webp',
            'caption_1'       => 'Map',
            'caption_1_label' => '<b>SCAN</b>',
            'image_2'         => '/storage/two.webp',
            'caption_2'       => 'Plan',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<span aria-hidden="true">&lt;b&gt;SCAN&lt;/b&gt; / 01</span>', $body);
        $this->assertStringContainsString('<span aria-hidden="true">02</span>', $body);
        $this->assertStringNotContainsString('<b>SCAN</b>', $body);
        $this->assertMatchesRegularExpression('#<h3>Plan</h3>\s*</article>#', $body);
    }

    public function test_the_method_cards_count_only_readable_photographs(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'gallery_1' => [
            'heading' => 'The method',
            'image_1' => '/storage/one.webp',
            'image_2' => 'javascript:alert(1)',
            'image_3' => ['nope'],
            'image_4' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Two tiles: the tenant's own readable one, and the design's own
        // photograph restored under the second slot (template fidelity 4.1).
        $this->assertStringContainsString('<div class="method-grid" data-count="2">', $body);
        $this->assertStringContainsString('landing/numa_skin_lab/assets/precision-device.webp', $body);
        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringNotContainsString('evil.example', $body);
    }

    /** His cards carry a word before the ordinal and a line under the name, and his header has no intro paragraph. */
    public function test_this_design_offers_the_word_and_the_line_but_no_intro_paragraph(): void
    {
        $gallery = LandingOnboardingService::contentFieldsFor('numa_skin_lab')['gallery'];

        $this->assertContains('caption_1_label', $gallery);
        $this->assertContains('caption_1_note', $gallery);
        $this->assertNotContains('subtext', $gallery);
    }

    // ─── The specialist (med-6) ───────────────────────────────────────────

    public function test_the_first_practitioner_is_the_specialist_and_the_band_closes_up(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Nora Kļava</h2>', $body);
        $this->assertStringContainsString('focused on device-based dermatology, skin assessment and careful long-term treatment sequencing.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
        $this->assertStringContainsString('class="specialist section container specialist--solo"', $body);
    }

    public function test_the_other_practitioners_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();

        foreach ([['Dr. Jānis Bērziņš', 'Dermatologist'], ['Elīna Kalniņa', 'Laser nurse']] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }

        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Nora Kļava</h2>', $body);
        $this->assertStringContainsString('class="specialist section container"', $body);
        $this->assertStringNotContainsString('specialist--solo', $body);
        $this->assertStringContainsString('<dt>Dr. Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Dermatologist</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>Dr. Nora Kļava</dt>', $body);
    }

    public function test_a_specialist_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Numa', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Nora Kļava',
            'title' => 'Physician', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Numa'], 'team' => ['kicker' => 'Clinical lead']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Nora Kļava</h2>', $body);
        $this->assertStringContainsString('<p>Physician</p>', $body);
    }

    public function test_the_specialist_band_offers_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();

        $body = $this->body();

        $this->assertStringNotContainsString('&amp;master=', $body);
    }

    // ─── The patient signal ───────────────────────────────────────────────

    public function test_the_patient_signal_is_the_first_featured_review_with_the_clinics_rating(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('The analysis changed the plan completely', $body);
        $this->assertMatchesRegularExpression('#<p class="rating"><svg class="icon"[^>]*><path d="m12 3 [^"]+" fill="currentColor"></path></svg>\s*4\.9 / 5 · verified patients</p>#', $body);
        $this->assertStringContainsString('<p>Laura K. · Riga</p>', $body);
    }

    public function test_an_anonymous_patient_is_a_verified_patient_and_no_score_is_invented(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Numa', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 5,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Numa'], 'reviews' => ['kicker' => 'Patient signal']]);
        $body = $this->body();

        $this->assertStringContainsString('<p>Verified patient · Riga</p>', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

    public function test_no_question_is_open_by_default(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(3, substr_count($body, '<details>'));
        $this->assertStringNotContainsString('<details open>', $body);
    }

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'faq' => [
            'heading' => 'Before the device.',
            'q1' => 'Which protocol?', 'a1' => 'The one the assessment supports.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which protocol?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The fact strip ───────────────────────────────────────────────────

    /** The rating leads, after his star ICON; the highlights are his plain mono lines. */
    public function test_the_fact_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-variant="lab-facts" data-count="4"', $body);
        $this->assertMatchesRegularExpression('#<p><svg class="icon"[^>]*><path d="m12 3 [^"]+" fill="currentColor"></path></svg>\s*<strong>4\.9</strong> patient rating</p>#', $body);
        $this->assertStringContainsString('<p>Imaging-led assessment</p>', $body);
        $this->assertSame(1, substr_count($body, 'aria-label="Clinic highlights"'));
    }

    public function test_a_paired_highlight_sets_its_value_in_the_authors_strong_without_his_star(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'trust' => [
            'feature_1' => '9 yrs', 'feature_1_caption' => 'device practice',
            'feature_2' => 'Imaging-led assessment',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="2"', $body);
        $this->assertStringContainsString('<p><strong>9 yrs</strong> device practice</p>', $body);
        $this->assertStringContainsString('<p>Imaging-led assessment</p>', $body);
    }

    public function test_a_clinic_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Numa'], 'trust' => ['feature_1' => 'Imaging-led assessment']]);
        $body = $this->body();

        $this->assertStringNotContainsString('patient rating', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The lab note and the header ──────────────────────────────────────

    public function test_the_lab_note_is_the_line_and_the_authors_dotted_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<p>Skin analysis consultations · Tuesday to Saturday ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>Book<\/a>/',
            $body,
        );
    }

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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Numa & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Numa']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Numa <em>&amp;</em> Co</strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Numa']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    /** The monogram is ONE letter, as the author sets it ("N"), in both lockups. */
    public function test_the_monogram_is_the_first_letter_of_the_business(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">N</span>'));
    }

    public function test_a_brand_logo_takes_the_monograms_ring(): void
    {
        $this->makeBrand('/storage/numa-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/numa-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">N</span>', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

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
        $this->assertStringContainsString('href="tel:+37120000634"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

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

    /** The closing band prints the bare number as the link, with no words before it, as the author draws it. */
    public function test_the_closing_band_prints_the_bare_number_as_the_link(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression('#<a class="button button--ink" [^>]*>.*?</a>\s*<a href="tel:\+37120000634">\+371 20 000 634</a>\s*</div>#s', $body);
        $this->assertNotContains('call_label', LandingOnboardingService::contentFieldsFor('numa_skin_lab')['booking']);
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
        $page->update(['content' => array_replace_recursive($page->content, ['booking' => ['cta_label' => ''], 'hero' => ['cta_label' => '']])]);

        $body = $this->body();

        // "Book skin analysis" in the hero and on the fixed pill, "Start
        // consultation" in the header, "Book analysis" on the footer lockup.
        $this->assertSame(2, substr_count($body, 'Book skin analysis</a>'));
        $this->assertSame(1, substr_count($body, 'Start consultation</a>'));
        $this->assertSame(1, substr_count($body, 'Book analysis</a>'));
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Patient signals', 'embed_key' => 'abc123',
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
            'organization_id' => 1, 'name' => 'Patient signals', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('<p>Diagnostic-led skin and device care in one private specialist studio.</p>', $body);
        $this->assertStringContainsString('<small>Skin lab · Riga</small>', $body);
        $this->assertStringContainsString('Email the studio', $body);
        $this->assertStringContainsString('class="button button--blue"', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration.', $body);
        $this->assertStringNotContainsString('href="#top">Privacy', $body);
        $this->assertStringNotContainsString('Accessibility</a>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Numa']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'about' => 'not an array', 'trust' => 'nor this', 'gallery_1' => 'nor this one']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Numa', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Numa'], 'faq' => [
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
            'hero'      => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>', 'edition' => '<b>edition</b>'],
            'about'     => ['caption' => '<b>caption</b>', 'fact_1' => '<b>fact</b>'],
            'trust'     => ['feature_1' => '<b>fact</b>', 'feature_1_caption' => '<b>caption</b>'],
            'services'  => ['price_prefix' => '<b>from</b>'],
            'gallery_1' => ['caption_1' => '<b>step</b>', 'caption_1_note' => '<b>line</b>', 'caption_1_label' => '<b>word</b>'],
            'contact'   => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>', 'email_label' => '<b>mail</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('&lt;b&gt;proof&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;edition&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;word&lt;/b&gt; / 01', $body);
        $this->assertStringContainsString('&lt;b&gt;line&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;descriptor&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/numa_skin_lab\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/numa_skin_lab.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range and covers latin-ext; the
     * mono face has the light weight the author asked for
     * (`DM+Mono:wght@300;400`), the display face both styles
     * (`Instrument+Serif:ital@0;1`), and the body face stops at 600
     * (`Space+Grotesk:wght@400;500;600`). None of the three publishes
     * Cyrillic, so none is declared — pinned as a fact rather than left as
     * an omission.
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/numa_skin_lab.css'));

        preg_match_all('/@font-face\{([^}]+)\}/', $css, $faces);

        $this->assertCount(10, $faces[1], 'Ten faces: DM Mono 300 and 400, Instrument Serif upright and italic, Space Grotesk — each in latin and latin-ext.');

        foreach ($faces[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face);
            $this->assertStringContainsString('font-display:swap', $face);
        }

        $this->assertSame(2, substr_count($css, "font-family:'DM Mono';font-style:normal;font-weight:300;"));
        $this->assertSame(2, substr_count($css, "font-family:'DM Mono';font-style:normal;font-weight:400;"));
        $this->assertSame(2, substr_count($css, "font-family:'Instrument Serif';font-style:normal;font-weight:400;"));
        $this->assertSame(2, substr_count($css, "font-family:'Instrument Serif';font-style:italic;font-weight:400;"));
        $this->assertSame(2, substr_count($css, "font-family:'Space Grotesk';font-style:normal;font-weight:400 600;"));
        $this->assertStringContainsString('dm-mono-300-latin-ext.woff2', $css);
        $this->assertStringNotContainsString('cyrillic', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/numa_skin_lab/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/numa_skin_lab/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/numa_skin_lab.css'));

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

    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/numa_skin_lab.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    /** The editor's picker draws a picture of every band this design renders, the gallery among them, and of the contact it folds into its footer. */
    public function test_every_rendered_block_has_a_thumbnail(): void
    {
        $renders = LandingOnboardingService::rendersFor('numa_skin_lab');

        $this->assertContains('gallery', $renders);

        foreach ($renders as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/numa_skin_lab/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/numa_skin_lab/contact.svg'));
    }

    // ─── The polish round (2026-09-08) ────────────────────────────────────

    public function test_a_kicker_with_no_lead_becomes_the_story_heading(): void
    {
        $this->published(['hero' => ['headline' => 'X'], 'about' => ['kicker' => 'Digital is convenient. Metal makes it unforgettable.', 'body' => 'Prose.']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Digital is convenient. Metal makes it unforgettable.</h2>', $body);
        $this->assertStringNotContainsString('class="eyebrow">Digital is convenient', $body);
    }

    public function test_a_long_headline_is_marked_for_the_stylesheet(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Digital Business Cards for People Who Get Remembered']]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="xlong">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'Train for the life beyond the gym today.']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="long">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'See the skin. Plan beyond it.']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading">', $this->body());
    }

    public function test_no_fixed_pill_without_a_booking_flow(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('href="tel:', $body);
        $this->assertStringNotContainsString('booking-fab', $body);
    }
}
