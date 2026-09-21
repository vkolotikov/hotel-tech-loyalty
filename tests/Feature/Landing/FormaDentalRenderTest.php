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
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Forma Dental — the second MedTech kit, rendered as a real template.
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
 * Every hostile-value battery that protects the thirteen templates before it
 * is repeated here, because they are independent sets of Blade files and a
 * guard that only thirteen of them make is a guard the fourteenth does not
 * have.
 *
 * The rulings this design needed of its own (med-1..N in the ledger) are
 * each pinned below: the split hero's availability card and small line, the
 * value-over-caption fact strip, the care cards with the author's cycling
 * oat tint and his minutes-and-price footer, the first-visit steps that
 * carry the tenant's photographs (med-2), the three-track dentist band, and
 * the accent that lands on his clay and his rose and never on his plum.
 */
class FormaDentalRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/med-tech/02-forma-dental';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'medical'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'forma',
            'template_key' => 'forma_dental', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Feel good about your smile.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Forma', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/forma')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/forma')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints in three places. */
    private function seedRatings(bool $featureFirst = true): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => 5,
            'comment' => 'For the first time, a dental appointment felt like a conversation—not something happening around me.',
            'is_featured' => $featureFirst, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Calm, clear and genuinely kind.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing card is gated on capability
     * (`PageContent::bookingMode()`): a hotel is bookable through the stay
     * widget with no rota, which is the cheap way to get every band on the
     * page at once; the medical path is exercised by the widget tests below.
     */
    private function seedLikeTheKit(string $industry = 'medical'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Forma Dental',
            'phone' => '+371 20 000 523', 'email' => 'hello@formadental.example',
            'address' => '26 Jeruzalemes iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['New patient visit', 'Conversation, examination, imaging where appropriate and a written care plan.', 60, 85],
            ['Healthy foundations', 'Check-ups, hygiene visits, gum care and practical preventive guidance.', 45, 70],
            ['Smile planning', 'Whitening, bonding and restorative options planned around your own features.', null, 95],
        ] as $i => [$name, $short, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        // The author's "From €70" and "From €95": the row's starting-price mark.
        DB::table('services')->whereIn('name', ['Healthy foundations', 'Smile planning'])->update(['price_is_from' => true]);

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Elīna Roze',
            'title' => 'General and cosmetic dentist',
            'bio'   => 'General and cosmetic dentist focused on minimally invasive care, calm communication and treatment plans that remain practical over time.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'New patient visits available this month',
                'cta_label' => 'Choose a time',
            ],
            'hero' => [
                'kicker'          => 'Modern dentistry · Human pace',
                'headline'        => "Feel good\nabout your",
                'headline_accent' => 'smile.',
                'subtext'         => 'Thoughtful prevention, restorative care and cosmetic dentistry in a calm studio where every decision is explained.',
                'cta_label'       => 'Book a dental visit',
                'note_label'      => 'Next new patient visit',
                'proof'           => 'Friday · 10:15',
                'edition'         => 'New patient visit · 60 minutes',
            ],
            'trust' => [
                'feature_1' => '60 min', 'feature_1_caption' => 'first appointment',
                'feature_2' => 'One', 'feature_2_caption' => 'clear care plan',
                'feature_3' => 'LV / EN', 'feature_3_caption' => 'consultations',
            ],
            'services' => [
                'kicker'  => 'How we can help',
                'heading' => "Care for today.\nConfidence for later.",
                'subtext' => 'Start with the appointment closest to what you need. We will confirm the right next step after assessment.',
            ],
            'about' => [
                'kicker'  => 'Our idea of cosmetic care',
                'lead'    => "Natural is not\none perfect shape.",
                'body'    => 'Your smile should still belong to your face. We plan conservatively, preserve healthy tooth structure and explain the trade-offs before you decide.',
                'fact_1'  => 'Digital planning where useful',
                'fact_2'  => 'Transparent written estimates',
                'fact_3'  => 'Comfort discussed in advance',
                'caption' => 'Designed around your own features',
            ],
            'gallery_1' => [
                'kicker'         => 'Your first visit',
                'heading'        => "Nothing hidden.\nNothing hurried.",
                'subtext'        => 'You leave the first appointment knowing what we found, what matters now and what can comfortably wait.',
                'image_1'        => '/storage/visit-one.webp',
                'caption_1'      => 'Tell us what matters',
                'caption_1_note' => 'Goals, concerns and past experiences.',
                'image_2'        => '/storage/visit-two.webp',
                'caption_2'      => 'Understand the picture',
                'caption_2_note' => 'A clear examination and plain-language explanation.',
                'image_3'        => '/storage/visit-three.webp',
                'caption_3'      => 'Choose your pace',
                'caption_3_note' => 'A prioritised plan with fees and alternatives.',
            ],
            'team' => [
                'kicker' => 'Meet your dentist',
            ],
            'reviews' => [
                'kicker' => 'Patient words',
            ],
            'faq' => [
                'kicker'  => 'Good to know',
                'heading' => 'Before your visit.',
                'q1' => 'I feel nervous about dental visits. Can you help?',
                'a1' => 'Yes. Tell us when booking. We can allow more explanation time, agree pauses and discuss comfort options before examination.',
                'q2' => 'Will I receive prices before treatment?',
                'a2' => 'Yes. After assessment, we provide a written estimate and explain which items are urgent, optional or suitable to phase.',
                'q3' => 'Do you offer emergency appointments?',
                'a3' => 'A limited number of urgent appointments are held each week. Call the studio so we can understand the problem and advise.',
            ],
            'booking' => [
                'kicker'     => 'A calmer first step',
                'heading'    => "Meet your dentist.\nMake a clear plan.",
                'terms'      => 'Choose a new patient visit or call if you are unsure which appointment fits.',
                'cta_label'  => 'Book a visit',
                'call_label' => 'Need help?',
            ],
            'contact' => [
                'descriptor'       => 'Private dental studio · Riga',
                'email_label'      => 'Email the studio',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/forma.example',
                'social_facebook'  => 'https://facebook.com/forma.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Preventive, restorative and cosmetic dentistry in a warm private studio.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/forma_dental/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/forma_dental/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Forma']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (med-4) ───────────────────────────────────────────────

    /**
     * The tenant's colour is spent on `--color-clay` (the accent) and
     * `--color-rose` (the paler sibling the plum bands set their labels in).
     * `--color-plum` is this page's INK — the buttons, the header pill, the
     * manifesto band, the closing card, the footer — and repainting a page's
     * ink with a brand colour is exactly the destruction D2 names.
     */
    public function test_a_tenant_colour_lands_on_the_accent_and_never_on_the_ink(): void
    {
        $this->published(['hero' => ['headline' => 'Forma']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-clay:', $body);
        $this->assertStringContainsString('--color-rose:', $body);

        $this->assertStringNotContainsString('--color-plum:', $body);
        $this->assertStringNotContainsString('--color-porcelain:', $body);
        $this->assertStringNotContainsString('--color-cream:', $body);
        $this->assertStringNotContainsString('--color-oat:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Forma']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Forma']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /** The accent is re-resolved against THIS kit's own porcelain page. */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Forma']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-clay: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto a porcelain page.');
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
            'announcement' => 'new-patient-note',
            'header'       => 'studio-sticky',
            'hero'         => 'warm-studio-split',
            'trust'        => 'patient-facts',
            'services'     => 'care-cards',
            'story'        => 'smile-manifesto',
            'gallery'      => 'appointment-steps',
            'team'         => 'dentist-profile',
            'testimonials' => 'patient-letter',
            'faq'          => 'visit-questions',
            'booking'      => 'smile-invitation',
            'footer'       => 'dental-hub',
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
        $this->assertStringContainsString('landing/forma_dental/assets/hero-studio.webp', $body);

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
        $this->assertStringNotContainsString('Dr. Elīna Roze', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Forma'],
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
     * The author breaks his hero, care, manifesto, first-visit and booking
     * headings across two lines and sets the hero's last word in clay; a
     * line break in the raw leaf plus the companion accent leaf reproduce
     * all of them.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Feel good<br>about your <em>smile.</em>', $body);
        $this->assertStringContainsString('Care for today.<br>Confidence for later.', $body);
        $this->assertStringContainsString('Natural is not<br>one perfect shape.', $body);
        $this->assertStringContainsString('Nothing hidden.<br>Nothing hurried.', $body);
        $this->assertStringContainsString('Meet your dentist.<br>Make a clear plan.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Feel good about your',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The hero's availability card and small line (med-2, med-3) ───────

    /** The card sits in the photograph's frame, his calendar first, the label over the line, his arrow last. */
    public function test_the_availability_card_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '#<div class="hero__image">\s*<img [^>]+>\s*<a class="hero__availability"[^>]*><svg class="icon"[^>]*>.*?</svg>\s*<span><small>Next new patient visit</small><strong>Friday · 10:15</strong></span><svg class="icon"#s',
            $body,
        );
    }

    public function test_no_availability_line_means_no_card(): void
    {
        $this->published(['hero' => ['headline' => 'Forma', 'note_label' => 'Next new patient visit']]);

        $this->assertStringNotContainsString('hero__availability', $this->body());
    }

    /** The small muted line under the button is the hero's `edition` — the one hero leaf with no fixed meaning. */
    public function test_the_small_line_is_the_heros_small_mark(): void
    {
        $this->seedLikeTheKit('hotel');

        $this->assertStringContainsString('<p class="hero__small">New patient visit · 60 minutes</p>', $this->body());
    }

    public function test_no_small_mark_means_no_small_line(): void
    {
        $this->published(['hero' => ['headline' => 'Forma', 'proof' => 'Friday · 10:15']]);

        $this->assertStringNotContainsString('hero__small', $this->body());
    }

    // ─── The care cards (med-5) ───────────────────────────────────────────

    public function test_the_care_cards_are_numbered_and_the_oat_tint_cycles_from_the_second(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Hygiene visit',
            'price' => 60, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('class="care-grid" data-count="4"', $body);

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('<p class="care-grid__number">' . $ordinal . '</p>', $body);
        }

        preg_match_all('/<article( class="care-grid__featured")? data-item-id="\d+">/', $body, $matches);

        $this->assertSame(['', ' class="care-grid__featured"', '', ''], $matches[1]);
    }

    /** "60 minutes · €85": the appointment's length on the left of the ruled footer and its price on the right. */
    public function test_the_card_footer_is_minutes_and_price_in_the_authors_shape(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#<div><span>60 minutes</span>\s*<strong>€85</strong></div>#', $body);
        $this->assertMatchesRegularExpression('#<div><span>45 minutes</span>\s*<strong>From €70</strong></div>#', $body);
        // No length on the record: the price stands alone.
        $this->assertMatchesRegularExpression('#<h3>Smile planning</h3>\s*<p>[^<]+</p>\s*<div>\s*<strong>From €95</strong></div>#', $body);
    }

    public function test_a_card_with_neither_length_nor_price_has_no_footer_row(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Forma', 'currency' => 'EUR', 'is_active' => true]);
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Second opinion',
            'short_description' => 'A calm review of a plan made elsewhere.', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Forma']]);
        $body = $this->body();

        $this->assertMatchesRegularExpression('#<h3>Second opinion</h3>\s*<p>A calm review of a plan made elsewhere\.</p>\s*</article>#', $body);
    }

    public function test_the_tenants_own_word_replaces_from(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['services' => ['price_prefix' => 'Starting at']])]);

        $this->assertStringContainsString('<strong>Starting at €70</strong>', $this->body());
    }

    public function test_the_care_cards_carry_no_link_of_their_own(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringNotContainsString('data-service-id=', $body);
    }

    // ─── The first-visit steps: this design's gallery (med-2) ─────────────

    /**
     * His band is three numbered step cards with a name and a line of prose
     * and NO photograph; a `gallery` band on this platform IS its pictures.
     * The card, the ring and the caption-as-heading are his; the photograph
     * is the tenant's.
     */
    public function test_the_first_visit_steps_carry_the_tenants_photographs_in_the_authors_cards(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<ol data-count="3">', $body);
        $this->assertSame(3, substr_count($body, '<li class="visit__photo">'));
        $this->assertStringContainsString('/storage/visit-one.webp', $body);
        $this->assertStringContainsString('<span aria-hidden="true">01</span>', $body);
        $this->assertMatchesRegularExpression('#<h3>Tell us what matters</h3>\s*<p>Goals, concerns and past experiences\.</p>#', $body);
        $this->assertMatchesRegularExpression('#<h3>Choose your pace</h3>\s*<p>A prioritised plan with fees and alternatives\.</p>#', $body);
        $this->assertStringContainsString('Nothing hidden.<br>Nothing hurried.', $body);
        $this->assertStringContainsString('<p>You leave the first appointment knowing what we found, what matters now and what can comfortably wait.</p>', $body);
    }

    public function test_the_line_under_a_caption_is_escaped_and_absent_when_blank(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'gallery_1' => [
            'heading'        => 'Your first visit',
            'image_1'        => '/storage/one.webp',
            'image_2'        => '/storage/two.webp',
            'caption_1'      => 'Tell us',
            'caption_1_note' => 'Goals <b>&</b> concerns',
            'caption_2'      => 'Understand',
        ]]);

        $body = $this->body();

        $this->assertMatchesRegularExpression('#<h3>Tell us</h3>\s*<p>Goals &lt;b&gt;&amp;&lt;/b&gt; concerns</p>#', $body);
        $this->assertStringNotContainsString('<b>&</b>', $body);
        $this->assertMatchesRegularExpression('#<h3>Understand</h3>\s*</li>#', $body);
    }

    public function test_a_step_with_no_caption_draws_no_heading(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'gallery_1' => [
            'heading'   => 'Your first visit',
            'image_1'   => '/storage/one.webp',
            'image_2'   => '/storage/two.webp',
            'caption_1' => 'Tell us',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('<h3>Tell us</h3>', $body);
        $this->assertSame(1, substr_count($body, '<h3>'));
    }

    public function test_the_steps_count_only_readable_photographs(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'gallery_1' => [
            'heading' => 'Your first visit',
            'image_1' => '/storage/one.webp',
            'image_2' => 'javascript:alert(1)',
            'image_3' => ['nope'],
            'image_4' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Two tiles: the tenant's own readable one, and the design's own
        // photograph restored under the second slot (template fidelity 4.1).
        $this->assertStringContainsString('<ol data-count="2">', $body);
        $this->assertStringContainsString('landing/forma_dental/assets/natural-smile.webp', $body);
        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringNotContainsString('evil.example', $body);
    }

    /** His steps carry a name, a line and an intro paragraph, and no word after the ordinal. */
    public function test_this_design_offers_the_step_line_and_intro_but_no_ordinal_word(): void
    {
        $gallery = LandingOnboardingService::contentFieldsFor('forma_dental')['gallery'];

        $this->assertContains('caption_1_note', $gallery);
        $this->assertContains('subtext', $gallery);
        $this->assertNotContains('caption_1_label', $gallery);
    }

    // ─── The dentist (med-6) ──────────────────────────────────────────────

    public function test_the_first_practitioner_is_the_dentist_and_the_row_closes_up(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Elīna Roze</h2>', $body);
        $this->assertStringContainsString('focused on minimally invasive care, calm communication and treatment plans that remain practical over time.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
        // Name and sentence, nobody beside her: two of the author's three tracks.
        $this->assertStringContainsString('class="container dentist__inner dentist__inner--pair"', $body);
    }

    public function test_the_other_practitioners_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();

        foreach ([['Dr. Jānis Bērziņš', 'Orthodontist'], ['Elīna Kalniņa', 'Dental hygienist']] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i + 1, 'is_active' => true,
            ]);
        }

        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Elīna Roze</h2>', $body);
        $this->assertStringContainsString('class="container dentist__inner"', $body);
        $this->assertStringContainsString('<dt>Dr. Jānis Bērziņš</dt>', $body);
        $this->assertStringContainsString('<dd>Orthodontist</dd>', $body);
        $this->assertStringContainsString('<dt>Elīna Kalniņa</dt>', $body);
        $this->assertStringNotContainsString('<dt>Dr. Elīna Roze</dt>', $body);
    }

    public function test_a_dentist_with_no_bio_is_introduced_by_their_title(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Forma', 'is_active' => true]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Dr. Elīna Roze',
            'title' => 'General and cosmetic dentist', 'sort_order' => 0, 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Forma'], 'team' => ['kicker' => 'Meet your dentist']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2>Dr. Elīna Roze</h2>', $body);
        $this->assertStringContainsString('<p>General and cosmetic dentist</p>', $body);
    }

    public function test_the_dentist_band_offers_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();

        $body = $this->body();

        $this->assertStringNotContainsString('&amp;master=', $body);
    }

    // ─── The patient letter ───────────────────────────────────────────────

    public function test_the_patient_letter_is_the_first_featured_review_with_the_studios_rating(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('For the first time, a dental appointment', $body);
        $this->assertMatchesRegularExpression('#<p class="rating"><svg class="icon"[^>]*><path d="m12 3 [^"]+" fill="currentColor"></path></svg>\s*4\.9 / 5</p>#', $body);
        $this->assertStringContainsString('Verified patient · Riga', $body);
    }

    public function test_a_named_patient_is_credited_by_name(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Forma', 'city' => 'Riga', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Anna K.', 'overall_rating' => 5,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Forma'], 'reviews' => ['kicker' => 'Patient words']]);
        $body = $this->body();

        $this->assertStringContainsString('Anna K. · Riga', $body);
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
        $this->published(['hero' => ['headline' => 'Forma'], 'faq' => [
            'heading' => 'Before your visit.',
            'q1' => 'Which appointment?', 'a1' => 'The one the assessment supports.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which appointment?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'faq' => [
            'heading' => 'Answers', 'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The fact strip ───────────────────────────────────────────────────

    public function test_the_fact_strip_leads_with_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-variant="patient-facts" data-count="4"', $body);
        $this->assertStringContainsString('<div><strong>4.9</strong><span>patient rating</span></div>', $body);
        $this->assertStringContainsString('<div><strong>60 min</strong><span>first appointment</span></div>', $body);
    }

    /** A highlight with no caption is the value alone, in the author's display type. */
    public function test_an_unpaired_highlight_is_the_value_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'trust' => [
            'feature_1' => '60 min', 'feature_1_caption' => 'first appointment',
            'feature_2' => 'Evidence-informed care',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="2"', $body);
        $this->assertStringContainsString('<div><strong>Evidence-informed care</strong></div>', $body);
    }

    public function test_a_studio_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Patient ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Forma'], 'trust' => ['feature_1' => 'One', 'feature_1_caption' => 'clear care plan']]);
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
            '/<p>New patient visits available this month ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>Choose a time<\/a>/',
            $body,
        );
    }

    /** No navigation on any kit (polish-1, 2026-09-08): the header is the brand and the Book pill. */
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
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Forma & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Forma']]);
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<strong>Forma <em>&amp;</em> Co</strong>'));
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Forma']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    /** The monogram is ONE letter, as the author sets it ("F"), in both lockups. */
    public function test_the_monogram_is_the_first_letter_of_the_business(): void
    {
        $this->seedLikeTheKit();

        $this->assertSame(2, substr_count($this->body(), '<span aria-hidden="true">F</span>'));
    }

    public function test_a_brand_logo_takes_the_monograms_disc(): void
    {
        $this->makeBrand('/storage/forma-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span aria-hidden="true"><img src="/storage/forma-logo.png"'));
        $this->assertStringNotContainsString('<span aria-hidden="true">F</span>', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    public function test_a_studio_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('/services-widget', $body);
        $this->assertStringContainsString('href="tel:+37120000523"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

    public function test_a_bookable_studio_wires_every_hook_to_the_appointment_flow(): void
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

    public function test_the_closing_card_prints_the_call_line_with_the_bare_number_as_the_link(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('<p class="booking__phone">Need help? <a href="tel:+37120000523">+371 20 000 523</a></p>', $body);
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

        // "Book a dental visit" in the hero and on the fixed pill; "Book a
        // visit" on the header pill and the footer lockup.
        $this->assertSame(2, substr_count($body, 'Book a dental visit</a>'));
        $this->assertSame(2, substr_count($body, 'Book a visit</a>'));
    }

    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Patient words', 'embed_key' => 'abc123',
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
            'organization_id' => 1, 'name' => 'Patient words', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('<p>Preventive, restorative and cosmetic dentistry in a warm private studio.</p>', $body);
        $this->assertStringContainsString('<small>Private dental studio · Riga</small>', $body);
        $this->assertStringContainsString('Email the studio', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration.', $body);
        $this->assertStringNotContainsString('href="#top">Privacy', $body);
        $this->assertStringNotContainsString('Accessibility</a>', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Forma']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'about' => 'not an array', 'trust' => 'nor this', 'gallery_1' => 'nor this one']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Forma', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Forma'], 'faq' => [
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
            'gallery_1' => ['subtext' => '<b>intro</b>', 'caption_1' => '<b>step</b>', 'caption_1_note' => '<b>line</b>'],
            'booking'   => ['call_label' => '<b>call</b>'],
            'contact'   => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>', 'email_label' => '<b>mail</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('&lt;b&gt;proof&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;edition&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;step&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;line&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;descriptor&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/forma_dental\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/forma_dental.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range; the display face is the
     * ONE weight the author set (`Fraunces:opsz,wght@9..144,400`) in latin
     * and latin-ext, and the body face stops at 600 (`Manrope:wght@400;500;600`)
     * with its Cyrillic. Fraunces publishes no Cyrillic, so none is declared
     * for it — pinned as a fact rather than left as an omission.
     */
    public function test_the_faces_are_declared_as_the_author_asked_for_them(): void
    {
        $css = file_get_contents(public_path('landing/forma_dental.css'));

        preg_match_all('/@font-face\{([^}]+)\}/', $css, $faces);

        $this->assertCount(5, $faces[1], 'Five faces: Fraunces (latin-ext, latin) and Manrope (cyrillic, latin-ext, latin).');

        foreach ($faces[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face);
            $this->assertStringContainsString('font-display:swap', $face);
        }

        $this->assertSame(2, substr_count($css, 'font-family:Fraunces;font-style:normal;font-weight:400;'));
        $this->assertSame(3, substr_count($css, 'font-family:Manrope;font-style:normal;font-weight:400 600;'));
        $this->assertStringContainsString('fraunces-var-latin-ext.woff2', $css);
        $this->assertStringContainsString('manrope-var-cyrillic.woff2', $css);
        $this->assertStringNotContainsString('fraunces-var-cyrillic', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/forma_dental/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/forma_dental/assets/' . basename($file)));
        }
    }

    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/forma_dental.css'));

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
        $css = file_get_contents(public_path('landing/forma_dental.css'));

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
        $renders = LandingOnboardingService::rendersFor('forma_dental');

        $this->assertContains('gallery', $renders);

        foreach ($renders as $id) {
            $this->assertFileExists(
                public_path('landing/thumbs/forma_dental/' . $id . '.svg'),
                "No thumbnail for the `{$id}` band.",
            );
        }

        $this->assertFileExists(public_path('landing/thumbs/forma_dental/contact.svg'));
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

        $page->update(['content' => ['hero' => ['headline' => 'Feel good about your smile.']]]);
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
