<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\ReviewSubmission;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The writer for `is_featured` -- PUT /v1/admin/reviews/submissions/{id}/featured.
 *
 * This is the only place in the app that can set the column the landing
 * renderer's reviews band and JSON-LD aggregate are gated on, so it is
 * exercised over the real HTTP stack (saas.auth, Sanctum, tenant, brand,
 * admin, check.subscription, feature:reviews) the same way
 * LandingPageTeardownTest exercises unpublish -- and the render assertion
 * reads the real public response bytes, not the model, for the same reason
 * that file gives: "the endpoint answered 200" is not "a visitor sees it".
 */
class FeaturedReviewWriteTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private const FEATURED_URI = '/api/v1/admin/reviews/submissions/%d/featured';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();

        // Mirrors LandingPageTeardownTest's setUp: these three are what the
        // full saas.auth/tenant/brand/admin/check.subscription stack reads
        // that the shared schema traits do not already provide.
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($table) {
                $table->string('plan_slug', 32)->nullable();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('role')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->string('role')->nullable();
                $table->timestamps();
            });
        }
    }

    // ─── Fixtures ────────────────────────────────────────────────────────

    /**
     * A RELATIVE test URI is resolved through url(), which builds its root
     * from whichever request the container is currently holding -- so once a
     * test has read the public landing host, the next relative call would go
     * to THAT host, where LandingHostGuard refuses /api with a 404. Every
     * admin call below names the admin host explicitly. Same device as
     * LandingPageTeardownTest::adminUrl().
     */
    private function adminUrl(string $uri): string
    {
        return 'http://' . parse_url(config('app.url'), PHP_URL_HOST) . $uri;
    }

    private function landingUrl(string $slug): string
    {
        return 'http://' . config('landing.host') . '/' . $slug;
    }

    private function org(array $features = ['reviews' => true]): Organization
    {
        return Organization::create([
            'name'                => 'Glamour',
            'slug'                => 'glamour-' . uniqid(),
            'industry'            => 'beauty',
            'subscription_status' => 'ACTIVE',
            'plan_slug'           => 'growth',
            'plan_features'       => $features,
        ]);
    }

    private function user(Organization $org): User
    {
        return User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            'user_type'       => 'staff',
        ]);
    }

    /** The tenant scope is what the model's creating hook reads, so it is bound for the write. */
    private function makeSubmission(Organization $org, array $attributes = []): ReviewSubmission
    {
        app()->instance('current_organization_id', $org->id);
        $submission = ReviewSubmission::create($attributes + [
            'organization_id' => $org->id,
            'overall_rating'  => 5,
            'comment'         => 'Lovely stay',
            'submitted_at'    => now(),
        ]);
        app()->forgetInstance('current_organization_id');

        return $submission;
    }

    /**
     * A published page with $count rated-but-unfeatured submissions on the
     * SAME org.
     *
     * `$reviewsEnabled` is the switch the round-2 defect turned on. The
     * wizard writes the `reviews` section row `enabled: false` for any
     * data-backed section with zero rows, and a brand-new tenant has nothing
     * featured BY DEFINITION — this endpoint is the app's first and only
     * writer of `is_featured` — so `false` is what a real page starts life
     * with, and `true` here is the state a tenant reaches only by flipping
     * the editor toggle by hand.
     */
    private function publishedPageWithRatedSubmissions(Organization $org, int $count, bool $reviewsEnabled = true): LandingPage
    {
        app()->instance('current_organization_id', $org->id);

        $page = LandingPage::create([
            'organization_id' => $org->id,
            'brand_id'        => null,
            'slug'            => 'glamour-salon-' . uniqid(),
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'published',
            'published_at'    => now(),
            'content'         => ['hero' => ['headline' => 'The Art of Wellness']],
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create([
                'key'     => $key,
                'enabled' => $key === 'reviews' ? $reviewsEnabled : true,
                'sort'    => $i,
            ]);
        }

        for ($i = 0; $i < $count; $i++) {
            ReviewSubmission::create([
                'organization_id' => $org->id,
                'overall_rating'  => 5,
                'comment'         => "Review {$i}",
                'anonymous_name'  => 'Anna K.',
                'is_featured'     => false,
                'submitted_at'    => now(),
            ]);
        }

        app()->forgetInstance('current_organization_id');

        return $page;
    }

    /**
     * The public renderer's response for the ruled_page template is a plain
     * view() Response, not a StreamedResponse -- ->streamedContent() would
     * fail the test with "The response is not a streamed response." rather
     * than assert anything. RuledPageSectionsTest, which exercises the same
     * route, reads it with ->getContent() for that reason; this does too.
     */
    private function body(\Illuminate\Testing\TestResponse $response): string
    {
        return (string) $response->getContent();
    }

    // ─── Tests ───────────────────────────────────────────────────────────

    public function test_it_features_a_submission(): void
    {
        $org = $this->org();
        $s = $this->makeSubmission($org, ['is_featured' => false]);

        Sanctum::actingAs($this->user($org), ['*']);

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $s->id)), ['featured' => true])
            ->assertOk()
            ->assertJsonPath('submission.is_featured', true);

        $this->assertDatabaseHas('review_submissions', ['id' => $s->id, 'is_featured' => true]);
    }

    public function test_it_cannot_feature_another_organizations_submission(): void
    {
        $theirs = $this->makeSubmission($this->org(), ['is_featured' => false]);

        $mine = $this->org();
        Sanctum::actingAs($this->user($mine), ['*']);

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $theirs->id)), ['featured' => true])
            ->assertNotFound();

        $this->assertDatabaseHas('review_submissions', ['id' => $theirs->id, 'is_featured' => false]);
    }

    public function test_featuring_a_review_makes_the_landing_band_render(): void
    {
        // The whole point of the column. Publish a page, confirm the reviews
        // band is ABSENT, feature a review, confirm it APPEARS -- asserted on
        // the real public response bytes, not on the model.
        $org = $this->org();
        $page = $this->publishedPageWithRatedSubmissions($org, count: 5);
        $firstSubmissionId = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->orderBy('id')
            ->value('id');

        $before = $this->get($this->landingUrl($page->slug));
        $this->assertStringNotContainsString('data-section="reviews"', $this->body($before));

        Sanctum::actingAs($this->user($org), ['*']);

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $firstSubmissionId)), ['featured' => true])
            ->assertOk();

        $after = $this->get($this->landingUrl($page->slug));
        $this->assertStringContainsString('data-section="reviews"', $this->body($after));
    }

    /**
     * The toggle's OTHER direction, which had no coverage at all (T1).
     *
     * The real control is a toggle — Reviews.tsx sends `!s.is_featured` and
     * toasts "Removed from your landing page" — so taking a customer's words
     * back OFF a public page is a first-class path, not an edge case. Every
     * previous test here sent `featured: true`, which meant a writer
     * hard-coded to `['is_featured' => true]` passed the whole file: proven
     * by mutation, 5 passed / 10 assertions, unchanged.
     *
     * Asserted on the real public response bytes for the same reason
     * test_featuring_a_review_makes_the_landing_band_render is: "the
     * endpoint answered 200" is not "the visitor stopped seeing it".
     */
    public function test_unfeaturing_a_review_takes_it_back_off_the_landing_page(): void
    {
        $org  = $this->org(['reviews' => true, 'landing_pages' => true]);
        $page = $this->publishedPageWithRatedSubmissions($org, count: 5);

        $id = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->orderBy('id')
            ->value('id');

        Sanctum::actingAs($this->user($org), ['*']);

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $id)), ['featured' => true])->assertOk();

        $this->assertStringContainsString(
            'data-section="reviews"',
            $this->body($this->get($this->landingUrl($page->slug))),
            'Fixture is wrong: the band never appeared, so its disappearance would prove nothing.',
        );

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $id)), ['featured' => false])
            ->assertOk()
            ->assertJsonPath('submission.is_featured', false);

        $this->assertDatabaseHas('review_submissions', ['id' => $id, 'is_featured' => false]);

        $this->assertStringNotContainsString(
            'data-section="reviews"',
            $this->body($this->get($this->landingUrl($page->slug))),
            "A review the tenant removed is still on their public page.",
        );
    }

    // ─── The second switch (M3) ──────────────────────────────────────────

    /**
     * Featuring the first review must actually put it on the page.
     *
     * The public renderer needs the `reviews` section row `enabled` AND the
     * section to have content. Featuring supplied only the second, and the
     * row is written `enabled: false` for every brand-new tenant BY
     * DEFINITION — the wizard forces `false` on any data-backed section with
     * zero rows, and this endpoint is the app's first writer of
     * `is_featured`, so at wizard time there is never anything featured yet.
     * The screen reported a green "Added to your landing page" for a write
     * that provably could not change the page: `PageContent reviews count =
     * 1`, band absent.
     */
    public function test_featuring_a_review_switches_the_reviews_band_on_when_the_wizard_left_it_off(): void
    {
        $org  = $this->org(['reviews' => true, 'landing_pages' => true]);
        $page = $this->publishedPageWithRatedSubmissions($org, count: 5, reviewsEnabled: false);

        $id = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->orderBy('id')
            ->value('id');

        Sanctum::actingAs($this->user($org), ['*']);

        $response = $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $id)), ['featured' => true]);

        $response->assertOk();
        $this->assertTrue($response->json('landing.has_page'));
        $this->assertTrue($response->json('landing.reviews_enabled'),
            'The response told the screen the review was on the page while the band was still switched off.');

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id,
            'key'             => 'reviews',
            'enabled'         => true,
        ]);

        $this->assertStringContainsString(
            'data-section="reviews"',
            $this->body($this->get($this->landingUrl($page->slug))),
            'Featuring a review reported success and the band still cannot render.',
        );
    }

    /**
     * ...and unfeaturing does NOT switch it back off.
     *
     * A tenant unfeaturing one review out of several is curating, not
     * dismantling: the renderer stops showing the band on its own once
     * nothing is featured, and a tenant who deliberately switched the band
     * off in the editor must not have that decision silently undone either.
     */
    public function test_unfeaturing_leaves_the_band_switched_on(): void
    {
        $org  = $this->org(['reviews' => true, 'landing_pages' => true]);
        $page = $this->publishedPageWithRatedSubmissions($org, count: 5, reviewsEnabled: false);

        $ids = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->orderBy('id')
            ->pluck('id');

        Sanctum::actingAs($this->user($org), ['*']);

        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $ids[0])), ['featured' => true])->assertOk();
        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $ids[1])), ['featured' => true])->assertOk();
        $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $ids[0])), ['featured' => false])->assertOk();

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id,
            'key'             => 'reviews',
            'enabled'         => true,
        ]);

        $this->assertStringContainsString(
            'data-section="reviews"',
            $this->body($this->get($this->landingUrl($page->slug))),
            'Removing one featured review took the whole band down with it.',
        );
    }

    /**
     * An org with no landing entitlement gets NOTHING switched on.
     *
     * This route is behind `feature:reviews`, not `feature:landing_pages`,
     * so a Growth org that once had a page can reach it. What makes that
     * safe today is that `is_featured` has exactly one consumer — the public
     * renderer — so for such a tenant the write is inert. Switching a
     * section on is a BUILD action, and inert is exactly how this must stay:
     * the fix above must not become a way to edit a live page from outside
     * the plan that pays for it.
     */
    public function test_it_does_not_switch_the_band_on_for_an_org_without_the_landing_entitlement(): void
    {
        $org  = $this->org(['reviews' => true]);
        $page = $this->publishedPageWithRatedSubmissions($org, count: 5, reviewsEnabled: false);

        $id = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->orderBy('id')
            ->value('id');

        Sanctum::actingAs($this->user($org), ['*']);

        $response = $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $id)), ['featured' => true]);

        $response->assertOk();
        $this->assertTrue($response->json('landing.has_page'));
        $this->assertFalse($response->json('landing.reviews_enabled'),
            'The screen would have claimed success for a page that cannot show the review.');

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id,
            'key'             => 'reviews',
            'enabled'         => false,
        ]);
    }

    /**
     * And a tenant with no landing page at all is told so, rather than told
     * the review was "added to your landing page".
     */
    public function test_it_reports_no_page_when_the_org_has_none(): void
    {
        $org = $this->org(['reviews' => true, 'landing_pages' => true]);
        $s   = $this->makeSubmission($org, ['is_featured' => false]);

        Sanctum::actingAs($this->user($org), ['*']);

        $response = $this->putJson($this->adminUrl(sprintf(self::FEATURED_URI, $s->id)), ['featured' => true]);

        $response->assertOk();
        $this->assertFalse($response->json('landing.has_page'));
        $this->assertFalse($response->json('landing.reviews_enabled'));
    }
}
