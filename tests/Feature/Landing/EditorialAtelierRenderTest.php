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
 * Editorial Atelier — the second BeautyTech kit, rendered as a real template.
 *
 * The acceptance criterion for this template is not a number in this file:
 * it is that the page a tenant gets is the page the author drew, and that is
 * settled by the screenshot pair in the phase 7/8 report. What THIS file is
 * for is everything a screenshot cannot see — that a hostile stored value
 * cannot take the page down or reach the DOM unescaped, that a band with
 * nothing in it does not render at all, that not one control on the page
 * points somewhere it cannot go, and that the author's own stylesheet and
 * photographs are still the ones we ship.
 *
 * Every hostile-value battery that protects The Ruled Page and Nocturne
 * Ritual is repeated here, because they are independent sets of Blade files
 * and a guard that only two of them make is a guard the third does not have.
 */
class EditorialAtelierRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/beauty-tech/02-editorial-atelier';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    /**
     * A published Editorial Atelier page with the seven bands a beauty page
     * is created with. Deliberately mirrors NocturneRitualRenderTest so the
     * three templates are exercised against the same shape of tenant.
     */
    private function published(array $content = [], array $theme = [], string $industry = 'beauty'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'elan-atelier',
            'template_key' => 'editorial_atelier', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Hair, made personal.']],
            'theme'   => $theme,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        // The lookbook is one of the author's eleven bands but no industry
        // seeds a gallery row, so a page that is meant to look like his has
        // to carry one — exactly as a tenant adds it from the picker.
        if (isset($content['gallery_1'])) {
            $page->sections()->create(['key' => 'gallery_1', 'enabled' => true, 'sort' => 8]);
        }

        return $page;
    }

    private function makeBrand(?string $logoUrl): void
    {
        Brand::withoutGlobalScopes()->create([
            'id' => 1, 'organization_id' => 1, 'name' => 'Elan', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/elan-atelier')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/elan-atelier')->getStatusCode();
    }

    /**
     * The kit's own sample content, as close as a real tenant can get to it.
     *
     * `$industry` because the closing booking panel is gated to hotel until
     * phase 6 (`PageContent::count('booking')`), and this author writes four
     * of his strings in that band — so the tests that check them have to seed
     * a tenant whose band actually renders.
     */
    private function seedLikeTheKit(string $industry = 'beauty'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Élan Atelier',
            'phone' => '+44 20 7946 0284', 'email' => 'hello@elanatelier.example',
            'address' => '48 Harper Street', 'city' => 'Soho', 'country' => 'United Kingdom',
            'currency' => 'GBP', 'timezone' => 'Europe/London', 'is_active' => true,
        ]);

        foreach ([
            ['Signature Cut & Finish', 'Consultation, tailored cut and a finish you can recreate at home.', 75, 88],
            ['Dimensional Colour', 'Bespoke placement for natural depth, softness and movement.', 150, 165],
            ['Gloss & Tone', 'A tone refresh and polished finish between colour appointments.', 60, 72],
            ['Curly Shape Session', 'Texture-led shaping, curl care guidance and a natural finish.', 90, 110],
            ['Event Styling', 'Modern polish, soft structure or a considered evening look.', 75, 95],
            ['Scalp & Hair Ritual', 'A restorative wash, targeted conditioning and signature blow-dry.', 45, 58],
        ] as $i => [$name, $short, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short,
                'duration_minutes' => $minutes, 'price' => $price, 'currency' => 'GBP',
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Mara Voss', 'Creative Director', 'Lived-in colour, long layers and decisive changes.'],
            ['Imani Cole', 'Curl Specialist', 'Texture-led cutting, sculpted shape and natural styling.'],
            ['Kenji Sato', 'Senior Stylist', 'Precision silhouettes, modern bobs and editorial finish.'],
        ] as $i => [$name, $title, $bio]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title, 'bio' => $bio,
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Clara R.', 5, 'Mara listened properly, explained what would work and gave me the best version of the cut I already loved.'],
            ['Nina P.', 5, 'Unhurried, precise and genuinely warm from the first minute.'],
            ['Tom H.', 5, 'The colour still looks deliberate six weeks later.'],
            ['Ada L.', 4, 'Careful work and honest advice about what would suit me.'],
        ] as $i => [$who, $stars, $text]) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => $who, 'overall_rating' => $stars,
                'comment' => $text, 'is_featured' => true, 'submitted_at' => now()->subDays($i + 1),
            ]);
        }

        return $this->published([
            'announcement' => [
                'text'      => 'New guest appointments are now open for September.',
                'cta_label' => 'Reserve your visit',
            ],
            'hero' => [
                'kicker'     => 'Independent hair atelier · London',
                'headline'   => 'Hair, made',
                'headline_accent' => 'personal.',
                'subtext'    => 'Considered cuts, dimensional colour and quietly confident styling—shaped around how you live.',
                'cta_label'  => 'Book a chair',
                'note_label' => 'Élan Edit 01',
                'caption'    => 'Shape / movement / shine',
                'edition'    => 'E / 01',
            ],
            'trust' => [
                'heading'           => 'Why guests choose Élan Atelier',
                'quote'             => '“The kind of cut that still works six weeks later.”',
                'feature_1'         => '15 years',
                'feature_1_caption' => 'Combined studio experience',
                'feature_2'         => 'Soho, London',
                'feature_2_caption' => 'Five minutes from Oxford Circus',
            ],
            'services' => [
                'kicker'       => 'The service edit',
                'heading'      => 'Start with what your hair needs.',
                'subtext'      => 'Every visit begins with a proper conversation. Prices shown are starting points.',
                'price_prefix' => 'from',
                'caption'      => 'Precision, without the formality.',
            ],
            'about' => [
                'kicker'      => 'The atelier',
                'lead'        => 'A quiet room for',
                'lead_accent' => 'bold decisions.',
                'body'        => 'Élan is an independent studio built around unhurried appointments and honest advice.',
                'caption'     => '48 Harper Street / London W1',
            ],
            'gallery_1' => [
                'kicker'    => 'The Élan edit / 2026',
                'heading'   => 'Cut, colour, character.',
                'subtext'   => 'A working lookbook of the people, details and spaces that shape the studio.',
                'caption_1' => 'Soft structure',
                'caption_2' => 'Precision bob',
                'caption_3' => 'Tools of the trade',
                'caption_4' => 'Room to breathe',
            ],
            'team' => [
                'kicker'  => 'Meet the artists',
                'heading' => 'Different hands. One standard.',
                'caption' => 'Independent artists. Shared point of view.',
                'secondary_link_label' => 'Book with an artist',
            ],
            'reviews' => ['kicker' => 'Guest notes', 'subtext' => 'Recent studio feedback'],
            'faq' => [
                'kicker'  => 'Before your visit',
                'heading' => 'A few useful answers.',
                'subtext' => 'Choose the closest service when booking.',
                'q1' => 'Which service should I choose?',
                'a1' => 'Choose the closest match and add a note when booking.',
                'q2' => 'Do I need a colour consultation?',
                'a2' => 'Yes for corrections, transformations or a first colour visit.',
            ],
            'booking' => [
                'kicker'     => 'Your chair is ready',
                'heading'    => 'Let’s make your next cut the one.',
                'terms'      => 'Choose a service and stylist online, or contact the studio if you would like a little guidance first.',
                'cta_label'  => 'Book now',
                'call_label' => 'Call:',
                'index'      => '06',
            ],
            'contact' => [
                'descriptor' => "Atelier\nLondon",
                'legal_note' => 'Fictional demonstration content.',
            ],
        ], [], $industry);
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/editorial_atelier/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /** glob() above does not recurse, and sections/ is where the customer content lands. */
    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/editorial_atelier/sections/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no section partials.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /** The shared partials this template includes are held to the same rule. */
    public function test_the_shared_partials_contain_no_raw_echo(): void
    {
        foreach (glob(resource_path('views/landing/shared/*.blade.php')) as $file) {
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
            $isExternal = str_contains($tag, 'src=');
            $isLdJson   = str_contains($tag, 'application/ld+json');

            $this->assertTrue($isExternal || $isLdJson,
                "An inline <script> reached the page: {$tag}");
        }

        $this->assertDoesNotMatchRegularExpression('/\son[a-z]+\s*=/i', $body);
        $this->assertStringNotContainsString('javascript:', $body);
    }

    public function test_every_inline_style_block_carries_the_request_nonce(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['brand_color' => '#8E2A5B']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent, and the palette that must not appear ─────────────────

    /**
     * FOUR slots here rather than nocturne's three, because this kit spends
     * its accent differently: the depth shade is a whole BAND (the footer's
     * background), not just a button's hover.
     */
    public function test_a_tenant_colour_lands_on_the_four_accent_slots(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['brand_color' => '#8E2A5B']);
        $body = $this->body();

        $this->assertStringContainsString('--color-oxblood:', $body);
        $this->assertStringContainsString('--color-oxblood-dark:', $body);
        $this->assertStringContainsString('--color-oxblood-on:', $body);
        $this->assertStringContainsString('--color-copper:', $body);
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('--bg-elev', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    public function test_no_font_pairing_attribute_is_emitted(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['font_pairing' => 'grand']);

        $this->assertStringNotContainsString('data-font-pairing', $this->body());
    }

    /**
     * The accent is re-resolved against THIS kit's own cream page, not the
     * porcelain Accent defaults to and not nocturne's near-black. A pale
     * tenant hex is darkened until it reads as a block on cream; the same hex
     * on the dark kit is left alone. Same input, two designs, two answers —
     * which is the whole reason each layout re-resolves it.
     */
    public function test_the_accent_is_resolved_against_this_kits_own_surface(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['brand_color' => '#FFF176']);
        $body = $this->body();

        preg_match('/--color-oxblood: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent fill was emitted at all.');
        $this->assertNotSame('#fff176', strtolower($m[1]),
            'A near-white accent was painted unchanged onto a cream page.');
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'gallery', 'team', 'testimonials', 'faq', 'booking', 'footer',
            'feedback', 'contact', 'assistant',
        ] as $block) {
            // `feedback` and `assistant` are gated on a review form and a
            // chat widget, neither of which this seed has, so they are
            // checked in their own tests below.
            if (in_array($block, ['feedback', 'assistant'], true)) {
                continue;
            }

            $this->assertStringContainsString('data-block="' . $block . '"', $body,
                "The kit's `{$block}` band is missing from the rendered page.");
        }
    }

    /**
     * The author's own data-variant strings, which are how his integration
     * contract identifies a band. They are not decoration and they are not
     * ours to rename.
     */
    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement' => 'compact',
            'header'       => 'editorial-sticky',
            'hero'         => 'editorial-overlap',
            'trust'        => 'editorial-strip',
            'services'     => 'numbered-menu',
            'story'        => 'image-led-manifesto',
            'gallery'      => 'asymmetric-lookbook',
            'team'         => 'collective-profile',
            'testimonials' => 'feature-quote',
            'faq'          => 'split-accordion',
            'booking'      => 'editorial-cta',
            'footer'       => 'service-hub',
        ] as $block => $variant) {
            $this->assertStringContainsString(
                'data-block="' . $block . '" data-variant="' . $variant . '"',
                $body,
                "The author's `{$block}` variant is not the one rendered.",
            );
        }
    }

    /**
     * A page with nothing but a headline renders the DESIGN'S photographs and
     * no empty bands — template fidelity 4.1's promise from the other end.
     */
    public function test_a_bare_page_renders_the_designs_photographs_and_no_empty_bands(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/editorial_atelier/assets/hero-elan.webp', $body);
        $this->assertStringNotContainsString('hero__grid--solo', $body);

        // Nothing else has anything to say, so nothing else is on the page.
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
        $this->assertStringNotContainsString('Different hands.', $body);
    }

    /**
     * Template fidelity 3.2: the repeatable words band the author did not
     * draw, shipped because the owner asked for all sections.
     */
    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Élan'],
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
        $this->assertStringContainsString('What we believe', $body);
        $this->assertStringContainsString('And a second.', $body);
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

    public function test_the_faq_renders_only_complete_pairs(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'faq' => [
            'heading' => 'A few useful answers.',
            'q1' => 'Which service?', 'a1' => 'The closest one.',
            'q2' => 'Orphan question',
            'a3' => 'Orphan answer',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('Which service?', $body);
        $this->assertStringNotContainsString('Orphan question', $body);
        $this->assertStringNotContainsString('Orphan answer', $body);
        $this->assertSame(1, substr_count($body, '<details>'));
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'faq' => [
            'heading' => 'A few useful answers.',
            'q1' => 'Lonely question',
        ]]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    public function test_faq_pairs_past_the_cap_never_render(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'faq' => array_merge(
            ['heading' => 'Answers'],
            ['q7' => 'Past the cap', 'a7' => 'Never rendered'],
            ['q1' => 'Within', 'a1' => 'Yes'],
        )]);

        $body = $this->body();

        $this->assertStringContainsString('Within', $body);
        $this->assertStringNotContainsString('Past the cap', $body);
    }

    // ─── The trust strip ──────────────────────────────────────────────────

    /**
     * The author's first cell is the aggregate rating, and it is the one
     * thing on this band a tenant cannot type. Below four ratings org-wide
     * PageContent::reviewStats is null BY DESIGN and the cell is absent
     * rather than fabricated.
     */
    public function test_the_trust_strip_renders_on_the_rating_alone(): void
    {
        foreach (range(1, 4) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => false, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Élan']]);
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust"', $body);
        $this->assertStringContainsString('5.0 / 5', $body);
        $this->assertStringContainsString('data-count="1"', $body);
    }

    public function test_a_studio_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Guest ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Élan'], 'reviews' => ['kicker' => 'Guest notes']]);
        $body = $this->body();

        $this->assertStringNotContainsString('5.0 / 5', $body);
        $this->assertStringNotContainsString('testimonial__rating', $body);
    }

    /**
     * The strip's heading is real, named and invisible — the author's own
     * treatment for a band of figures with no visible title. A section
     * pointing `aria-labelledby` at an empty element is worse than one with
     * none, so the heading falls back rather than being dropped.
     */
    public function test_the_trust_strip_is_named_in_the_document_outline(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'trust' => [
            'heading'   => 'Why guests choose Élan Atelier',
            'feature_1' => '15 years',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('aria-labelledby="trust-title"', $body);
        $this->assertStringContainsString('<h2 class="visually-hidden" id="trust-title">Why guests choose Élan Atelier</h2>', $body);
    }

    public function test_a_trust_strip_with_no_heading_still_names_itself(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'trust' => ['feature_1' => '15 years']]);

        $this->assertMatchesRegularExpression('/<h2 class="visually-hidden" id="trust-title">\S/', $this->body());
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
        // The Book controls still exist and still point somewhere real.
        $this->assertStringContainsString('href="tel:+442079460284"', $body);
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
        $this->assertStringNotContainsString('Call to book', $body);
    }

    public function test_a_hotel_page_wires_every_booking_hook_to_the_real_flow(): void
    {
        // The widget binds by widget_token, so a page whose org has none can
        // honestly offer no booking URL at all.
        $this->seedWidgetOrganization();

        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        // Every open-booking hook points at the widget the middleware built,
        // on the admin origin — never at a bare in-page anchor.
        preg_match_all('/<a[^>]*data-action="open-booking"[^>]*>/i', $body, $matches);
        $this->assertNotEmpty($matches[0]);

        foreach ($matches[0] as $tag) {
            $this->assertStringContainsString('/booking-widget', $tag);
            $this->assertStringContainsString('rel="noopener"', $tag);
        }

        $this->assertStringContainsString('data-block="booking"', $body);
        $this->assertStringContainsString('data-action="open-booking"', $body);
        $this->assertStringContainsString('/booking-widget?', $body);
        $this->assertStringContainsString('data-service-id=', $body);
        $this->assertStringNotContainsString('href="#site-footer"', $body);
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
        $this->assertStringContainsString('data-action="open-feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
    }

    public function test_an_inactive_review_form_is_not_linked(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest notes', 'embed_key' => 'abc123',
            'is_active' => false, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();

        $this->assertStringNotContainsString('data-action="open-feedback"', $this->body());
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
        $this->assertStringNotContainsString('ai-launcher', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => 'ok']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_string_shaped_block_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'gallery_1' => 'not an array']);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_200k_character_leaf_does_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => 'Élan', 'subtext' => str_repeat('a', 200000)]]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_a_hostile_faq_leaf_is_escaped_not_executed(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'faq' => [
            'q1' => '<script>alert(1)</script>',
            'a1' => '<img src=x onerror=alert(1)>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $body);
        $this->assertStringContainsString('&lt;img src=x onerror=alert(1)&gt;', $body);
    }

    /**
     * The leaves only this design draws, held to the same rule as every
     * other: the hero's note label and edition mark, the services price
     * prefix, the trust heading, the team's one link and the closing panel's
     * numeral all reach the page through the escaping braces.
     */
    public function test_the_leaves_only_this_design_draws_are_escaped(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, [
            'hero'     => ['note_label' => '<b>note</b>', 'edition' => '<b>edition</b>'],
            'services' => ['price_prefix' => '<b>from</b>'],
            'trust'    => ['heading' => '<b>trust</b>'],
            'team'     => ['secondary_link_label' => '<b>book</b>'],
            'booking'  => ['index' => '<b>06</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>note</b>', $body);
        $this->assertStringContainsString('&lt;b&gt;note&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;edition&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;from&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;trust&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;book&lt;/b&gt;', $body);
        $this->assertStringContainsString('&lt;b&gt;06&lt;/b&gt;', $body);
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
        $this->published(['hero' => ['headline' => 'Élan', 'image_url' => $value]]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/editorial_atelier/assets/hero-elan.webp', $body);
        $this->assertStringNotContainsString('hero__grid--solo', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    #[DataProvider('hostileImages')]
    public function test_a_hostile_services_plate_never_reaches_the_page(mixed $value, ?string $needle): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace($page->content, [
            'services' => array_replace($page->content['services'], ['image_url' => $value]),
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/editorial_atelier/assets/service-precision-cut.webp', $body);

        if ($needle !== null) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    public function test_a_gallery_of_only_hostile_leaves_renders_the_designs_own_lookbook(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'gallery_1' => [
            'heading' => 'Cut, colour, character.',
            'image_1' => 'javascript:alert(1)',
            'image_2' => ['nope'],
            'image_3' => '//evil.example/x.jpg',
        ]]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="gallery"', $body);
        $this->assertStringContainsString('data-count="4"', $body);

        foreach (['javascript:', 'evil.example', 'nope'] as $needle) {
            $this->assertStringNotContainsString($needle, $body);
        }
    }

    /**
     * The four hand-placed cards cycle by POSITION, so a fifth photograph
     * lands in the first card's columns on the next row and the author's
     * cascade continues rather than breaking.
     */
    public function test_the_lookbook_cycles_the_authors_four_placements(): void
    {
        $this->published(['hero' => ['headline' => 'Élan'], 'gallery_1' => [
            'heading' => 'Cut, colour, character.',
            'image_1' => '/storage/one.webp',
            'image_2' => '/storage/two.webp',
            'image_3' => '/storage/three.webp',
            'image_4' => '/storage/four.webp',
            'image_5' => '/storage/five.webp',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="5"', $body);
        $this->assertSame(2, substr_count($body, 'gallery-card--portrait'));
        $this->assertSame(1, substr_count($body, 'gallery-card--space'));
    }

    // ─── Photographs, share image and the logo ────────────────────────────

    public function test_the_page_publishes_a_share_image_and_names_it_in_its_structured_data(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('property="og:image"', $body);
        $this->assertStringContainsString('name="twitter:image"', $body);
        $this->assertMatchesRegularExpression('#og:image" content="https?://#', $body);
    }

    /**
     * Template fidelity 4.6, and this kit is the exception the plan names: it
     * has NO MONOGRAM, so a tenant's logo replaces the WORDMARK rather than
     * sitting beside it.
     */
    public function test_the_brands_own_logo_replaces_the_wordmark(): void
    {
        $this->makeBrand('/storage/brand/elan.svg');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringContainsString('class="brand__logo" src="/storage/brand/elan.svg"', $body);
        $this->assertStringNotContainsString('<span class="brand__name">', $body);
    }

    public function test_a_hostile_brand_logo_never_reaches_the_page(): void
    {
        $this->makeBrand('javascript:alert(1)');
        $this->seedLikeTheKit();

        $body = $this->body();

        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringContainsString('<span class="brand__name">', $body);
    }

    // ─── Assets, fonts and cache busting ──────────────────────────────────

    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/editorial_atelier\.css\?v=[0-9a-f]{10}#', $body);
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
        $css = file_get_contents(public_path('landing/editorial_atelier.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertNotEmpty($matches[1], 'The stylesheet declares no faces at all.');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url,
                "A font source is not a relative same-origin path: {$url}");
            $this->assertFileExists(public_path('landing/' . $url));
        }
    }

    /**
     * Every declared face carries a unicode-range, and the BODY face covers
     * Cyrillic and latin-ext.
     *
     * The display face deliberately does not, and this pins that as a fact
     * rather than an omission: Google publishes Bodoni Moda as latin,
     * latin-ext, math and symbols and no Cyrillic subset exists to declare.
     * A Russian tenant's display headings therefore fall through to the
     * author's own declared stack, which is exactly what happens on the
     * author's page — while every word of running copy is Manrope and is
     * covered.
     */
    public function test_every_font_face_declares_a_unicode_range_and_the_body_face_covers_cyrillic(): void
    {
        $css = file_get_contents(public_path('landing/editorial_atelier.css'));

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

        $this->assertDoesNotMatchRegularExpression(
            "/@font-face\{font-family:'Bodoni Moda'[^}]+U\+0400-045F/s",
            $css,
            'A Cyrillic Bodoni Moda face was declared; Google publishes none.',
        );

        // D3: roman only, exactly as the author's own <link> asks for. His
        // page lets the browser synthesise the italic and so does ours.
        $this->assertDoesNotMatchRegularExpression(
            "/@font-face\{font-family:'Bodoni Moda';font-style:italic/",
            $css,
            'An italic Bodoni axis shipped; the author asks for roman only (D3).',
        );
    }

    /** The kit's own assets shipped alongside the template. */
    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/editorial_atelier/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/editorial_atelier/assets/' . basename($file)));
        }
    }

    /**
     * The stylesheet is the author's file. Anything but the three documented
     * changes is a change to their design, so the :root palette is pinned by
     * value against the kit's own source.
     */
    public function test_the_kits_root_palette_ships_verbatim(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/editorial_atelier.css'));

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
     * And the rest of the file, rule for rule. The palette test above proves
     * the tokens; this proves every one of the author's 2,130 lines is still
     * there, so a later "small fix" to his design fails here rather than in a
     * screenshot nobody takes again.
     *
     * The three documented edits are the only exceptions, and they are named
     * one by one rather than allowed by a rule.
     */
    public function test_the_authors_stylesheet_ships_rule_for_rule(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/editorial_atelier.css'));

        // The one edit inside the author's own rules (change 2): the two
        // accent fills read a label token instead of --color-white.
        $expected = str_replace(
            [
                "  --color-copper: #a56f56;\n",
                ".button--oxblood {\n  background: var(--color-oxblood);\n  color: var(--color-white);\n}",
                "  background: var(--color-oxblood);\n  box-shadow: var(--shadow-image);\n  color: var(--color-white);",
            ],
            [
                "  --color-copper: #a56f56;\n  --color-oxblood-on: #fffdf9;\n",
                ".button--oxblood {\n  background: var(--color-oxblood);\n  color: var(--color-oxblood-on);\n}",
                "  background: var(--color-oxblood);\n  box-shadow: var(--shadow-image);\n  color: var(--color-oxblood-on);",
            ],
            $kit,
        );

        // Everything between the @font-face block (change 1) and the tenant
        // states banner (change 3) is the author's file.
        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $shipped = substr($css, $start, $end - $start);

        // The comment the one in-rule edit carries is ours; strip it before
        // comparing, so the assertion is about the author's CSS and not
        // about our note explaining it.
        $shipped = preg_replace('/\n  \/\* The LABEL on an oxblood fill\..*?\*\/\n/s', "\n", $shipped);

        $this->assertSame(trim($expected), trim($shipped),
            "The shipped stylesheet is no longer the author's file plus the three documented changes.");
    }

    // ─── Template fidelity 7.x — the author's own strings ─────────────────

    /**
     * 5.1b / R7. The author breaks his brand descriptor across two lines
     * (`Atelier<br>London`) and sets his h1's emphasis on its own line;
     * App\Landing\Copy is the one permitted route to either, and the three
     * raw-echo scans above are still green in the same run.
     */
    public function test_the_authors_hand_placed_line_break_survives_in_the_lockup(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<span class="brand__descriptor">Atelier<br>London</span>', $body);
    }

    public function test_a_heading_accent_renders_as_the_authors_em(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Hair, made <em>personal.</em>', $body);
        $this->assertStringContainsString('A quiet room for <em>bold decisions.</em>', $body);
    }

    public function test_an_accent_a_tenant_never_wrote_puts_no_empty_em_on_the_page(): void
    {
        $this->published(['hero' => ['headline' => 'Hair, made personal.']]);

        $this->assertStringNotContainsString('<em></em>', $this->body());
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Hair, made',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    /**
     * 7.5 — the note on the hero plate, in the author's own two parts. Only
     * the LABEL is a new leaf: the sentence is the photograph's caption,
     * which every single-plate band has carried since 4.3 and which no
     * shipped design had ever drawn.
     */
    public function test_the_hero_plate_carries_the_authors_two_part_note(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString(
            '<p class="hero__image-note"><span>Élan Edit 01</span>Shape / movement / shine</p>',
            $body,
        );
    }

    public function test_a_hero_with_neither_half_of_the_note_draws_none(): void
    {
        $this->published(['hero' => ['headline' => 'Élan']]);

        $this->assertStringNotContainsString('hero__image-note', $this->body());
    }

    public function test_the_hero_carries_the_authors_edition_mark(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<p class="hero__edition" aria-hidden="true">E / 01</p>', $this->body());
    }

    /**
     * 5.2 — "from £88". A word rather than a flag, because it is not the same
     * word in five locales and a studio with fixed prices should not say it
     * at all.
     */
    public function test_the_price_prefix_is_the_tenants_word_and_is_absent_by_default(): void
    {
        $this->seedLikeTheKit();

        $this->assertStringContainsString('<strong>from £88</strong>', $this->body());
    }

    public function test_a_studio_with_no_price_prefix_prints_the_price_alone(): void
    {
        $page = $this->seedLikeTheKit();
        $content = $page->content;
        unset($content['services']['price_prefix']);
        $page->update(['content' => $content]);

        $body = $this->body();

        $this->assertStringContainsString('<strong>£88</strong>', $body);
        $this->assertStringNotContainsString('from £88', $body);
    }

    /**
     * R3 / 4.1 — the band-level editorial plate this design is the reason
     * for, with the author's own figcaption under it.
     */
    public function test_the_services_band_draws_its_own_plate_and_caption(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('class="services__media"', $body);
        $this->assertStringContainsString('landing/editorial_atelier/assets/service-precision-cut.webp', $body);
        $this->assertStringContainsString('<figcaption>Precision, without the formality.</figcaption>', $body);
    }

    /**
     * 5.3 — `ServiceMaster.bio`, already on the record and read by no landing
     * partial until this one. Kit 01 draws a name and a role; this author
     * draws three fields per person.
     */
    public function test_each_artist_carries_the_blurb_the_team_screen_already_holds(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('Lived-in colour, long layers and decisive changes.', $body);
        $this->assertStringContainsString('<p class="artist__role">Creative Director</p>', $body);
    }

    /**
     * This design draws ONE section-level link and NO per-person Book
     * control, which is why `team.secondary_link_label` exists and why
     * `team.item_cta_label` is not offered here.
     */
    public function test_the_artists_band_closes_on_one_link_and_no_per_person_control(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Book with an artist', $body);
        $this->assertSame(1, substr_count($body, 'class="text-link"'));
    }

    /** Exactly one testimonial, at headline size — not kit 01's row of three. */
    public function test_the_testimonial_band_renders_exactly_one_quote(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        // The <head>'s JSON-LD publishes every featured review by design, so
        // the claim is about the rendered BAND.
        $rendered = substr($body, strpos($body, '<body>'));

        $this->assertSame(1, substr_count($rendered, '<blockquote>'));
        $this->assertStringContainsString('Mara listened properly', $rendered);
        $this->assertStringNotContainsString('Unhurried, precise', $rendered);
    }

    /**
     * 5.2 / D6 — the phone action beside the button. `call_label` and
     * `call_short` have been in the catalogue since 1.3 surfaced them and
     * only the Ruled Page drew them.
     */
    public function test_the_closing_panel_puts_the_phone_beside_the_button(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('href="tel:+442079460284"', $body);
        $this->assertStringContainsString('Call: +44 20 7946 0284', $body);
        $this->assertStringContainsString('<p class="booking__index" aria-hidden="true">06</p>', $body);
    }

    /** The footer hub reaches four columns — the author's own grid rule. */
    public function test_the_footer_hub_counts_the_columns_it_really_has(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Guest notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => [
                'social_instagram' => 'https://instagram.com/elanatelier',
                'social_facebook'  => 'https://facebook.com/elanatelier',
            ],
        ])]);

        $body = $this->body();

        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('data-social-platform="instagram"', $body);
        $this->assertStringContainsString('Fictional demonstration content.', $body);
    }

    public function test_a_blank_social_leaf_renders_no_icon_and_no_column(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, [
            'contact' => ['social_instagram' => 'instagram.com/elanatelier'],
        ])]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-social-platform', $body);
        $this->assertStringNotContainsString('footer-hub__social', $body);
    }
}
