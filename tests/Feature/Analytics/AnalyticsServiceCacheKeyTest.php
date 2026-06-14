<?php

namespace Tests\Feature\Analytics;

use App\Services\AnalyticsService;
use Database\Factories\OrganizationFactory;
use Illuminate\Contracts\Container\BindingResolutionException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks AnalyticsService's per-org cache-key suffixing — the
 * audit-fix wave landed in 2026-06-01 that prevents one tenant
 * from pinning their cached results for every other tenant
 * until TTL expiry.
 *
 * The CLAUDE.md audit-fix entry calls this out as one of the
 * deferred follow-ups that was eventually shipped. Pre-fix,
 * the first tenant to call getDashboardKpis() would populate
 * a cache key like 'dashboard:loyalty_kpis' that subsequent
 * tenants would read verbatim — silent cross-tenant data leak.
 *
 * Critical invariants:
 *
 *   1. orgKey('foo') appends ':org:{current_organization_id}'
 *      to every key — multi-tenant isolation by construction.
 *
 *   2. Different orgs MUST produce different cache keys for
 *      the same logical name.
 *
 *   3. The org context binding is REQUIRED at call time —
 *      calling without it must throw BindingResolutionException
 *      (the docblock makes this explicit: "if the binding is
 *      missing, calling these methods is a bug and the loud
 *      failure is correct").
 *
 *   4. clearDashboardCache() forgets ONLY the current org's
 *      keys, not other tenants'. The forget list must walk
 *      through orgKey() too.
 *
 *   5. End-to-end multi-tenant safety: org A's totalMembers
 *      cached result must NOT show up for org B.
 */
class AnalyticsServiceCacheKeyTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private ReflectionMethod $orgKey;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        Cache::flush();

        $this->orgKey = new ReflectionMethod(AnalyticsService::class, 'orgKey');
        $this->orgKey->setAccessible(true);
    }

    protected function tearDown(): void
    {
        Cache::flush();
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function invokeOrgKey(string $base): string
    {
        return $this->orgKey->invoke(null, $base);
    }

    public function test_orgKey_appends_org_id_suffix(): void
    {
        // The contract: orgKey('foo') returns 'foo:org:{id}'.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $key = $this->invokeOrgKey('dashboard:loyalty_kpis');

        $this->assertSame("dashboard:loyalty_kpis:org:{$org->id}", $key);
    }

    public function test_different_orgs_produce_different_cache_keys(): void
    {
        // The load-bearing multi-tenant invariant. Two different
        // bound orgs must yield two different cache keys for the
        // same logical name — otherwise the first to write owns
        // the cache for everyone.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        $keyA = $this->invokeOrgKey('analytics:tier_distribution');

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        $keyB = $this->invokeOrgKey('analytics:tier_distribution');

        $this->assertNotSame($keyA, $keyB,
            'Same logical key across different orgs MUST produce different cache keys.');
        $this->assertStringEndsWith(":org:{$orgA->id}", $keyA);
        $this->assertStringEndsWith(":org:{$orgB->id}", $keyB);
    }

    public function test_orgKey_throws_when_no_org_context_bound(): void
    {
        // The "loud failure" invariant per the docblock.
        // BindingResolutionException is intentional — calling
        // analytics methods without an org context is a bug,
        // and silent fall-through to a global cache key would
        // re-introduce the multi-tenant leak.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }

        $this->expectException(BindingResolutionException::class);

        $this->invokeOrgKey('dashboard:loyalty_kpis');
    }

    public function test_clearDashboardCache_forgets_only_current_org_keys(): void
    {
        // Symmetric invariant: the cache-bust path must NOT
        // forget across tenants. clearDashboardCache walks through
        // orgKey() too — so calling it under org A's context
        // forgets only A's keys.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        // Seed BOTH orgs' caches with the dashboard_kpis key.
        Cache::put("dashboard:loyalty_kpis:org:{$orgA->id}", ['org_a' => 'data'], 600);
        Cache::put("dashboard:loyalty_kpis:org:{$orgB->id}", ['org_b' => 'data'], 600);

        // Bust under org A's context.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        AnalyticsService::clearDashboardCache();

        // Org A's key gone, org B's preserved.
        $this->assertFalse(Cache::has("dashboard:loyalty_kpis:org:{$orgA->id}"),
            "Org A's cache must be cleared.");
        $this->assertTrue(Cache::has("dashboard:loyalty_kpis:org:{$orgB->id}"),
            "Org B's cache must NOT be affected by org A's clear.");
    }

    public function test_end_to_end_no_cross_tenant_cache_leakage_on_total_members(): void
    {
        // Integration test: org A populates a cached result,
        // org B reads against the SAME logical method, must
        // see its OWN count (zero members), NOT org A's.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        // Seed org A with 5 loyalty members.
        app()->instance('current_organization_id', $orgA->id);
        \Database\Factories\LoyaltyMemberFactory::new()->count(5)->create();

        $service = new AnalyticsService();
        $orgATotal = $service->totalMembers();
        $this->assertSame(5, $orgATotal);

        // Switch to org B. NO members seeded.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);

        $orgBTotal = $service->totalMembers();
        $this->assertSame(0, $orgBTotal,
            "Org B must see ITS OWN member count, NOT org A's cached result.");
    }

    public function test_cache_persists_across_calls_within_same_org_context(): void
    {
        // Sanity check on the cache mechanism itself: within the
        // same org context, repeated calls return the SAME cached
        // result (we're not accidentally busting on every call).
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Manually pre-populate the cache key so we can prove
        // the service reads from it.
        Cache::put("dashboard:loyalty_kpis:org:{$org->id}", ['preseeded' => true], 600);

        $service = new AnalyticsService();
        $kpis = $service->getDashboardKpis();

        // The preseeded value should come back, NOT a fresh DB hit.
        $this->assertSame(['preseeded' => true], $kpis);
    }

    public function test_org_key_format_is_stable_for_documented_keys(): void
    {
        // Lock the EXACT format for the keys clearDashboardCache
        // depends on. A regression that changed the separator
        // (e.g. ':org:' to '_org_') would silently leave stale
        // pre-bust values in cache until TTL.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $documentedKeys = [
            'dashboard:loyalty_kpis',
            'dashboard:crm_kpis',
            'analytics:tier_distribution',
            'analytics:weekly_kpi_summary',
            'analytics:member_engagement',
            'analytics:points_distribution',
        ];

        foreach ($documentedKeys as $base) {
            $full = $this->invokeOrgKey($base);
            $this->assertSame("{$base}:org:{$org->id}", $full,
                "Cache key for '{$base}' must follow the exact pattern.");
        }
    }
}
