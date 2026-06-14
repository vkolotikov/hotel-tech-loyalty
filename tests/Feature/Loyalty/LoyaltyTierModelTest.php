<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyTier;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the LoyaltyTier model contract — the tier ladder that
 * drives the points hot-path (every points-write reads this).
 *
 * Why this matters:
 *
 *   - getNextTier() drives the SPA's "X more points to <Next>"
 *     progress bar and the tier-up notification trigger. A
 *     regression returning the WRONG tier (e.g. an inactive one,
 *     or one below the current member's tier) silently surfaces
 *     wrong-progress UX.
 *
 *   - cachedActiveForCurrentOrg() is read by LoyaltyService on
 *     every points award/redeem/reverse call. Without the cache,
 *     a busy hotel would hit the loyalty_tiers table ~20 times
 *     per booking confirm.
 *
 *   - The cache bust hooks (saved + deleted) MUST fire so admin
 *     tier edits propagate within seconds — without them, the
 *     30-min CACHE_TTL would force admins to wait or manually
 *     clear cache after every change.
 *
 * Contract:
 *
 *   getNextTier(): returns the lowest-min_points active tier
 *     STRICTLY ABOVE the current tier; null when none higher.
 *     Inactive tiers MUST be excluded.
 *
 *   cachedActiveForCurrentOrg(): returns active tiers ordered
 *     by min_points; cached per-org; unbound context falls back
 *     to direct query.
 *
 *   Saved + deleted hooks call flushCacheFor.
 *
 *   Casts: perks → array; earn_rate → decimal:2; is_active → bool.
 */
class LoyaltyTierModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        Cache::flush();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function tier(array $attrs = []): LoyaltyTier
    {
        return LoyaltyTier::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Tier ' . uniqid(),
            'min_points'      => 0,
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── getNextTier ─── */

    public function test_getNextTier_returns_the_next_higher_active_tier(): void
    {
        // CRITICAL: drives the SPA's "X more points to Silver"
        // progress bar. A regression silently shows wrong progress.
        $bronze = $this->tier(['name' => 'Bronze', 'min_points' => 0]);
        $silver = $this->tier(['name' => 'Silver', 'min_points' => 500]);
        $gold   = $this->tier(['name' => 'Gold',   'min_points' => 2000]);

        $next = $bronze->getNextTier();

        $this->assertNotNull($next);
        $this->assertSame('Silver', $next->name,
            'Bronze MUST see Silver as next (lowest min_points strictly above).');
    }

    public function test_getNextTier_returns_null_at_top_tier(): void
    {
        // The top tier (no higher tier) → null. The SPA shows
        // "Top tier!" UX based on this.
        $bronze = $this->tier(['name' => 'Bronze', 'min_points' => 0]);
        $diamond = $this->tier(['name' => 'Diamond', 'min_points' => 10000]);

        $this->assertNull($diamond->getNextTier(),
            'Highest min_points tier MUST yield null (top of ladder).');
    }

    public function test_getNextTier_skips_inactive_tiers(): void
    {
        // CRITICAL: an admin might soft-deactivate a deprecated
        // tier. getNextTier MUST NOT route members through it —
        // tier-up logic would assign them to a hidden tier with
        // no benefits.
        $bronze = $this->tier(['name' => 'Bronze',     'min_points' => 0,    'is_active' => true]);
        $silver = $this->tier(['name' => 'Silver',     'min_points' => 500,  'is_active' => false]); // hidden
        $gold   = $this->tier(['name' => 'Gold',       'min_points' => 2000, 'is_active' => true]);

        $next = $bronze->getNextTier();

        $this->assertNotNull($next);
        $this->assertSame('Gold', $next->name,
            'CRITICAL: inactive Silver MUST be skipped — next is Gold.');
    }

    public function test_getNextTier_uses_strict_inequality_on_min_points(): void
    {
        // > $min_points (strict) not >=. A tier with the same
        // min_points MUST NOT count as "next".
        $tierA = $this->tier(['name' => 'A', 'min_points' => 500]);
        $tierB = $this->tier(['name' => 'B', 'min_points' => 500]); // same threshold

        $this->assertNull($tierA->getNextTier(),
            'Same min_points MUST NOT count as next (strict >, not >=).');
    }

    /* ─── cachedActiveForCurrentOrg ─── */

    public function test_cached_returns_active_tiers_ordered_by_min_points(): void
    {
        // Order matters — LoyaltyService walks the list in
        // ascending min_points to assess tier. A wrong sort
        // could assign Diamond as Bronze (jumbled).
        $this->tier(['name' => 'Gold',   'min_points' => 2000]);
        $this->tier(['name' => 'Bronze', 'min_points' => 0]);
        $this->tier(['name' => 'Silver', 'min_points' => 500]);

        $tiers = LoyaltyTier::cachedActiveForCurrentOrg();
        $names = $tiers->pluck('name')->values()->toArray();

        $this->assertSame(['Bronze', 'Silver', 'Gold'], $names,
            'Tiers MUST be ordered by min_points ascending.');
    }

    public function test_cached_excludes_inactive_tiers(): void
    {
        $this->tier(['name' => 'Active',   'is_active' => true]);
        $this->tier(['name' => 'Inactive', 'is_active' => false]);

        $tiers = LoyaltyTier::cachedActiveForCurrentOrg();

        $this->assertCount(1, $tiers,
            'Inactive tiers MUST be excluded.');
        $this->assertSame('Active', $tiers->first()->name);
    }

    public function test_cached_returns_cached_value_until_bust(): void
    {
        // The cache is the whole point of the helper. Warm it,
        // bypass-write (no model events), confirm cache still
        // returns the old value.
        $this->tier(['name' => 'Bronze', 'min_points' => 0]);
        $first = LoyaltyTier::cachedActiveForCurrentOrg();
        $this->assertCount(1, $first);

        // Write directly without firing the saved hook.
        \DB::table('loyalty_tiers')->insert([
            'organization_id' => $this->orgId,
            'name'            => 'Silver',
            'min_points'      => 500,
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $second = LoyaltyTier::cachedActiveForCurrentOrg();

        $this->assertCount(1, $second,
            'Cache MUST return old value across calls (no fresh fetch until bust).');
    }

    public function test_cached_with_no_org_context_returns_empty_via_tenant_scope_fail_closed(): void
    {
        // The cachedActiveForCurrentOrg branch when org isn't
        // bound calls static::where(...) which still goes through
        // BelongsToOrganization's TenantScope (fail-closed by
        // design). The contract is: unbound context returns
        // empty. Cron / queue callers MUST bind context first or
        // use withoutGlobalScopes themselves.
        //
        // This lock prevents a future regression that opens a
        // cross-tenant read door via the unbound fallback path
        // (which would surface ALL orgs' tiers to a console
        // caller).
        $this->tier(['name' => 'Bronze', 'min_points' => 0]);
        $this->tier(['name' => 'Silver', 'min_points' => 500]);

        app()->forgetInstance('current_organization_id');

        $tiers = LoyaltyTier::cachedActiveForCurrentOrg();

        $this->assertCount(0, $tiers,
            'Unbound context MUST yield 0 (TenantScope fail-closed) — NOT a cross-tenant read.');
    }

    /* ─── saved/deleted bust hooks ─── */

    public function test_saving_tier_busts_cache(): void
    {
        // Admin edits a tier → cache MUST drop so the SPA sees
        // the change within seconds.
        $bronze = $this->tier(['name' => 'Bronze', 'min_points' => 0]);

        // Warm cache.
        LoyaltyTier::cachedActiveForCurrentOrg();
        $this->assertNotNull(
            Cache::get("org:{$this->orgId}:loyalty_tiers_active"),
            'Pre-condition: cache warm.',
        );

        // Edit a tier — saved hook MUST bust.
        $bronze->update(['name' => 'Bronze Plus']);

        $this->assertNull(
            Cache::get("org:{$this->orgId}:loyalty_tiers_active"),
            'CRITICAL: saved() MUST flush cache.',
        );
    }

    public function test_creating_new_tier_busts_cache(): void
    {
        $this->tier(['name' => 'Bronze']);
        LoyaltyTier::cachedActiveForCurrentOrg(); // warm

        $this->tier(['name' => 'Silver', 'min_points' => 500]);

        $this->assertNull(
            Cache::get("org:{$this->orgId}:loyalty_tiers_active"),
            'create() saved event MUST bust cache.',
        );
    }

    public function test_deleting_tier_busts_cache(): void
    {
        $bronze = $this->tier(['name' => 'Bronze']);
        LoyaltyTier::cachedActiveForCurrentOrg(); // warm

        $bronze->delete();

        $this->assertNull(
            Cache::get("org:{$this->orgId}:loyalty_tiers_active"),
            'delete() MUST bust cache.',
        );
    }

    public function test_flushCacheFor_null_org_is_noop(): void
    {
        // Defensive: passing null MUST NOT crash.
        LoyaltyTier::flushCacheFor(null);
        $this->assertTrue(true);
    }

    /* ─── Casts ─── */

    public function test_perks_round_trips_through_array_cast(): void
    {
        // The perks column carries the tier's benefit summary
        // (free breakfast, 5pm checkout, etc.) shown in the SPA
        // tier card.
        $perks = ['Free WiFi', 'Late checkout', '2× points on weekends'];
        $tier = $this->tier(['perks' => $perks]);

        $this->assertSame($perks, $tier->fresh()->perks);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        $active = $this->tier(['is_active' => true]);
        $hidden = $this->tier(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($hidden->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_earn_rate_casts_to_decimal_string(): void
    {
        // decimal:2 cast yields a string with 2 decimal places —
        // money math should use BCMath downstream.
        $tier = $this->tier(['earn_rate' => 1.5]);

        $this->assertSame('1.50', $tier->fresh()->earn_rate,
            'earn_rate MUST cast to decimal:2 string.');
    }

    /* ─── Relationships ─── */

    public function test_members_relationship_is_has_many_with_tier_id_fk(): void
    {
        $tier = $this->tier();
        $rel = $tier->members();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('tier_id', $rel->getForeignKeyName());
    }

    public function test_tier_benefits_relationship_is_has_many_with_tier_id_fk(): void
    {
        $tier = $this->tier();
        $rel = $tier->tierBenefits();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('tier_id', $rel->getForeignKeyName());
    }
}
