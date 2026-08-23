<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
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
     */
    private function livePage(Organization $org, string $slug, string $phone): LandingPage
    {
        // The tenant scope is what the model's own creating hooks read, so
        // it is bound for the write and released again — every request below
        // rebinds it through TenantMiddleware.
        app()->instance('current_organization_id', $org->id);

        $page = LandingPage::create([
            'organization_id' => $org->id,
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
            'name'            => 'Glamour Salon',
            'address'         => '12 High Street',
            'phone'           => $phone,
            'is_active'       => true,
        ]);

        app()->forgetInstance('current_organization_id');

        return $page;
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

    // ─── ...and nothing else may be weakened ─────────────────────────────

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
