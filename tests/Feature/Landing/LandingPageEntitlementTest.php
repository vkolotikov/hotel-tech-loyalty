<?php
namespace Tests\Feature\Landing;

use App\Http\Middleware\RequireFeature;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The landing-page builder is an Enterprise feature, but only the BUILDER is.
 *
 * Two things have to hold, and neither implies the other: the gate must be
 * ATTACHED to every admin route (middleware nobody applies is indistinguishable
 * from no middleware), and it must actually REFUSE an org that has not bought
 * the feature. The first two tests here cover attachment. The last two run the
 * gate the routes name, over the feature key the routes name, and watch a real
 * org bounce off it with a 402 and pass through when entitled.
 *
 * Not driven over HTTP: these tests are about which middleware is on which
 * route, which the route collection answers directly and a request cannot —
 * a 402 over the wire says an org was refused, not that the gate is still
 * attached to the four routes that need it. LandingPageTeardownTest builds
 * the request-stack harness (`saas.auth` + Sanctum + `tenant` + `brand` +
 * `admin` + `check.subscription`) and drives the assembled result over HTTP;
 * that is the complementary half, not a substitute for this one. The gate
 * parameter is read off the route rather than spelled here, so a route gated
 * on a feature key no plan grants (or on the wrong key entirely) cannot pass
 * these.
 *
 * The asymmetry between admin and public is the whole design: the admin API is
 * gated so an org without the entitlement cannot build a page, while the
 * public renderer is not, so an already-published page does not vanish from
 * the internet because a card expired mid-month. A customer standing in front
 * of a shopfront QR code is not party to our billing relationship.
 */
class LandingPageEntitlementTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // Only the HTTP-driven test below needs this (BrandMiddleware joins
        // `brands` through `brand_user` for every staff request), but it is
        // additive and every other test in this file ignores tables it
        // doesn't query.
        $this->setUpLandingContentSchema();

        // RequireFeature reads $org->plan_slug into both 402 bodies.
        // SetsUpMinimalSchema's organizations table has no such column
        // (nothing else needs it); add it for this suite only, exactly as
        // Tests\Feature\Middleware\RequireFeatureTest does.
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($table) {
                $table->string('plan_slug', 32)->nullable();
            });
        }

        // Only test_a_non_enterprise_org_cannot_reach_the_wizard_endpoints
        // below drives real HTTP through the whole admin stack (the rest of
        // this file asks the route collection or the middleware directly),
        // and that stack's CheckSubscription and BrandMiddleware both read
        // these two tables. Same two, same shapes, as
        // LandingPageTeardownTest's setUp — nothing else in this file needs
        // them.
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

    /**
     * The paths that BUILD a page. Teardown is deliberately not among them —
     * see the block below.
     */
    private const BUILD_VERBS = [
        'api/v1/admin/landing-pages',
        'api/v1/admin/landing-pages/publish',
        'api/v1/admin/landing-pages/preview-url',
    ];

    /**
     * Taking a page down is not something a tenant has to still be paying
     * for — and neither is seeing that there is a page to take down.
     * `status` is the read half of the same story as `unpublish` (Task
     * 10b): the admin SPA cannot show a lapsed tenant "your page is live at
     * X" without a call that survives a dead subscription too, and it
     * carries none of the edit surface `show()` does.
     */
    private const TEARDOWN_VERBS = [
        'api/v1/admin/landing-pages/unpublish',
        'api/v1/admin/landing-pages/status',
    ];

    public function test_the_admin_endpoints_require_the_enterprise_feature(): void
    {
        $routes = collect(Route::getRoutes())
            ->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/landing-pages'))
            ->reject(fn ($r) => in_array($r->uri(), self::TEARDOWN_VERBS, true));

        $this->assertNotEmpty($routes, 'No landing-page admin routes exist.');

        foreach ($routes as $r) {
            $this->assertContains('feature:landing_pages', $r->gatherMiddleware(),
                "{$r->uri()} is reachable without the landing_pages entitlement.");
        }

        // The reject() above is a hole in this test, so name what may fall
        // through it. A new build verb added to the teardown list — or
        // teardown quietly widened to cover publish — would otherwise leave
        // this green while an unentitled org could publish.
        foreach (self::BUILD_VERBS as $uri) {
            $this->assertContains($uri, $routes->map->uri()->all(),
                "{$uri} is no longer gated on the entitlement.");
        }
    }

    /**
     * A former customer must be able to take their own live page DOWN.
     *
     * Gating the whole group meant the opposite, through two separate
     * refusals: after a downgrade unpublish answered 402 feature_locked from
     * `feature:landing_pages`, and after a cancellation 403
     * subscription_required from `check.subscription` on the enclosing
     * `admin` group — while the page carried on serving 200 to the public
     * with that tenant's prices, staff names, phone number and address on
     * it. The only remaining way off the internet was a manual UPDATE by us.
     * That is a data-protection problem wearing a billing gate: the
     * entitlement buys the ability to PUBLISH, and nothing about ceasing to
     * pay should compel a business to stay published.
     *
     * Both refusals are asserted, because closing one leaves the tenant just
     * as stuck as before: a downgraded org gets past the first and a
     * cancelled org still bounces off the second.
     */
    public function test_the_teardown_verbs_are_reachable_without_the_entitlement(): void
    {
        foreach (self::TEARDOWN_VERBS as $uri) {
            $route = collect(Route::getRoutes())->first(fn ($r) => $r->uri() === $uri);

            $this->assertNotNull($route, "{$uri} does not exist.");
            $this->assertNotContains('feature:landing_pages', $route->gatherMiddleware(),
                "{$uri} still needs the entitlement, so a downgraded tenant cannot take their page down.");

            // gatherMiddleware() would still list the alias inherited from
            // the `admin` group whether or not the route excluded it;
            // gatherRouteMiddleware() resolves aliases AND applies the
            // route's exclusions, so this is the only form that can see the
            // difference.
            $this->assertNotContains(
                \App\Http\Middleware\CheckSubscription::class,
                Route::gatherRouteMiddleware($route),
                "{$uri} still needs a live subscription, so a cancelled tenant cannot take their page down.",
            );
        }
    }

    /**
     * ...and ungating teardown must cost nothing else. The entitlement is a
     * BILLING gate; authentication, staff-only access and the tenant scope
     * are not, and dropping one of those while moving the route out of the
     * group would turn "let a former customer unpublish" into "let anyone
     * unpublish anyone's page".
     *
     * Asserted through gatherRouteMiddleware, which resolves aliases and
     * group names to classes — the route's own gatherMiddleware() would
     * report the alias strings and pass whether or not the middleware was
     * reachable. Cross-tenant refusal is the controller's half of this and
     * lives in LandingPageAdminApiTest.
     */
    public function test_teardown_is_still_authenticated_staff_only_and_tenant_scoped(): void
    {
        foreach (self::TEARDOWN_VERBS as $uri) {
            $route = collect(Route::getRoutes())->first(fn ($r) => $r->uri() === $uri);
            $this->assertNotNull($route, "{$uri} does not exist.");

            $stack = Route::gatherRouteMiddleware($route);

            foreach ([
                \App\Http\Middleware\SaasAuthMiddleware::class => "{$uri} no longer authenticates.",
                \App\Http\Middleware\AdminMiddleware::class    => "{$uri} is no longer staff-only.",
                \App\Http\Middleware\TenantMiddleware::class   => "{$uri} no longer binds a tenant.",
            ] as $class => $message) {
                $this->assertContains($class, $stack, $message);
            }

            // auth:sanctum resolves to Authenticate with its guard appended,
            // so it is a prefixed string rather than a bare class name.
            $this->assertNotEmpty(
                array_filter($stack, fn ($m) => is_string($m)
                    && str_starts_with($m, \Illuminate\Auth\Middleware\Authenticate::class . ':')),
                "{$uri} is reachable without a Sanctum token."
            );
        }
    }

    public function test_the_public_renderer_is_not_gated(): void
    {
        // A published page must not vanish because a card expired mid-month.
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => $r->getName() === 'landing.show');

        $this->assertNotNull($route);
        $this->assertNotContains('feature:landing_pages', $route->gatherMiddleware());
    }

    public function test_an_org_without_the_entitlement_gets_a_402_from_the_admin_api(): void
    {
        // An org on a lesser plan, subscription perfectly healthy: the only
        // thing it is missing is this feature. Anything else would let the
        // 402 come from `subscription_inactive` instead and prove nothing
        // about the entitlement.
        $org = $this->orgWith(['reviews' => true, 'campaigns' => true], 'growth');

        $response = $this->runTheGate($org);

        $this->assertSame(402, $response->getStatusCode(),
            'An org that has not bought the landing-page builder reached the admin API.');

        $body = json_decode($response->getContent(), true);

        $this->assertSame('feature_locked', $body['code'] ?? null,
            'The refusal is not the shape the SPA interceptor listens for.');
        $this->assertSame($this->gatedFeature(), $body['feature'] ?? null);
        $this->assertSame('growth', $body['plan'] ?? null);
    }

    /**
     * The other half, and not a formality: without it the test above passes
     * just as well against a gate that refuses everyone, or against a feature
     * key no plan in the catalog will ever contain.
     */
    public function test_an_entitled_org_is_let_through(): void
    {
        $org = $this->orgWith([$this->gatedFeature() => true], 'enterprise');

        $response = $this->runTheGate($org);

        $this->assertSame(200, $response->getStatusCode(),
            'An entitled org was refused; the gate refuses everybody and the 402 test above is vacuous.');
        $this->assertSame('reached the controller', $response->getContent());
    }

    /**
     * The wizard's own two endpoints (Task 4), proven the same way
     * LandingPageTeardownTest proves teardown: driven over the real HTTP
     * stack, not against RequireFeature run in isolation the way the two
     * tests above are. That distinction is the point — the SPA's own
     * `useSubscription().hasFeature()` returns `true` on localhost before it
     * has read anything at all, so clicking through the wizard in a
     * browser proves nothing about this gate. Only a 402 that came out the
     * other end of routing, the container-bound tenant, BrandMiddleware and
     * the real `LandingOnboardingController` / `LandingPageSectionController`
     * can prove it.
     *
     * Growth, not a plan with nothing: close enough that a 402 here can only
     * have come from the missing `landing_pages` entitlement, not from
     * `check.subscription` (this org's subscription is ACTIVE) or from a
     * catalog with no features granted at all.
     */
    public function test_a_non_enterprise_org_cannot_reach_the_wizard_endpoints(): void
    {
        $org = $this->orgWith(['reviews' => true, 'campaigns' => true], 'growth');

        Sanctum::actingAs(User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            'user_type'       => 'staff',
        ]), ['*']);

        $this->getJson('/api/v1/admin/landing-pages/onboarding')->assertStatus(402)
            ->assertJsonPath('code', 'feature_locked')
            ->assertJsonPath('feature', 'landing_pages');

        $this->postJson('/api/v1/admin/landing-pages/onboarding', [])->assertStatus(402)
            ->assertJsonPath('code', 'feature_locked');

        $this->putJson('/api/v1/admin/landing-pages/sections', ['sections' => []])->assertStatus(402)
            ->assertJsonPath('code', 'feature_locked');
    }

    /**
     * The feature key the routes are actually gated on, read from the route
     * collection rather than spelled here. A rename in routes/api.php that
     * points the gate at a key nothing grants would otherwise leave both
     * tests above green while every Enterprise customer got a 402.
     */
    private function gatedFeature(): string
    {
        // Teardown is ungated on purpose, so reading the gate off whichever
        // landing-pages route happens to sort first would find no gate at all
        // and fail every test in this file for the wrong reason.
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/landing-pages')
                && !in_array($r->uri(), self::TEARDOWN_VERBS, true));

        $this->assertNotNull($route, 'No gated landing-page admin routes exist.');

        $gate = collect($route->gatherMiddleware())
            ->first(fn ($m) => is_string($m) && str_starts_with($m, 'feature:'));

        $this->assertNotNull($gate, 'The landing-page admin routes carry no feature gate.');

        return explode(':', $gate, 2)[1];
    }

    private function orgWith(array $features, string $planSlug): Organization
    {
        return Organization::create([
            'name'                => 'Glamour',
            'slug'                => 'glamour-' . uniqid(),
            'plan_features'       => $features,
            'subscription_status' => 'ACTIVE',
            'plan_slug'           => $planSlug,
        ]);
    }

    /** Run the real middleware, with the real gate parameter, as a real user. */
    private function runTheGate(Organization $org): Response
    {
        $user = User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            // Not a platform admin: RequireFeature waves those through
            // regardless of plan, which would make this test vacuous.
            'user_type'       => 'staff',
        ]);

        Auth::login($user);

        return (new RequireFeature)->handle(
            Request::create('/api/v1/admin/landing-pages'),
            fn () => new Response('reached the controller'),
            $this->gatedFeature(),
        );
    }
}
