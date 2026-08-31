<?php
namespace Tests\Feature\Landing;

use App\Landing\PageContent;
use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class PageContentTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();   // services, service_masters, review_submissions, properties
    }

    /**
     * $brandId is nullable because a landing page's brand_id is: the column
     * is explicitly nullable in the migration, its unique index deliberately
     * allows one brandless page per org, and a page created in "All brands"
     * mode (app('current_brand_id') === null) is exactly that. A non-nullable
     * int here made the brandless case unconstructible, which is why the
     * ordering bug on it went unnoticed for a round.
     */
    private function page(int $orgId = 1, ?int $brandId = 1): LandingPage
    {
        return LandingPage::create([
            'organization_id' => $orgId, 'brand_id' => $brandId,
            'slug' => 'org-' . $orgId . '-brand-' . ($brandId ?? 'none'),
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
        ]);
    }

    public function test_it_never_returns_another_tenants_services(): void
    {
        // The worst failure available here: one salon's page listing another
        // salon's treatments and prices.
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',   'is_active' => true, 'price' => 40]);
        Service::create(['organization_id' => 2, 'brand_id' => 1, 'name' => 'Theirs', 'is_active' => true, 'price' => 50]);

        $content = PageContent::for($this->page(1));

        $this->assertSame(['Ours'], $content->services->pluck('name')->all());
    }

    public function test_inactive_services_are_not_advertised(): void
    {
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Live',    'is_active' => true,  'price' => 40]);
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Retired', 'is_active' => false, 'price' => 40]);

        $this->assertSame(['Live'], PageContent::for($this->page(1))->services->pluck('name')->all());
    }

    public function test_services_sharing_the_default_sort_order_are_tie_broken_by_name(): void
    {
        // sort_order defaults to 0 for every service nobody has manually
        // reordered, so without a tiebreak the public order is whatever the
        // database happens to return - not the order the admin list (and so
        // the tenant) actually arranged. 'Zebra' is created first so a bare
        // insertion-order return would show it before 'Aardvark'; only a
        // real name tiebreak sorts them the other way.
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Zebra Facial',  'is_active' => true, 'sort_order' => 0]);
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Aardvark Wax',   'is_active' => true, 'sort_order' => 0]);

        $this->assertSame(
            ['Aardvark Wax', 'Zebra Facial'],
            PageContent::for($this->page(1))->services->pluck('name')->all()
        );
    }

    public function test_team_sharing_the_default_sort_order_are_tie_broken_by_name(): void
    {
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Zoe Stylist',   'is_active' => true, 'sort_order' => 0]);
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Amir Stylist',  'is_active' => true, 'sort_order' => 0]);

        $this->assertSame(
            ['Amir Stylist', 'Zoe Stylist'],
            PageContent::for($this->page(1))->team->pluck('name')->all()
        );
    }

    public function test_services_beyond_the_cap_are_not_rendered(): void
    {
        // A 300-item catalogue rendering in full on a public marketing page
        // is not a menu, it's a directory dump.
        for ($i = 0; $i < PageContent::MAX_SERVICES + 5; $i++) {
            Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => "Service {$i}",
                'is_active' => true, 'sort_order' => $i]);
        }

        $this->assertCount(PageContent::MAX_SERVICES, PageContent::for($this->page(1))->services);
    }

    public function test_team_beyond_the_cap_are_not_rendered(): void
    {
        for ($i = 0; $i < PageContent::MAX_TEAM + 5; $i++) {
            ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => "Member {$i}",
                'is_active' => true, 'sort_order' => $i]);
        }

        $this->assertCount(PageContent::MAX_TEAM, PageContent::for($this->page(1))->team);
    }

    public function test_only_featured_reviews_are_shown(): void
    {
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Chosen', 'is_featured' => true, 'submitted_at' => now()]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 1,
            'comment' => 'Complaint', 'submitted_at' => now()]);
        // A featured review belonging to a different tenant entirely. The
        // previous version of this suite only proved reviews were filtered
        // by is_featured, never that they were filtered by organization_id
        // at all - a mutation test caught that gap.
        ReviewSubmission::create(['organization_id' => 2, 'overall_rating' => 5,
            'comment' => 'Sibling org', 'is_featured' => true, 'submitted_at' => now()]);

        $this->assertSame(['Chosen'], PageContent::for($this->page(1))->reviews->pluck('comment')->all());
    }

    public function test_it_never_returns_another_tenants_team(): void
    {
        // Same worst-failure shape as services, proven the same way: a
        // mutation test found this was previously unproven because every
        // ServiceMaster row in the suite belonged to organization_id 1.
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'is_active' => true]);
        ServiceMaster::create(['organization_id' => 2, 'brand_id' => 1, 'name' => 'Theirs',
            'is_active' => true]);

        $content = PageContent::for($this->page(1));

        $this->assertSame(['Ours'], $content->team->pluck('name')->all());
    }

    public function test_a_featured_review_with_no_submitted_at_sorts_last_not_first(): void
    {
        // submitted_at is nullable, and an unqualified DESC order sorts NULLs
        // first on Postgres. A review that reached is_featured through an
        // import or a backfill rather than the public submit path would then
        // pin itself to the top of the list forever.
        //
        // This assertion does NOT prove the fix on this suite's engine: sqlite
        // sorts NULLs last in DESC by default - the opposite of Postgres - so
        // it passes identically whether or not orderByRaw('submitted_at is
        // null') is even present. It stays because it documents the intent
        // and would catch a regression on a Postgres-run suite. The test
        // below it is the one that actually fails here if that line is
        // removed.
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Imported', 'is_featured' => true, 'submitted_at' => null]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Recent', 'is_featured' => true, 'submitted_at' => now()]);

        $this->assertSame(
            ['Recent', 'Imported'],
            PageContent::for($this->page(1))->reviews->pluck('comment')->all()
        );
    }

    public function test_the_featured_reviews_query_orders_nulls_last_in_sql(): void
    {
        // White-box, on purpose. sqlite's own NULL-ordering default makes the
        // behavioural test above pass with or without the fix, so it is not a
        // regression guard on this engine. This inspects the compiled SQL
        // directly instead: it is the one assertion that actually fails here
        // if orderByRaw('submitted_at is null') is deleted or altered, on
        // either engine.
        DB::enableQueryLog();

        PageContent::for($this->page(1));

        $sql = collect(DB::getQueryLog())
            ->pluck('query')
            ->first(fn (string $query) => str_contains($query, 'review_submissions'));

        DB::flushQueryLog();

        $this->assertNotNull($sql, 'expected a query against review_submissions to be logged');
        $this->assertStringContainsString('submitted_at is null', $sql);
    }

    public function test_featured_reviews_sharing_a_submitted_at_are_tie_broken_by_id(): void
    {
        $same = now();
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'First', 'is_featured' => true, 'submitted_at' => $same]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Second', 'is_featured' => true, 'submitted_at' => $same]);

        $this->assertSame(
            ['Second', 'First'],
            PageContent::for($this->page(1))->reviews->pluck('comment')->all()
        );
    }

    public function test_reviews_with_an_empty_string_comment_are_excluded(): void
    {
        // whereNotNull('comment') admits '' - an empty string is not null.
        // has('reviews') would then report true and a template would render
        // a blank testimonial card for this row.
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => '', 'is_featured' => true, 'submitted_at' => now()]);

        $content = PageContent::for($this->page(1));

        $this->assertSame([], $content->reviews->pluck('comment')->all());
        $this->assertFalse($content->has('reviews'));
    }

    public function test_the_aggregate_counts_every_review_not_only_featured_ones(): void
    {
        // Showing "4.9 from 2 reviews" while hiding thirty poor ones would be
        // a fabricated aggregate. The score is computed over everything.
        foreach ([5, 5, 4, 1, 2] as $i => $rating) {
            ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => $rating,
                'comment' => 'c' . $i, 'is_featured' => $rating === 5, 'submitted_at' => now()]);
        }

        // A different tenant's review with a rating that would visibly shift
        // the count and average if the aggregate ever lost its org filter.
        ReviewSubmission::create(['organization_id' => 2, 'overall_rating' => 1,
            'comment' => 'sibling-org', 'is_featured' => true, 'submitted_at' => now()]);

        $stats = PageContent::for($this->page(1))->reviewStats;

        $this->assertSame(5, $stats['count']);
        $this->assertSame(3.4, round($stats['average'], 1));
    }

    public function test_the_aggregate_is_suppressed_below_four_reviews(): void
    {
        // A distribution drawn from three rows is misleading, and the first
        // week is exactly when the temptation to show one is strongest.
        foreach ([5, 5, 4] as $i => $rating) {
            ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => $rating,
                'comment' => 'c' . $i, 'is_featured' => true, 'submitted_at' => now()]);
        }

        $this->assertNull(PageContent::for($this->page(1))->reviewStats);
    }

    public function test_the_aggregate_does_not_hydrate_one_model_per_review_row(): void
    {
        // The aggregate is computed over EVERY review the organisation
        // holds, on an UNAUTHENTICATED page, once per hit. Eloquent's
        // pluck() on a column carrying a cast - overall_rating is
        // 'integer' - takes the newFromBuilder() path and builds one model
        // per ROW, so the cost of rendering /{slug} grew forever with review
        // volume: 17.6ms at 10 rows, 984.9ms at 50k (~975ms of it pure PHP),
        // 2.2s at 100k. throttle:120,1 is per-IP and /{slug}?cb=<random>
        // defeats the CDN, so that is lawfully minutes of PHP per minute per
        // IP against one tenant. The aggregate must run DB-side.
        //
        // Hydration is counted rather than timed: newFromBuilder() fires
        // `retrieved` exactly once per model, so this measures the thing
        // that actually grew, and cannot go flaky on a loaded machine the
        // way a wall-clock budget would.
        $rows = [];
        for ($i = 0; $i < 3000; $i++) {
            $rows[] = [
                'organization_id' => 1,
                'overall_rating'  => ($i % 5) + 1,
                'comment'         => 'c' . $i,
                // Not featured, so the twelve-row testimonial query returns
                // nothing and every model counted here is one the AGGREGATE
                // built.
                'is_featured'     => false,
                'submitted_at'    => now(),
                'created_at'      => now(),
                'updated_at'      => now(),
            ];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('review_submissions')->insert($chunk);
        }

        $hydrated = 0;
        ReviewSubmission::retrieved(function () use (&$hydrated) { $hydrated++; });

        $stats = PageContent::for($this->page(1))->reviewStats;

        // The published shape must be identical to what the per-row version
        // returned - this is a cost fix, not a behaviour change.
        $this->assertSame(3000, $stats['count']);
        $this->assertSame(3.0, $stats['average']);
        $this->assertSame([1 => 600, 2 => 600, 3 => 600, 4 => 600, 5 => 600], $stats['distribution']);

        // Twelve is the featured-testimonial cap: a constant, not a
        // multiple of the row count. Per-row hydration scores 3000 here;
        // the DB-side aggregate scores 0.
        $this->assertLessThanOrEqual(
            12,
            $hydrated,
            "Rendering the aggregate hydrated {$hydrated} ReviewSubmission models for 3000 rows; "
            . 'it must not build a model per row.'
        );
    }

    public function test_the_aggregate_ignores_out_of_range_ratings_in_its_distribution(): void
    {
        // The distribution has always carried exactly the keys 1..5, and a
        // rating outside that range counts toward the total and the average
        // but has no bar to sit in. A DB-side GROUP BY must not start
        // publishing a sixth key, and must not drop the row from count.
        foreach ([5, 4, 3, 9] as $i => $rating) {
            ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => $rating,
                'comment' => 'c' . $i, 'is_featured' => false, 'submitted_at' => now()]);
        }

        $stats = PageContent::for($this->page(1))->reviewStats;

        // Narrowing the TOTALS to 1..5 as well as the histogram is the
        // obvious way to write this and the wrong one: it drops the fourth
        // row, falls under MIN_REVIEWS_FOR_AGGREGATE and suppresses the
        // whole aggregate. Named rather than left to a null-offset notice.
        $this->assertIsArray($stats, 'An out-of-range rating suppressed the aggregate entirely.');
        $this->assertSame(4, $stats['count']);
        $this->assertSame(5.25, $stats['average']);
        $this->assertSame([1 => 0, 2 => 0, 3 => 1, 4 => 1, 5 => 1], $stats['distribution']);
    }

    public function test_a_section_with_no_data_reports_no_data(): void
    {
        $content = PageContent::for($this->page(1));

        $this->assertFalse($content->has('services'));
        $this->assertFalse($content->has('team'));
        $this->assertFalse($content->has('reviews'));
    }

    public function test_it_never_leaks_another_tenants_hours_or_contact(): void
    {
        // Same worst-failure shape as services: a page publishing a
        // different tenant's opening hours, address, or phone number. Both
        // rows share brand_id 1 on purpose: if either query ever lost its
        // organization_id filter, the brand filter alone would still match
        // org 2's row, and an unordered first() could return it.
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1,
            'business_hours' => ['mon' => [['open' => '09:00', 'close' => '17:00']]]]);
        ChatWidgetConfig::create(['organization_id' => 2, 'brand_id' => 1,
            'business_hours' => ['mon' => [['open' => '00:00', 'close' => '23:59']]]]);

        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'phone' => '111', 'address' => 'Our street', 'is_active' => true]);
        Property::create(['organization_id' => 2, 'brand_id' => 1, 'name' => 'Theirs',
            'phone' => '222', 'address' => 'Their street', 'is_active' => true]);

        $content = PageContent::for($this->page(1));

        $this->assertSame('111', $content->contact?->phone);
        $this->assertSame('09:00', $content->hours[0]['open']);
    }

    public function test_it_never_leaks_another_tenants_hours_or_contact_when_its_own_org_has_none(): void
    {
        // A stronger, order-independent version of the test above: org 1
        // (the page under test) has no config or property at all. Org 2
        // does, and shares the same brand_id. If either query lost its
        // organization_id filter, org 2's row is the ONLY row matching the
        // brand filter, so it would leak through deterministically rather
        // than by lucky insertion order.
        ChatWidgetConfig::create(['organization_id' => 2, 'brand_id' => 1,
            'business_hours' => ['mon' => [['open' => '00:00', 'close' => '23:59']]]]);
        Property::create(['organization_id' => 2, 'brand_id' => 1, 'name' => 'Theirs',
            'phone' => '222', 'address' => 'Their street', 'is_active' => true]);

        $content = PageContent::for($this->page(1));

        // $content->contact is always a ContactDetails instance now (there
        // is no Property to leak, and no page-level override either), so
        // the no-leak assertion is on its fields rather than on the object
        // itself being null.
        $this->assertNull($content->contact->phone);
        $this->assertNull($content->contact->address);
        $this->assertNull($content->contact->name);
        $this->assertNull($content->hours);
    }

    public function test_it_never_returns_a_sibling_brands_services_team_contact_or_hours(): void
    {
        // A multi-brand tenant gets one page per brand. A page for brand 1
        // must never publish brand 2's price list, staff, location, or
        // opening hours.
        Service::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'is_active' => true, 'price' => 40]);
        Service::create(['organization_id' => 1, 'brand_id' => 2, 'name' => 'Sibling',
            'is_active' => true, 'price' => 50]);

        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Our Stylist',
            'is_active' => true]);
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => 2, 'name' => 'Sibling Stylist',
            'is_active' => true]);

        // Sibling created first on purpose: with orderBy('id'), creating
        // "Our Site" first would make this assertion pass on id-ordering
        // alone even if the brand filter were missing entirely. Creating
        // the sibling first means the test only passes if the brand filter
        // actually excludes it.
        Property::create(['organization_id' => 1, 'brand_id' => 2, 'name' => 'Sibling Site',
            'phone' => '222', 'address' => 'B', 'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Our Site',
            'phone' => '111', 'address' => 'A', 'is_active' => true]);

        // Same reasoning for hours: nothing previously proved this query
        // was brand-filtered at all - deleting the filter left the suite
        // green. Sibling created first, same as Property above.
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 2,
            'business_hours' => ['mon' => [['open' => '00:00', 'close' => '23:59']]]]);
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1,
            'business_hours' => ['mon' => [['open' => '09:00', 'close' => '17:00']]]]);

        $content = PageContent::for($this->page(orgId: 1, brandId: 1));

        $this->assertSame(['Ours'], $content->services->pluck('name')->all());
        $this->assertSame(['Our Stylist'], $content->team->pluck('name')->all());
        $this->assertSame('111', $content->contact?->phone);
        $this->assertSame('09:00', $content->hours[0]['open']);
    }

    public function test_contact_excludes_inactive_properties_and_picks_deterministically(): void
    {
        // A bare first() with no order is genuinely nondeterministic on
        // Postgres, and a deactivated location is publishable.
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Closed',
            'phone' => '000', 'is_active' => false]);
        $open = Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Open',
            'phone' => '999', 'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'AlsoOpen',
            'phone' => '888', 'is_active' => true]);

        $content = PageContent::for($this->page(1));

        $this->assertSame($open->phone, $content->contact?->phone);
    }

    public function test_contact_prefers_the_brands_own_property_over_an_unassigned_one(): void
    {
        // Unassigned (brand_id null) created FIRST, so plain id ordering
        // would hand this brand-1 page an unrelated, unassigned property
        // instead of its own. The brand's own row must win regardless of
        // which was created first.
        Property::create(['organization_id' => 1, 'brand_id' => null, 'name' => 'Unassigned Site',
            'phone' => '555', 'address' => 'Nowhere', 'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Brand 1 Site',
            'phone' => '111', 'address' => 'Somewhere', 'is_active' => true]);

        $content = PageContent::for($this->page(orgId: 1, brandId: 1));

        $this->assertSame('111', $content->contact?->phone);
    }

    public function test_hours_prefers_the_brands_own_config_over_an_unassigned_one(): void
    {
        // Same shape as the contact test above, and for the same reason:
        // hours() had no ordering at all, so an unassigned config could win
        // over the brand's own nondeterministically.
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => null,
            'business_hours' => ['mon' => [['open' => '00:00', 'close' => '23:59']]]]);
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1,
            'business_hours' => ['mon' => [['open' => '09:00', 'close' => '17:00']]]]);

        $hours = PageContent::for($this->page(orgId: 1, brandId: 1))->hours;

        $this->assertSame('09:00', $hours[0]['open']);
    }

    public function test_a_brandless_page_prefers_the_org_level_property(): void
    {
        // The mirror image of the two tests above, and the failure the
        // round-3 ordering introduced: a page with brand_id null belongs to
        // no brand, so scopedToBrand() applies no filter and every brand's
        // rows stay in scope. An ungated "the brand's own row first" then
        // ranked SOME brand's row above the org-level one, publishing an
        // unrelated brand's address and phone on a page that is not that
        // brand's - the sibling-brand leak, pointed the other way.
        //
        // Brand 7's row is created FIRST on purpose: plain id ordering
        // would hand it the page, so this only passes if the preference
        // itself ranks the org-level row above it.
        Property::create(['organization_id' => 1, 'brand_id' => 7, 'name' => 'Some Brand Site',
            'phone' => '777', 'address' => 'Theirs', 'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => null, 'name' => 'Org Site',
            'phone' => '555', 'address' => 'Ours', 'is_active' => true]);

        $content = PageContent::for($this->page(orgId: 1, brandId: null));

        $this->assertSame('Org Site', $content->contact?->name);
        $this->assertSame('555', $content->contact?->phone);
    }

    public function test_a_brandless_page_prefers_the_org_level_hours(): void
    {
        // Same shape as the property test above: brand 7's config created
        // first, so id ordering alone would publish brand 7's all-hours
        // week on a page that belongs to no brand.
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 7,
            'business_hours' => ['mon' => [['open' => '00:00', 'close' => '23:59']]]]);
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => null,
            'business_hours' => ['mon' => [['open' => '09:00', 'close' => '17:00']]]]);

        $hours = PageContent::for($this->page(orgId: 1, brandId: null))->hours;

        $this->assertSame('09:00', $hours[0]['open']);
        $this->assertSame('17:00', $hours[0]['close']);
    }

    public function test_hours_is_null_when_no_widget_config_exists(): void
    {
        $this->assertNull(PageContent::for($this->page(1))->hours);
    }

    public function test_hours_is_null_when_business_hours_is_empty(): void
    {
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1, 'business_hours' => []]);

        $this->assertNull(PageContent::for($this->page(1))->hours);
    }

    public function test_hours_reports_absent_and_empty_days_as_closed(): void
    {
        // Monday is configured, Tuesday is explicitly closed (empty array),
        // and Wednesday through Sunday were never touched by the venue - in
        // real data that absence means closed too, because the only writer
        // of this column (the admin editor) deletes a day's key rather than
        // ever writing an empty array. An earlier version of this ruling
        // treated an absent day as "unknown, not open"; the re-review found
        // that would silently drop a venue's explicitly-closed days (e.g.
        // Sunday) from the page instead of showing "Closed".
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1, 'business_hours' => [
            'mon' => [['open' => '09:00', 'close' => '17:00']],
            'tue' => [],
        ]]);

        $hours = PageContent::for($this->page(1))->hours;

        $this->assertCount(7, $hours);
        $this->assertSame(['day' => 0, 'open' => '09:00', 'close' => '17:00', 'closed' => false], $hours[0]);
        $this->assertSame(['day' => 1, 'open' => null, 'close' => null, 'closed' => true], $hours[1]);
        // Wednesday (index 2) was never configured: closed, same as Tuesday.
        $this->assertSame(['day' => 2, 'open' => null, 'close' => null, 'closed' => true], $hours[2]);
        // Monday-first ordering all the way through to Sunday.
        $this->assertSame(6, $hours[6]['day']);
    }

    public function test_hours_shows_an_unconfigured_day_as_closed_when_the_rest_of_the_week_is_set(): void
    {
        // The exact real-world shape the wrong ruling would have broken: a
        // venue configures Monday through Saturday and simply never touches
        // Sunday, because the editor's own UI deletes a toggled-off day's
        // key rather than writing []. Sunday must still read as closed, not
        // vanish as "unknown".
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1, 'business_hours' => [
            'mon' => [['open' => '09:00', 'close' => '17:00']],
            'tue' => [['open' => '09:00', 'close' => '17:00']],
            'wed' => [['open' => '09:00', 'close' => '17:00']],
            'thu' => [['open' => '09:00', 'close' => '17:00']],
            'fri' => [['open' => '09:00', 'close' => '17:00']],
            'sat' => [['open' => '10:00', 'close' => '14:00']],
            // 'sun' deliberately absent.
        ]]);

        $hours = PageContent::for($this->page(1))->hours;
        $sunday = collect($hours)->firstWhere('day', 6);

        $this->assertSame(['day' => 6, 'open' => null, 'close' => null, 'closed' => true], $sunday);
    }

    public function test_hours_treats_blank_open_or_close_times_as_closed(): void
    {
        // Clearing an <input type="time"> in the admin editor stores "" for
        // that field rather than removing the day. The editor's own UI and
        // the widget both treat that as closed; this must match or a
        // landing page would show the day as open with blank times.
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => 1, 'business_hours' => [
            'mon' => [['open' => '', 'close' => '']],
        ]]);

        $hours = PageContent::for($this->page(1))->hours;

        $this->assertSame(['day' => 0, 'open' => null, 'close' => null, 'closed' => true], $hours[0]);
    }

    public function test_null_brand_content_still_appears_on_a_brand_scoped_page(): void
    {
        // brand_id NULL means "not assigned to any brand", not "excluded
        // from every brand's page". A strict brand_id = X filter would make
        // an entire section vanish from a brand-scoped page for a row
        // nobody has gotten around to assigning yet - a mutation test
        // caught exactly that on services.
        Service::create(['organization_id' => 1, 'brand_id' => null, 'name' => 'Unassigned Service',
            'is_active' => true, 'price' => 10]);
        ServiceMaster::create(['organization_id' => 1, 'brand_id' => null, 'name' => 'Unassigned Stylist',
            'is_active' => true]);
        Property::create(['organization_id' => 1, 'brand_id' => null, 'name' => 'Unassigned Site',
            'phone' => '555', 'address' => 'Nowhere', 'is_active' => true]);
        ChatWidgetConfig::create(['organization_id' => 1, 'brand_id' => null,
            'business_hours' => ['mon' => [['open' => '09:00', 'close' => '17:00']]]]);

        $content = PageContent::for($this->page(orgId: 1, brandId: 1));

        $this->assertSame(['Unassigned Service'], $content->services->pluck('name')->all());
        $this->assertSame(['Unassigned Stylist'], $content->team->pluck('name')->all());
        $this->assertSame('555', $content->contact?->phone);
        $this->assertSame('09:00', $content->hours[0]['open']);
    }

    // ─── content.contact overrides (App\Landing\ContactDetails) ─────────────

    /**
     * The precedence ContactDetails::resolve() owns: an override wins for
     * its own field, and every field the tenant did NOT override - even
     * another overridable one - still comes from the Property. The JSON-LD
     * "pass-through" fields (city, country, currency, timezone) are never
     * overridable at all, and are asserted here too, because that is what
     * layout.blade.php's addressLocality/addressCountry and services.blade
     * .php's currency fallback both read.
     */
    public function test_a_content_contact_override_wins_for_its_own_field_only(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'phone' => '111', 'email' => 'old@ours.test', 'address' => 'Old St',
            'city' => 'Riga', 'country' => 'LV', 'currency' => 'EUR', 'is_active' => true]);

        $page = $this->page(1);
        $page->update(['content' => ['contact' => ['phone' => '+371 999']]]);

        $content = PageContent::for($page);

        $this->assertSame('+371 999', $content->contact->phone);
        // Untouched overridable field: still the Property's.
        $this->assertSame('old@ours.test', $content->contact->email);
        $this->assertSame('Old St', $content->contact->address);
        // Never overridable: always the Property's.
        $this->assertSame('Riga', $content->contact->city);
        $this->assertSame('LV', $content->contact->country);
        $this->assertSame('EUR', $content->contact->currency);
    }

    /**
     * A blank override is absence, not erasure: clearing a field in the
     * builder must fall back to the Property rather than blanking the
     * public page.
     */
    public function test_a_blank_content_contact_override_falls_back_to_the_property(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'phone' => '111', 'is_active' => true]);

        $page = $this->page(1);
        $page->update(['content' => ['contact' => ['phone' => '   ']]]);

        $this->assertSame('111', PageContent::for($page)->contact->phone);
    }

    /**
     * An override reaches the rendered band on its own: with no Property row
     * at all, a page-level phone override is still enough for has('contact')
     * to report true, exactly as a Property's own phone would be.
     */
    public function test_a_content_contact_override_makes_the_band_available_with_no_property_at_all(): void
    {
        $page = $this->page(1);
        $page->update(['content' => ['contact' => ['phone' => '+371 999']]]);

        $content = PageContent::for($page);

        $this->assertSame('+371 999', $content->contact->phone);
        $this->assertTrue($content->has('contact'));
        $this->assertSame(1, $content->count('contact'));
    }

    /**
     * The widening this task makes deliberately: has('contact') used to ask
     * only about address and phone, so an email-only Property published no
     * contact band at all. An email address is exactly as publishable a
     * contact fact as either of those, so it must count on its own.
     */
    public function test_an_email_only_property_counts_as_a_contact_section(): void
    {
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Ours',
            'email' => 'hello@ours.test', 'is_active' => true]);

        $content = PageContent::for($this->page(1));

        $this->assertTrue($content->has('contact'));
        $this->assertSame(1, $content->count('contact'));
    }

    /**
     * A page with neither a Property nor any override at all still gets a
     * ContactDetails instance - the object is never null - and every field
     * on it is null, so has('contact') correctly reports false rather than
     * throwing on a null contact the way the old ?Property typed field
     * would have let a careless caller do.
     */
    public function test_a_page_with_no_contact_facts_at_all_reports_no_contact_section(): void
    {
        $content = PageContent::for($this->page(1));

        $this->assertNull($content->contact->phone);
        $this->assertNull($content->contact->email);
        $this->assertNull($content->contact->address);
        $this->assertFalse($content->has('contact'));
    }

    // ─── Tenant-added bands (the repeatable-sections round) ────────────────
    //
    // count() is matched on the section's TYPE now rather than on its key,
    // which is what lets two bands of one kind be answered by one arm. These
    // are the tests for that substitution: the answer has to be per-KEY (two
    // text bands have separate copy) while the arm is per-TYPE.

    private function pageWithContent(array $content): LandingPage
    {
        $page = $this->page(1);
        $page->update(['content' => $content]);

        return $page->fresh();
    }

    public function test_an_added_band_with_body_copy_counts_as_one_section(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'text_1' => ['kicker' => 'The promise', 'body' => 'Quiet rooms.'],
        ]));

        $this->assertSame(1, $content->count('text_1'));
        $this->assertTrue($content->has('text_1'));
    }

    /**
     * The empty case, and the reason it is spelled with a kicker AND a
     * heading filled in: a band with an eyebrow, a title and no prose is a
     * fragment, not a section, and it is exactly the shape that would slip
     * past a predicate written as "has any copy at all". A headed band over
     * blank space on a live customer site is the difference between
     * considered and broken, which is the whole reason this method exists.
     */
    public function test_an_added_band_with_no_body_counts_as_nothing(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'text_1' => ['kicker' => 'The promise', 'heading' => 'Quiet rooms'],
        ]));

        $this->assertSame(0, $content->count('text_1'));
        $this->assertFalse($content->has('text_1'));
    }

    /** A photo is not prose either: a plate with nothing to say is still an empty band. */
    public function test_an_added_band_with_only_a_photo_counts_as_nothing(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'text_1' => ['image_url' => '/storage/landing/plate.png'],
        ]));

        $this->assertSame(0, $content->count('text_1'));
    }

    public function test_a_whitespace_only_body_counts_as_nothing(): void
    {
        $content = PageContent::for($this->pageWithContent(['text_1' => ['body' => "  \n\t "]]));

        $this->assertSame(0, $content->count('text_1'));
    }

    /**
     * Per-KEY, not per-type. One arm of the match answers both bands, so
     * the thing that must not regress is the arm reading the type's name
     * instead of the key's when it goes looking for the copy — which would
     * make every text band on a page report whatever `content.text` held
     * (nothing) or share text_1's answer.
     */
    public function test_two_added_bands_are_counted_independently(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'text_1' => ['body' => 'Quiet rooms.'],
            'text_2' => ['kicker' => 'The method'],
        ]));

        $this->assertSame(1, $content->count('text_1'));
        $this->assertSame(0, $content->count('text_2'));
    }

    /**
     * A key the grammar does not accept is not a section, whatever is
     * stored under it — the cap bounds the grammar, so `text_7` reports
     * nothing even with a full band's worth of copy beneath it. Same answer
     * an unknown key has always had, which is what keeps the renderer's
     * "skip, don't fatal" path intact for stored data the shipped code does
     * not recognise.
     */
    public function test_a_key_past_the_instance_cap_counts_as_nothing(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'text_7'  => ['body' => 'Words nothing should publish.'],
            'text'    => ['body' => 'Nor these.'],
            'gallery' => ['body' => 'Nor these either.'],
        ]));

        $this->assertSame(0, $content->count('text_7'));
        $this->assertSame(0, $content->count('text'));
        $this->assertSame(0, $content->count('gallery'));
    }

    /**
     * The fixed types answer exactly as they always did — asserted here
     * because count() stopped matching on the key directly and started
     * matching on the type, and for every fixed type those are the same
     * string only as long as the parser says so.
     */
    public function test_the_fixed_sections_still_answer_as_they_did(): void
    {
        $content = PageContent::for($this->pageWithContent(['about' => ['body' => 'Our story.']]));

        $this->assertSame(1, $content->count('hero'));
        $this->assertSame(1, $content->count('footer'));
        $this->assertSame(1, $content->count('about'));
        $this->assertSame(0, $content->count('services'));
        // beauty, not hotel — the booking band is gated on the industry.
        $this->assertSame(0, $content->count('booking'));
        $this->assertSame(0, $content->count('not_a_section'));
    }

    // ─── The gallery band (the second repeatable type) ────────────────────

    /**
     * A gallery IS its pictures, so it counts pictures — and, being a
     * count() arm, that is also what decides whether the band renders at
     * all. Two claims in one test because they are one decision.
     */
    public function test_a_gallery_counts_the_pictures_it_will_actually_show(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'gallery_1' => [
                'heading' => 'The rooms',
                'image_1' => '/storage/landing/one.jpg',
                'image_2' => '/storage/landing/two.jpg',
                'image_3' => 'https://cdn.example.test/landing/three.jpg',
            ],
        ]));

        $this->assertSame(3, $content->count('gallery_1'));
        $this->assertTrue($content->has('gallery_1'));
        $this->assertSame([
            '/storage/landing/one.jpg',
            '/storage/landing/two.jpg',
            'https://cdn.example.test/landing/three.jpg',
        ], $content->galleryImages('gallery_1'));
    }

    /**
     * ORDER IS THE LEAF ORDER, AND GAPS CLOSE. Removing one picture unsets
     * its leaf and deliberately does not renumber the rest (see
     * LandingPageController::removeImage), so this is the shape a real
     * gallery is in the moment a tenant deletes the middle of five.
     *
     * Stored deliberately out of order too: a `foreach` over whatever order
     * the JSON column happens to decode in would pass the first half of this
     * and fail the second.
     */
    public function test_a_gallery_publishes_its_pictures_in_leaf_order_with_gaps_closed(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'gallery_1' => [
                'image_8' => '/storage/landing/eighth.jpg',
                'image_1' => '/storage/landing/first.jpg',
                'image_5' => '/storage/landing/fifth.jpg',
            ],
        ]));

        $this->assertSame([
            '/storage/landing/first.jpg',
            '/storage/landing/fifth.jpg',
            '/storage/landing/eighth.jpg',
        ], $content->galleryImages('gallery_1'));
        $this->assertSame(3, $content->count('gallery_1'));
    }

    /**
     * THE HONEST EMPTY. A gallery a tenant added, captioned and never put a
     * picture in is not a section — the same ruling `text` carries for a
     * band with an eyebrow and no prose, pointed at the half of THIS band
     * that is the reason it exists.
     *
     * The caption is filled in on purpose: it is exactly the shape that
     * slips past a predicate written as "has any content at all", and a
     * headed band over an empty grid on a live customer site is the
     * difference between considered and broken.
     */
    public function test_a_gallery_with_a_caption_and_no_pictures_is_not_a_section(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'gallery_1' => ['kicker' => 'Our work', 'heading' => 'The rooms'],
            'gallery_2' => [],
        ]));

        $this->assertSame(0, $content->count('gallery_1'));
        $this->assertFalse($content->has('gallery_1'));
        $this->assertSame(0, $content->count('gallery_2'));
        $this->assertSame([], $content->galleryImages('gallery_1'));
    }

    /**
     * The picture guards are imageUrl()'s guards, reached through the same
     * private allowlist — so a gallery whose every leaf is hostile counts
     * ZERO and does not render, rather than rendering a band of broken
     * images.
     *
     * Mutation target: return the raw leaf from galleryImages() and this is
     * the first thing that goes red.
     */
    public function test_a_gallery_of_hostile_leaves_counts_nothing(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'gallery_1' => [
                'image_1' => 'javascript:alert(1)',
                'image_2' => '//evil.example/x.jpg',
                'image_3' => '"><script>',
                'image_4' => '',
                'image_5' => str_repeat('x', 200_000),
                // A leaf outside the eight this type holds is not a picture
                // at all: no endpoint can write it and no render may read it.
                'image_9' => '/storage/landing/ninth.jpg',
            ],
        ]));

        $this->assertSame(0, $content->count('gallery_1'));
        $this->assertSame([], $content->galleryImages('gallery_1'));
    }

    /** Only the bad leaves drop; the good ones still publish, in order. */
    public function test_one_hostile_leaf_does_not_take_the_rest_of_the_gallery_with_it(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'gallery_1' => [
                'image_1' => '/storage/landing/first.jpg',
                'image_2' => 'javascript:alert(1)',
                'image_3' => '/storage/landing/third.jpg',
            ],
        ]));

        $this->assertSame(
            ['/storage/landing/first.jpg', '/storage/landing/third.jpg'],
            $content->galleryImages('gallery_1'),
        );
    }

    /**
     * A section that holds no photos, or none of THIS shape, publishes none
     * — asked here rather than only of SectionType because this is the
     * method the partial actually calls, and "hero has an image_url, so a
     * loop over image_N might find it" is precisely the confusion an
     * enumerated leaf list exists to prevent.
     */
    public function test_only_a_gallery_publishes_gallery_pictures(): void
    {
        $content = PageContent::for($this->pageWithContent([
            'hero'     => ['image_url' => '/storage/landing/hero.jpg', 'image_1' => '/storage/landing/nope.jpg'],
            'services' => ['image_1' => '/storage/landing/nope.jpg'],
            'gallery'  => ['image_1' => '/storage/landing/nope.jpg'],
        ]));

        $this->assertSame([], $content->galleryImages('hero'));
        $this->assertSame([], $content->galleryImages('services'));
        $this->assertSame([], $content->galleryImages('gallery'));
        // ... and the hero's own single plate is untouched by any of it.
        $this->assertSame('/storage/landing/hero.jpg', $content->imageUrl('hero'));
    }
}
