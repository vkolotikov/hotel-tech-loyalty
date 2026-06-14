<?php

namespace Tests\Feature\Middleware;

use App\Http\Middleware\RequireFeature;
use App\Models\Organization;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the RequireFeature middleware contract — the gate that
 * powers the v2 (Enterprise-only: time_management, admin_ai,
 * brands) and v3 (Growth+: campaigns, reviews, engagement, wallet,
 * chatbot) feature enforcement on 8 route groups.
 *
 * Three response shapes the frontend depends on:
 *
 *   200 PASS — request continues to the controller
 *
 *   402 + code='subscription_inactive' + plan=<slug>
 *     → frontend `useSubscription` SubscriptionWall renders
 *
 *   402 + code='feature_locked' + feature=<key> + plan=<slug>
 *      + upgrade_url
 *     → frontend api.ts interceptor dispatches `feature:locked`
 *       window event → UpgradeFeatureModal renders the
 *       upgrade flow
 *
 *   403 + code='no_org' — defensive (auth path bug, should
 *     never happen in normal flow)
 *
 * Platform-admin bypass: hotel-tech.ai operator emails listed in
 * services.saas.platform_admin_emails get full pass-through
 * regardless of plan / status. Mirrors the synthetic-features map
 * in AuthController::subscription so SPA hasFeature() agrees
 * with the actual middleware enforcement.
 */
class RequireFeatureTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private RequireFeature $middleware;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        // The middleware reads $org->plan_slug — SetsUpMinimalSchema's
        // organizations table doesn't include it (other tests don't
        // need it). Add the column for this suite only.
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($t) {
                $t->string('plan_slug', 32)->nullable();
            });
        }
        // UserFactory stamps `email_verified_at` + `remember_token`
        // which aren't in the minimal users schema (other tests
        // don't need them). Add for this suite.
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', function ($t) {
                $t->timestamp('email_verified_at')->nullable();
                $t->string('remember_token', 100)->nullable();
            });
        }
        $this->middleware = new RequireFeature();
    }

    /** Helper: build an org with explicit plan_features + status. */
    private function orgWith(array $features, string $status = 'ACTIVE', string $planSlug = 'growth'): Organization
    {
        return OrganizationFactory::new()->create([
            'plan_features'       => $features,
            'subscription_status' => $status,
            'plan_slug'           => $planSlug,
        ]);
    }

    /** Helper: a user with the given org, logged in. */
    private function loginAs(?Organization $org, string $email = 'staff@example.com'): User
    {
        $u = UserFactory::new()->create([
            'organization_id' => $org?->id,
            'email'           => $email,
        ]);
        Auth::login($u);
        return $u;
    }

    /** Helper: invoke the middleware with feature `$name`. */
    private function invoke(string $name): SymfonyResponse
    {
        return $this->middleware->handle(
            Request::create('/v1/admin/whatever', 'GET'),
            fn () => new Response('PASS', 200),
            $name,
        );
    }

    /* ─── 200 PASS-THROUGH path ─── */

    public function test_feature_unlocked_allows_request_through(): void
    {
        $this->loginAs($this->orgWith(['campaigns' => true]));

        $resp = $this->invoke('campaigns');

        $this->assertSame(200, $resp->getStatusCode());
        $this->assertSame('PASS', $resp->getContent(),
            'next() closure must run when feature is unlocked.');
    }

    public function test_trialing_subscription_counts_as_active(): void
    {
        // Trialing orgs unlock features per their trial plan_features
        // map. Locked because: an early audit bug treated trial as
        // "no sub" and 402'd every trialing customer.
        $this->loginAs($this->orgWith(
            features: ['campaigns' => true],
            status: 'TRIALING',
        ));

        $resp = $this->invoke('campaigns');
        $this->assertSame(200, $resp->getStatusCode());
    }

    /* ─── Platform-admin bypass ─── */

    public function test_platform_admin_bypasses_every_gate(): void
    {
        // Platform admin (the operator running hotel-tech.ai) gets
        // pass-through regardless of plan or sub state — used for
        // production triage / impersonation flows. Without this,
        // a super-admin debugging a 402'd request would get 402'd
        // on its own debug route.
        Config::set('services.saas.platform_admin_emails', 'admin@hotel-tech.ai,ops@hotel-tech.ai');

        // Even with NO org context AND no features the admin gets
        // through.
        $this->loginAs(null, 'admin@hotel-tech.ai');

        $resp = $this->invoke('time_management');
        $this->assertSame(200, $resp->getStatusCode(),
            'Platform admin email MUST bypass — every gate, every plan.');
    }

    public function test_platform_admin_match_is_case_insensitive(): void
    {
        Config::set('services.saas.platform_admin_emails', 'ADMIN@hotel-tech.ai');

        $this->loginAs(null, 'admin@hotel-tech.ai');

        $resp = $this->invoke('admin_ai');
        $this->assertSame(200, $resp->getStatusCode(),
            'Case-insensitive email match — operator typos do not lock them out of their own platform.');
    }

    public function test_non_admin_email_does_not_bypass(): void
    {
        // Defense: a regular customer with email that LOOKS similar
        // (e.g. 'admin@customer.com') MUST NOT bypass. Strict
        // whitelist by exact-equals after lowercase normalisation.
        Config::set('services.saas.platform_admin_emails', 'admin@hotel-tech.ai');

        $this->loginAs($this->orgWith([]), 'admin@customer.com');

        $resp = $this->invoke('admin_ai');
        $this->assertSame(402, $resp->getStatusCode(),
            'Substring match MUST NOT count as platform-admin.');
    }

    /* ─── 403 / no org context ─── */

    public function test_no_org_context_returns_403_with_no_org_code(): void
    {
        // Defensive: a user without an organization (auth-path bug
        // — shouldn't happen in normal flow) gets a 403 with a
        // distinct code so monitoring distinguishes from 402s.
        Config::set('services.saas.platform_admin_emails', ''); // ensure no admin bypass
        $this->loginAs(null);

        $resp = $this->invoke('campaigns');

        $this->assertSame(403, $resp->getStatusCode());
        $body = json_decode($resp->getContent(), true);
        $this->assertSame('no_org', $body['code']);
    }

    /* ─── 402 / subscription inactive ─── */

    public function test_canceled_subscription_returns_402_subscription_inactive(): void
    {
        $org = $this->orgWith(
            features: ['campaigns' => true],
            status: 'CANCELED',
            planSlug: 'growth',
        );
        $this->loginAs($org);

        $resp = $this->invoke('campaigns');

        $this->assertSame(402, $resp->getStatusCode(),
            '402 Payment Required is the canonical SaaS-gate status.');
        $body = json_decode($resp->getContent(), true);
        $this->assertSame('subscription_inactive', $body['code']);
        $this->assertSame('growth', $body['plan'],
            'plan slug surfaces so SPA can route to the right upgrade page.');
    }

    public function test_expired_subscription_returns_402_subscription_inactive(): void
    {
        $org = $this->orgWith(
            features: ['campaigns' => true],
            status: 'EXPIRED',
        );
        $this->loginAs($org);

        $resp = $this->invoke('campaigns');
        $body = json_decode($resp->getContent(), true);

        $this->assertSame(402, $resp->getStatusCode());
        $this->assertSame('subscription_inactive', $body['code']);
    }

    public function test_unpaid_subscription_returns_402_subscription_inactive(): void
    {
        // Stripe routes terminal failures through `customer.subscription.updated`
        // status=UNPAID when dunning retries run out. SaaS-side handler now
        // deprovisions tools on this transition. The loyalty middleware
        // is the second-line guard.
        $org = $this->orgWith(['campaigns' => true], 'UNPAID');
        $this->loginAs($org);

        $resp = $this->invoke('campaigns');
        $body = json_decode($resp->getContent(), true);

        $this->assertSame(402, $resp->getStatusCode());
        $this->assertSame('subscription_inactive', $body['code']);
    }

    /* ─── 402 / feature_locked — THE main v2+v3 enforcement path ─── */

    public function test_feature_missing_from_plan_returns_402_feature_locked(): void
    {
        // The canonical v2/v3 case: ACTIVE sub on Starter, hits a
        // Growth+ route. Body shape MUST match the frontend
        // UpgradeFeatureModal contract.
        $org = $this->orgWith(
            features: [], // Starter plan: no Growth+ features
            status: 'ACTIVE',
            planSlug: 'starter',
        );
        $this->loginAs($org);

        $resp = $this->invoke('campaigns');

        $this->assertSame(402, $resp->getStatusCode());
        $body = json_decode($resp->getContent(), true);
        $this->assertSame('feature_locked', $body['code']);
        $this->assertSame('campaigns', $body['feature'],
            'feature key surfaces so UpgradeFeatureModal can show the right copy.');
        $this->assertSame('starter', $body['plan'],
            'plan slug surfaces so SPA can show "your current plan is …".');
        $this->assertArrayHasKey('upgrade_url', $body,
            'upgrade_url MUST be present so SPA can deep-link to Checkout.');
    }

    public function test_feature_explicitly_false_returns_402_feature_locked(): void
    {
        // `false` is the canonical "off" value in plan_features.
        // Locked separate from "missing" because pre-fix, an
        // explicit false used to short-circuit `array_key_exists`
        // and slip through.
        $org = $this->orgWith(['admin_ai' => false], 'ACTIVE');
        $this->loginAs($org);

        $resp = $this->invoke('admin_ai');
        $body = json_decode($resp->getContent(), true);

        $this->assertSame(402, $resp->getStatusCode());
        $this->assertSame('feature_locked', $body['code']);
    }

    public function test_feature_string_truthy_unlocks(): void
    {
        // SaaS catalog stores feature flags as STRINGS in DB jsonb
        // (Postgres jsonb has no bool primitive — everything comes
        // back as string). 'true' / 'enabled' / non-empty all
        // unlock per hasFeature() semantics.
        foreach (['true', 'enabled', '1', 'yes', 'limited'] as $val) {
            $org = $this->orgWith(['campaigns' => $val], 'ACTIVE');
            $this->loginAs($org, "string-{$val}@example.com");

            $resp = $this->invoke('campaigns');
            $this->assertSame(200, $resp->getStatusCode(),
                "String value '{$val}' MUST unlock the feature per hasFeature contract.");
        }
    }

    public function test_feature_string_falsy_returns_402(): void
    {
        // Falsy strings MUST be treated as "off". Pre-fix, any
        // non-empty string slipped through — including 'false' /
        // 'no' / '0' which are obviously off semantically.
        foreach (['false', 'no', '0', 'none', ''] as $val) {
            $org = $this->orgWith(['campaigns' => $val], 'ACTIVE');
            $this->loginAs($org, "falsy-{$val}@example.com");

            $resp = $this->invoke('campaigns');
            $this->assertSame(402, $resp->getStatusCode(),
                "Falsy string '{$val}' MUST be treated as locked.");
        }
    }

    /* ─── Auth not-logged-in edge ─── */

    public function test_anonymous_request_returns_403_no_org(): void
    {
        // No Auth::login() → Auth::user() = null → $org = null →
        // hits the no_org branch. (Real routes have an `auth`
        // middleware in front, but defense in depth catches a
        // misconfigured route group.)
        Auth::logout();
        Config::set('services.saas.platform_admin_emails', '');

        $resp = $this->invoke('campaigns');

        $this->assertSame(403, $resp->getStatusCode());
        $body = json_decode($resp->getContent(), true);
        $this->assertSame('no_org', $body['code']);
    }
}
