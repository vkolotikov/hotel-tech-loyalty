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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Organic Wellness — the third BeautyTech kit, rendered as a real template.
 *
 * The acceptance criterion for this template is not a number in this file: it
 * is that the page a tenant gets is the page the author drew, and that is
 * settled by the screenshot pair in the phase 7/8 report. What THIS file is
 * for is everything a screenshot cannot see — that a hostile stored value
 * cannot take the page down or reach the DOM unescaped, that a band with
 * nothing in it does not render at all, that not one control on the page
 * points somewhere it cannot go, and that the author's own stylesheet and
 * photographs are still the ones we ship.
 *
 * Every hostile-value battery that protects the other three templates is
 * repeated here, because they are independent sets of Blade files and a guard
 * that only three of them make is a guard the fourth does not have.
 */
class OrganicWellnessRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/beauty-tech/03-organic-wellness';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'beauty'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'morrow-moss',
            'template_key' => 'organic_wellness', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Care that follows your natural rhythm.']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        // The mosaic is one of the author's eleven bands but no industry seeds
        // a gallery row, so a page meant to look like his has to carry one —
        // exactly as a tenant adds it from the picker.
        if (isset($content['gallery_1'])) {
            $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 8]);
        }

        return $page;
    }

    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'Morrow', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/morrow-moss')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/morrow-moss')->getStatusCode();
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing booking panel is gated to hotel until
     * phase 6 (`PageContent::count('booking')`), and this author writes four
     * of his strings in that band.
     */
    private function seedLikeTheKit(string $industry = 'beauty', ?string $firstServiceImage = '/storage/facial-clay.webp'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Morrow & Moss',
            'phone' => '+371 20 000 000', 'email' => 'hello@morrowandmoss.example',
            'address' => '18 Linden Lane', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Moss Reset Facial', 'A personalised cleanse, gentle exfoliation, mask and facial massage.', 75, 92, $firstServiceImage],
            ['Body Grounding', 'Slow, flowing bodywork with warm oil and time to settle before you leave.', 90, 118, null],
            ['Barrier Comfort', 'A calm, fragrance-aware facial focused on comfort and a simple home routine.', 60, 84, null],
            ['Quiet Glow', 'A compact facial with cleansing, hydration and sculpting massage.', 45, 64, null],
        ] as $i => [$name, $short, $minutes, $price, $image]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'image' => $image,
                'duration_minutes' => $minutes, 'price' => $price, 'currency' => 'EUR',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Imani Reed', 'Skin therapist · facial massage'],
            ['Clara Voss', 'Founder · holistic facials'],
            ['Lila Chen', 'Bodywork therapist · grounding rituals'],
        ] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Elīna K.', 5, 'The whole visit felt calm without being overly ceremonial. I left with skin that felt comfortable and advice I could actually use.'],
            ['Mara S.', 5, 'Lila checked in about pressure without interrupting the quiet. It was thoughtful from the tea at the start to the note waiting at the end.'],
            ['Nadia R.', 5, 'No hard sell, no complicated routine. Just a beautiful facial and three clear suggestions that made sense for me.'],
            ['Ance B.', 4, 'Careful, unhurried and genuinely kind.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'announcement' => [
                'label'     => 'Late-summer ritual',
                'text'      => 'Cooling clay, rosemary compresses and unhurried rest.',
                'cta_label' => 'Book the seasonal ritual',
            ],
            'hero' => [
                'kicker'          => 'Skin & body studio · Riga',
                'headline'        => 'Care that follows your',
                'headline_accent' => 'natural rhythm.',
                'subtext'         => 'Thoughtful facials, grounding bodywork and small rituals shaped around how you feel today.',
                'cta_label'       => 'Find your ritual',
                'proof'           => 'Appointments available this week',
                'note_label'      => 'Begin with a pause',
                'caption'         => 'Every visit starts with tea and a quiet conversation.',
            ],
            'trust' => [
                'feature_1'         => 'Unhurried',
                'feature_1_caption' => 'Time between visits',
                'feature_2'         => 'Considered',
                'feature_2_caption' => 'Skin-first product choices',
                'feature_3'         => 'Open daily',
                'feature_3_caption' => 'Early and evening times',
            ],
            'services' => [
                'kicker'         => 'Choose your pace',
                'heading'        => 'Rituals for skin, body',
                'heading_accent' => 'and breathing room.',
                'subtext'        => 'Each appointment is adapted after a short consultation.',
                'item_cta_label' => 'Reserve this ritual',
                'badge_label'    => 'Guest favourite',
            ],
            'about' => [
                'kicker'      => 'Our approach',
                'lead'        => 'Less noise. More',
                'lead_accent' => 'listening.',
                'body'        => "Morrow & Moss was created around a simple idea: care works best when it feels personal, understandable and pleasantly human.\n\nWe pair tactile treatments with clear guidance.",
                'caption'     => 'A room designed to let the day fall away.',
                'note_label'  => 'Our ingredient philosophy',
                'note_1'      => 'Recognisable, well-considered formulas',
                'note_2'      => 'Fragrance-aware options at every visit',
                'note_3'      => 'Texture and comfort chosen with you',
            ],
            'gallery_1' => [
                'kicker'         => 'Inside the studio',
                'heading'        => 'Daylight, warm clay',
                'heading_accent' => 'and room to pause.',
                'subtext'        => 'Natural materials, soft sound and small sensory details.',
                'caption_1'      => 'The treatment room',
                'caption_2'      => 'Botanical textures',
                'caption_3'      => 'A slower morning',
            ],
            'team' => [
                'kicker'         => 'The collective',
                'heading'        => 'Care shaped by',
                'heading_accent' => 'good hands and open ears.',
                'subtext'        => 'Our small team shares one treatment philosophy.',
                'caption'        => 'Imani, Clara & Lila — the collective',
            ],
            'reviews' => [
                'kicker'         => 'Guest notes',
                'heading'        => 'Kind words, left',
                'heading_accent' => 'after the exhale.',
            ],
            'faq' => [
                'kicker'         => 'Before you visit',
                'heading'        => 'A few things guests',
                'heading_accent' => 'often ask.',
                'subtext'        => 'Choose the closest ritual when booking.',
                'q1' => 'How do I choose the right facial?',
                'a1' => 'Choose the ritual that sounds closest to how you want to feel.',
                'q2' => 'What should I do before my appointment?',
                'a2' => 'Come as you are.',
            ],
            'booking' => [
                'kicker'         => 'Make space for yourself',
                'heading'        => 'Your next quiet hour',
                'heading_accent' => 'can start here.',
                'terms'          => 'Browse live availability, choose a therapist or start with the time that fits your week.',
                'cta_label'      => 'Book now',
                'call_label'     => 'Prefer a person? Call',
            ],
            'contact' => [
                'descriptor' => 'skin · body · stillness',
                'legal_note' => 'Fictional demo business.',
            ],
        ], [], $industry);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/organic_wellness/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/organic_wellness/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Morrow']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent, and D2 ───────────────────────────────────────────────

    /**
     * D2, answered: the tenant's colour is spent on the CLAY family and on
     * `--color-moss`, the accent TEXT this design sets its eight two-tone
     * headings in. `--color-moss-deep` is this page's INK — the announcement
     * bar, the story band, the primary button — and repainting a page's ink
     * with a brand colour is exactly the destruction D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-clay:', $body);
        $this->assertStringContainsString('--color-clay-soft:', $body);
        $this->assertStringContainsString('--color-clay-pale:', $body);
        $this->assertStringContainsString('--color-moss:', $body);

        $this->assertStringNotContainsString('--color-moss-deep:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own oat page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-clay: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto an oat page.');
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'gallery', 'team', 'testimonials', 'faq', 'booking', 'footer', 'contact',
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
            'announcement' => 'seasonal',
            'header'       => 'calm-sticky',
            'hero'         => 'split-organic',
            'trust'        => 'proof-strip',
            'services'     => 'soft-modular-grid',
            'story'        => 'image-philosophy',
            'gallery'      => 'organic-mosaic',
            'team'         => 'collective-profile',
            'testimonials' => 'guest-notes',
            'faq'          => 'native-accordion',
            'booking'      => 'guided-cta',
            'footer'       => 'service-hub',
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
        $this->assertStringContainsString('landing/organic_wellness/assets/hero-wellness.webp', $body);
        $this->assertStringNotContainsString('hero__inner--solo', $body);

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
        $this->assertDoesNotMatchRegularExpression('/<h2[^>]*>\s*<\/h2>/', $body);
    }

    public function test_a_disabled_band_does_not_render(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->sections()->where('key', 'team')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="team"', $body);
        $this->assertStringNotContainsString('good hands and open ears', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Morrow'],
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

    // ─── The eyebrow's dash (8.5) ─────────────────────────────────────────

    /**
     * Template fidelity 8.5 — THE ONE MARKUP CHANGE THIS KIT NEEDED. The clay
     * dash before every eyebrow is `.eyebrow > span`, an empty first child in
     * the author's own markup, on all eight of his eyebrows. A Blade printing
     * `<p class="eyebrow">{{ … }}</p>` loses the dash on every band.
     */
    public function test_every_eyebrow_carries_the_authors_dash(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        preg_match_all('/<(?:p|h2)[^>]*class="eyebrow[^"]*"[^>]*>(.*?)<\/(?:p|h2)>/s', $body, $matches);

        $this->assertGreaterThanOrEqual(7, count($matches[1]), 'The page draws almost no eyebrows at all.');

        foreach ($matches[1] as $inner) {
            $this->assertStringStartsWith('<span aria-hidden="true"></span>', trim($inner),
                'An eyebrow reached the page without the author\'s dash.');
        }
    }

    // ─── The infix wordmark ───────────────────────────────────────────────

    /**
     * THE ONE INFIX EMPHASIS IN THE SIX KITS, and the one `_accent` cannot
     * express. The author writes `Morrow <em>&amp;</em> Moss` in his header
     * and again in his footer; it is derived from the business's own name by
     * App\Landing\Copy::wordmark(), out of escaped fragments, and it appears
     * in both lockups.
     */
    public function test_the_wordmark_sets_the_conjunction_in_the_authors_em(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span class="brand__name">Morrow <em>&amp;</em> Moss</span>'),
            'The infix emphasis is missing from the header lockup, the footer lockup, or both.');
    }

    public function test_a_business_with_no_conjunction_gets_the_lockup_it_always_had(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Morrow Studio', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Morrow']]);
        $body = $this->body();

        $this->assertStringContainsString('<span class="brand__name">Morrow Studio</span>', $body);
        $this->assertStringNotContainsString('<em>&amp;</em>', $body);
    }

    /** An ampersand inside a word is not a conjunction and is left alone. */
    public function test_an_ampersand_inside_a_word_is_not_emphasised(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'R&D Skin Lab', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Morrow']]);

        $this->assertStringContainsString('<span class="brand__name">R&amp;D Skin Lab</span>', $this->body());
    }

    /** And a hostile business name still cannot put markup on the page. */
    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Moss', 'is_active' => true,
        ]);

        $body = $this->published(['hero' => ['headline' => 'Morrow']]) ? $this->body() : '';

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Moss', $body);
    }

    // ─── The grids that had to learn to degrade (8.6) ─────────────────────

    /**
     * The author's six-column grid is authored for exactly four cards. An
     * EVEN number needs nothing — 4+2 leads and the rest tile 3+3 — and an
     * ODD one gives the featured card the whole first row so the remainder
     * still tiles in pairs.
     */
    public function test_an_even_service_count_keeps_the_authors_own_composition(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);
        $this->assertStringNotContainsString('data-lead=', $body);
        $this->assertStringContainsString('service-card service-card--featured', $body);
    }

    public function test_an_odd_service_count_gives_the_featured_card_the_whole_row(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Scalp Ritual',
            'price' => 70, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="5" data-lead="full"', $body);
    }

    /**
     * And the same answer for a studio whose FIRST treatment has no
     * photograph: there is no featured card to widen, so the odd width goes
     * to the last card instead of leaving a half-width orphan.
     */
    public function test_an_odd_count_with_no_featured_photograph_widens_the_last_card(): void
    {
        $this->seedLikeTheKit('beauty', null);
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Scalp Ritual',
            'price' => 70, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="5" data-lead="tail"', $body);
        $this->assertStringNotContainsString('service-card--featured', $body);
        $this->assertStringNotContainsString('service-card__badge', $body);
    }

    /**
     * The featured card's photograph is the SERVICE's own (R3 / 4.2) — read
     * through PageContent::serviceImage(), the same three guards every other
     * picture on this page goes through — and the badge is the tenant's word.
     */
    public function test_the_featured_card_draws_the_services_own_photograph_and_badge(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="service-card__image">', $body);
        $this->assertStringContainsString('src="/storage/facial-clay.webp"', $body);
        $this->assertStringContainsString('<span class="service-card__badge">Guest favourite</span>', $body);
    }

    public function test_a_hostile_service_photograph_never_reaches_the_page(): void
    {
        $this->seedLikeTheKit('beauty', 'javascript:alert(1)');
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringNotContainsString('service-card--featured', $body);
    }

    public function test_the_mosaic_cycles_the_authors_three_shapes(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'gallery_1' => [
            'heading' => 'Inside the studio',
            'image_1' => '/storage/one.webp',
            'image_2' => '/storage/two.webp',
            'image_3' => '/storage/three.webp',
            'image_4' => '/storage/four.webp',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);
        $this->assertSame(2, substr_count($body, 'gallery__item--wide'));
        $this->assertSame(1, substr_count($body, 'gallery__item--detail'));
    }

    public function test_the_guest_notes_band_says_how_many_cards_it_has(): void
    {
        foreach (range(1, 2) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Morrow'], 'reviews' => ['kicker' => 'Guest notes']]);
        $body = $this->body();

        $this->assertStringContainsString('<div class="testimonials__grid" data-count="2">', $body);
    }

    /**
     * 5.3 — the per-card star row this design draws and kit 01 does not, from
     * the rating already on the record. An unrated submission draws no row
     * rather than an empty one.
     */
    public function test_each_quote_card_carries_its_own_star_row(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(3, substr_count($body, '<span role="img"'));
        $this->assertStringContainsString('★★★★★', $body);
    }

    public function test_an_unrated_review_draws_no_stars(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Morrow & Moss', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Quiet guest', 'overall_rating' => null,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Morrow'], 'reviews' => ['kicker' => 'Guest notes']]);
        $body = $this->body();

        $this->assertStringContainsString('A calm hour.', $body);
        $this->assertStringNotContainsString('<span role="img"', $body);
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

    /** 8.7 — the author opens his first pair, and that is derived from the list. */
    public function test_the_first_question_is_open_and_only_the_first(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<details open>'));
        $this->assertSame(1, substr_count($body, '<details >'));
    }

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'faq' => [
            'heading' => 'A few things guests often ask.',
            'q1' => 'Which ritual?', 'a1' => 'The closest one.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which ritual?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The trust strip ──────────────────────────────────────────────────

    public function test_the_trust_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        foreach (range(1, 4) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => false, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Morrow']]);
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('<strong>5.0 / 5</strong>', $body);
    }

    public function test_a_studio_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Morrow'], 'trust' => ['feature_1' => 'Unhurried']]);
        $body = $this->body();

        $this->assertStringNotContainsString('5.0 / 5', $body);
        $this->assertStringNotContainsString('hero__stars', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    /**
     * Template fidelity 6.6: a beauty org with the schedule removed renders
     * no band and no dead hook — the capability gate (PageContent::
     * bookingMode()), not the old industry gate. The Book controls dial the
     * phone instead and say so (6.4).
     */
    public function test_a_beauty_page_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000000"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    /** 6.1 / 6.2: once bookable, every hook opens the appointment widget on the row's own id. */
    public function test_a_bookable_beauty_page_wires_every_hook_to_the_appointment_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $ids = $this->seedBookableSchedule();

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

        $this->assertStringContainsString('&amp;service=' . $ids['service'] . '"', $body);
        $this->assertStringContainsString('&amp;master=' . $ids['master'] . '"', $body);
        $this->assertStringNotContainsString('Call to book', $body);
    }

    public function test_a_hotel_page_wires_every_booking_hook_to_the_real_flow(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('data-block="booking"', $body);
        $this->assertStringContainsString('data-service-id=', $body);

        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/booking-widget', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
        }
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

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

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'gallery_1' => 'not an array']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'faq' => [
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
            'announcement' => ['label' => '<b>badge</b>'],
            'hero'         => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>'],
            'services'     => ['badge_label' => '<b>badge2</b>'],
            'about'        => ['note_label' => '<b>philosophy</b>', 'note_1' => '<b>line</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        foreach (['badge', 'proof', 'note', 'badge2', 'philosophy', 'line'] as $needle) {
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
        $this->published(['hero' => ['headline' => 'Morrow', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/organic_wellness/assets/hero-wellness.webp', $body);
        $this->assertStringNotContainsString('hero__inner--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Morrow'],
            'about' => ['body' => 'A quiet place.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/organic_wellness/assets/studio-interior.webp', $body);
        $this->assertStringNotContainsString('story__grid--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    public function test_a_gallery_of_only_hostile_leaves_renders_the_designs_own_mosaic(): void
    {
        $this->published(['hero' => ['headline' => 'Morrow'], 'gallery_1' => [
            'heading' => 'Inside the studio',
            'image_1' => 'javascript:alert(1)',
            'image_2' => ['nope'],
            'image_3' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-count="3"', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    // ─── Photographs, share image and the logo ────────────────────────────

    public function test_the_page_publishes_a_share_image(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('property="og:image"', $body);
        $this->assertMatchesRegularExpression('#og:image" content="https?://#', $body);
    }

    public function test_the_brands_own_logo_replaces_the_monogram(): void
    {
        $this->makeBrand('/storage/brand/morrow.svg');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('<span class="brand__mark" aria-hidden="true"><img src="/storage/brand/morrow.svg"', $body);
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

    // ─── Assets, fonts and cache busting ──────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/organic_wellness\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/organic_wellness.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; the BODY face covers
     * Cyrillic and latin-ext; and THE ITALIC AXIS IS SHIPPED.
     *
     * That last one is the opposite of editorial_atelier's ruling and for the
     * opposite reason: D3 says to match the author, and THIS author asks for
     * `1,6..72,400` and then sets an <em> in all eight of his display
     * headings and his own wordmark. A synthesised oblique on nine slanted
     * headings is a different typeface from the one he chose.
     *
     * Newsreader publishes no Cyrillic subset, so none is declared and a
     * Russian tenant's display headings fall through to his own stack —
     * pinned here as a fact rather than left as an omission.
     */
    public function test_every_font_face_declares_a_unicode_range_and_the_italic_axis_ships(): void
    {
        $css = file_get_contents(public_path('landing/organic_wellness.css'));

        preg_match_all('/@font-face\{(.+?)\}/s', $css, $matches);

        $this->assertNotEmpty($matches[1]);

        foreach ($matches[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face,
                'A @font-face declares no unicode-range.');
        }

        $this->assertMatchesRegularExpression(
            '/@font-face\{font-family:Manrope[^}]+U\+0400-045F/s',
            $css,
            'The body face declares no Cyrillic subset.',
        );

        $this->assertMatchesRegularExpression(
            '/@font-face\{font-family:Newsreader;font-style:italic/',
            $css,
            'The italic axis this design cannot do without is not declared.',
        );

        $this->assertDoesNotMatchRegularExpression(
            '/@font-face\{font-family:Newsreader[^}]+U\+0400-045F/s',
            $css,
            'A Cyrillic Newsreader face was declared; Google publishes none.',
        );
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/organic_wellness/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/organic_wellness/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/organic_wellness.css'));

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
     * And the rest of the file, rule for rule — which on THIS kit means every
     * byte of it, because nothing here paints text on an accent fill and so
     * no label token had to be introduced. Two documented changes: the font
     * block prepended, the tenant states appended. Nothing in between.
     */
    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/organic_wellness.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    // ─── Template fidelity 8.x — the author's own strings ─────────────────

    public function test_a_heading_accent_renders_as_the_authors_em_in_every_band(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'Care that follows your <em>natural rhythm.</em>',
            'Rituals for skin, body <em>and breathing room.</em>',
            'Less noise. More <em>listening.</em>',
            'Daylight, warm clay <em>and room to pause.</em>',
            'Care shaped by <em>good hands and open ears.</em>',
            'Kind words, left <em>after the exhale.</em>',
            'A few things guests <em>often ask.</em>',
            'Your next quiet hour <em>can start here.</em>',
        ] as $heading) {
            $this->assertStringContainsString($heading, $body,
                'A two-tone heading did not render as the author drew it.');
        }
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Care that follows',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    public function test_the_hero_carries_the_authors_note_and_proof_line(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>Begin with a pause</strong>Every visit starts with tea and a quiet conversation.', $body);
        $this->assertStringContainsString('<span class="status-dot" aria-hidden="true"></span> Appointments available this week', $body);
    }

    public function test_the_announcement_carries_the_authors_badge(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<span class="announcement__label">Late-summer ritual</span>', $this->body());
    }

    public function test_the_story_band_carries_the_authors_ingredient_note(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<p class="ingredient-note__label">Our ingredient philosophy</p>', $body);
        $this->assertStringContainsString('<li>Fragrance-aware options at every visit</li>', $body);
    }

    public function test_the_closing_panel_puts_the_phone_beside_the_button(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Prefer a person? Call', $body);
        $this->assertStringContainsString('href="tel:+37120000000"', $body);
    }

    public function test_the_footer_hub_counts_the_columns_it_really_has(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => [
                'social_instagram' => 'https://instagram.com/morrowandmoss',
                'social_tiktok'    => 'https://tiktok.com/@morrowandmoss',
            ],
        ])]);

        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demo business.', $body);
    }

    public function test_a_blank_social_leaf_renders_no_icon_and_no_column(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => ['social_instagram' => 'instagram.com/morrowandmoss'],
        ])]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-social-platform', $body);
        $this->assertStringNotContainsString('footer-hub__social', $body);
    }
}
