<?php

namespace Tests\Feature\Auth;

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Regression guard for Task 9b's Fix 1: two "grant everything" feature
 * maps inside AuthController::subscription() are hand-maintained arrays
 * that exist purely so a platform admin (hotel-tech.ai operator) never
 * sees an Enterprise-only route/page as locked in the SPA. They are NOT
 * read from getTrialFeatures('enterprise') — they are separate literals
 * that must independently be kept a superset of it.
 *
 * That's exactly how landing_pages fell through: Phase 1 added it to
 * getTrialFeatures('enterprise') (the plan a platform admin is meant to
 * have implicit parity with) and to neither of these two blocks. The
 * backend's own RequireFeature middleware still let a platform admin
 * through (it has its own unconditional isPlatformAdmin() bypass, keyed
 * on nothing), but the SPA never got that far: useSubscription().
 * hasFeature('landing_pages') read false from this endpoint's response,
 * and GatedRoute (frontend/src/App.tsx) bounced the platform admin off
 * /landing-pages before a single request reached the backend.
 *
 * Rather than pin the exact key list here (a third hand-maintained copy
 * of the same problem), this diffs the two blocks against
 * getTrialFeatures('enterprise') itself — the plan catalog's own
 * source of truth — via reflection (the method is private; it has no
 * public affordance and refactoring it is out of scope for this fix).
 * Adding a new Enterprise-only key to the plan without touching either
 * platform-admin block now fails here immediately, instead of shipping
 * silently until an operator notices they personally can't reach their
 * own new feature.
 *
 * Checks VALUE truthiness, not just key presence — round-1 review caught
 * that a first version of this guard used array_diff() on the key sets
 * alone, so a platform-admin key present but set to the STRING 'false'
 * (e.g. 'landing_pages' => 'false') passed it while reproducing the exact
 * lockout this test exists to catch: frontend hasFeature() reads the
 * string 'false' as not-entitled, same as a missing key. Comparing full
 * value equality would be wrong the other way — 'ai_avatars' is 'false'
 * on the enterprise plan (not sold there) but 'true' in both
 * platform-admin blocks (they grant literally everything, a strict
 * superset, not a mirror) — so equality would fail a block that is
 * MORE generous than required. The only correct invariant: every
 * enterprise key that is truthy under the SPA's own hasFeature()
 * semantics (frontend/src/hooks/useSubscription.ts:96-112 — 'true' or
 * 'unlimited' → true, 'false' → false, else numeric > 0) must also be
 * truthy — not necessarily identical — in each platform-admin block.
 * isTruthyFeatureValue() below is that same truth table, kept in this
 * file rather than shared with the TS source because there is nothing
 * in this PHP codebase to import it from.
 *
 * Deliberately does not attempt the same comparison for the frontend's
 * mirrored ALL_FEATURES constant (frontend/src/hooks/useSubscription.ts)
 * — see task-9b-report.md for why a matching guard there is not a
 * comparably cheap addition.
 *
 * Residual blind spot: this only diffs the two platform-admin blocks
 * against getTrialFeatures('enterprise'). A feature added to the SaaS
 * plan_features catalog and gated with RequireFeature but NEVER added to
 * getTrialFeatures() is invisible to this test — there would be nothing
 * here to diff against, and the omission would only surface if the
 * SaaS-unreachable trial-fallback path was also exercised for that plan.
 */
class PlatformAdminFeatureParityTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
    }

    /**
     * The isPlatformAdmin() branch — reachable any time SaaS is
     * configured and the request carries a platform-admin email. This is
     * the path a real deployed operator hits.
     */
    public function test_platform_admin_branch_grants_every_enterprise_feature_key(): void
    {
        Config::set('services.saas.platform_admin_emails', 'admin@hotel-tech.ai');
        Config::set('services.saas.api_url', 'https://saas.hotel-tech.ai/api');

        $user = User::create([
            'name'      => 'Platform Admin',
            'email'     => 'admin@hotel-tech.ai',
            'user_type' => 'staff',
        ]);

        $body = $this->callSubscription($user);

        $this->assertTrue($body['isSuperAdmin'] ?? false,
            'Fixture did not take the platform-admin branch — the rest of this test proves nothing.');

        $this->assertGrantsEveryTruthyEnterpriseFeature($body['features'] ?? [],
            'Platform-admin block (AuthController::subscription, isPlatformAdmin branch)');
    }

    /**
     * The "truly local dev, SaaS not configured at all" fallback branch
     * — a second, independent literal that grants a non-admin user every
     * feature so local development never sees a gated UI. Reached when
     * services.saas.api_url is empty and the user has no cached org
     * subscription data.
     */
    public function test_local_dev_fallback_grants_every_enterprise_feature_key(): void
    {
        Config::set('services.saas.platform_admin_emails', ''); // not a platform admin
        Config::set('services.saas.api_url', '');                // "truly local, no SaaS"

        $user = User::create([
            'name'      => 'Local Dev User',
            'email'     => 'dev@example.test',
            'user_type' => 'staff',
        ]);

        $body = $this->callSubscription($user);

        $this->assertSame('LOCAL', $body['status'] ?? null,
            'Fixture did not take the local-dev fallback branch — the rest of this test proves nothing.');

        $this->assertGrantsEveryTruthyEnterpriseFeature($body['features'] ?? [],
            'Local-dev fallback block (AuthController::subscription, "truly local dev" branch)');
    }

    /** Invoke the real controller method directly — no route/middleware stack needed for this check. */
    private function callSubscription(User $user): array
    {
        $request = Request::create('/api/v1/auth/subscription', 'GET');
        $request->setUserResolver(fn () => $user);

        $response = app(AuthController::class)->subscription($request);

        return json_decode($response->getContent(), true) ?? [];
    }

    /**
     * For every enterprise key that is truthy under the SPA's own
     * hasFeature() semantics, assert the block's value for that same key
     * is ALSO truthy — not identical (see class docblock for why identity
     * would be the wrong check), and not merely present with a falsy
     * value like the string 'false' (why key-presence alone was the wrong
     * check — that's the exact bug this test exists to catch).
     */
    private function assertGrantsEveryTruthyEnterpriseFeature(array $features, string $blockLabel): void
    {
        $entitledOnEnterprise = array_keys(array_filter(
            $this->enterpriseFeatures(),
            fn ($v) => $this->isTruthyFeatureValue($v),
        ));

        $notTruthyHere = array_values(array_filter(
            $entitledOnEnterprise,
            fn ($key) => !$this->isTruthyFeatureValue($features[$key] ?? null),
        ));

        $this->assertSame([], $notTruthyHere,
            "{$blockLabel} does not grant Enterprise feature key(s): " . implode(', ', $notTruthyHere)
            . '. A platform admin will read hasFeature() as false for these and bounce off the gated route,'
            . ' whether the key is missing entirely or present with a falsy value (e.g. the string \'false\').');
    }

    /**
     * getTrialFeatures('enterprise') is private and stays that way — this
     * reflects into it rather than duplicating its key list, so the only
     * thing this test can drift from is the real method.
     */
    private function enterpriseFeatures(): array
    {
        $method = new ReflectionMethod(AuthController::class, 'getTrialFeatures');
        $method->setAccessible(true);

        return $method->invoke(app(AuthController::class), 'enterprise');
    }

    /**
     * Mirrors frontend/src/hooks/useSubscription.ts:96-112's hasFeature()
     * truth table exactly, so "truthy" here means the same thing it means
     * to the SPA that actually reads this response. Values that are
     * present but neither a recognised flag string nor a positive number
     * (e.g. 'priority_support' => 'dedicated') are NOT truthy under this
     * table — same as the frontend, which would also read them as false
     * through hasFeature(). Those keys are excluded from the comparison
     * entirely (never entitledOnEnterprise), so this test makes no claim
     * about them.
     */
    private function isTruthyFeatureValue($value): bool
    {
        if (!$value) return false; // null, '', missing
        if ($value === 'true' || $value === 'unlimited') return true;
        if ($value === 'false') return false;

        return is_numeric($value) && (float) $value > 0;
    }
}
