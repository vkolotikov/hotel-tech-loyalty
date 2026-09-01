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
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Nocturne Ritual — the first BeautyTech kit, rendered as a real template.
 *
 * The acceptance criterion for this template is not a number in this file:
 * it is that the page a tenant gets is the page the author drew. What THIS
 * file is for is everything a screenshot cannot see — that a hostile stored
 * value cannot take the page down or reach the DOM unescaped, that a band
 * with nothing in it does not render at all, and that not one control on the
 * page points somewhere it cannot go.
 *
 * Every hostile-value battery that protects The Ruled Page is repeated here
 * against this template, because they are two independent sets of Blade files
 * and a guard that only one of them makes is a guard the other one does not
 * have.
 */
class NocturneRitualRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    /**
     * A published nocturne page with the seven bands a beauty page is
     * created with. Deliberately mirrors RuledPageRenderTest::published() so
     * the two templates are exercised against the same shape of tenant.
     */
    private function published(array $content = [], array $theme = [], string $industry = 'beauty'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'nocturne-spa',
            'template_key' => 'nocturne_ritual', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Let the day fall away.']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page;
    }

    /**
     * The brand this page belongs to, with a logo on it (template fidelity
     * 4.6). The landing schema creates the `brands` table but no rows —
     * every other fixture here only needs the page's `brand_id` to be a
     * number — so the row a logo actually lives on has to be made.
     */
    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'Nocturne', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/nocturne-spa')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/nocturne-spa')->getStatusCode();
    }

    /** The kit's own sample content, as close as a real tenant can get to it. */
    private function seedLikeTheKit(): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne Bathhouse',
            'phone' => '+44 (0) 1225 555 014', 'email' => 'hello@nocturnebathhouse.example',
            'address' => '18 Wren Street', 'city' => 'Bath', 'country' => 'United Kingdom',
            'currency' => 'GBP', 'timezone' => 'Europe/London', 'is_active' => true,
        ]);

        foreach ([
            ['Still Water', 'Thermal bathing · Full-body reset', 'Unhurried heat, mineral soak and grounding bodywork for tired muscles.', 90, 145],
            ['Amber Hour', 'Warm linen · Restorative bodywork', 'A warm-compress ritual with flowing pressure, finished with a slow scalp release.', 75, 118],
            ['Night Face', 'Facial massage · Hydration ritual', 'Gentle cleansing, layered hydration and considered facial massage.', 60, 92],
            ['Quiet for Two', 'Private bathing · Paired treatments', 'Private thermal time followed by side-by-side personalised rituals.', 120, 310],
        ] as $i => [$name, $short, $long, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'description' => $long,
                'duration_minutes' => $minutes, 'price' => $price, 'currency' => 'GBP',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Amara Cole', 'Deep rest · Warm-oil bodywork'],
            ['Mei Lawson', 'Facial massage · Skin rituals'],
            ['Clara Voss', 'Restorative bodywork · Thermal host'],
        ] as $i => [$name, $title]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title,
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Ella M.', 5, 'The rare kind of place that changes your pace before the treatment has even begun.'],
            ['Priya R.', 5, 'Beautifully calm, never performative. Amara listened, adapted and gave me exactly the reset I needed.'],
            ['Jon C.', 5, 'The late appointment was perfect after work. Warm, thoughtful and genuinely easy.'],
            ['Sam T.', 4, 'Quiet, careful and unhurried from booking to goodbye.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'hero' => [
                'kicker'   => 'Bathing · Bodywork · Rest',
                'headline' => 'Let the day fall away.',
                'subtext'  => 'An intimate city bathhouse for slow heat, skilled hands and the kind of quiet you can feel.',
            ],
            'trust' => [
                'quote'     => 'A deeply considered place to pause.',
                'feature_1' => 'Private treatment rooms',
                'feature_2' => 'Small daily guest list',
                'feature_3' => 'Gift rituals available',
            ],
            'announcement' => [
                'text'      => 'Late-light rituals now available Thursday to Saturday.',
                'cta_label' => 'Book an evening ritual',
            ],
            'services' => [
                'kicker'  => 'Our rituals',
                'heading' => 'Care that meets you where you are.',
                'subtext' => 'Every appointment begins with a quiet consultation.',
            ],
            'about' => [
                'kicker' => 'The house',
                'lead'   => 'Warmth, water and room to exhale.',
                'body'   => "Nocturne was made for the hour between doing and resting.\n\nBehind our Wren Street door, sound softens. The bath is warm, appointments are unhurried and every room has been designed around privacy.",
            ],
            'team' => [
                'kicker'  => 'Your practitioners',
                'heading' => 'Good hands. Thoughtful people.',
                'subtext' => 'Our small team brings together bodywork, facial practice and thoughtful hosting.',
            ],
            'reviews' => ['kicker' => 'Guest notes'],
            'faq'     => [
                'kicker'  => 'Before you arrive',
                'heading' => 'A few useful things.',
                'subtext' => 'Choose the closest option when booking.',
                'q1' => 'What should I bring?',
                'a1' => 'Just yourself. Robes, towels, sandals and secure storage are provided.',
                'q2' => 'How early should I arrive?',
                'a2' => 'We recommend 20 minutes, so you can settle and speak with your practitioner.',
            ],
        ]);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        // Blade's raw echo on customer content is how this page would become
        // stored XSS. This directory contains zero; keep it that way.
        $files = glob(resource_path('views/landing/nocturne_ritual/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /** glob() above does not recurse, and sections/ is where the customer content lands. */
    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/nocturne_ritual/sections/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no section partials.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /** The shared head partial this template includes is held to the same rule. */
    public function test_the_shared_partials_contain_no_raw_echo(): void
    {
        foreach (glob(resource_path('views/landing/shared/*.blade.php')) as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /**
     * No executable inline script anywhere on the rendered page.
     *
     * script-src is 'self' with no nonce token for scripts, so an inline
     * script would not run — relying on one means a page that silently
     * half-works. The one src-less script permitted is the ld+json block,
     * which the HTML parser never treats as script at all.
     */
    public function test_it_ships_no_inline_script(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<script\b[^>]*>/i', $body, $matches);

        foreach ($matches[0] as $tag) {
            $isExternal = str_contains($tag, 'src=');
            $isLdJson   = str_contains($tag, 'application/ld+json');

            $this->assertTrue($isExternal || $isLdJson,
                "An inline <script> reached the page: {$tag}");
        }

        // And no DOM event handler attributes or javascript: URLs, which the
        // kit's own markup rules forbid for the same reason.
        $this->assertDoesNotMatchRegularExpression('/\son[a-z]+\s*=/i', $body);
        $this->assertStringNotContainsString('javascript:', $body);
    }

    public function test_every_inline_style_block_carries_the_request_nonce(): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent, and the palette that must not appear ─────────────────

    public function test_a_tenant_colour_lands_on_the_three_accent_slots(): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-accent:', $body);
        $this->assertStringContainsString('--color-accent-light:', $body);
        $this->assertStringContainsString('--color-accent-on:', $body);
    }

    /**
     * With no tenant colour the page ships NO inline CSS at all, and the
     * kit's own gold stands. That is the whole promise of "the palette is
     * the design".
     */
    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    /**
     * The Ruled Page's palette system does not apply here, and a stored
     * palette must not leak into this template by any route: no token block,
     * no data-scheme, no fifteen custom properties.
     */
    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'gallery' => false, 'team', 'testimonials', 'faq', 'footer',
        ] as $key => $block) {
            $block = is_string($key) ? $key : $block;

            if ($block === 'gallery') {
                continue; // needs uploaded photographs; covered separately
            }

            $this->assertStringContainsString('data-block="' . $block . '"', $body,
                "The '{$block}' block did not render.");
        }

        // The nested footer blocks the kits' shared contract names.
        $this->assertStringContainsString('data-block="contact"', $body);
        $this->assertStringContainsString('data-ai-widget-slot', $body);
    }

    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        foreach ([
            'announcement' => 'quiet-offer',
            'header'       => 'floating',
            'hero'         => 'cinematic-image',
            'trust'        => 'press-and-rating',
            'services'     => 'editorial-list',
            'story'        => 'offset-image',
            'team'         => 'feature-and-list',
            'testimonials' => 'featured-and-cards',
            'faq'          => 'two-column',
            'footer'       => 'service-hub',
            'contact'      => 'footer-details',
            'assistant'    => 'widget-slot',
        ] as $block => $variant) {
            $this->assertStringContainsString(
                'data-block="' . $block . '" data-variant="' . $variant . '"',
                $body,
                "The '{$block}' block lost its data-variant."
            );
        }
    }

    /**
     * A brand-new tenant: a page, a name and nothing else. Not one empty
     * band, not one stray heading — and, since template fidelity 4.1, the
     * DESIGN'S OWN PHOTOGRAPHS rather than a page with none.
     *
     * The second half of that is the author's recorded decision and it is
     * what this test now pins: a tenant who chose this design because of its
     * photography gets its photography on day one. A band with nothing to
     * SAY is still absent — the photographs are the design's, the words are
     * the tenant's, and no band renders on the strength of a picture alone
     * except the ones whose whole content is pictures.
     */
    public function test_a_bare_page_renders_the_designs_photographs_and_no_empty_bands(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);

        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Every band whose content comes from a screen the tenant has not
        // filled in yet is simply not in the document. `story` and `team`
        // are in this list although the design has a photograph for each:
        // count() gates them on the tenant's prose and their practitioners,
        // and a photograph is not a reason to publish a band about a studio
        // nobody has described yet.
        foreach (['services', 'story', 'team', 'testimonials', 'gallery', 'faq', 'trust', 'announcement'] as $block) {
            $this->assertStringNotContainsString('data-block="' . $block . '"', $body,
                "The '{$block}' block rendered with nothing in it.");
        }

        // What IS there: the header, the hero and the footer.
        $this->assertStringContainsString('data-block="hero"', $body);
        $this->assertStringContainsString('data-block="footer"', $body);

        // The hero wears the author's own plate, with the author's own
        // description of it — not `.hero--plain`, which is what a design
        // shipping NO photograph falls back to and is still what The Ruled
        // Page renders.
        $this->assertStringContainsString('hero__media', $body);
        $this->assertStringContainsString('landing/nocturne_ritual/assets/hero-nocturne.webp', $body);
        $this->assertStringContainsString('alt="A warmly lit, charcoal-toned treatment room"', $body);
        $this->assertStringNotContainsString('hero--plain', $body);

        // And nothing about the author's own fictional business travels with
        // the picture: the alt describes the photograph, never the studio.
        $this->assertStringNotContainsString('Nocturne Bathhouse', $body);
        $this->assertStringNotContainsString('Amara', $body);
    }

    /**
     * The other side of the default model, and the reason it is not simply
     * "ship some photographs": The Ruled Page has none of its own, so its
     * empty states are exactly what they were.
     */
    public function test_a_design_with_no_photographs_of_its_own_still_renders_its_empty_state(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);

        $page = $this->published();
        $page->update(['template_key' => 'ruled_page']);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('landing/nocturne_ritual/assets/', $body);
    }

    public function test_an_empty_page_ships_no_empty_heading(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'nocturne-spa',
            'template_key' => 'nocturne_ritual', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now(), 'content' => [],
        ]);
        $page->sections()->create(['key' => 'hero', 'enabled' => true, 'sort' => 0]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        // An empty <h1> is a WCAG 2.4.6 failure. With nothing to say the
        // element is dropped, not emptied.
        $this->assertStringNotContainsString('<h1', $body);
    }

    public function test_a_disabled_band_does_not_render(): void
    {
        $page = $this->seedLikeTheKit();
        $page->sections()->where('key', 'services')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="services"', $body);
        // ...and the nav cannot point at it either.
        $this->assertStringNotContainsString('href="#services"', $body);
    }

    /**
     * Template fidelity 3.2 — "Add a Text block" stops being a dead control.
     *
     * A tenant could add this band on this template, watch the editor
     * auto-focus its first input, write copy, save it, and never see it: the
     * layout filtered the band out because no `text.blade.php` shipped here.
     * The partial ships now, drawn as the author's own story band — his
     * composition, his classes, not one byte added to his stylesheet.
     *
     * Gated on the BODY, like every other prose band: an added band the
     * tenant has not written into is not in the document at all.
     */
    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Nocturne'],
            'text_1' => [
                'kicker'  => 'A note',
                'heading' => 'Membership is open.',
                'body'    => "First paragraph.\n\nSecond paragraph.",
            ],
            'text_2' => ['kicker' => 'Written into never'],
        ]);
        $page->sections()->create(['key' => 'text_1', 'enabled' => true, 'sort' => 8]);
        $page->sections()->create(['key' => 'text_2', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="text"', $body);
        $this->assertStringContainsString('Membership is open.', $body);
        // Paragraph breaks the tenant typed survive as paragraphs.
        $this->assertStringContainsString('First paragraph.', $body);
        $this->assertStringContainsString('Second paragraph.', $body);
        // The band with no body is a fragment, not a section.
        $this->assertStringNotContainsString('Written into never', $body);
        // Two instances, one partial: the second one's id is its own key.
        $this->assertStringContainsString('id="text_1"', $body);
        $this->assertStringNotContainsString('id="text_2"', $body);
        // No photograph, so no empty frame — the author's own --solo collapse.
        $this->assertStringContainsString('story__grid--solo', $body);
    }

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published([
            'hero' => ['headline' => 'Nocturne'],
            'faq'  => [
                'q1' => 'What should I bring?', 'a1' => 'Just yourself.',
                'q2' => 'A question with no answer',
                'a3' => 'An answer with no question',
                'q4' => 'Both halves', 'a4' => 'Present.',
            ],
        ]);

        $body = $this->body();

        $this->assertStringContainsString('What should I bring?', $body);
        $this->assertStringContainsString('Both halves', $body);
        $this->assertStringNotContainsString('A question with no answer', $body);
        $this->assertStringNotContainsString('An answer with no question', $body);
        $this->assertSame(2, substr_count($body, '<details>'));
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published([
            'hero' => ['headline' => 'Nocturne'],
            'faq'  => ['q1' => 'Only a question', 'a2' => 'Only an answer', 'heading' => 'Questions'],
        ]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('data-block="faq"', $body);
        $this->assertStringNotContainsString('Questions', $body);
    }

    public function test_faq_pairs_past_the_cap_never_render(): void
    {
        $beyond = SectionType::MAX_FAQ_PAIRS + 1;

        $this->published([
            'hero' => ['headline' => 'Nocturne'],
            'faq'  => [
                'q1' => 'In range', 'a1' => 'Yes.',
                'q' . $beyond => 'Past the cap', 'a' . $beyond => 'Never rendered.',
            ],
        ]);

        $body = $this->body();

        $this->assertStringContainsString('In range', $body);
        $this->assertStringNotContainsString('Past the cap', $body);
    }

    /**
     * The trust strip has three independent sources and needs only one. A
     * studio with reviews and no copy still has something to say here.
     */
    public function test_the_trust_strip_renders_on_the_rating_alone(): void
    {
        foreach (range(1, 4) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Wonderful.',
                'anonymous_name' => 'Guest ' . $i, 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('trust-strip__rating', $body);
        $this->assertStringNotContainsString('trust-strip__quote', $body);
    }

    public function test_a_studio_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        // Three ratings — one below PageContent::MIN_REVIEWS_FOR_AGGREGATE.
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Wonderful.',
                'anonymous_name' => 'Guest ' . $i, 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published();
        $body = $this->body();

        // The quotes are there; the fabricated score is not.
        $this->assertStringContainsString('data-block="testimonials"', $body);
        $this->assertStringNotContainsString('reviews__score', $body);
        $this->assertStringNotContainsString('trust-strip__rating', $body);
        $this->assertStringNotContainsString('5.0 / 5', $body);
    }

    // ─── The integration contract ─────────────────────────────────────────

    /**
     * The booking band is gated to the hotel industry by
     * PageContent::count('booking'), because the widget asks hotel
     * questions. On an industry it does not fit, the "Book" controls fall
     * back to the footer's contact hub and DROP the data-action with them:
     * a link that does not open the booking widget must not claim to.
     */
    public function test_a_beauty_page_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringNotContainsString('data-service-id', $body);

        // The control itself survives, pointing at the details the page does
        // publish. Never a dead control, and never an absent one where there
        // is somewhere real to go.
        $this->assertStringContainsString('href="#site-footer"', $body);
    }

    public function test_a_hotel_page_wires_every_booking_hook_to_the_real_flow(): void
    {
        // The widget binds by widget_token, so a page whose org has none can
        // honestly offer no booking URL at all.
        $this->seedWidgetOrganization();

        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Thermal Suite',
            'price' => 145, 'is_active' => true,
        ]);
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Amara Cole', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Nocturne']], [], 'hotel');
        $body = $this->body();

        $this->assertStringContainsString('data-block="booking"', $body);
        $this->assertStringContainsString('data-action="open-booking"', $body);

        // Every open-booking hook points at the widget the middleware built,
        // on the admin origin — never at a bare in-page anchor.
        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/booking-widget', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
        }

        // The author's per-item hook rides along on the service and
        // practitioner links.
        $this->assertStringContainsString('data-service-id', $body);
    }

    /**
     * "Reaches the review flow if one exists — if it does not, render the
     * link only when it can work, never dead."
     */
    public function test_no_review_form_means_no_feedback_link(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringNotContainsString('data-action="open-feedback"', $body);
        $this->assertStringNotContainsString('footer-hub__review', $body);
    }

    public function test_an_active_review_form_wires_the_feedback_link(): void
    {
        $form = ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest survey', 'type' => 'basic',
            'is_active' => true, 'is_default' => true, 'embed_key' => 'nocturne-key',
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-action="open-feedback"', $body);
        $this->assertStringContainsString('/review/' . $form->id, $body);
        $this->assertStringContainsString('key=nocturne-key', $body);
    }

    public function test_an_inactive_or_keyless_review_form_is_not_linked(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Retired', 'type' => 'basic',
            'is_active' => false, 'embed_key' => 'retired-key',
        ]);
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Never shared', 'type' => 'basic',
            'is_active' => true, 'embed_key' => null,
        ]);

        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_a_form_that_refuses_anonymous_submissions_is_not_linked(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Invite only', 'type' => 'custom',
            'is_active' => true, 'embed_key' => 'invite-key',
            'config' => ['allow_anonymous' => false],
        ]);

        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
    }

    public function test_the_chat_launcher_mounts_in_the_reserved_slot(): void
    {
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1, 'widget_key' => 'wk-nocturne', 'is_active' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        // The slot is the author's; the launcher and the framed panel are
        // the platform's, and they are INSIDE it.
        $this->assertMatchesRegularExpression(
            '/data-ai-widget-slot[^>]*>.*?<iframe class="ai-panel".*?<button class="ai-launcher"/s',
            $body
        );
        $this->assertStringContainsString('/chat-frame/wk-nocturne', $body);
        // A slot holding a real control is not aria-hidden.
        $this->assertDoesNotMatchRegularExpression('/data-ai-widget-slot aria-hidden/', $body);
    }

    public function test_no_chat_widget_leaves_the_slot_reserved_and_empty(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-ai-widget-slot', $body);
        $this->assertStringNotContainsString('ai-launcher', $body);
        $this->assertStringNotContainsString('ai-panel', $body);
    }

    public function test_a_switched_off_chat_widget_is_not_embedded(): void
    {
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1, 'widget_key' => 'wk-off', 'is_active' => false,
        ]);

        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('ai-launcher', $this->body());
    }

    // ─── Stored values the renderer must survive ──────────────────────────
    //
    // theme, content and seo are `array` casts with no schema behind them.
    // The admin API refuses these writes now, but a validator only governs
    // rows written after it shipped: a migration, an import or a raw UPDATE
    // never meets one. Every one of these must render 200.

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne']], ['brand_color' => ['#fff', '#000']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_seo_title_does_not_take_the_page_down(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne']]);
        $page->forceFill(['seo' => ['title' => ['a' => 'b']]])->save();

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['deep' => ['deeper' => 'x']]]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published([
            'hero'         => 'not a map at all',
            'faq'          => 'not a map either',
            'trust'        => 'nor this',
            'announcement' => 'nor this one',
            'contact'      => 'nor that',
        ]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published([
            'hero' => ['headline' => 'Nocturne'],
            'faq'  => ['q1' => str_repeat('a', 200000), 'a1' => str_repeat('b', 200000)],
        ]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published([
            'hero' => ['headline' => 'Nocturne'],
            'faq'  => [
                'q1' => '"><script>alert(1)</script>',
                'a1' => '</summary><img src=x onerror=alert(1)>',
            ],
        ]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        // Escaped, not stripped: the ANGLE BRACKETS are what make a tag, so
        // the test is that no real element reached the document — the words
        // themselves are still there, as text, which is exactly right.
        $this->assertStringNotContainsString('<script>', $body);
        $this->assertStringNotContainsString('<img src=x', $body);
        $this->assertStringNotContainsString('</summary><img', $body);
        $this->assertStringContainsString('&lt;script&gt;', $body);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $body);
    }

    public function test_a_hostile_announcement_and_trust_leaf_are_escaped(): void
    {
        $this->published([
            'hero'         => ['headline' => 'Nocturne'],
            'announcement' => ['text' => '<img src=x onerror=alert(1)>', 'cta_label' => '"><b>x'],
            'trust'        => ['quote' => '</p><script>alert(2)</script>', 'feature_1' => '"><i>y'],
        ]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>', $body);
        $this->assertStringNotContainsString('<img src=x', $body);
        $this->assertStringContainsString('&lt;script&gt;alert(2)&lt;/script&gt;', $body);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $body);
    }

    /**
     * The three photo guards apply here identically, because they are
     * PageContent's and this template calls nothing else.
     *
     * @return array<string, array{0: mixed, 1: ?string}>
     */
    public static function hostileImages(): array
    {
        return [
            'javascript uri'   => ['javascript:alert(1)', 'javascript:'],
            // The prefix allowlist refuses this outright, so the string
            // never reaches an attribute context at all.
            'attribute breakout' => ['"><script>', '"><script>'],
            'protocol relative'=> ['//evil.example/x.jpg', 'evil.example'],
            'array'            => [['/storage/a.jpg'], null],
            'number'           => [12345, null],
            'oversized'        => ['/storage/' . str_repeat('a', 3000) . '.jpg', null],
        ];
    }

    /**
     * THE BATTERY IS STRONGER AFTER TEMPLATE FIDELITY 4.1, NOT WEAKER, and
     * this is where that is pinned.
     *
     * A hostile leaf still fails every one of imageUrl()'s three guards and
     * still never reaches the DOM — that half is unchanged and is what the
     * `$needle` assertion holds. What it FALLS BACK TO changed: the design's
     * own photograph rather than an empty band. So a page whose stored hero
     * leaf is `javascript:alert(1)` now renders the author's plate, which is
     * also exactly what "Remove restores the original" means one door over.
     */
    #[DataProvider('hostileImages')]
    public function test_a_hostile_hero_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/nocturne_ritual/assets/hero-nocturne.webp', $body);
        $this->assertStringNotContainsString('hero--plain', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    /**
     * The same battery against a design that ships no photograph of its own,
     * where the fallback is still the empty state. Both halves of the model
     * have to be proven, or "it fell back to something" says nothing about
     * which something.
     */
    #[DataProvider('hostileImages')]
    public function test_a_hostile_hero_image_renders_no_img_where_the_design_has_no_default(mixed $value, ?string $needle): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne', 'image_url' => $value]]);
        $page->update(['template_key' => 'ruled_page']);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('landing/nocturne_ritual/assets/', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_never_reaches_the_page_and_restores_the_default(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Nocturne'],
            'about' => ['body' => 'A quiet place.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="story"', $body);
        // The design's own plate, and not the tenant's hostile leaf.
        $this->assertStringContainsString('landing/nocturne_ritual/assets/thermal-pool.webp', $body);
        $this->assertStringNotContainsString('story__grid--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    /**
     * A gallery of nothing but hostile leaves renders the DESIGN'S OWN
     * mosaic — none of the hostile values, all four of the author's
     * photographs — because every one of those leaves has a default behind
     * it (template fidelity 4.1). The half that matters is unchanged: not
     * one of the three hostile strings reaches the document.
     */
    public function test_a_gallery_of_only_hostile_leaves_renders_the_designs_own_mosaic(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne'], 'gallery_1' => [
            'heading' => 'Inside the house',
            'image_1' => 'javascript:alert(1)',
            'image_2' => ['nope'],
            'image_3' => '//evil.example/x.jpg',
        ]]);
        $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="gallery"', $body);
        $this->assertStringContainsString('data-count="4"', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    /**
     * A design with no photographs of its own is where "an empty gallery is
     * not a section" still lives — and it has to, because it is the ruling
     * that keeps a headed band off a page with nothing under it.
     */
    public function test_a_gallery_with_no_usable_picture_renders_no_band_where_the_design_has_no_defaults(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne'], 'gallery_1' => [
            'heading' => 'Inside the house',
            'image_1' => 'javascript:alert(1)',
            'image_2' => ['nope'],
        ]]);
        $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 9]);
        $page->update(['template_key' => 'ruled_page']);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('Inside the house', $body);
    }

    public function test_a_gallery_renders_its_photographs_in_leaf_order(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne'], 'gallery_1' => [
            'kicker'    => 'Inside Nocturne',
            'heading'   => 'A house made for the evening.',
            'image_1'   => '/storage/one.webp',
            'image_3'   => '/storage/three.webp',
            'image_4'   => '/storage/four.webp',
            'caption_1' => 'Dry heat room',
        ]]);
        $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertStringContainsString('data-block="gallery"', $body);
        // Leaf order, and gaps in the TENANT's uploads closed by this
        // design's own photograph for that exact slot rather than by
        // shuffling the pictures up: `image_2` is the author's, and the
        // tenant's three sit where they were put.
        $this->assertStringContainsString('data-count="4"', $body);
        $this->assertStringContainsString('landing/nocturne_ritual/assets/ritual-detail.webp', $body);
        $this->assertLessThan(
            strpos($body, '/storage/three.webp'),
            strpos($body, '/storage/one.webp')
        );
        $this->assertLessThan(
            strpos($body, '/storage/four.webp'),
            strpos($body, '/storage/three.webp')
        );

        // The tenant's own caption pill, which the conversion had to drop
        // for want of a field until template fidelity 4.3.
        $this->assertStringContainsString('<figcaption>Dry heat room</figcaption>', $body);
    }

    /**
     * A caption is the tenant's, never the author's. The kit writes one per
     * photograph ("Dry heat room", "Amber Hour" — its own fictional rooms
     * and treatments) and none of them ships as a default, because a caption
     * is a claim about the business where an alt is a description of the
     * picture.
     */
    public function test_the_designs_photographs_ship_with_a_description_and_no_caption(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne'], 'gallery_1' => [
            'heading' => 'A house made for the evening.',
        ]]);
        $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertStringContainsString('data-block="gallery"', $body);
        $this->assertStringContainsString('alt="Warm timber sauna with towels and soft architectural lighting"', $body);
        $this->assertStringNotContainsString('<figcaption>', $body);
        $this->assertStringNotContainsString('Amber Hour', $body);
        $this->assertStringNotContainsString('Dry heat room', $body);
    }

    /**
     * TEMPLATE FIDELITY 4.1 / R1, R2, R3 — THE THREE NEW SLOTS, AND THEIR
     * HOSTILE BATTERY.
     *
     * `team`, `booking` and `services` became addressable photographs in the
     * same round the default model landed, and every battery that protects
     * `hero` has to protect them or they are three new ways for a stored
     * value to reach a `src`. Same provider, same guards, same reader — which
     * is the whole reason there is one reader.
     *
     * `services` is included although neither shipped design draws its plate
     * (kit 02's is the first): the slot is real, the endpoints accept it, and
     * a guard that is only tested where a picture happens to be visible is a
     * guard nobody notices losing.
     *
     * Mutation target: drop the `safeUrl()` call from `PageContent::
     * imageUrl()` — or read `$copy['image_url']` in `team.blade.php` instead
     * of going through it — and this goes red.
     *
     * @param mixed $value
     */
    #[DataProvider('hostileImages')]
    public function test_a_hostile_value_in_a_new_slot_never_reaches_the_page(mixed $value, ?string $needle): void
    {
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Amara Cole', 'is_active' => true,
        ]);

        $this->published([
            'hero'     => ['headline' => 'Nocturne'],
            'team'     => ['image_url' => $value],
            'booking'  => ['image_url' => $value],
            'services' => ['image_url' => $value],
        ], industry: 'hotel');

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }

        // Each failed leaf restored the design's own photograph rather than
        // leaving a hole — the same outcome "Remove" produces.
        $this->assertStringContainsString('landing/nocturne_ritual/assets/team-nocturne.webp', $body);
        $this->assertStringContainsString('booking-panel__media', $body);
    }

    /**
     * R1 — the team band's photograph is the BAND's, not one practitioner's
     * headshot, and the avatar substitution survives only as the fallback for
     * a design that ships none.
     */
    public function test_the_team_band_leads_with_its_own_photograph(): void
    {
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Amara Cole',
            'avatar' => '/storage/avatars/amara.webp', 'is_active' => true,
        ]);

        $page = $this->published(['hero' => ['headline' => 'Nocturne']]);
        $body = $this->body();

        // The design's group shot, in a frame the author drew for three.
        $this->assertStringContainsString('landing/nocturne_ritual/assets/team-nocturne.webp', $body);
        $this->assertStringNotContainsString('/storage/avatars/amara.webp', $body);
        $this->assertStringContainsString('alt="Three practitioners together in the treatment space"', $body);

        // On a design with no photograph of its own, the first
        // practitioner's avatar is still what the band leads with.
        $page->update(['template_key' => 'ruled_page']);
        $this->assertStringContainsString('/storage/avatars/amara.webp', $this->body());
    }

    /**
     * R2 — the closing panel has its own slot, and the author's reuse of the
     * hero plate is that slot's DEFAULT rather than an alias. Replacing it
     * must not touch the hero.
     */
    public function test_the_closing_panel_can_take_a_photograph_of_its_own(): void
    {
        $this->published([
            'hero'    => ['headline' => 'Nocturne', 'image_url' => '/storage/my-hero.webp'],
            'booking' => ['image_url' => '/storage/my-closing-plate.webp'],
        ], industry: 'hotel');

        $body = $this->body();

        $this->assertStringContainsString('/storage/my-closing-plate.webp', $body);
        $this->assertStringContainsString('/storage/my-hero.webp', $body);
    }

    /**
     * The migration behind R2, stated as a test because it is what keeps
     * every already-live page unchanged: a page with a hero upload and
     * nothing for `booking` renders the hero plate in the closing panel,
     * exactly as it did before the slot existed.
     */
    public function test_a_page_with_no_closing_plate_still_reuses_its_hero(): void
    {
        $this->published([
            'hero' => ['headline' => 'Nocturne', 'image_url' => '/storage/my-hero.webp'],
        ], industry: 'hotel');

        $body = $this->body();

        // Counted over the BODY only: the same URL also appears twice in
        // <head> as this page's share image (4.7), which is a different
        // claim and would make this assertion about the wrong thing.
        $rendered = substr($body, strpos($body, '<body>'));

        $this->assertSame(2, substr_count($rendered, '/storage/my-hero.webp'),
            'The closing panel no longer reuses the hero plate for a page that has not chosen its own.');
    }

    /**
     * Template fidelity 4.7 — the page publishes a picture when it is
     * shared, and the same one in its structured data.
     *
     * Every one of these designs is photography-led and, until this, a
     * pasted link produced a dark rectangle with a title on it.
     */
    public function test_the_page_publishes_a_share_image_and_names_it_in_its_structured_data(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Nocturne', 'image_url' => '/storage/my-hero.webp']]);
        $body = $this->body();

        // ABSOLUTE, always: a crawler does not resolve a storage-relative
        // path against this page's origin.
        $this->assertMatchesRegularExpression(
            '#<meta property="og:image" content="https?://[^"]+/storage/my-hero\.webp">#',
            $body,
        );
        $this->assertStringContainsString('<meta name="twitter:card" content="summary_large_image">', $body);
        $this->assertMatchesRegularExpression('#"image":"https?:\\\\?/\\\\?/[^"]+my-hero#', $body);
    }

    /**
     * A tenant who has uploaded nothing still shares as a photograph — the
     * design's own — which is the day-one case and the reason 4.1 and 4.7
     * land together.
     */
    public function test_a_page_with_no_upload_shares_as_the_designs_own_photograph(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);

        $this->published();

        $this->assertMatchesRegularExpression(
            '#<meta property="og:image" content="https?://[^"]+/landing/nocturne_ritual/assets/hero-nocturne\.webp">#',
            $this->body(),
        );
    }

    /**
     * No picture anywhere means no tag, rather than one pointing at nothing.
     *
     * Asserted through The Ruled Page because it is the only design that can
     * reach that state — it ships no photographs of its own. Its layout also
     * carries its OWN <head> and its own inline JSON-LD copy (the four byte
     * goldens pin them), so it publishes no share image at all yet: that is
     * the same known duplication `landing/shared/local-business-json-ld.blade.php`
     * already records, and closing it is a deliberate golden re-capture this
     * task was told not to make.
     */
    public function test_a_design_with_no_photographs_publishes_no_share_image(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne']]);
        $page->update(['template_key' => 'ruled_page']);

        $this->assertStringNotContainsString('og:image', $this->body());
    }

    /**
     * Template fidelity 4.6 — a tenant with a real logo finally has
     * somewhere to put it, and it is somewhere they have already put it.
     *
     * No new upload slot: `Brand.logo_url` exists, is tenant-uploadable, and
     * was read by no landing file at all. The monogram stays as the fallback.
     */
    public function test_the_brands_own_logo_replaces_the_monogram(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);
        $this->makeBrand('/storage/brands/mark.svg');

        $this->published();
        $body = $this->body();

        // Header and footer both, from one resolved value.
        $this->assertSame(2, substr_count($body, '/storage/brands/mark.svg'));
        $this->assertStringNotContainsString('<span class="brand__mark" aria-hidden="true">N</span>', $body);
    }

    /** A hostile logo_url is refused by the same allowlist every photograph clears. */
    public function test_a_hostile_brand_logo_never_reaches_the_page(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);
        $this->makeBrand('javascript:alert(1)');

        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('javascript:', $body);
        // And the monogram is back, rather than a frame with nothing in it.
        $this->assertStringContainsString('<span class="brand__mark" aria-hidden="true">N</span>', $body);
    }

    /**
     * Template fidelity 4.4 — the shipped defect. The catalogue admits eight
     * photographs and the mosaic was authored for four, with nothing sizing
     * the implicit rows five to eight land in; because `.gallery__item img`
     * is `height: 100%`, those tiles collapsed to zero height on desktop.
     *
     * Asserted against the STYLESHEET rather than the markup, because that
     * is where the defect is and there is nothing in the HTML to look at.
     * Mutation target: delete `grid-auto-rows` from the appended block and
     * this goes red.
     */
    public function test_the_mosaic_sizes_the_rows_a_fifth_photograph_lands_in(): void
    {
        $css = file_get_contents(public_path('landing/nocturne_ritual.css'));

        $this->assertMatchesRegularExpression(
            '/\.gallery__grid\s*\{[^}]*grid-auto-rows:\s*\d/s',
            $css,
            'Photographs five to eight land in implicit rows with no height.',
        );
    }

    // ─── Assets, fonts and cache busting ──────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/nocturne_ritual\.css\?v=[0-9a-f]{10}#', $body);
        $this->assertMatchesRegularExpression('#landing/nocturne_ritual\.js\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/nocturne_ritual.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range, and both families this
     * kit names cover Cyrillic and latin-ext — the F3 discipline, applied to
     * a template whose body face is new.
     */
    public function test_every_font_face_declares_a_unicode_range_and_covers_cyrillic(): void
    {
        $css = file_get_contents(public_path('landing/nocturne_ritual.css'));

        preg_match_all('/@font-face\{(.+?)\}/s', $css, $matches);

        $this->assertNotEmpty($matches[1]);

        foreach ($matches[1] as $face) {
            $this->assertStringContainsString('unicode-range:', $face,
                'A @font-face declares no unicode-range.');
        }

        foreach (['Manrope', 'Cormorant Garamond'] as $family) {
            $this->assertMatchesRegularExpression(
                '/@font-face\{font-family:\'?' . preg_quote($family, '/') . '\'?[^}]+U\+0400-045F/s',
                $css,
                "The {$family} family declares no Cyrillic subset."
            );
        }
    }

    /** The kit's own assets shipped alongside the template. */
    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/nocturne_ritual/assets/*.webp'));
        $source  = glob(resource_path('landing-kits/beauty-tech/01-nocturne-ritual/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/nocturne_ritual/assets/' . basename($file)));
        }
    }

    /**
     * The stylesheet is the author's file. Anything but the three documented
     * changes is a change to their design, so the :root palette is pinned by
     * value against the kit's own source.
     */
    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path('landing-kits/beauty-tech/01-nocturne-ritual/style.css'));
        $css = file_get_contents(public_path('landing/nocturne_ritual.css'));

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
}
