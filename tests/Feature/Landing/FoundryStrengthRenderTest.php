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
 * Foundry Strength — the second GymTech kit, rendered as a real template.
 *
 * The same battery AeraReformerRenderTest runs, because these are
 * independent sets of Blade files and a guard only one of them makes is a
 * guard the other does not have — plus the rulings this dark kit needed of
 * its own: the bronze family that carries black text, the highlight strip
 * that closes on the rating, the method steps split on the author's middle
 * dot, the member note with its own stars, and a brand mark that is the
 * tenant's initial rather than the author's glyph.
 */
class FoundryStrengthRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/gym-tech/02-foundry-strength';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'fitness'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'foundry',
            'template_key' => 'foundry_strength', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Train for the life beyond the gym.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Foundry', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/foundry')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/foundry')->getStatusCode();
    }

    /** Ten ratings averaging 4.9 — the figure the author prints twice. */
    private function seedRatings(): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Anna K.', 'overall_rating' => 5,
            'comment' => 'The first gym where I never feel lost. Every set has a purpose, and I am stronger without feeling broken.',
            'is_featured' => true, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Member ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Calm, precise and genuinely useful.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /** The kit's own sample content, as close as a real tenant can get to it. */
    private function seedLikeTheKit(string $industry = 'fitness'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Foundry',
            'phone' => '+371 20 000 822', 'email' => 'train@foundry.example',
            'address' => '8 Sporta iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Strength assessment', 'Movement screen, training history and a practical starting plan.', 75, 85, false],
            ['Private coaching', 'One coach, one programme and every session adjusted in real time.', 60, 70, true],
            ['Semi-private training', 'Your own programme, coached beside a small group of committed members.', 60, 32, true],
        ] as $i => [$name, $short, $minutes, $price, $from]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'price_is_from' => $from,
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Luca Berziņš',
            'title' => 'Strength and conditioning coach',
            'bio'   => 'Strength and conditioning coach specialising in sustainable performance for busy adults.',
            'sort_order' => 0, 'is_active' => true,
        ]);

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'text'      => 'Private training · limited memberships',
                'cta_label' => 'View assessment times',
            ],
            'hero' => [
                'kicker'          => 'Strength, made personal',
                'headline'        => "Train for the life\nbeyond",
                'headline_accent' => 'the gym.',
                'subtext'         => 'Private coaching, intelligent programming and a quiet club built around measurable progress.',
                'cta_label'       => 'Book your assessment',
                'note_label'      => 'Assessment opening',
                'proof'           => 'Tuesday · 18:00',
            ],
            'trust' => [
                'feature_1' => '1:1',   'feature_1_caption' => 'Dedicated coaching',
                'feature_2' => '6',     'feature_2_caption' => 'Semi-private limit',
                'feature_3' => '12 wk', 'feature_3_caption' => 'Progress cycles',
            ],
            'services' => [
                'kicker'  => 'Ways to train',
                'heading' => 'A plan with a point.',
                'subtext' => 'You will know what you are doing, why it matters and how today connects to the next twelve weeks.',
            ],
            'about' => [
                'kicker'  => 'Inside the method',
                'lead'    => "Less noise.\nMore signal.",
                'body'    => 'We combine careful coaching with simple performance data. No theatre, no random workouts—just work that earns its place.',
                'fact_1'  => 'Assess · Find the useful starting point',
                'fact_2'  => 'Build · Train the patterns that matter',
                'fact_3'  => 'Review · Measure, adjust and progress',
                'caption' => 'Every programme has a reason.',
            ],
            'team' => [
                'kicker' => 'Head coach',
            ],
            'reviews' => [
                'kicker' => 'Member note',
            ],
            'faq' => [
                'kicker'  => 'Before you begin',
                'heading' => 'Clear from day one.',
                'q1' => 'Do I need lifting experience?',
                'a1' => 'No. The assessment gives us a safe, useful starting point whether this is your first programme or your fiftieth.',
                'q2' => 'Is this an open gym?',
                'a2' => 'Foundry is appointment-led. Members train in coached private or semi-private sessions, so the floor stays calm.',
                'q3' => 'Can you work around an injury?',
                'a3' => 'Often, yes. Share your history before booking; where needed, we will coordinate with your clinician.',
            ],
            'booking' => [
                'kicker'     => 'Your starting point',
                'heading'    => "Book the assessment.\nWe build the rest.",
                'terms'      => 'Seventy-five focused minutes to understand your movement, goals and best route forward.',
                'call_label' => 'Prefer to call?',
            ],
            'contact' => [
                'descriptor'       => 'Strength club · Riga',
                'email_label'      => 'Email the club',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/foundry.example',
                'social_facebook'  => 'https://facebook.com/foundry.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Private coaching and purposeful strength training.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/foundry_strength/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/foundry_strength/sections/*.blade.php'));

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
        $this->published(['hero' => ['headline' => 'Foundry']], ['brand_color' => '#E8B86D']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag,
                "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (gym-21) ──────────────────────────────────────────────

    /**
     * On this dark page the bronze is a FILL that carries the author's
     * black button text and a whole band's black copy, so it takes the
     * shade Accent measures as readable on ink — which is exactly the shade
     * black reads on — and the soft bronze, accent text on the page, takes
     * the shade measured against this page's own black. The black, the
     * charcoal and the bone are surfaces and stay the author's.
     */
    public function test_a_tenant_colour_lands_on_the_bronze_family_and_never_on_the_surfaces(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        $this->assertStringContainsString('--bronze:', $body);
        $this->assertStringContainsString('--bronze-soft:', $body);
        $this->assertStringContainsString('--bronze-halo:', $body);

        $this->assertStringNotContainsString('--black:', $body);
        $this->assertStringNotContainsString('--charcoal:', $body);
        $this->assertStringNotContainsString('--bone:', $body);
    }

    /** A tenant colour this page keeps is one the author's black label can read on. */
    public function test_a_kept_tenant_colour_carries_the_black_label(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        preg_match('/--bronze: (#[0-9a-fA-F]{6});/', $body, $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#0d0d0c'),
            'The bronze fill would not carry the author\'s black label.');
    }

    /**
     * A dark tenant colour is lifted off this near-black page until it reads
     * as a block, and if the lifted shade lands where NEITHER label can read
     * on it (Accent's dead band) the hex is discarded rather than painted —
     * the author's own bronze stands and the page ships no inline CSS. A
     * navy is the case a tenant is likely to paste.
     */
    public function test_a_colour_no_label_can_read_on_falls_back_to_the_authors_bronze(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry']], ['brand_color' => '#1A2F6B']);

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'announcement', 'header', 'hero', 'trust', 'services', 'story',
            'team', 'testimonials', 'faq', 'booking', 'footer', 'feedback', 'contact', 'assistant',
        ] as $block) {
            if ($block === 'feedback') {
                continue; // needs a review form; covered below
            }

            $this->assertStringContainsString('data-block="' . $block . '"', $body,
                "The kit's `{$block}` band is missing from the rendered page.");
        }

        $this->assertStringNotContainsString('data-block="gallery"', $body);
    }

    /** The author names a variant on nine of his blocks and none on the other five; both facts are kept. */
    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'hero'         => 'private-strength',
            'services'     => 'training-ledger',
            'story'        => 'measured-progress',
            'team'         => 'lead-coach',
            'testimonials' => 'member-note',
            'faq'          => 'membership-questions',
            'booking'      => 'assessment-cta',
            'footer'       => 'club-hub',
            'assistant'    => 'widget-slot',
        ] as $block => $variant) {
            $this->assertStringContainsString(
                'data-block="' . $block . '" data-variant="' . $variant . '"',
                $body,
                "The author's `{$block}` variant is not the one rendered.",
            );
        }

        foreach (['announcement', 'header', 'trust', 'contact'] as $block) {
            $this->assertStringNotContainsString('data-block="' . $block . '" data-variant=', $body,
                "A variant was invented for `{$block}`, which the author left unnamed.");
        }
    }

    public function test_a_bare_page_renders_the_designs_photographs_and_no_empty_bands(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('landing/foundry_strength/assets/hero-strength.webp', $body);

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
        $this->assertStringNotContainsString('Luca Berziņš', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Foundry'],
            'text_1' => ['kicker' => 'A note', 'heading' => 'What we believe', 'body' => "One paragraph.\n\nAnd a second."],
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
     * The author breaks all three display headings; the hero's accent is
     * infix on his page ("beyond") and the catalogue's companion leaf is a
     * TRAILING fragment, so the seed carries "the gym." — one word of colour
     * difference, no geometry, recorded in the conversion report.
     */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Train for the life<br>beyond <em>the gym.</em>', $body);
        $this->assertStringContainsString('Less noise.<br>More signal.', $body);
        $this->assertStringContainsString('Book the assessment.<br>We build the rest.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => [
            'headline'        => 'Train for the life',
            'headline_accent' => '</em><script>alert(1)</script>',
        ]]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The hero's status card ───────────────────────────────────────────

    public function test_the_status_card_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression('/<a class="hero__status" href="[^"]+" data-action="open-booking"[^>]*><span class="pulse"><\/span><small>Assessment opening<\/small><strong>Tuesday · 18:00<\/strong>/', $body);
    }

    public function test_no_availability_line_means_no_status_card(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry', 'note_label' => 'Assessment opening']]);

        $this->assertStringNotContainsString('hero__status', $this->body());
    }

    // ─── The training ledger ──────────────────────────────────────────────

    public function test_the_ledger_rows_are_numbered_and_carry_the_authors_cycling_icons(): void
    {
        $this->seedLikeTheKit();
        Service::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Open floor hour',
            'price' => 18, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('<span>' . $ordinal . '</span>', $body);
        }

        $this->assertSame(2, substr_count($body, 'M9 24h30M6 18v12m5-15v18m26-18v18m5-15v12'));
        $this->assertSame(1, substr_count($body, 'M12 41c1-13 5-19 12-19s11 6 12 19M7 29h34'));
        $this->assertSame(1, substr_count($body, 'M7 39c1-10 4-16 10-16s9 6 10 16m-3-9c2-4 4-6 8-6 6 0 9 6 9 15'));
    }

    public function test_the_smoke_row_is_the_second_of_every_three(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        preg_match_all('/<article( class="featured")? data-item-id="\d+">/', $body, $matches);

        $this->assertSame(['', ' class="featured"', ''], $matches[1]);
    }

    public function test_the_ledger_meta_line_prints_the_authors_shape_and_his_starting_prices(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<strong>75 min · €85</strong>', $body);
        $this->assertStringContainsString('<strong>60 min · from €70</strong>', $body);
        $this->assertStringContainsString('<strong>60 min · from €32</strong>', $body);
    }

    public function test_the_ledger_rows_carry_no_link_of_their_own(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');

        $this->assertStringNotContainsString('data-service-id=', $this->body());
    }

    // ─── The method steps (gym-20) ────────────────────────────────────────

    /** A fact line splits on the author's own middle dot into his strong and small. */
    public function test_a_method_step_splits_on_the_middle_dot_into_title_and_line(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<li><span>01</span><strong>Assess</strong><small>Find the useful starting point</small></li>', $body);
        $this->assertStringContainsString('<li><span>03</span><strong>Review</strong><small>Measure, adjust and progress</small></li>', $body);
    }

    public function test_a_fact_line_without_a_dot_is_the_title_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry'], 'about' => ['body' => 'Prose.', 'fact_1' => 'Assess first']]);

        $body = $this->body();

        $this->assertStringContainsString('<li><span>01</span><strong>Assess first</strong></li>', $body);
        $this->assertStringNotContainsString('<small>', $body);
    }

    public function test_the_method_photograph_carries_the_authors_caption_box(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('landing/foundry_strength/assets/training-plan.webp', $body);
        $this->assertStringContainsString('<figcaption>Every programme has a reason.</figcaption>', $body);
    }

    // ─── The head coach ───────────────────────────────────────────────────

    public function test_the_first_practitioner_is_the_head_coach(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2>Luca Berziņš</h2>', $body);
        $this->assertStringContainsString('specialising in sustainable performance for busy adults.', $body);
        $this->assertStringNotContainsString('<dl>', $body);
    }

    public function test_the_other_coaches_fill_the_authors_cells(): void
    {
        $this->seedLikeTheKit();
        ServiceMaster::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Ieva Ozola', 'title' => 'Mobility coach',
            'sort_order' => 1, 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('<dt>Ieva Ozola</dt>', $body);
        $this->assertStringContainsString('<dd>Mobility coach</dd>', $body);
        $this->assertStringNotContainsString('<dt>Luca Berziņš</dt>', $body);
    }

    // ─── The member note ──────────────────────────────────────────────────

    public function test_the_member_note_is_the_first_featured_review_with_its_own_stars(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('The first gym where I never feel lost.', $body);
        $this->assertStringContainsString('<p class="rating"', $body);
        $this->assertStringContainsString('★★★★★', $body);
        $this->assertStringContainsString('<strong>Anna K.</strong>', $body);
        $this->assertStringContainsString('<p>Riga</p>', $body);
    }

    public function test_an_unrated_note_draws_no_stars(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Foundry', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => null,
            'comment' => 'A calm hour.', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $this->published(['hero' => ['headline' => 'Foundry'], 'reviews' => ['kicker' => 'Member note']]);
        $body = $this->body();

        $this->assertStringContainsString('A calm hour.', $body);
        $this->assertStringNotContainsString('class="rating"', $body);
        $this->assertStringContainsString('<strong>Verified member</strong>', $body);
    }

    // ─── The FAQ ──────────────────────────────────────────────────────────

    public function test_no_question_is_open_by_default(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(3, substr_count($body, '<details>'));
        $this->assertStringNotContainsString('<details open>', $body);
    }

    public function test_an_faq_of_only_half_pairs_renders_no_band(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry'], 'faq' => ['heading' => 'Answers', 'q1' => 'Lonely question']]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The highlight strip ──────────────────────────────────────────────

    /** The author closes his row on the rating, so the rating comes LAST here. */
    public function test_the_highlight_strip_closes_on_the_rating_it_has_actually_earned(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-count="4"', $body);
        $this->assertMatchesRegularExpression(
            '/<p><strong>1:1<\/strong><span>Dedicated coaching<\/span><\/p>.*<p><strong>4\.9<\/strong><span>Member rating<\/span><\/p>\s*<\/section>/s',
            $body,
        );
    }

    public function test_a_flat_highlight_is_the_authors_figure_alone(): void
    {
        $this->published(['hero' => ['headline' => 'Foundry'], 'trust' => ['feature_1' => 'Appointment-led']]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="1"', $body);
        $this->assertStringContainsString('<p><strong>Appointment-led</strong></p>', $body);
    }

    public function test_a_club_below_the_aggregate_floor_shows_no_score_anywhere(): void
    {
        foreach (range(1, 3) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Member ' . $i, 'overall_rating' => 5,
                'comment' => 'Lovely.', 'is_featured' => true, 'submitted_at' => now(),
            ]);
        }

        $this->published(['hero' => ['headline' => 'Foundry'], 'trust' => ['feature_1' => 'Small']]);
        $body = $this->body();

        $this->assertStringNotContainsString('Member rating', $body);
        $this->assertStringNotContainsString('footer-rating', $body);
    }

    // ─── The offer bar, the header and the brand mark (gym-22) ────────────

    public function test_the_offer_bar_is_the_message_and_the_authors_dotted_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');

        $this->assertMatchesRegularExpression(
            '/<div class="announcement" data-block="announcement">Private training · limited memberships ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>View assessment times<\/a>/',
            $this->body(),
        );
    }

    public function test_the_brand_mark_is_the_tenants_initial_not_the_authors_glyph(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span class="brand__mark" aria-hidden="true">F</span>'));
        $this->assertStringNotContainsString('M7 35V7h28M7 21h21', $body);
        $this->assertSame(2, substr_count($body, '<small>Strength club · Riga</small>'));
    }

    public function test_a_brand_logo_takes_the_marks_box(): void
    {
        $this->makeBrand('/storage/foundry-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span class="brand__mark" aria-hidden="true"><img src="/storage/foundry-logo.png"'));
        $this->assertStringNotContainsString('aria-hidden="true">F</span>', $body);
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

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true,
        ]);

        $this->published(['hero' => ['headline' => 'Foundry']]);
        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<script>x</script>', $body);
        $this->assertStringContainsString('&lt;script&gt;x&lt;/script&gt; <em>&amp;</em> Co', $body);
    }

    // ─── Booking, feedback and the chat launcher ──────────────────────────

    public function test_a_fitness_page_with_no_schedule_offers_no_booking_widget_and_no_dead_hook(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();
        DB::table('service_master_schedules')->delete();

        $body = $this->body();

        $this->assertStringNotContainsString('data-block="booking"', $body);
        $this->assertStringNotContainsString('data-action="open-booking"', $body);
        $this->assertStringContainsString('href="tel:+37120000822"', $body);
        $this->assertStringContainsString('Call to book', $body);
    }

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
            $this->assertStringContainsString('rel="noopener"', $tag);
        }
    }

    /** The author's own word on each control until the tenant writes theirs — the hero's with his arrow after it. */
    public function test_the_book_controls_carry_the_authors_words_per_placement(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertGreaterThanOrEqual(3, substr_count($body, 'Book assessment</a>'));
        $this->assertMatchesRegularExpression('/Book your assessment<svg class="icon"[^>]*><path d="M5 12h13m-4-5 5 5-5 5"/', $body);
        $this->assertStringContainsString('Prefer to call? <a href="tel:+37120000822">+371 20 000 822</a>', $body);
    }

    public function test_an_active_review_form_wires_the_feedback_link_with_the_authors_star(): void
    {
        ReviewForm::create([
            'organization_id' => 1, 'name' => 'Member notes', 'embed_key' => 'abc123',
            'is_active' => true, 'allow_anonymous' => true,
        ]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
        $this->assertMatchesRegularExpression('/<p class="footer-rating"><svg class="icon"[^>]*>.*?<\/svg>\s*<strong>4\.9<\/strong> \/ 5<\/p>/s', $body);
        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
    }

    public function test_the_chat_launcher_mounts_in_the_reserved_slot(): void
    {
        ChatWidgetConfig::create(['organization_id' => 1, 'widget_key' => 'wk-123', 'is_enabled' => true]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-ai-widget-slot', $body);
        $this->assertStringContainsString('class="ai-launcher"', $body);
        $this->assertStringContainsString('/chat-frame/wk-123', $body);
    }

    // ─── Hostile values ───────────────────────────────────────────────────

    public function test_hostile_shapes_do_not_take_the_page_down(): void
    {
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => str_repeat('a', 200000)], 'about' => 'not an array', 'trust' => 'nor this'], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_the_leaves_only_this_design_draws_are_escaped(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, [
            'hero'    => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>'],
            'about'   => ['caption' => '<b>caption</b>', 'fact_1' => '<b>title</b> · <b>line</b>'],
            'trust'   => ['feature_1' => '<b>fact</b>', 'feature_1_caption' => '<b>caption</b>'],
            'contact' => ['descriptor' => '<b>descriptor</b>', 'legal_note' => '<b>legal</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('<strong>&lt;b&gt;title&lt;/b&gt;</strong><small>&lt;b&gt;line&lt;/b&gt;</small>', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_rendered_head_names_no_google_fonts_host(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/foundry_strength\.css\?v=[0-9a-f]{10}#', $body);
        $this->assertStringNotContainsString('fonts.googleapis.com', $body);
        $this->assertStringNotContainsString('fonts.gstatic.com', $body);
    }

    public function test_every_font_face_is_same_origin_relative_and_on_disk(): void
    {
        $css = file_get_contents(public_path('landing/foundry_strength.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertCount(5, $matches[1], 'Five faces: Bodoni Moda (latin, latin-ext) and Manrope (cyrillic, latin-ext, latin).');

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url);
            $this->assertFileExists(public_path('landing/' . $url));
        }

        $this->assertSame(3, substr_count($css, 'font-family:Manrope;font-style:normal;font-weight:400 700'));
        $this->assertSame(2, substr_count($css, "font-family:'Bodoni Moda';font-style:normal;font-weight:400 500"));
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/foundry_strength/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/foundry_strength/assets/' . basename($file)));
        }
    }

    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/foundry_strength.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    public function test_every_rendered_block_has_a_thumbnail_and_no_gallery_does(): void
    {
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('foundry_strength') as $id) {
            $this->assertFileExists(public_path('landing/thumbs/foundry_strength/' . $id . '.svg'), "No thumbnail for the `{$id}` band.");
        }

        $this->assertFileExists(public_path('landing/thumbs/foundry_strength/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/foundry_strength/gallery.svg'));
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

    /** The hero marks a long headline for the stylesheet: over 28 characters `long`, over 48 `xlong` (polish-3). */
    public function test_a_long_headline_is_marked_for_the_stylesheet(): void
    {
        $page = $this->published(['hero' => ['headline' => 'Digital Business Cards for People Who Get Remembered']]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="xlong">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'Train for the life beyond the gym.']]]);
        $this->assertStringContainsString('<h1 data-field="hero-heading" data-length="long">', $this->body());

        $page->update(['content' => ['hero' => ['headline' => 'Strength, with space for you']]]);
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
