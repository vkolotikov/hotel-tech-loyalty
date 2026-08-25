<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Taking your own page off the internet, driven over real HTTP.
 *
 * The other two landing suites deliberately stop short of the wire —
 * LandingPageEntitlementTest asserts which middleware is ATTACHED,
 * LandingPageAdminApiTest calls the controller directly — and neither can
 * see this defect, because the defect is not in either half. It is in what
 * the assembled stack DOES: `feature:landing_pages` was lifted off
 * unpublish, so the entitlement half was fixed, while `check.subscription`
 * on the enclosing admin group kept answering for the other half. A
 * cancelled tenant still could not take their own live page down, and it
 * carried on serving 200 with their prices, staff names, phone number and
 * address on it. The only way off the internet was us running an UPDATE by
 * hand.
 *
 * So these tests go through the whole stack — saas.auth, Sanctum, tenant,
 * brand, admin, check.subscription — and then read the PUBLIC host to see
 * whether the page actually stopped serving. Nothing short of that can tell
 * "the endpoint answered 200" from "the page is off the internet".
 *
 * The billing gate must not be weakened anywhere else, so the refusals are
 * asserted here too, over the same wire: no token, no staff, and no reaching
 * another tenant's page. The BUILD verbs keep both gates and are asserted to
 * still refuse.
 */
class LandingPageTeardownTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private const UNPUBLISH = '/api/v1/admin/landing-pages/unpublish';
    /**
     * The read half of teardown (Task 10b): the admin SPA cannot show a
     * lapsed tenant so much as "your page is live at X" — the one thing
     * standing between them and the Unpublish button above — without a
     * call that survives a dead subscription too. `show()` cannot be
     * reused for this; it carries the full edit surface and stays behind
     * `feature:landing_pages` on purpose.
     */
    private const STATUS = '/api/v1/admin/landing-pages/status';

    /**
     * Every admin call below names the admin host explicitly, and that is not
     * decoration. A RELATIVE test URI is resolved through url(), which builds
     * its root from whichever request the container is currently holding — so
     * once a test has read the public host, the next relative call goes to the
     * LANDING host, where LandingHostGuard refuses /api with a 404 and the
     * assertion fails for a reason that has nothing to do with what it is
     * testing. Same helper shape as LandingHostIsolationTest::adminHost().
     */
    private function adminUrl(string $uri): string
    {
        return 'http://' . parse_url(config('app.url'), PHP_URL_HOST) . $uri;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // The public renderer reads these live on every request, and half of
        // this file's value is what the public host answers afterwards.
        $this->setUpLandingContentSchema();

        // Three columns/tables the shared traits do not carry, added here
        // exactly as LandingPageEntitlementTest adds plan_slug: nothing else
        // in the landing suites walks the full request stack, so nothing
        // else needs them.
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($table) {
                $table->string('plan_slug', 32)->nullable();
            });
        }
        // CheckSubscription reads $user->staff?->isSuperAdmin() before
        // anything else — a super admin bypasses the gate entirely, and
        // every org below must NOT be one, so the table has to exist and
        // stay empty.
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
        // BrandMiddleware asks every staff user which brands they are
        // pinned to.
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

    private function org(string $status, string $plan = 'enterprise', array $features = ['landing_pages' => true]): Organization
    {
        return Organization::create([
            'name'                => 'Glamour',
            'slug'                => 'glamour-' . uniqid(),
            'industry'            => 'beauty',
            'subscription_status' => $status,
            'plan_slug'           => $plan,
            'plan_features'       => $features,
        ]);
    }

    private function user(Organization $org, string $type = 'staff'): User
    {
        return User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            'user_type'       => $type,
        ]);
    }

    /**
     * A live page with a real business behind it — the phone number is what
     * makes "still serving" concrete rather than a bare status code.
     *
     * `$brandId` null means "whatever BelongsToBrand would have chosen",
     * which for an org with a default brand is that default brand — the
     * shape every test here had before the sibling-brand cases were added.
     * The Property takes the SAME brand, because PageContent resolves the
     * contact block brand-first: a page on brand B whose only Property sits
     * on brand A would render without the phone number, and the fixture
     * assertion below would then fail for a reason that has nothing to do
     * with what is being tested.
     */
    private function livePage(Organization $org, string $slug, string $phone, ?int $brandId = null): LandingPage
    {
        // The tenant scope is what the model's own creating hooks read, so
        // it is bound for the write and released again — every request below
        // rebinds it through TenantMiddleware.
        app()->instance('current_organization_id', $org->id);

        $page = LandingPage::create([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'slug'            => $slug,
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'published',
            'published_at'    => now(),
            'content'         => ['hero' => ['headline' => 'The Art of Wellness']],
        ]);

        foreach (['hero', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        Property::create([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'name'            => 'Glamour Salon',
            'address'         => '12 High Street',
            'phone'           => $phone,
            'is_active'       => true,
        ]);

        app()->forgetInstance('current_organization_id');

        return $page;
    }

    /**
     * The org's default brand — the one Organization::created backfills, and
     * the one LandingPageGuard::currentBrandId() substitutes whenever the
     * SPA sends `brand_id=all`.
     *
     * Asserted rather than cast: a missing row casts to 0, which would make
     * "the page is not on the default brand" trivially true and the tests
     * below prove nothing.
     */
    private function defaultBrandId(Organization $org): int
    {
        $id = DB::table('brands')
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->value('id');

        $this->assertNotNull($id, 'The organisation has no default brand; its fixture is in a state production forbids.');

        return (int) $id;
    }

    /**
     * A SECOND, non-default brand. Multi-brand is an Enterprise-only
     * affordance, i.e. exactly the landing-pages audience.
     *
     * Inserted through the query builder rather than the model so nothing —
     * not the tenant scope, not a creating hook — can quietly move it onto
     * another org or flip `is_default`.
     */
    private function siblingBrand(Organization $org): int
    {
        return (int) DB::table('brands')->insertGetId([
            'organization_id' => $org->id,
            'name'            => 'Glamour Northside',
            'slug'            => 'glamour-northside-' . uniqid(),
            'is_default'      => false,
            'sort_order'      => 1,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    /** What a visitor gets on the public host, which is the only thing that settles this. */
    private function publicGet(LandingPage $page): \Illuminate\Testing\TestResponse
    {
        return $this->get('http://' . config('landing.host') . '/' . $page->slug);
    }

    // ─── The defect ──────────────────────────────────────────────────────

    /**
     * Ceasing to pay must never compel a business to stay published. Both
     * statuses are real: CANCELLED is the customer who left, EXPIRED is the
     * trial that ran out, and CheckSubscription treats every status that is
     * not ACTIVE or TRIALING identically — so these two stand for
     * PAST_DUE/UNPAID/PAUSED as well.
     */
    #[DataProvider('deadSubscriptionProvider')]
    public function test_an_org_whose_subscription_is_dead_can_take_its_own_page_down(string $status): void
    {
        $org  = $this->org($status);
        $page = $this->livePage($org, 'dead-sub-' . strtolower($status), '+44 113 000 0000');

        // The page really is on the internet, with the tenant's data on it.
        $before = $this->publicGet($page);
        $before->assertOk();
        $this->assertStringContainsString('+44 113 000 0000', $before->getContent(),
            'Fixture is wrong: the page was not serving the tenant data this test is about taking down.');

        Sanctum::actingAs($this->user($org), ['*']);

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertOk();

        $this->assertSame(LandingPage::STATUS_DRAFT, $page->fresh()->status);

        // The status column is not the promise. This is.
        $this->publicGet($page)->assertNotFound();
    }

    /** @return array<string, array{0: string}> */
    public static function deadSubscriptionProvider(): array
    {
        return [
            'cancelled' => ['CANCELLED'],
            'expired'   => ['EXPIRED'],
        ];
    }

    /**
     * The precondition for the test above, proven in its own right: before a
     * cancelled tenant can even see the Unpublish button, the admin SPA has
     * to learn that there is something to unpublish, over a call that also
     * survives a dead subscription. Without this route, the fix above is
     * reachable only by curling `unpublish` blind — nothing in the admin
     * screen could have told the tenant their page was still live.
     */
    #[DataProvider('deadSubscriptionProvider')]
    public function test_an_org_whose_subscription_is_dead_can_see_its_own_status(string $status): void
    {
        $org  = $this->org($status);
        $page = $this->livePage($org, 'dead-sub-status-' . strtolower($status), '+44 113 000 0006');

        Sanctum::actingAs($this->user($org), ['*']);

        $response = $this->getJson($this->adminUrl(self::STATUS));

        $response->assertOk();
        $this->assertTrue($response->json('published'));
        $this->assertStringEndsWith('/' . $page->slug, $response->json('url'));
    }

    // ─── The same promise, on a brand nobody selected ────────────────────

    /**
     * Round 2's defect, and the one a live customer could be trapped by.
     *
     * The SPA sends `brand_id=all` by default, and again after any
     * localStorage reset — so these calls deliberately name NO brand at
     * all, which is what BrandMiddleware turns into a bound NULL. Both
     * teardown verbs used to resolve that through
     * LandingPageGuard::currentBrandId(), which substitutes the org's
     * DEFAULT brand, so a page published on a SIBLING brand was reported
     * `{published:false, url:null}` and `unpublish` answered 404 while the
     * page carried on serving the tenant's address, phone number, staff
     * names and prices.
     *
     * And there was no way round it from inside the product: `GET
     * /v1/admin/brands` sits inside `check.subscription` and answers 403 to
     * a cancelled org, `brandStore` does not persist the list, and
     * `BrandSwitcher` renders nothing when it is empty — so the cohort that
     * needed the brand switcher most is the one that cannot have it.
     *
     * Status and unpublish are asserted TOGETHER because they have to agree:
     * a status that cannot see the page means the screen never offers the
     * button, and an unpublish that cannot see it means the button does
     * nothing. Either half alone leaves the tenant published.
     *
     * @param string $subscription subscription_status
     * @param string $plan         plan_slug
     * @param array<string, bool> $features plan_features
     */
    #[DataProvider('teardownCohortProvider')]
    public function test_all_brands_mode_takes_down_a_page_on_a_non_default_brand(
        string $subscription,
        string $plan,
        array $features,
        string $slug,
        string $phone,
    ): void {
        $org     = $this->org($subscription, $plan, $features);
        $sibling = $this->siblingBrand($org);
        $page    = $this->livePage($org, $slug, $phone, $sibling);

        $this->assertNotSame(
            $this->defaultBrandId($org),
            (int) $page->fresh()->brand_id,
            'Fixture is wrong: the page landed on the DEFAULT brand, which is the case that always worked.',
        );

        $before = $this->publicGet($page);
        $before->assertOk();
        $this->assertStringContainsString($phone, $before->getContent(),
            'Fixture is wrong: the page was not serving the tenant data this test is about taking down.');

        Sanctum::actingAs($this->user($org), ['*']);

        // No `brand_id` — "All brands", the SPA's own default.
        $statusResponse = $this->getJson($this->adminUrl(self::STATUS));

        $statusResponse->assertOk();
        $this->assertTrue($statusResponse->json('published'),
            'A live page on a non-default brand was reported as nothing to tear down, so the screen would never offer the button.');
        $this->assertStringEndsWith('/' . $page->slug, $statusResponse->json('url'),
            'The reported address is not the address the page is actually serving at.');

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertOk();

        $this->assertSame(LandingPage::STATUS_DRAFT, $page->fresh()->status);

        // The status column is not the promise. This is.
        $this->publicGet($page)->assertNotFound();
    }

    /**
     * Three fixture SHAPES, not three spellings of one — each models a
     * different cohort, and getting the shape wrong is how a verification
     * passes while proving nothing:
     *
     *  - CANCELLED / enterprise / landing_pages: the customer who LEFT.
     *    Nothing clears `plan_features` on cancellation, so the entitlement
     *    gate would still pass them; it is `check.subscription` that refuses
     *    every other verb, and this route's `withoutMiddleware` that lets
     *    these two through.
     *  - ACTIVE / enterprise / landing_pages: perfectly HEALTHY, paying,
     *    entitled. No gate refuses this org anything, which is what proves
     *    the blindness belonged to the resolver rather than to a middleware.
     *  - ACTIVE / growth / reviews-only: DOWNGRADED but still paying — the
     *    cohort routes/api.php's own comment names as the reason `unpublish`
     *    sits outside `feature:landing_pages`. Subscription healthy, feature
     *    genuinely gone, so `feature:landing_pages` 402s every build verb
     *    and these two routes are the whole of what they have left.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, bool>, 3: string, 4: string}>
     */
    public static function teardownCohortProvider(): array
    {
        return [
            'cancelled — only check.subscription refuses them' => [
                'CANCELLED', 'enterprise', ['landing_pages' => true], 'sibling-brand-cancelled', '+44 113 000 0011',
            ],
            'healthy — nothing refuses them at all' => [
                'ACTIVE', 'enterprise', ['landing_pages' => true], 'sibling-brand-healthy', '+44 113 000 0012',
            ],
            'downgraded — only feature:landing_pages refuses them' => [
                'ACTIVE', 'growth', ['reviews' => true], 'sibling-brand-downgraded', '+44 113 000 0013',
            ],
        ];
    }

    /**
     * The downgraded-but-still-paying cohort on the ORDINARY (default-brand)
     * page, driven over the assembled stack.
     *
     * `test_the_entitlement_still_refuses_a_downgraded_org_on_the_build_verbs`
     * already proves every build verb 402s for this org. This is the other
     * half of the same sentence and had no test at all: the two verbs that
     * must NOT 402, for the one cohort the entitlement gate is what refuses.
     * It is also the backend half of the sidebar fix — Layout.tsx used to
     * render this tenant a locked BUTTON that never navigates, so the screen
     * this route serves was unreachable in the product.
     */
    public function test_an_active_but_downgraded_org_can_take_its_own_page_down(): void
    {
        $org  = $this->org('ACTIVE', 'growth', ['reviews' => true]);
        $page = $this->livePage($org, 'downgraded-teardown', '+44 113 000 0014');

        $this->publicGet($page)->assertOk();

        Sanctum::actingAs($this->user($org), ['*']);

        $statusResponse = $this->getJson($this->adminUrl(self::STATUS));
        $statusResponse->assertOk();
        $this->assertTrue($statusResponse->json('published'));

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertOk();

        $this->assertSame(LandingPage::STATUS_DRAFT, $page->fresh()->status);
        $this->publicGet($page)->assertNotFound();
    }

    /**
     * The response SHAPE, pinned by exact key set (T2).
     *
     * `status` is the one admin route stripped of BOTH the entitlement gate
     * and `check.subscription`, and its docblock says it returns the
     * narrowest possible answer. Nothing asserted that. A review added
     * `'page' => $page` to its JSON and the entire landing suite stayed
     * green while the draft slug and the URL travelled out as `page.slug`
     * and `page.url` — the existing `assertNull($body['url'])` above says
     * nothing about a sibling key carrying the same address.
     *
     * Asserted on a DRAFT page on purpose: that is the case where the route
     * is meant to disclose nothing at all, so a leak has the most to leak.
     */
    public function test_status_answers_with_exactly_two_keys(): void
    {
        $org = $this->org('CANCELLED');
        $this->livePage($org, 'shape-of-status', '+44 113 000 0015');

        // Back to draft, so `url` is legitimately null and any address in
        // the body can only have arrived through a key that should not exist.
        LandingPage::withoutGlobalScopes()
            ->where('slug', 'shape-of-status')
            ->update(['status' => LandingPage::STATUS_DRAFT]);

        Sanctum::actingAs($this->user($org), ['*']);

        $body = $this->getJson($this->adminUrl(self::STATUS))->assertOk()->json();

        $keys = array_keys($body);
        sort($keys);

        $this->assertSame(['published', 'url'], $keys,
            'The entitlement-free status route grew a key. Everything it returns is readable by a tenant with no plan and no live subscription, so widening it is a decision, not an accident.');
        $this->assertFalse($body['published']);
        $this->assertNull($body['url']);
        $this->assertStringNotContainsString('shape-of-status', json_encode($body),
            "A draft page's address leaked through the entitlement-free route.");
    }

    // ─── The editor's own Unpublish button must hit the page on screen ───

    /**
     * Round 2's regression, and the mirror image of
     * `test_all_brands_mode_takes_down_a_page_on_a_non_default_brand` above:
     * this time the tenant is healthy and entitled, not lapsed, and the
     * defect is not a page nobody can reach — it is the WRONG page going
     * dark under the admin's own hand.
     *
     * `show()` — what the editor renders, Unpublish button included — keeps
     * resolving ONE brand via `currentBrandId()`, which substitutes the
     * org's DEFAULT brand in "all brands" mode. `pageToTakeDown()` answers
     * for the whole organisation instead, and used to break a two-live-page
     * tie by lowest id alone: read raw rather than through
     * `currentBrandId()`, so a NULL bound brand never matched either
     * candidate's `brand_id` and the tie fell straight past the named-brand
     * rung. If the sibling brand's page happened to be created first — and
     * nothing stops that; the wizard creates one page per brand in whatever
     * order the admin chooses — the id order and the on-screen order simply
     * disagreed.
     *
     * So the click that promised "take the page in front of you down" could
     * silently take a DIFFERENT brand's live marketing page off the
     * internet instead: no org boundary crossed, but the sibling's address,
     * phone number, staff names and prices vanish from the internet with no
     * toast, no confirmation and no way to tell from the response alone —
     * the green "Your page is no longer public" fires either way.
     *
     * Reachable in ordinary use, not just a lab condition: multi-brand is
     * Enterprise-only — exactly this feature's audience — `api.ts` sends
     * `brand_id=all` by default and again after any localStorage reset, and
     * which brand's page happens to hold the lower id is a coin flip.
     */
    public function test_the_editors_own_unpublish_button_takes_down_the_page_it_is_showing_in_all_brands_mode(): void
    {
        $org     = $this->org('ACTIVE');
        $default = $this->defaultBrandId($org);
        $sibling = $this->siblingBrand($org);

        // The SIBLING's page is created first, so it holds the LOWER id —
        // the exact ordering that used to win the old lowest-id fallback
        // regardless of which page `show()` was rendering.
        $pageSibling = $this->livePage($org, 'editor-sibling-page', '+44 113 666 0001', $sibling);
        $pageDefault = $this->livePage($org, 'editor-default-page', '+44 113 666 0002', $default);

        $this->assertLessThan(
            $pageDefault->id,
            $pageSibling->id,
            'Fixture is wrong: the sibling page must hold the lower id for this test to say anything about the tie-break.',
        );

        Sanctum::actingAs($this->user($org), ['*']);

        // What the editor is looking at — `show()`, in "all brands" mode,
        // is what LandingEditor.tsx renders and what its Unpublish button
        // is drawn from.
        $shown = $this->getJson($this->adminUrl('/api/v1/admin/landing-pages?brand_id=all'));
        $shown->assertOk();
        $this->assertSame($pageDefault->slug, $shown->json('page.slug'),
            'Fixture is wrong: show() in all-brands mode did not resolve the default-brand page, so nothing was proved about the tie-break.');

        $this->postJson($this->adminUrl(self::UNPUBLISH . '?brand_id=all'))->assertOk();

        $this->assertSame(LandingPage::STATUS_DRAFT, $pageDefault->fresh()->status,
            'The editor showed the DEFAULT brand\'s page, but a click on its own Unpublish button took the SIBLING brand\'s page down instead.');
        $this->assertSame(LandingPage::STATUS_PUBLISHED, $pageSibling->fresh()->status,
            'A single click took down a brand\'s page the admin was never shown.');

        // The status column is not the promise. This is.
        $this->publicGet($pageDefault)->assertNotFound();
        $this->publicGet($pageSibling)->assertOk();
    }

    // ─── ...and nothing else may be weakened ─────────────────────────────

    public function test_an_unauthenticated_caller_cannot_read_status(): void
    {
        $org = $this->org('ACTIVE');
        $this->livePage($org, 'no-token-status', '+44 113 000 0007');

        $this->getJson($this->adminUrl(self::STATUS))->assertStatus(401);
    }

    /** Same reasoning as the unpublish version above: a real member token must not reach a staff verb. */
    public function test_a_non_staff_user_cannot_read_status(): void
    {
        $org = $this->org('ACTIVE');
        $this->livePage($org, 'not-staff-status', '+44 113 000 0008');

        Sanctum::actingAs($this->user($org, 'member'), ['*']);

        $this->getJson($this->adminUrl(self::STATUS))->assertStatus(403);
    }

    /**
     * Ungating the READ side must not turn "let a former customer see its
     * own status" into "let anyone see anyone's status". B reads its own
     * live page (proving the call actually reached a page); A's is never
     * reported.
     */
    public function test_one_org_cannot_read_another_orgs_status(): void
    {
        $orgA = $this->org('ACTIVE');
        $this->livePage($orgA, 'org-a-status', '+44 113 000 0009');

        $orgB  = $this->org('CANCELLED');
        $pageB = $this->livePage($orgB, 'org-b-status', '+44 113 000 0010');

        Sanctum::actingAs($this->user($orgB), ['*']);

        $response = $this->getJson($this->adminUrl(self::STATUS));

        $response->assertOk();
        $this->assertTrue($response->json('published'),
            "Fixture is wrong: org B's own page did not report as published, so nothing was proved about org A.");
        $this->assertStringEndsWith('/' . $pageB->slug, $response->json('url'),
            "org B's status reported org A's page instead of its own.");
    }

    public function test_an_unauthenticated_caller_cannot_unpublish(): void
    {
        $org  = $this->org('ACTIVE');
        $page = $this->livePage($org, 'no-token', '+44 113 000 0001');

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertStatus(401);

        $this->assertSame(LandingPage::STATUS_PUBLISHED, $page->fresh()->status);
        $this->publicGet($page)->assertOk();
    }

    /**
     * The `admin` middleware is a separate gate from the billing one and had
     * no part in the defect, so it stays. A member token is a real token —
     * the loyalty mobile app mints them — and must not reach a staff verb.
     */
    public function test_a_non_staff_user_cannot_unpublish(): void
    {
        $org  = $this->org('ACTIVE');
        $page = $this->livePage($org, 'not-staff', '+44 113 000 0002');

        Sanctum::actingAs($this->user($org, 'member'), ['*']);

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertStatus(403);

        $this->assertSame(LandingPage::STATUS_PUBLISHED, $page->fresh()->status);
        $this->publicGet($page)->assertOk();
    }

    /**
     * Ungating teardown must not turn "let a former customer unpublish" into
     * "let anyone unpublish anyone's page". Both orgs own a page, so this
     * catches a controller that resolves the caller's row by anything wider
     * than the tenant scope: B's own page going down is what proves the call
     * did work, and A's staying up is the assertion that matters.
     */
    public function test_one_org_cannot_take_another_orgs_page_down(): void
    {
        $orgA  = $this->org('ACTIVE');
        $pageA = $this->livePage($orgA, 'org-a-page', '+44 113 000 0003');

        $orgB  = $this->org('CANCELLED');
        $pageB = $this->livePage($orgB, 'org-b-page', '+44 113 000 0004');

        Sanctum::actingAs($this->user($orgB), ['*']);

        $this->postJson($this->adminUrl(self::UNPUBLISH))->assertOk();

        $this->assertSame(LandingPage::STATUS_DRAFT, $pageB->fresh()->status,
            'Fixture is wrong: org B did not unpublish anything, so nothing was proved about org A.');

        $this->assertSame(LandingPage::STATUS_PUBLISHED, $pageA->fresh()->status,
            'A cancelled tenant took another tenant\'s page off the internet.');
        $this->publicGet($pageA)->assertOk();
    }

    /**
     * The entitlement buys the ability to PUBLISH, and it still does. This
     * org's subscription is perfectly healthy — the only thing it lacks is
     * the feature, so a 402 here can only have come from the entitlement
     * gate and not from the billing one.
     */
    #[DataProvider('buildVerbProvider')]
    public function test_the_entitlement_still_refuses_a_downgraded_org_on_the_build_verbs(string $method, string $uri): void
    {
        $org  = $this->org('ACTIVE', 'growth', ['reviews' => true]);
        $page = $this->livePage($org, 'downgraded-' . strtolower($method) . '-' . substr(md5($uri), 0, 6), '+44 113 000 0005');

        Sanctum::actingAs($this->user($org), ['*']);

        $response = $this->json($method, $this->adminUrl($uri));

        $response->assertStatus(402);
        $this->assertSame('feature_locked', $response->json('code'));
        $this->assertSame('landing_pages', $response->json('feature'));

        // Nothing was built, and the live page was not touched on the way past.
        $this->assertSame(LandingPage::STATUS_PUBLISHED, $page->fresh()->status);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function buildVerbProvider(): array
    {
        return [
            'create'      => ['POST', '/api/v1/admin/landing-pages'],
            'update'      => ['PUT',  '/api/v1/admin/landing-pages'],
            'publish'     => ['POST', '/api/v1/admin/landing-pages/publish'],
            'preview-url' => ['POST', '/api/v1/admin/landing-pages/preview-url'],
        ];
    }

    /**
     * The exclusion is one route wide. A dead subscription still cannot
     * PUBLISH — that refusal is `check.subscription`'s, on the enclosing
     * admin group, and it has to still be reached from the routes that did
     * not opt out. Without this, `withoutMiddleware` applied a level too high
     * would leave every test above green.
     */
    public function test_a_dead_subscription_still_cannot_publish(): void
    {
        $org = $this->org('CANCELLED');

        // Draft, so a 403 cannot be mistaken for "there was nothing to publish".
        app()->instance('current_organization_id', $org->id);
        LandingPage::create([
            'organization_id' => $org->id,
            'slug'            => 'still-blocked',
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'draft',
        ]);
        app()->forgetInstance('current_organization_id');

        Sanctum::actingAs($this->user($org), ['*']);

        $this->postJson($this->adminUrl('/api/v1/admin/landing-pages/publish'))->assertStatus(403);

        $this->get('http://' . config('landing.host') . '/still-blocked')->assertNotFound();
    }
}
