<?php
namespace Tests\Feature\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewSubmission;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\URL;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * A landing page is built for a business that has no website of its own —
 * being findable in search is the entire point, which is why this template
 * is server-rendered Blade rather than a client-rendered SPA. These tests
 * hold that promise to its structured-data half: title, description, Open
 * Graph tags, and a LocalBusiness (or industry subtype) JSON-LD block that
 * actually parses and carries the fields it claims to.
 *
 * landing_pages has a unique (organization_id, brand_id) index, so every
 * test that needs its own page uses a distinct brand_id.
 */
class LandingSeoTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(int $brandId, string $slug, string $industry = 'beauty'): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => $brandId, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'The Art of Wellness']],
        ]);
        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }
        return $page;
    }

    private function body(LandingPage $page): string
    {
        return $this->get('http://' . config('landing.host') . '/' . $page->slug)->getContent();
    }

    /**
     * Pulls the JSON-LD payload out of the rendered page and decodes it, so
     * assertions run against the parsed structure rather than a substring —
     * a substring match cannot tell "the field is present and correct" from
     * "the field's name happens to appear somewhere in the HTML".
     */
    private function jsonLd(string $body): array
    {
        $this->assertSame(
            1,
            preg_match('#<script type="application/ld\+json"[^>]*>(.*?)</script>#s', $body, $m),
            'No application/ld+json script block found in the rendered page.'
        );

        $data = json_decode(trim($m[1]), true);
        $this->assertIsArray($data, 'The JSON-LD block did not decode to an array: ' . json_last_error_msg());

        return $data;
    }

    public function test_it_emits_local_business_structured_data(): void
    {
        // Being findable is the entire point for a business with no website.
        // Industry 'other' carries no industry-specific schema.org subtype
        // (see test_the_schema_type_matches_the_pages_industry below for the
        // ones that do), so the literal @type asserted here is the generic
        // fallback. A Property with a name is required: a nameless node is
        // suppressed entirely (test_the_json_ld_block_is_suppressed_when_
        // there_is_no_property), so the happy path needs an actual name.
        $page = $this->published(1, 'glamour-salon', 'other');
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon', 'is_active' => true,
        ]);

        $body = $this->body($page);

        $this->assertStringContainsString('"@type":"LocalBusiness"', $body);
        $this->assertStringContainsString('application/ld+json', $body);
    }

    public function test_a_preview_is_not_indexable(): void
    {
        $page = $this->published(2, 'preview-target');
        $url  = URL::signedRoute('landing.preview', ['page' => $page->id]);

        $this->get($url)->assertHeader('X-Robots-Tag', 'noindex');
    }

    public function test_the_json_ld_block_carries_the_contact_propertys_fields(): void
    {
        $page = $this->published(3, 'contact-fields');
        Property::create([
            'organization_id' => 1, 'brand_id' => 3, 'name' => 'Glamour & Co',
            'address' => '12 High Street', 'city' => 'Leeds', 'country' => 'GB',
            'phone' => '+44 113 000 0000', 'email' => 'hello@glamour.test',
            'is_active' => true,
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertSame('https://schema.org', $data['@context']);
        // 'beauty' (this fixture's industry) has its own subtype — see
        // test_the_schema_type_matches_the_pages_industry for the mapping.
        $this->assertSame('BeautySalon', $data['@type']);
        $this->assertSame('Glamour & Co', $data['name']);
        $this->assertSame('+44 113 000 0000', $data['telephone']);
        $this->assertSame('hello@glamour.test', $data['email']);
        $this->assertSame('PostalAddress', $data['address']['@type']);
        $this->assertSame('12 High Street', $data['address']['streetAddress']);
        $this->assertSame('Leeds', $data['address']['addressLocality']);
        $this->assertSame('GB', $data['address']['addressCountry']);
    }

    /**
     * A LocalBusiness with no name is the same fabrication as "name": null
     * one level down — Google's structured data tooling reports "Missing
     * field 'name'" on it, and url/description alone do not make it a real
     * business. The whole block is omitted rather than publishing a hollow
     * node.
     */
    public function test_the_json_ld_block_is_suppressed_when_there_is_no_property(): void
    {
        $page = $this->published(4, 'no-contact');

        $this->assertStringNotContainsString('application/ld+json', $this->body($page));
    }

    /**
     * A whitespace-only name is not a name: blank(), not a bare truthiness
     * check, is what decides "does this page have an identity", so " " is
     * treated exactly like null rather than surviving as a published name.
     */
    public function test_a_whitespace_only_name_is_also_suppressed(): void
    {
        $page = $this->published(20, 'blank-name');
        Property::create([
            'organization_id' => 1, 'brand_id' => 20, 'name' => '   ', 'is_active' => true,
        ]);

        $this->assertStringNotContainsString('application/ld+json', $this->body($page));
    }

    /**
     * array_filter() with no callback treats a business literally named "0"
     * as falsy and drops it, while <title> (a plain ?? chain that only
     * treats null as absent) would still print "0" — the page and its own
     * structured data would disagree about the business's name. filled()
     * fixes that: "0" is not blank, so it survives.
     */
    public function test_a_literal_zero_business_name_survives_filtering(): void
    {
        $page = $this->published(19, 'zero-name');
        Property::create([
            'organization_id' => 1, 'brand_id' => 19, 'name' => '0', 'is_active' => true,
        ]);

        $body = $this->body($page);

        $this->assertStringContainsString('<title>0</title>', $body);
        $this->assertSame('0', $this->jsonLd($body)['name']);
    }

    /**
     * A Property that exists but has no address fields filled must not
     * publish a bare {"@type":"PostalAddress"} with nothing else in it —
     * that is exactly as much of a fabrication as "name": null.
     */
    public function test_an_empty_address_is_omitted_entirely_not_published_bare(): void
    {
        $page = $this->published(9, 'no-address-fields');
        Property::create([
            'organization_id' => 1, 'brand_id' => 9, 'name' => 'No Fixed Address Ltd',
            'is_active' => true,
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertSame('No Fixed Address Ltd', $data['name']);
        $this->assertArrayNotHasKey('address', $data);
    }

    /**
     * @json encodes with JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_AMP|JSON_HEX_QUOT,
     * so a business name carrying a literal `</script>` cannot close the
     * element early and smuggle a second script tag onto the page. This is
     * the one test in this file that would fail if the block were ever
     * hand-built instead of run through @json.
     */
    public function test_a_business_name_containing_a_script_close_tag_cannot_break_out(): void
    {
        $page = $this->published(5, 'xss-name');
        Property::create([
            'organization_id' => 1, 'brand_id' => 5,
            'name' => 'Evil</script><script>alert(1)</script>',
            'is_active' => true,
        ]);

        $body = $this->body($page);

        $this->assertStringNotContainsString('<script>alert(1)</script>', $body);
        $this->assertStringNotContainsString('</script><script>', $body);

        // And the value still round-trips correctly for the legitimate reader.
        $data = $this->jsonLd($body);
        $this->assertSame('Evil</script><script>alert(1)</script>', $data['name']);
    }

    /**
     * hours come from ChatWidgetConfig.business_hours via PageContent, not
     * from Property. A day absent, blank, or explicitly closed must be
     * omitted from openingHoursSpecification rather than guessed at.
     */
    public function test_opening_hours_specification_reflects_business_hours(): void
    {
        $page = $this->published(6, 'hours-page');
        Property::create([
            'organization_id' => 1, 'brand_id' => 6, 'name' => 'Hours Co', 'is_active' => true,
        ]);
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 6, 'widget_key' => 'wk-hours',
            'is_active' => true,
            'business_hours' => [
                'mon' => [['open' => '09:00', 'close' => '17:00']],
                'tue' => [['open' => '09:00', 'close' => '17:00']],
                // wed: absent entirely -> closed.
                'thu' => [['open' => '', 'close' => '']],   // blank times -> closed.
                'fri' => [['open' => '09:00', 'close' => '18:00']],
                'sat' => [],                                 // empty array -> closed.
                // sun: absent entirely -> closed.
            ],
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertArrayHasKey('openingHoursSpecification', $data);
        $spec = $data['openingHoursSpecification'];

        $this->assertCount(3, $spec, 'Only Monday, Tuesday and Friday were configured open.');

        $days = collect($spec)->pluck('dayOfWeek')->map(
            fn ($d) => trim(str_replace('https://schema.org/', '', $d))
        )->all();

        $this->assertEqualsCanonicalizing(['Monday', 'Tuesday', 'Friday'], $days);

        foreach ($spec as $row) {
            $this->assertSame('OpeningHoursSpecification', $row['@type']);
            $this->assertNotNull($row['opens']);
            $this->assertNotNull($row['closes']);
        }

        $friday = collect($spec)->first(fn ($r) => str_contains($r['dayOfWeek'], 'Friday'));
        $this->assertSame('09:00', $friday['opens']);
        $this->assertSame('18:00', $friday['closes']);
    }

    /** For a business with no website, this page IS the url. */
    public function test_the_json_ld_block_carries_the_canonical_url(): void
    {
        $page = $this->published(15, 'url-page');
        Property::create([
            'organization_id' => 1, 'brand_id' => 15, 'name' => 'Url Co', 'is_active' => true,
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertSame('http://' . config('landing.host') . '/url-page', $data['url']);
    }

    public function test_the_json_ld_block_carries_the_seo_description(): void
    {
        $page = $this->published(16, 'desc-page');
        Property::create([
            'organization_id' => 1, 'brand_id' => 16, 'name' => 'Desc Co', 'is_active' => true,
        ]);
        $page->update(['seo' => ['description' => 'A calm, considered salon.']]);

        $data = $this->jsonLd($this->body($page));

        $this->assertSame('A calm, considered salon.', $data['description']);
    }

    /**
     * aggregateRating and review are gated on the exact same switch the
     * visible reviews band already renders its own aggregate behind:
     * PageContent::MIN_REVIEWS_FOR_AGGREGATE (4) ratings, org-wide.
     */
    public function test_aggregate_rating_and_reviews_appear_at_four_or_more_ratings(): void
    {
        $page = $this->published(17, 'rated-page');
        Property::create([
            'organization_id' => 1, 'brand_id' => 17, 'name' => 'Rated Co', 'is_active' => true,
        ]);

        // PageContent orders featured reviews by submitted_at DESC, so the
        // "Alex" review (index 0, the one asserted on below) is given the
        // most recent timestamp — otherwise all four sharing "now()" would
        // tie-break on id DESC and the last-created row would sort first.
        foreach ([5, 4, 5, 3] as $i => $rating) {
            ReviewSubmission::create([
                'organization_id' => 1,
                'overall_rating' => $rating,
                'comment' => "Review number {$i}",
                'anonymous_name' => $i === 0 ? 'Alex' : null,
                'is_featured' => true,
                'submitted_at' => now()->subMinutes($i),
            ]);
        }

        $data = $this->jsonLd($this->body($page));

        $this->assertArrayHasKey('aggregateRating', $data);
        $this->assertSame('AggregateRating', $data['aggregateRating']['@type']);
        $this->assertSame(4, $data['aggregateRating']['reviewCount']);
        $this->assertEqualsWithDelta(4.25, $data['aggregateRating']['ratingValue'], 0.01);
        $this->assertSame(5, $data['aggregateRating']['bestRating']);
        $this->assertSame(1, $data['aggregateRating']['worstRating']);

        $this->assertArrayHasKey('review', $data);
        $this->assertCount(4, $data['review']);
        $this->assertSame('Review', $data['review'][0]['@type']);
        $this->assertSame('Alex', $data['review'][0]['author']['name']);
        $this->assertSame('Person', $data['review'][0]['author']['@type']);
        $this->assertSame('Review number 0', $data['review'][0]['reviewBody']);
        $this->assertSame(5, $data['review'][0]['reviewRating']['ratingValue']);

        // A review with no anonymous_name still gets a name, not a
        // fabricated one — matches sections/reviews.blade.php exactly.
        $this->assertSame('Verified client', $data['review'][1]['author']['name']);
    }

    public function test_aggregate_rating_and_reviews_are_both_absent_below_four_ratings(): void
    {
        $page = $this->published(18, 'unrated-page');
        Property::create([
            'organization_id' => 1, 'brand_id' => 18, 'name' => 'Unrated Co', 'is_active' => true,
        ]);

        ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Great!',
            'anonymous_name' => 'Sam', 'is_featured' => true, 'submitted_at' => now(),
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertArrayNotHasKey('aggregateRating', $data);
        $this->assertArrayNotHasKey('review', $data);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function industryProvider(): array
    {
        return [
            'beauty maps to BeautySalon'      => ['beauty', 'BeautySalon'],
            'medical maps to MedicalBusiness' => ['medical', 'MedicalBusiness'],
            'restaurant maps to Restaurant'   => ['restaurant', 'Restaurant'],
            'hotel maps to LodgingBusiness'   => ['hotel', 'LodgingBusiness'],
            // Not a GTM industry (Organization::GTM_INDUSTRIES) yet — the
            // abstraction falls back to the generic type rather than a guess.
            'fitness has no subtype yet'      => ['fitness', 'LocalBusiness'],
        ];
    }

    /** @dataProvider industryProvider */
    public function test_the_schema_type_matches_the_pages_industry(string $industry, string $expectedType): void
    {
        $page = $this->published(10, 'schema-type-' . $industry, $industry);
        Property::create([
            'organization_id' => 1, 'brand_id' => 10, 'name' => 'Business Co', 'is_active' => true,
        ]);

        $data = $this->jsonLd($this->body($page));

        $this->assertSame($expectedType, $data['@type']);
    }

    public function test_open_graph_tags_describe_the_page(): void
    {
        $page = $this->published(7, 'og-page');
        $page->update(['seo' => ['title' => 'Glamour Salon Leeds', 'description' => 'A calm, considered salon.']]);

        $body = $this->body($page);

        $this->assertStringContainsString('<meta property="og:title" content="Glamour Salon Leeds">', $body);
        $this->assertStringContainsString('<meta property="og:type" content="website">', $body);
        $this->assertStringContainsString(
            '<meta property="og:url" content="http://' . config('landing.host') . '/og-page">',
            $body
        );
    }

    /**
     * <title> is the tag Google actually shows in results, so it must not
     * lag behind og:title's fallback chain. It did, for one round: og:title
     * fell back to the hero headline while <title> fell straight to
     * config('app.name'), so a beauty salon with a hero headline and no
     * Property rendered <title>HotelLoyalty</title> while og:title read
     * "The Art of Wellness" — a real white-label leak on APP_NAME. Both tags
     * now share one fallback chain (seo title -> Property name -> hero
     * headline -> config('app.name')), and this asserts on both together so
     * they cannot drift apart again without this test catching it.
     */
    public function test_title_and_og_title_both_fall_back_to_the_heros_headline_before_the_site_name(): void
    {
        $body = $this->body($this->published(8, 'bare-og'));

        $this->assertStringContainsString('<title>The Art of Wellness</title>', $body);
        $this->assertStringContainsString(
            '<meta property="og:title" content="The Art of Wellness">',
            $body
        );
    }

    /** Only once seo title, Property name, AND a hero headline are all absent. */
    public function test_title_and_og_title_both_fall_back_to_the_site_name_only_as_a_last_resort(): void
    {
        $page = $this->published(21, 'truly-bare-og');
        $page->update(['content' => []]);

        $body = $this->body($page);

        $this->assertStringContainsString('<title>' . e(config('app.name')) . '</title>', $body);
        $this->assertStringContainsString(
            '<meta property="og:title" content="' . e(config('app.name')) . '">',
            $body
        );
    }

    /**
     * schemaType() must not inherit the vocabulary fallback: an unresolved
     * industry ('' or 'garbage') falls through to DEFAULT_INDUSTRY ('hotel')
     * for VOCABULARY, but publishing LodgingBusiness for a business that was
     * never identified as a hotel is a false claim to Google, not a graceful
     * degrade. Decoded end to end for '', 'garbage', and a real industry so
     * the contrast is explicit: only the real one gets a subtype.
     */
    public function test_an_unresolved_industry_publishes_the_generic_type_not_a_guess(): void
    {
        $cases = [
            'empty industry'   => ['', 30, 'unresolved-empty'],
            'garbage industry' => ['garbage', 31, 'unresolved-garbage'],
        ];

        foreach ($cases as $label => [$industry, $brandId, $slug]) {
            $page = $this->published($brandId, $slug, $industry);
            Property::create([
                'organization_id' => 1, 'brand_id' => $brandId, 'name' => 'Business Co', 'is_active' => true,
            ]);

            $data = $this->jsonLd($this->body($page));

            $this->assertSame('LocalBusiness', $data['@type'], "[{$label}] did not publish the generic type.");
        }

        // The contrast: a genuinely resolved industry still gets its subtype.
        $page = $this->published(32, 'resolved-industry', 'beauty');
        Property::create([
            'organization_id' => 1, 'brand_id' => 32, 'name' => 'Resolved Co', 'is_active' => true,
        ]);

        $this->assertSame('BeautySalon', $this->jsonLd($this->body($page))['@type']);
    }
}
