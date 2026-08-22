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
 * Not driven over HTTP: reaching these routes needs `saas.auth` + Sanctum +
 * `check.subscription` on top of the gate, and this repo has no harness for
 * that stack — see LandingPageAdminApiTest's docblock, which makes the same
 * call for the same reason. The gate parameter is read off the route rather
 * than spelled here, so a route gated on a feature key no plan grants (or on
 * the wrong key entirely) cannot pass these.
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

        // RequireFeature reads $org->plan_slug into both 402 bodies.
        // SetsUpMinimalSchema's organizations table has no such column
        // (nothing else needs it); add it for this suite only, exactly as
        // Tests\Feature\Middleware\RequireFeatureTest does.
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($table) {
                $table->string('plan_slug', 32)->nullable();
            });
        }
    }

    public function test_the_admin_endpoints_require_the_enterprise_feature(): void
    {
        $routes = collect(Route::getRoutes())
            ->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/landing-pages'));

        $this->assertNotEmpty($routes, 'No landing-page admin routes exist.');

        foreach ($routes as $r) {
            $this->assertContains('feature:landing_pages', $r->gatherMiddleware(),
                "{$r->uri()} is reachable without the landing_pages entitlement.");
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
     * The feature key the routes are actually gated on, read from the route
     * collection rather than spelled here. A rename in routes/api.php that
     * points the gate at a key nothing grants would otherwise leave both
     * tests above green while every Enterprise customer got a 402.
     */
    private function gatedFeature(): string
    {
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/landing-pages'));

        $this->assertNotNull($route, 'No landing-page admin routes exist.');

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
