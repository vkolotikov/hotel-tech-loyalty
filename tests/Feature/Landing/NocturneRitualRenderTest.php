<?php
namespace Tests\Feature\Landing;

use App\Landing\SectionType;
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
     * band, not one stray heading, not one photo frame with no photo.
     */
    public function test_a_bare_page_renders_no_empty_bands(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Nocturne', 'is_active' => true,
        ]);

        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());

        // Every band whose content comes from a screen the tenant has not
        // filled in yet is simply not in the document.
        foreach (['services', 'story', 'team', 'testimonials', 'gallery', 'faq', 'trust', 'announcement'] as $block) {
            $this->assertStringNotContainsString('data-block="' . $block . '"', $body,
                "The '{$block}' block rendered with nothing in it.");
        }

        // What IS there: the header, the hero and the footer.
        $this->assertStringContainsString('data-block="hero"', $body);
        $this->assertStringContainsString('data-block="footer"', $body);

        // And no photo frames: no plate, no story media, no team portrait.
        $this->assertStringNotContainsString('hero__media', $body);
        $this->assertStringNotContainsString('story__media', $body);
        $this->assertStringNotContainsString('team__portrait', $body);

        // The imageless hero wears the kit's own designed fallback rather
        // than a hole where a photograph should be.
        $this->assertStringContainsString('hero--plain', $body);
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

    #[DataProvider('hostileImages')]
    public function test_a_hostile_hero_image_renders_no_img_and_stays_up(mixed $value, ?string $needle): void
    {
        $this->published(['hero' => ['headline' => 'Nocturne', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('hero__media', $body);
        $this->assertStringContainsString('hero--plain', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_story_image_renders_no_frame_and_stays_up(mixed $value, ?string $needle): void
    {
        $this->published([
            'hero'  => ['headline' => 'Nocturne'],
            'about' => ['body' => 'A quiet place.', 'image_url' => $value],
        ]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="story"', $body);
        $this->assertStringNotContainsString('story__media', $body);
        $this->assertStringContainsString('story__grid--solo', $body);
    }

    public function test_a_gallery_of_only_hostile_leaves_renders_no_band(): void
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
        $this->assertStringNotContainsString('data-block="gallery"', $body);
        $this->assertStringNotContainsString('Inside the house', $body);
    }

    public function test_a_gallery_renders_its_photographs_in_leaf_order(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Nocturne'], 'gallery_1' => [
            'kicker'  => 'Inside Nocturne',
            'heading' => 'A house made for the evening.',
            'image_1' => '/storage/one.webp',
            'image_3' => '/storage/three.webp',
            'image_4' => '/storage/four.webp',
        ]]);
        $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertStringContainsString('data-block="gallery"', $body);
        // Gaps close up: three pictures, in order, and the count reaches the
        // stylesheet so the mosaic composes for three rather than for four.
        $this->assertStringContainsString('data-count="3"', $body);
        $this->assertLessThan(
            strpos($body, '/storage/three.webp'),
            strpos($body, '/storage/one.webp')
        );
        $this->assertLessThan(
            strpos($body, '/storage/four.webp'),
            strpos($body, '/storage/three.webp')
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
