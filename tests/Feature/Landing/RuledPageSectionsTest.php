<?php
namespace Tests\Feature\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The ruled_page section partials.
 *
 * RuledPageRenderTest polices the template's invariants — escaping, the CSP
 * nonce, the chat embed. This file is about the six content bands: what each
 * one puts on the page when it has data, and the fact that it is absent
 * rather than empty when it does not.
 *
 * "Absent, not empty" is asserted twice over for every section, because the
 * two halves fail for different reasons. PageContent::has() decides whether
 * the layout includes the partial at all; the partial itself decides what to
 * do with a row that is missing a field. A section can pass the first and
 * still print a bare currency code or a blank role line.
 */
class RuledPageSectionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    /**
     * $industry defaults to 'beauty', same as every fixture in this file did
     * before Task 4 (the booking gate) existed. Only the booking-band tests
     * below override it to 'hotel' -- booking.blade.php is the one section
     * whose rendering now depends on which industry the page carries (see
     * PageContent::count('booking')), so every OTHER section's tests here
     * are correctly unaffected by leaving the default alone.
     */
    private function published(array $content = [], string $industry = 'beauty'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'glamour-salon',
            'template_key' => 'ruled_page', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content + ['hero' => ['headline' => 'The Art of Wellness']],
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page;
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/glamour-salon')->getContent();
    }

    // ── services ────────────────────────────────────────────────────────────

    public function test_services_render_with_price_and_duration(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial', 'is_active' => true,
            'price' => 65, 'currency' => 'EUR', 'duration_minutes' => 60,
            'short_description' => 'Sixty minutes of quiet']);

        $body = $this->body();

        $this->assertStringContainsString('Signature Facial', $body);
        $this->assertStringContainsString('65.00', $body);
        $this->assertStringContainsString('60 min', $body);
        $this->assertStringContainsString('Sixty minutes of quiet', $body);
    }

    public function test_a_service_without_a_price_still_renders(): void
    {
        // Price on request is normal in this industry. A null price must not
        // print a zero or a bare currency code.
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Consultation',
            'is_active' => true, 'price' => null, 'currency' => 'EUR']);

        $body = $this->body();

        $this->assertStringContainsString('Consultation', $body);
        $this->assertStringNotContainsString('0.00', $body);
        $this->assertStringNotContainsString('EUR', $body);
    }

    public function test_a_service_falls_back_to_its_long_description(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Deep Tissue', 'is_active' => true,
            'description' => 'Firm pressure, worked slowly.']);

        $this->assertStringContainsString('Firm pressure, worked slowly.', $this->body());
    }

    public function test_the_services_band_is_absent_without_services(): void
    {
        $this->published();

        $this->assertStringNotContainsString('data-section="services"', $this->body());
    }

    /**
     * Task 7 (pillar rebuild): the sticky preview plate is gone; a row's
     * photograph is a small square plate trailing the row itself, rendered
     * ONLY for rows that actually have one. An imageless studio gets clean
     * pillars — no shot spans, no monogram column.
     */
    public function test_no_shot_plate_renders_when_no_service_has_an_image(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true, 'image' => null]);

        $body = $this->body();

        $this->assertStringNotContainsString('rp-pillar__shot', $body);
        $this->assertStringNotContainsString('rp-pillar--shot', $body);
    }

    // ── about ───────────────────────────────────────────────────────────────

    public function test_about_renders_its_lead_and_body(): void
    {
        $this->published(['about' => [
            'lead' => 'Six rooms, one appointment at a time.',
            'body' => 'We opened in 2019 with a single chair and a rule about noise.',
        ]]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="about"', $body);
        $this->assertStringContainsString('one appointment at a time', $body);
        $this->assertStringContainsString('a single chair and a rule about noise', $body);
    }

    public function test_the_about_band_is_absent_without_a_body(): void
    {
        // A lead with no body is not an About section — PageContent::has()
        // keys on the body alone, and the partial must not contradict it.
        $this->published(['about' => ['lead' => 'Six rooms.']]);

        $this->assertStringNotContainsString('data-section="about"', $this->body());
    }

    public function test_the_letterpress_opening_takes_the_first_two_words_and_loses_none(): void
    {
        // The opening is small-capped by wrapping the first two words in a
        // span. Splitting a string and re-emitting the halves is exactly how
        // a word goes missing, so the full sentence must survive the split.
        $this->published(['about' => ['body' => 'We opened in 2019 with a single chair.']]);

        $body = $this->body();

        $this->assertStringContainsString('rp-about__opening">We opened</span>', $body);
        $this->assertStringContainsString('in 2019 with a single chair.', $body);
    }

    public function test_a_one_word_body_does_not_lose_its_only_word(): void
    {
        $this->published(['about' => ['body' => 'Quiet']]);

        $this->assertStringContainsString('Quiet', $this->body());
    }

    public function test_a_long_body_sets_in_two_columns(): void
    {
        // 4.5.4: over 900 characters the body takes a column rule. Under it,
        // a two-column set balances into two stubs.
        $this->published(['about' => ['body' => str_repeat('Sixty minutes of quiet. ', 50)]]);
        $this->assertStringContainsString('is-columns', $this->body());
    }

    public function test_a_short_body_stays_in_one_column(): void
    {
        $this->published(['about' => ['body' => 'Sixty minutes of quiet.']]);
        $this->assertStringNotContainsString('is-columns', $this->body());
    }

    // ── team ────────────────────────────────────────────────────────────────

    public function test_team_members_render_with_their_role(): void
    {
        $this->published();
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak',
            'title' => 'Senior therapist', 'is_active' => true,
            'specialties' => ['Facials', 'Massage']]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="team"', $body);
        $this->assertStringContainsString('Marta Nowak', $body);
        $this->assertStringContainsString('Senior therapist', $body);
        $this->assertStringContainsString('Facials', $body);
    }

    public function test_a_member_without_a_role_drops_the_line_rather_than_leaving_it_blank(): void
    {
        $this->published();
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak',
            'title' => null, 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('Marta Nowak', $body);
        $this->assertStringNotContainsString('rp-member__role', $body);
    }

    public function test_a_member_without_a_photograph_gets_the_monogram_plate(): void
    {
        // 4.4: the same device in every image slot, so a studio that has
        // uploaded nothing still gets a coherent page rather than six
        // broken-image boxes.
        $this->published();
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak',
            'avatar' => null, 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('rp-plate--mono', $body);
        $this->assertStringContainsString('>MN<', $body);
    }

    public function test_the_team_band_is_absent_without_practitioners(): void
    {
        $this->published();

        $this->assertStringNotContainsString('data-section="team"', $this->body());
    }

    public function test_the_team_grid_states_its_count_so_a_pair_does_not_span_four_columns(): void
    {
        $this->published();
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak', 'is_active' => true]);
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Ola Kaczmarek', 'is_active' => true]);

        $this->assertStringContainsString('data-count="2"', $this->body());
    }

    // ── reviews ─────────────────────────────────────────────────────────────

    private function review(array $attributes = []): ReviewSubmission
    {
        return ReviewSubmission::create($attributes + [
            'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Quiet, careful, unhurried.',
            'anonymous_name' => 'Anna K.', 'is_featured' => true, 'submitted_at' => now(),
        ]);
    }

    public function test_a_featured_review_renders_its_quote_and_author(): void
    {
        $this->published();
        $this->review();

        $body = $this->body();

        $this->assertStringContainsString('data-section="reviews"', $body);
        $this->assertStringContainsString('Quiet, careful, unhurried.', $body);
        $this->assertStringContainsString('Anna K.', $body);
    }

    public function test_a_review_with_no_name_is_attributed_honestly(): void
    {
        $this->published();
        $this->review(['anonymous_name' => null]);

        $this->assertStringContainsString('Verified client', $this->body());
    }

    public function test_the_reviews_band_is_absent_without_featured_reviews(): void
    {
        $this->published();
        $this->review(['is_featured' => false]);

        $this->assertStringNotContainsString('data-section="reviews"', $this->body());
    }

    public function test_below_four_reviews_no_aggregate_is_claimed(): void
    {
        // PageContent suppresses reviewStats under four ratings by design.
        // The section must not fill the gap with a zero — "0 reviews" under a
        // wall of five-star quotes is worse than saying nothing.
        $this->published();
        $this->review();

        $body = $this->body();

        $this->assertStringContainsString('Quiet, careful, unhurried.', $body);
        $this->assertStringNotContainsString('rp-reviews__aggregate', $body);
        $this->assertStringNotContainsString('0 reviews', $body);
    }

    public function test_the_aggregate_and_its_distribution_appear_from_four_reviews(): void
    {
        $this->published();
        $this->review();
        $this->review(['overall_rating' => 5, 'is_featured' => false]);
        $this->review(['overall_rating' => 4, 'is_featured' => false]);
        $this->review(['overall_rating' => 3, 'is_featured' => false]);

        $body = $this->body();

        $this->assertStringContainsString('rp-reviews__aggregate', $body);
        // One decimal place, always. PageContent rounds to two, so the raw
        // value would read 4.25 here and 4.4 on the next page -- an average
        // that changes its own precision reads as a number nobody is looking
        // after, which is the opposite of what this band is selling.
        $this->assertStringContainsString('4.3', $body);
        $this->assertStringNotContainsString('4.25', $body);
        $this->assertStringContainsString('4 reviews', $body);

        // Appendix B asks for a distribution bar, not a row of gold stars.
        $this->assertStringContainsString('rp-dist', $body);

        // Every star from 1 to 5 has a row even when nothing scored it — a
        // histogram with holes in it is unreadable, and the distribution
        // always carries all five keys for exactly that reason.
        foreach (range(1, 5) as $star) {
            $this->assertStringContainsString('data-star="' . $star . '"', $body);
        }
    }

    public function test_a_whole_number_average_still_prints_its_decimal(): void
    {
        // The other half of the same rule: 5 must render as 5.0, not as a
        // bare 5 beside a "/ 5" that then reads as a fraction.
        $this->published();
        foreach (range(1, 4) as $i) {
            $this->review(['is_featured' => $i === 1]);
        }

        $this->assertStringContainsString('5.0', $this->body());
    }

    public function test_the_distribution_widths_travel_in_the_nonced_block_not_a_style_attribute(): void
    {
        // style-src carries a nonce for style ELEMENTS only; a style attribute
        // is refused by the same policy, so per-tenant percentages have to be
        // custom properties in a nonced block.
        $this->published();
        foreach (range(1, 4) as $i) {
            $this->review(['is_featured' => $i === 1]);
        }

        $body = $this->body();

        $this->assertMatchesRegularExpression('/--pct:\s*100%/', $body);
        $this->assertDoesNotMatchRegularExpression('/\sstyle="/i', $body);

        // And it is nonced, like every other style element on the page. An
        // un-nonced block is refused by style-src and the histogram would draw
        // every bar at the 0% fallback rather than not draw at all, which is
        // the kind of failure nobody notices in review.
        $this->assertMatchesRegularExpression('/<style nonce="[A-Za-z0-9]+">\s*\.rp-reviews/', $body);
    }

    // ── the anchor the whole page points at ─────────────────────────────────

    public function test_switching_booking_off_takes_its_dead_anchors_with_it(): void
    {
        // Hotel, deliberately: this proves the tenant's OWN switch (the
        // section row's `enabled`) takes the anchors with it, which is only
        // exercised where the industry gate would otherwise let the band
        // render at all.
        $page = $this->published(industry: 'hotel');
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true]);
        $page->sections()->where('key', 'booking')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertStringNotContainsString('id="booking"', $body);
        $this->assertStringNotContainsString('href="#booking"', $body);
    }

    public function test_booking_left_on_gives_every_cta_a_live_target(): void
    {
        $this->published(industry: 'hotel');
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('id="booking"', $body);
        $this->assertGreaterThanOrEqual(3, substr_count($body, 'href="#booking"'),
            'The hero, the menu and the action bar should all reach the booking band.');
    }

    // ── booking ─────────────────────────────────────────────────────────────

    /**
     * Task 4: the booking widget asks Check-in/Check-out/Adults/Children --
     * hotel questions -- and is framed unmodified on every industry's page,
     * so PageContent::count('booking') gates the band to 'hotel'
     * (the parity half of that gate: a hotel page must not regress).
     */
    public function test_booking_is_present_for_a_hotel_page_and_carries_the_heros_anchor(): void
    {
        $this->published(industry: 'hotel');

        $body = $this->body();

        $this->assertStringContainsString('data-section="booking"', $body);
        $this->assertStringContainsString('id="booking"', $body);
    }

    /**
     * The other half of the same gate: an education tenant's page -- with the
     * booking section row itself switched ON, exactly as a template rollback
     * or a stale section row could leave it -- must never render the band or
     * frame the widget. The widget's questions (Check-in/Check-out/Adults/
     * Children) fit hotel stays, not a lesson booking, and there is no amount
     * of tenant data that should bring the band back for any other industry.
     */
    public function test_the_booking_band_is_absent_for_an_education_page_even_with_the_row_enabled(): void
    {
        $this->published(industry: 'education');
        Service::create(['organization_id' => 1, 'name' => 'Algebra', 'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Learning Co',
            'phone' => '+48 12 345 67 89', 'address' => 'ul. Sw. Tomasza 12', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringNotContainsString('data-section="booking"', $body);
        $this->assertStringNotContainsString('id="booking"', $body);
        $this->assertStringNotContainsString('booking-widget', $body);
        $this->assertDoesNotMatchRegularExpression('/<iframe[^>]+src="[^"]*\/booking-widget/i', $body);
    }

    public function test_the_booking_widget_is_framed_from_the_admin_origin_never_inlined(): void
    {
        // LandingHostGuard refuses /api/v1/booking/* and /book/{token} on this
        // host by ruling: the widget's isolation is an origin boundary. An
        // inline widget here would need that allow-list widened.
        $this->published(industry: 'hotel');

        $body = $this->body();

        $this->assertMatchesRegularExpression('/<iframe[^>]+src="[^"]*\/booking-widget/i', $body);
        $this->assertStringNotContainsString('/api/v1/booking', $body);
    }

    public function test_the_frames_source_is_one_the_pages_own_policy_permits(): void
    {
        // The one assertion that matters: whatever the template put in the
        // src, the response's own frame-src must already name it. A hardcoded
        // host, a widened path or a second copy of app.url all fail here
        // rather than in a browser console on a customer's site.
        $this->published(industry: 'hotel');

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

        preg_match('/<iframe[^>]+src="([^"]+)"/i', $response->getContent(), $frame);
        $this->assertNotEmpty($frame, 'The booking band framed nothing.');

        $src = html_entity_decode($frame[1]);
        $this->assertStringStartsWith('http', $src, 'The frame src is not absolute.');

        preg_match('/frame-src ([^;]+)/', (string) $response->headers->get('Content-Security-Policy'), $policy);
        $this->assertNotEmpty($policy, 'The response names no frame-src.');

        $permitted = collect(explode(' ', trim($policy[1])))
            ->contains(fn (string $source) => str_ends_with($source, '/')
                ? str_starts_with($src, $source)
                : str_starts_with($src, $source . '?') || $src === $source);

        $this->assertTrue($permitted, "frame-src does not permit [{$src}].");
    }

    public function test_the_phone_is_promoted_beside_the_widget_and_dials(): void
    {
        // Three design judges called this the sharpest commercial point in the
        // set. It is not decoration and it is not a footnote.
        $this->published(industry: 'hotel');
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour',
            'phone' => '+48 12 345 67 89', 'address' => 'ul. Sw. Tomasza 12', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('href="tel:+48123456789"', $body);
        $this->assertStringContainsString('rp-book__phone', $body);
    }

    public function test_a_tenant_with_no_phone_gets_no_empty_call_block(): void
    {
        $this->published(industry: 'hotel');
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour',
            'phone' => null, 'address' => 'ul. Sw. Tomasza 12', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="booking"', $body);
        $this->assertStringNotContainsString('rp-book__phone', $body);
        $this->assertStringNotContainsString('tel:', $body);
    }

    public function test_the_mobile_action_bar_carries_both_a_call_and_the_cta(): void
    {
        $this->published(industry: 'hotel');
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour',
            'phone' => '+48 12 345 67 89', 'address' => 'ul. Sw. Tomasza 12', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('rp-bar', $body);
        $this->assertStringContainsString('rp-bar__call', $body);
        $this->assertStringContainsString('rp-bar__cta', $body);
    }

    // ── the hero cta when booking cannot honour it ──────────────────────────

    /**
     * Task 4: the hero CTA's own guard is now the same two-part test the
     * section loop uses (row enabled AND has()), applied to booking first and
     * then, on an @elseif, to contact -- so an industry the booking widget
     * does not fit still gets a live button rather than a dead "#booking"
     * anchor, as long as there is somewhere honest to send it.
     */
    public function test_an_education_pages_hero_cta_falls_back_to_contact_when_booking_cannot_honour_it(): void
    {
        $this->published(industry: 'education');
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Learning Co',
            'phone' => '+48 12 345 67 89', 'address' => 'ul. Sw. Tomasza 12', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('href="#contact"', $body);
        $this->assertStringNotContainsString('href="#booking"', $body);
    }

    /** With neither band available, the button is dropped rather than dead. */
    public function test_an_education_pages_hero_cta_is_absent_when_neither_booking_nor_contact_render(): void
    {
        $this->published(industry: 'education');
        // No Property at all, so has('contact') is false too -- and the
        // fixture's own sections carry no services/team/reviews content
        // either, so nothing this test does not intend is filling the gap.

        $body = $this->body();

        $this->assertStringNotContainsString('href="#booking"', $body);
        $this->assertStringNotContainsString('href="#contact"', $body);
        $this->assertStringNotContainsString('rp-cta', $body);
    }

    // ── contact ─────────────────────────────────────────────────────────────

    private function contactable(array $attributes = []): Property
    {
        return Property::create($attributes + [
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'address' => 'ul. Sw. Tomasza 12', 'city' => 'Krakow', 'country' => 'Poland',
            'phone' => '+48 12 345 67 89', 'email' => 'hello@example.test',
            'timezone' => 'Europe/Warsaw', 'is_active' => true,
        ]);
    }

    public function test_contact_renders_the_address_the_phone_and_the_email(): void
    {
        $this->published();
        $this->contactable();

        $body = $this->body();

        $this->assertStringContainsString('data-section="contact"', $body);
        $this->assertStringContainsString('ul. Sw. Tomasza 12', $body);
        $this->assertStringContainsString('href="tel:+48123456789"', $body);
        $this->assertStringContainsString('href="mailto:hello@example.test"', $body);
    }

    public function test_the_contact_band_is_absent_with_no_address_phone_or_email(): void
    {
        // Email is one of the three overridable, publishable facts
        // ContactDetails carries, so it has to be nulled out here too, or
        // this fixture leaves a real contact fact standing and the band
        // would correctly render -- proving nothing about the "no contact at
        // all" case this test is for.
        $this->published();
        $this->contactable(['address' => null, 'phone' => null, 'email' => null]);

        $this->assertStringNotContainsString('data-section="contact"', $this->body());
    }

    /**
     * The widening this task intends: an email-only Property previously did
     * NOT render a contact band at all -- has('contact') only ever asked
     * about address and phone. An email address is exactly as publishable a
     * contact fact as either of those.
     */
    public function test_an_email_only_property_now_renders_the_contact_band(): void
    {
        $this->published();
        $this->contactable(['address' => null, 'phone' => null]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="contact"', $body);
        $this->assertStringContainsString('href="mailto:hello@example.test"', $body);
    }

    public function test_the_map_tile_is_an_outbound_link_not_a_third_party_frame(): void
    {
        // frame-src names six admin-host widget paths and nothing else. A map
        // is an outbound navigation, which is not a subresource, so the tile
        // is ours and the link leaves.
        $this->published();
        $this->contactable();

        $body = $this->body();

        $this->assertStringContainsString('https://maps.google.com/?q=', $body);
        $this->assertStringContainsString('rel="noopener"', $body);
        $this->assertStringNotContainsString('google.com/maps/embed', $body);
    }

    public function test_the_hours_ledger_names_every_day_and_says_closed_out_loud(): void
    {
        $this->published();
        $this->contactable();
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1, 'widget_key' => 'wk-hours', 'is_active' => true,
            'business_hours' => [
                'mon' => [['open' => '09:00', 'close' => '19:00']],
                'tue' => [['open' => '09:00', 'close' => '19:00']],
                'wed' => [['open' => '09:00', 'close' => '19:00']],
                'thu' => [['open' => '09:00', 'close' => '19:00']],
                'fri' => [['open' => '09:00', 'close' => '19:00']],
                'sat' => [['open' => '10:00', 'close' => '16:00']],
            ],
        ]);

        $body = $this->body();

        $this->assertStringContainsString('rp-hours', $body);
        $this->assertStringContainsString('Monday', $body);
        $this->assertStringContainsString('09:00', $body);
        $this->assertStringContainsString('19:00', $body);
        // Sunday's key was deleted by the editor, which is how it spells
        // "closed". An em-dash would be the page declining to say so.
        $this->assertStringContainsString('Sunday', $body);
        $this->assertStringContainsString('Closed', $body);
    }

    public function test_no_hours_means_no_ledger_rather_than_an_empty_one(): void
    {
        $this->published();
        $this->contactable();

        $this->assertStringNotContainsString('rp-hours', $this->body());
    }

    public function test_a_row_that_is_neither_open_nor_closed_is_omitted_not_guessed(): void
    {
        // PageContent cannot produce this shape today — every path it has ends
        // in either a window or closed:true. The partial still has to refuse
        // it, because "unknown" is the one thing a published opening-hours
        // table must never render as a fact in either direction.
        $content = new class {
            public ?object $contact;
            public ?array $hours;
            public function has(string $key): bool { return true; }
        };
        $content->contact = (object) ['address' => 'ul. Sw. Tomasza 12', 'city' => null,
            'country' => null, 'phone' => null, 'email' => null, 'timezone' => 'UTC', 'name' => 'Glamour'];
        $content->hours = [
            ['day' => 0, 'open' => '09:00', 'close' => '19:00', 'closed' => false],
            ['day' => 1, 'open' => null, 'close' => null, 'closed' => false],
        ];

        $html = view('landing.ruled_page.sections.contact', [
            'content'  => $content,
            'copy'     => [],
            'profile'  => \App\Landing\IndustryProfile::for('beauty'),
            'sections' => collect(),
        ])->render();

        $this->assertStringContainsString('Monday', $html);
        $this->assertStringNotContainsString('Tuesday', $html);
    }

    // ── the interactive layer ───────────────────────────────────────────────

    public function test_the_template_ships_its_script_as_an_external_same_origin_file(): void
    {
        // script-src is 'self' with no nonce for scripts, which permits an
        // external same-origin file and refuses an inline block. The file
        // lives under public/ like the stylesheet, so it is served without
        // reaching Laravel and needs nothing from LandingHostGuard's list.
        $this->published();

        $body = $this->body();

        $this->assertStringContainsString('landing/ruled_page.js', $body);
        $this->assertMatchesRegularExpression('/<script[^>]+ruled_page\.js[^>]+defer/', $body);
        $this->assertFileExists(public_path('landing/ruled_page.js'));
    }

    public function test_the_reading_spine_has_something_to_fill(): void
    {
        $this->published();

        $this->assertStringContainsString('class="rule-progress"', $this->body());
    }

    public function test_the_reviews_track_announces_itself_and_its_items(): void
    {
        // The index row is built by the script, so these are the parts that
        // have to be true with the script blocked as well as with it running.
        $this->published();
        $this->review();
        $this->review(['is_featured' => true]);

        $body = $this->body();

        $this->assertStringContainsString('aria-roledescription="carousel"', $body);
        $this->assertStringContainsString('aria-label="Review 1 of 2"', $body);
        $this->assertStringContainsString('aria-label="Review 2 of 2"', $body);
    }

    // ── the trailing shot plates (Task 7: the pillar rebuild) ───────────────

    public function test_a_row_with_a_photograph_carries_its_trailing_shot_plate(): void
    {
        // The shot travels ON its own row — the row takes the --shot
        // modifier (the third grid column exists only where a plate does)
        // and exactly the rows with images render one.
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true, 'image' => '/storage/a.jpg']);
        Service::create(['organization_id' => 1, 'name' => 'Massage', 'is_active' => true]);

        $body = $this->body();

        $this->assertStringContainsString('class="rp-pillar rp-pillar--shot"', $body);
        $this->assertSame(1, substr_count($body, 'rp-pillar__shot"'),
            'Exactly the one row with a photograph should carry a shot plate.');
        $this->assertStringNotContainsString('rp-services__plate', $body,
            'The old sticky preview-plate column must not come back.');
    }

    public function test_service_photography_survives_on_mobile(): void
    {
        // Task 7: the old desktop sticky plate / mobile thumb split is gone —
        // the trailing shot plate IS the presentation at every width, one
        // markup, and no media rule may ever hide it (the same house
        // mobile-parity rule the hero image test enforces). Each photograph
        // therefore appears exactly ONCE, and rows without one render no
        // monogram stand-in.
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true, 'image' => '/storage/a.jpg']);
        Service::create(['organization_id' => 1, 'name' => 'Massage', 'is_active' => true, 'image' => '/storage/b.jpg']);
        Service::create(['organization_id' => 1, 'name' => 'Consultation', 'is_active' => true]);

        $body = $this->body();

        $this->assertSame(2, substr_count($body, 'rp-pillar__shot"'),
            'Exactly the two rows with photographs should carry shot plates.');
        $this->assertSame(1, substr_count($body, '/storage/a.jpg'));
        $this->assertSame(1, substr_count($body, '/storage/b.jpg'));

        // The parity half, grep-level (no layout engine here): nothing in
        // the stylesheet may hide the shot plate at any width.
        $css = file_get_contents(public_path('landing/ruled_page.css'));
        $this->assertDoesNotMatchRegularExpression(
            '/\.rp-pillar__shot[^{]*\{[^}]*display:\s*none/',
            $css,
            'A rule hides the service photography — the shot plate must survive every viewport.'
        );
    }

    // ── the contact band's columns ──────────────────────────────────────────

    public function test_a_tenant_with_a_phone_and_no_address_gets_no_empty_map_column(): void
    {
        // has('contact') is true on an address OR a phone, so this is
        // reachable, and it used to leave a third of an ink band holding
        // nothing at all.
        $this->published();
        $this->contactable(['address' => null, 'city' => null, 'country' => null]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="contact"', $body);
        $this->assertStringNotContainsString('rp-map', $body);
        $this->assertStringNotContainsString('maps.google.com', $body);
    }
}
