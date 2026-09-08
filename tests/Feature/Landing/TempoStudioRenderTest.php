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
 * Tempo Studio — the third GymTech kit, rendered as a real template.
 *
 * The same battery its two siblings run, plus the rulings this navy-and-acid
 * kit needed of its own: the acid is the one tenant override while the blue
 * stays structural; the offer bar carries a label; the "next up" card pairs
 * the availability leaves with today's closing time; the numbered signal
 * strip has no rating cell; the protocol cards print duration and price in
 * the author's two-pair ledger; the coach cards are the record's people with
 * the acid stat card written on the band's lead line; the member note's
 * eyebrow carries the studio's aggregate.
 */
class TempoStudioRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** Where the kit's own sources live, for the verbatim assertions. */
    private const KIT = 'landing-kits/gym-tech/03-tempo-studio';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(array $content = [], array $theme = [], string $industry = 'fitness'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'tempo',
            'template_key' => 'tempo_studio', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Find your pace. Raise it.']],
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
            'id' => 1, 'organization_id' => 1, 'name' => 'Tempo', 'logo_url' => $logoUrl,
        ]);
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/tempo')->getContent();
    }

    private function statusCode(): int
    {
        return $this->get('http://' . config('landing.host') . '/tempo')->getStatusCode();
    }

    private function seedRatings(): void
    {
        ReviewSubmission::create([
            'organization_id' => 1, 'anonymous_name' => 'Martins R.', 'overall_rating' => 5,
            'comment' => 'It has the energy of a group class and the attention of personal training. I finally train consistently.',
            'is_featured' => true, 'submitted_at' => now()->subDay(),
        ]);

        foreach (range(2, 10) as $i) {
            ReviewSubmission::create([
                'organization_id' => 1, 'anonymous_name' => 'Member ' . $i, 'overall_rating' => $i === 10 ? 4 : 5,
                'comment' => 'Coached, paced and genuinely fun.', 'is_featured' => false,
                'submitted_at' => now()->subDays($i),
            ]);
        }
    }

    /** The kit's own sample content, as close as a real tenant can get to it. */
    private function seedLikeTheKit(string $industry = 'fitness'): LandingPage
    {
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Tempo',
            'phone' => '+371 20 000 933', 'email' => 'move@tempo.example',
            'address' => '21 Dzirnavu iela', 'city' => 'Riga', 'country' => 'Latvia',
            'currency' => 'EUR', 'timezone' => 'Europe/Riga', 'is_active' => true,
        ]);

        foreach ([
            ['Build', 'Full-body strength, controlled tempo and simple progressive loading.', 50, 18],
            ['Engine', 'Intervals that build capacity with smart pacing, not chaotic exhaustion.', 45, 20],
            ['Reset', 'Mobility, trunk strength and recovery work that keeps you consistent.', 40, 16],
        ] as $i => [$name, $short, $minutes, $price]) {
            Service::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name,
                'short_description' => $short, 'duration_minutes' => $minutes,
                'price' => $price, 'currency' => 'EUR', 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        foreach ([
            ['Elza Kalniņa', 'Head coach', 'Strength, conditioning and calm cues when the room gets loud.'],
            ['Rihards Ozols', 'Performance coach', 'Movement quality, smart pacing and an excellent playlist.'],
        ] as $i => [$name, $title, $bio]) {
            ServiceMaster::create([
                'organization_id' => 1, 'brand_id' => 1, 'name' => $name, 'title' => $title, 'bio' => $bio,
                'sort_order' => $i, 'is_active' => true,
            ]);
        }

        $this->seedRatings();

        $page = $this->published([
            'announcement' => [
                'label'     => 'New member week',
                'text'      => 'First coached session €12',
                'cta_label' => 'Choose a time',
            ],
            'hero' => [
                'kicker'          => 'Coached group training',
                'headline'        => "Find your pace.\n",
                'headline_accent' => 'Raise it.',
                'subtext'         => 'Strength and conditioning sessions that meet you at your level, then move you forward together.',
                'cta_label'       => 'Book your first class',
                'note_label'      => 'Next up',
                'proof'           => 'Engine 45',
            ],
            'trust' => [
                'feature_1' => 'Every session coached',
                'feature_2' => 'Live progress tracking',
                'feature_3' => 'All levels welcomed',
                'feature_4' => '12 people maximum',
            ],
            'services' => [
                'kicker'  => 'Choose your protocol',
                'heading' => 'Three ways to move.',
                'subtext' => 'Follow a balanced weekly rhythm or book the session your body needs today. Coaches scale every exercise.',
            ],
            'about' => [
                'kicker'      => 'The Tempo system',
                'lead'        => "Technology informs.\n",
                'lead_accent' => 'Coaches decide.',
                'body'        => 'Your training history, session effort and progress are easy to see. The screen supports the room; it never replaces a coach who knows your name.',
                'fact_1'      => 'Plan · A balanced weekly recommendation',
                'fact_2'      => 'Track · Useful metrics, without obsession',
                'fact_3'      => 'Adapt · Options for your level and today',
                'caption'     => 'LIVE · Coaching in every interval',
            ],
            'team' => [
                'kicker'  => 'On the floor',
                'heading' => "Seen by a coach.\nBacked by a team.",
                'subtext' => '12 · Members maximum in every session.',
            ],
            'reviews' => [
                'kicker' => 'Member signal',
            ],
            'faq' => [
                'kicker'  => 'Your first class',
                'heading' => "Ready when\nyou are.",
                'q1' => 'Which session should I start with?',
                'a1' => 'Build is a good first choice. Tell the coach you are new and they will guide your setup and options.',
                'q2' => 'Do I need to be fit already?',
                'a2' => 'No. Sessions have clear progressions and regressions, so you can train alongside the group at the right level.',
                'q3' => 'What should I bring?',
                'a3' => 'Training clothes, clean indoor shoes and water. Towels, lockers and all equipment are ready here.',
            ],
            'booking' => [
                'kicker'     => 'Your next session',
                'heading'    => "Pick the time.\nWe set the pace.",
                'terms'      => 'See live availability and reserve your first coached class in under a minute.',
                'call_label' => 'Questions?',
            ],
            'contact' => [
                'descriptor'       => 'Train in rhythm',
                'email_label'      => 'Email the studio',
                'legal_note'       => 'Fictional demonstration.',
                'social_instagram' => 'https://instagram.com/tempo.example',
                'social_facebook'  => 'https://facebook.com/tempo.example',
                'social_tiktok'    => 'https://tiktok.com/@tempo.example',
            ],
        ], [], $industry);

        $page->update(['seo' => ['description' => 'Premium coached group training in central Riga.']]);

        return $page;
    }

    // ─── Escaping and policy ──────────────────────────────────────────────

    public function test_the_template_contains_no_raw_echoes(): void
    {
        $files = glob(resource_path('views/landing/tempo_studio/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no files.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file), basename($file) . ' uses a raw echo.');
        }
    }

    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/tempo_studio/sections/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no section partials.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file), basename($file) . ' uses a raw echo.');
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
        $this->published(['hero' => ['headline' => 'Tempo']], ['brand_color' => '#E8B86D']);

        preg_match_all('/<style\b[^>]*>/i', $this->body(), $matches);

        $this->assertNotEmpty($matches[0], 'The tenant colour emitted no token block at all.');

        foreach ($matches[0] as $tag) {
            $this->assertMatchesRegularExpression('/nonce="[^"]+"/', $tag, "An inline <style> reached the page with no nonce: {$tag}");
        }
    }

    // ─── The accent (gym-27) ──────────────────────────────────────────────

    /**
     * The acid is the ONE override — the author's accent by his own token
     * naming: the eyebrow dash, the <em>, the labels, the numerals, and the
     * fills that carry night type (the brand circle, the stat card, the
     * schedule button). The blue is this page's STRUCTURAL fill — buttons,
     * the offer bar, the member-note band — with white type on it, and it
     * stays the author's, as do the night and the ice.
     */
    public function test_a_tenant_colour_lands_on_the_acid_and_never_on_the_blue_or_the_surfaces(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo']], ['brand_color' => '#E8B86D']);
        $body = $this->body();

        $this->assertStringContainsString('--acid:', $body);

        foreach (['--blue:', '--blue-bright:', '--night:', '--navy:', '--ice:'] as $token) {
            $this->assertStringNotContainsString($token, $body, "{$token} was repainted.");
        }
    }

    /** The acid carries night type, so a kept tenant colour must read under black. */
    public function test_a_kept_tenant_colour_carries_the_night_label(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo']], ['brand_color' => '#E8B86D']);

        preg_match('/--acid: (#[0-9a-fA-F]{6});/', $this->body(), $m);

        $this->assertNotEmpty($m, 'No accent was emitted at all.');
        $this->assertGreaterThanOrEqual(4.5, \App\Support\Accent::contrast($m[1], '#07101e'));
    }

    public function test_a_page_with_no_tenant_colour_emits_no_inline_style(): void
    {
        $this->published();

        $this->assertStringNotContainsString('<style', $this->body());
    }

    public function test_a_stored_palette_emits_nothing_on_this_template(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo']], ['palette' => 'champagne_noir']);
        $body = $this->body();

        $this->assertStringNotContainsString('data-scheme', $body);
        $this->assertStringNotContainsString('<style', $body);
    }

    // ─── The blocks ───────────────────────────────────────────────────────

    public function test_every_block_the_kit_defines_renders_with_real_content(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach (['announcement', 'header', 'hero', 'trust', 'services', 'story', 'team', 'testimonials', 'faq', 'booking', 'footer', 'contact', 'assistant'] as $block) {
            $this->assertStringContainsString('data-block="' . $block . '"', $body, "The kit's `{$block}` band is missing from the rendered page.");
        }

        $this->assertStringNotContainsString('data-block="gallery"', $body);
    }

    public function test_the_author_variants_are_preserved(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        foreach ([
            'hero'         => 'performance-grid',
            'services'     => 'session-protocols',
            'story'        => 'coaching-system',
            'team'         => 'coaching-team',
            'testimonials' => 'member-signal',
            'faq'          => 'first-class',
            'booking'      => 'first-class-cta',
            'footer'       => 'studio-hub',
            'assistant'    => 'widget-slot',
        ] as $block => $variant) {
            $this->assertStringContainsString('data-block="' . $block . '" data-variant="' . $variant . '"', $body,
                "The author's `{$block}` variant is not the one rendered.");
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
        $this->assertStringContainsString('landing/tempo_studio/assets/hero-conditioning.webp', $body);

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
        $this->assertStringNotContainsString('Elza Kalniņa', $body);
    }

    public function test_a_tenant_added_words_band_renders_on_this_template(): void
    {
        $page = $this->published([
            'hero'   => ['headline' => 'Tempo'],
            'text_1' => ['kicker' => 'A note', 'heading' => 'What we believe', 'body' => "One paragraph.\n\nAnd a second."],
        ]);
        $page->sections()->create(['key' => 'text_1', 'enabled' => true, 'sort' => 9]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringContainsString('data-block="text"', $body);
        $this->assertStringContainsString('And a second.', $body);
    }

    // ─── The author's own strings ─────────────────────────────────────────

    /** Two of his headings put the accent on a line of its own; the leaf's trailing break does that. */
    public function test_the_authors_two_line_headings_render_as_he_drew_them(): void
    {
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertStringContainsString('Find your pace.<br><em>Raise it.</em>', $body);
        $this->assertStringContainsString('Technology informs.<br><em>Coaches decide.</em>', $body);
        $this->assertStringContainsString('Seen by a coach.<br>Backed by a team.', $body);
        $this->assertStringContainsString('Ready when<br>you are.', $body);
        $this->assertStringContainsString('Pick the time.<br>We set the pace.', $body);
    }

    public function test_a_hostile_accent_never_reaches_the_dom(): void
    {
        $this->published(['hero' => ['headline' => 'Find your pace.', 'headline_accent' => '</em><script>alert(1)</script>']]);

        $body = $this->body();

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringContainsString('&lt;/em&gt;&lt;script&gt;', $body);
    }

    // ─── The offer bar's label and the hero's next-up card (gym-23) ───────

    public function test_the_offer_bar_carries_the_authors_label_message_and_link(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');

        $this->assertMatchesRegularExpression(
            '/<div class="announcement" data-block="announcement"><span>New member week<\/span> · First coached session €12 ·\s*<a href="[^"]+" data-action="open-booking"[^>]*>Choose a time<\/a><\/div>/',
            $this->body(),
        );
    }

    public function test_the_offer_bar_without_a_label_is_the_message_and_the_link(): void
    {
        $this->seedWidgetOrganization();
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, ['announcement' => ['label' => '']])]);

        $this->assertMatchesRegularExpression('/<div class="announcement" data-block="announcement">First coached session €12 ·\s*<a /', $this->body());
    }

    public function test_the_next_up_card_prints_the_tenants_line_under_its_label(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');

        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<a class="hero__next" href="[^"]+" data-action="open-booking"[^>]*><div><span>Next up<\/span><strong>Engine 45<\/strong><\/div>/',
            $body,
        );

        // The author's arrow closes the card — an INCLUDE, and one that a
        // directive glued to the @endif before it once printed as text.
        $this->assertMatchesRegularExpression('/Engine 45<\/strong><\/div>(?:<div>.*?<\/div>)?<svg class="icon"[^>]*><path d="M5 12h13m-4-5 5 5-5 5"/s', $body);
        $this->assertStringNotContainsString('@include', $body);
    }

    public function test_no_availability_line_means_no_next_up_card(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo', 'note_label' => 'Next up']]);

        $this->assertStringNotContainsString('hero__next', $this->body());
    }

    /** The card's second pair is the author's "Today · 18:30" shape carrying a fact the business publishes: today's closing time. */
    public function test_the_next_up_card_second_pair_is_todays_closing_time_when_hours_are_published(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');

        // Opening hours are the chat widget's business hours — the only
        // customer-facing hours the platform holds (PageContent::hours()).
        $hours = [];
        foreach (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as $day) {
            $hours[$day] = [['open' => '06:00', 'close' => '22:00']];
        }
        ChatWidgetConfig::create([
            'organization_id' => 1, 'widget_key' => 'wk-hours', 'is_enabled' => true,
            'business_hours' => $hours,
        ]);

        $body = $this->body();

        $this->assertMatchesRegularExpression('/<div><small>Open until<\/small><strong>22:00<\/strong><\/div>/', $body);
    }

    // ─── The signal strip ─────────────────────────────────────────────────

    /** Four numbered lines and NO rating cell — the author keeps his score for the member note and the footer. */
    public function test_the_signal_strip_numbers_the_highlights_and_carries_no_rating(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="trust" data-count="4"', $body);
        $this->assertStringContainsString('<p><span>01</span>Every session coached</p>', $body);
        $this->assertStringContainsString('<p><span>04</span>12 people maximum</p>', $body);
        $this->assertDoesNotMatchRegularExpression('/data-block="trust"[^>]*>(?:(?!<\/section>).)*4\.9/s', $body);
    }

    public function test_a_paired_highlight_joins_its_caption_with_the_authors_dot(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo'], 'trust' => ['feature_1' => '12', 'feature_1_caption' => 'people maximum']]);

        $this->assertStringContainsString('<p><span>01</span>12 · people maximum</p>', $this->body());
    }

    // ─── The protocol cards (gym-24) ──────────────────────────────────────

    public function test_the_protocol_cards_carry_the_authors_cycling_icons_and_ordinals(): void
    {
        $this->seedLikeTheKit();
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Open gym', 'price' => 10, 'currency' => 'EUR', 'sort_order' => 9, 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('data-count="4"', $body);
        $this->assertSame(2, substr_count($body, 'M8 24h32M6 18v12m5-16v20m26-20v20m5-16v12'));
        $this->assertSame(1, substr_count($body, 'M8 31c5-16 10-16 15 0s10 16 17 0M8 17c5 16 10 16 15 0s10-16 17 0'));
        $this->assertSame(1, substr_count($body, 'M24 6c-2 9-12 13-12 24a12 12 0 0 0 24 0C36 19 26 15 24 6Z'));

        foreach (['01', '02', '03', '04'] as $ordinal) {
            $this->assertStringContainsString('</svg><span>' . $ordinal . '</span>', $body);
        }
    }

    public function test_the_blue_card_is_the_second_of_every_three(): void
    {
        $this->seedLikeTheKit();

        // Scoped to the protocol grid: the coach cards are articles too.
        preg_match('/<div class="protocol-grid"[^>]*>(.*?)<\/section>/s', $this->body(), $grid);
        $this->assertNotEmpty($grid, 'The protocol grid is missing.');

        preg_match_all('/<article( class="featured")? data-item-id="\d+">/', $grid[1], $matches);

        $this->assertSame(['', ' class="featured"', ''], $matches[1]);
    }

    /** The author's two-pair ledger: his "50 / minutes" is the duration, and the price takes his second pair. */
    public function test_the_protocol_ledger_prints_duration_and_price_in_the_authors_pairs(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div><dt>50</dt><dd>minutes</dd></div>', $body);
        $this->assertStringContainsString('<div><dt>€18</dt><dd>per class</dd></div>', $body);
    }

    public function test_a_starting_price_prints_the_word_before_it_in_the_ledger(): void
    {
        $this->seedLikeTheKit();
        DB::table('services')->where('name', 'Build')->update(['price_is_from' => true]);

        $this->assertStringContainsString('<div><dt>from €18</dt><dd>per class</dd></div>', $this->body());
    }

    public function test_a_session_with_neither_duration_nor_price_draws_no_ledger(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Tempo', 'is_active' => true]);
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Open gym', 'sort_order' => 0, 'is_active' => true]);

        $this->published(['hero' => ['headline' => 'Tempo']]);
        $body = $this->body();

        $this->assertStringContainsString('<h3>Open gym</h3>', $body);
        $this->assertStringNotContainsString('<dl>', $body);
    }

    // ─── The system band (gym-20, gym-25) ─────────────────────────────────

    public function test_a_metric_splits_on_the_middle_dot_into_title_and_line(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="metric"><span>01</span><div><strong>Plan</strong><small>A balanced weekly recommendation</small></div></div>', $body);
        $this->assertStringContainsString('<div class="metric"><span>03</span><div><strong>Adapt</strong><small>Options for your level and today</small></div></div>', $body);
    }

    public function test_the_caption_pill_splits_its_tag_on_the_middle_dot(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('landing/tempo_studio/assets/coached-interval.webp', $body);
        $this->assertStringContainsString('<figcaption><span>LIVE</span> Coaching in every interval</figcaption>', $body);
    }

    public function test_a_caption_without_a_dot_has_no_tag(): void
    {
        $this->published(['hero' => ['headline' => 'Tempo'], 'about' => ['body' => 'Prose.', 'caption' => 'Coaching in every interval']]);

        $this->assertStringContainsString('<figcaption>Coaching in every interval</figcaption>', $this->body());
    }

    // ─── The coaches (gym-26) ─────────────────────────────────────────────

    public function test_the_coach_cards_are_the_records_people_and_the_stat_card_is_the_bands_lead_line(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<div class="coach-cards" data-coaches="2" data-stat="1">', $body);
        $this->assertStringContainsString('<span>Head coach</span>', $body);
        $this->assertStringContainsString('<h3>Elza Kalniņa</h3>', $body);
        $this->assertStringContainsString('<p>Strength, conditioning and calm cues when the room gets loud.</p>', $body);
        $this->assertStringContainsString('<h3>Rihards Ozols</h3>', $body);
        $this->assertStringContainsString('<article class="coach-stat"><strong>12</strong><p>Members maximum in every session.</p></article>', $body);
    }

    public function test_no_lead_line_means_no_stat_card_and_the_row_closes_up(): void
    {
        $page = $this->seedLikeTheKit();
        $page->update(['content' => array_replace_recursive($page->content, ['team' => ['subtext' => '']])]);

        $body = $this->body();

        $this->assertStringContainsString('<div class="coach-cards" data-coaches="2" data-stat="0">', $body);
        $this->assertStringNotContainsString('coach-stat', $body);
    }

    public function test_three_or_more_coaches_tile_in_threes(): void
    {
        $this->seedLikeTheKit();
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Anete Liepa', 'title' => 'Mobility coach', 'sort_order' => 2, 'is_active' => true]);

        $this->assertStringContainsString('<div class="coach-cards coach-cards--many" data-coaches="3" data-stat="1">', $this->body());
    }

    public function test_the_coach_cards_offer_no_per_person_book_control(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit();
        $this->seedBookableSchedule();

        $this->assertStringNotContainsString('&amp;master=', $this->body());
    }

    // ─── The member note ──────────────────────────────────────────────────

    public function test_the_member_note_eyebrow_carries_the_studios_score_and_the_note_its_own_stars(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('<h2 class="eyebrow">Member signal · 4.9 / 5</h2>', $body);
        $this->assertSame(1, substr_count($body, '<blockquote>'));
        $this->assertStringContainsString('It has the energy of a group class', $body);
        $this->assertStringContainsString('★★★★★', $body);
        $this->assertStringContainsString('<strong>Martins R.</strong><small>Riga</small>', $body);
    }

    public function test_below_the_aggregate_floor_the_eyebrow_is_the_kicker_alone(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Tempo', 'is_active' => true]);
        ReviewSubmission::create(['organization_id' => 1, 'anonymous_name' => null, 'overall_rating' => null, 'comment' => 'A good hour.', 'is_featured' => true, 'submitted_at' => now()]);

        $this->published(['hero' => ['headline' => 'Tempo'], 'reviews' => ['kicker' => 'Member signal']]);
        $body = $this->body();

        $this->assertStringContainsString('<h2 class="eyebrow">Member signal</h2>', $body);
        $this->assertStringNotContainsString('★', $body);
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
        $this->published(['hero' => ['headline' => 'Tempo'], 'faq' => ['heading' => 'Answers', 'q1' => 'Lonely question']]);

        $this->assertStringNotContainsString('data-block="faq"', $this->body());
    }

    // ─── The header, the brand mark and the chrome ────────────────────────

    public function test_the_brand_mark_is_the_initial_in_the_authors_circle(): void
    {
        $this->seedLikeTheKit();
        $body = $this->body();

        // The two are flex children: whitespace between them is not rendered.
        $this->assertSame(2, preg_match_all('/<span aria-hidden="true">T<\/span>\s*<strong>Tempo<small>Train in rhythm<\/small><\/strong>/', $body));
    }

    public function test_a_brand_logo_takes_the_circle_on_a_hairline(): void
    {
        $this->makeBrand('/storage/tempo-logo.png');
        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertSame(2, substr_count($body, '<span class="brand__mark--logo" aria-hidden="true"><img src="/storage/tempo-logo.png"'));
        $this->assertStringNotContainsString('aria-hidden="true">T</span>', $body);
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

    /** The author's own word on each control until the tenant writes theirs — the header's and the hero's with his arrow after them. */
    public function test_the_book_controls_carry_the_authors_words_per_placement(): void
    {
        $this->seedWidgetOrganization();
        $this->seedLikeTheKit('hotel');
        $body = $this->body();

        $this->assertMatchesRegularExpression('/class="header__book"[^>]*>Book a class<svg class="icon"/', $body);
        $this->assertMatchesRegularExpression('/Book your first class<svg class="icon"/', $body);
        $this->assertGreaterThanOrEqual(2, substr_count($body, 'Book a class</a>'));
        $this->assertStringContainsString('class="button button--acid"', $body);
        $this->assertStringContainsString('Questions? <a href="tel:+37120000933">+371 20 000 933</a>', $body);
    }

    public function test_a_hostile_business_name_never_reaches_the_lockup_unescaped(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => '<script>x</script> & Co', 'is_active' => true]);

        $this->published(['hero' => ['headline' => 'Tempo']]);
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
        $this->assertStringContainsString('href="tel:+37120000933"', $body);
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

    public function test_an_active_review_form_wires_the_feedback_link_with_the_authors_star(): void
    {
        ReviewForm::create(['organization_id' => 1, 'name' => 'Member notes', 'embed_key' => 'abc123', 'is_active' => true, 'allow_anonymous' => true]);

        $this->seedLikeTheKit();
        $body = $this->body();

        $this->assertStringContainsString('data-block="feedback"', $body);
        $this->assertStringContainsString('key=abc123', $body);
        $this->assertMatchesRegularExpression('/<p class="footer-rating"><svg class="icon"[^>]*>.*?<\/svg>\s*<strong>4\.9<\/strong> \/ 5<\/p>/s', $body);
        $this->assertStringContainsString('footer-hub footer-hub--4', $body);
        $this->assertStringContainsString('data-social-platform="tiktok"', $body);
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
        $this->published(['hero' => ['headline' => ['nested' => 'x'], 'subtext' => str_repeat('a', 200000)], 'about' => 'not an array', 'trust' => 'nor this', 'team' => 'nor this'], ['brand_color' => ['nested' => '#fff']]);

        $this->assertSame(200, $this->statusCode());
    }

    public function test_the_leaves_only_this_design_draws_are_escaped(): void
    {
        $page = $this->seedLikeTheKit('hotel');
        $page->update(['content' => array_replace_recursive($page->content, [
            'announcement' => ['label' => '<b>label</b>'],
            'hero'         => ['proof' => '<b>proof</b>', 'note_label' => '<b>note</b>'],
            'about'        => ['caption' => '<b>tag</b> · <b>caption</b>', 'fact_1' => '<b>title</b> · <b>line</b>'],
            'team'         => ['subtext' => '<b>12</b> · <b>stat</b>'],
            'trust'        => ['feature_1' => '<b>fact</b>'],
        ])]);

        $body = $this->body();

        $this->assertSame(200, $this->statusCode());
        $this->assertStringNotContainsString('<b>', $body);
        $this->assertStringContainsString('<strong>&lt;b&gt;12&lt;/b&gt;</strong><p>&lt;b&gt;stat&lt;/b&gt;</p>', $body);
        $this->assertStringContainsString('<span>&lt;b&gt;tag&lt;/b&gt;</span> &lt;b&gt;caption&lt;/b&gt;', $body);
    }

    // ─── Assets, fonts and the stylesheet ─────────────────────────────────

    public function test_the_rendered_head_names_no_google_fonts_host(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression('#landing/tempo_studio\.css\?v=[0-9a-f]{10}#', $body);
        $this->assertStringNotContainsString('fonts.googleapis.com', $body);
        $this->assertStringNotContainsString('fonts.gstatic.com', $body);
    }

    /** Six faces: Instrument Serif roman and italic in latin and latin-ext, Space Grotesk's variable file in both. */
    public function test_every_font_face_is_same_origin_relative_and_on_disk(): void
    {
        $css = file_get_contents(public_path('landing/tempo_studio.css'));

        preg_match_all("/src:\s*url\('([^']+)'\)/", $css, $matches);

        $this->assertCount(6, $matches[1]);

        foreach ($matches[1] as $url) {
            $this->assertStringStartsWith('fonts/', $url);
            $this->assertFileExists(public_path('landing/' . $url));
            $this->assertSame('wOF2', file_get_contents(public_path('landing/' . $url), false, null, 0, 4), "{$url} is not a woff2 file.");
        }

        $this->assertSame(2, substr_count($css, "font-family:'Instrument Serif';font-style:italic;font-weight:400"));
        $this->assertSame(2, substr_count($css, "font-family:'Space Grotesk';font-style:normal;font-weight:400 700"));
        $this->assertStringNotContainsString('cyrillic', $css);
    }

    public function test_the_kits_assets_shipped_with_the_template(): void
    {
        $shipped = glob(public_path('landing/tempo_studio/assets/*.webp'));
        $source  = glob(resource_path(self::KIT . '/assets/*.webp'));

        $this->assertNotEmpty($source);
        $this->assertSameSize($source, $shipped);

        foreach ($source as $file) {
            $this->assertFileEquals($file, public_path('landing/tempo_studio/assets/' . basename($file)));
        }
    }

    public function test_the_authors_stylesheet_ships_byte_for_byte(): void
    {
        $kit = file_get_contents(resource_path(self::KIT . '/style.css'));
        $css = file_get_contents(public_path('landing/tempo_studio.css'));

        $start = strpos($css, ':root {');
        $end   = strpos($css, '/* =========================================================================');

        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $this->assertSame(trim($kit), trim(substr($css, $start, $end - $start)),
            "The shipped stylesheet is no longer the author's file with the two documented additions.");
    }

    public function test_every_rendered_block_has_a_thumbnail_and_no_gallery_does(): void
    {
        foreach (\App\Services\Landing\LandingOnboardingService::rendersFor('tempo_studio') as $id) {
            $this->assertFileExists(public_path('landing/thumbs/tempo_studio/' . $id . '.svg'), "No thumbnail for the `{$id}` band.");
        }

        $this->assertFileExists(public_path('landing/thumbs/tempo_studio/contact.svg'));
        $this->assertFileDoesNotExist(public_path('landing/thumbs/tempo_studio/gallery.svg'));
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
