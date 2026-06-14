<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyTier;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the LoyaltyService tier-lookup family —
 * getTierForPoints + previewTier — that drive the tier
 * qualification engine. assessTier (already covered) uses
 * getTierForMember which delegates to getTierForPoints for the
 * default points model + the per-model getTierBy* helpers for
 * nights/stays/spend/hybrid.
 *
 * Critical because:
 *   - Admin "what tier would this points total be?" preview
 *     for tier-rule preview tool (Settings → Loyalty)
 *   - getTierForPoints is the public entry that the cron sweep
 *     calls for every member on nightly assessment
 *
 * Coverage:
 *
 *   getTierForPoints:
 *     - Returns highest tier whose min_points <= lifetime_points
 *     - max_points cap respected (member above max → drop to
 *       next tier down)
 *     - invitation_only tiers SKIPPED (admin-granted only)
 *     - Returns null when no tier matches
 *
 *   previewTier with each model:
 *     - 'points' delegates to getTierForPoints
 *     - 'nights' uses min_nights threshold
 *     - 'stays'  uses min_stays threshold
 *     - 'spend'  uses min_spend threshold
 *     - 'hybrid' qualifies via ANY threshold (most generous —
 *       sorted by sort_order so highest tier wins)
 *     - Unknown model defaults to 'points' (match-arm default)
 *     - invitation_only tiers excluded across every model
 */
class LoyaltyServiceTierLookupTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        Cache::flush();

        $this->service = app(LoyaltyService::class);
    }

    protected function tearDown(): void
    {
        Cache::flush();
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── getTierForPoints ─────────────────────────────────── */

    public function test_getTierForPoints_returns_highest_min_points_tier_meeting_threshold(): void
    {
        $bronze = LoyaltyTierFactory::new()->create(['name' => 'Bronze', 'min_points' => 0,    'sort_order' => 1]);
        $silver = LoyaltyTierFactory::new()->create(['name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2]);
        $gold   = LoyaltyTierFactory::new()->create(['name' => 'Gold',   'min_points' => 5000, 'sort_order' => 3]);
        Cache::flush();

        $tier = $this->service->getTierForPoints(3000);

        $this->assertNotNull($tier);
        $this->assertSame($silver->id, $tier->id,
            '3000 points → Silver (between 1000 and 5000).');
    }

    public function test_getTierForPoints_at_exact_threshold_qualifies(): void
    {
        // Boundary: exactly min_points should qualify.
        $bronze = LoyaltyTierFactory::new()->create(['name' => 'Bronze', 'min_points' => 0,    'sort_order' => 1]);
        $silver = LoyaltyTierFactory::new()->create(['name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2]);
        Cache::flush();

        $tier = $this->service->getTierForPoints(1000);

        $this->assertSame($silver->id, $tier->id,
            'Exact min_points value must qualify.');
    }

    public function test_getTierForPoints_respects_max_points_cap(): void
    {
        // max_points caps the upper end — a tier with max_points=999
        // excludes anyone above 999 even if they meet min_points.
        // (Production use case: time-limited promo tiers.)
        $capped = LoyaltyTierFactory::new()->create([
            'name' => 'Capped Promo', 'min_points' => 0, 'max_points' => 999, 'sort_order' => 1,
        ]);
        $gold = LoyaltyTierFactory::new()->create([
            'name' => 'Gold', 'min_points' => 5000, 'sort_order' => 3,
        ]);
        Cache::flush();

        $aboveCap = $this->service->getTierForPoints(3000);
        $belowCap = $this->service->getTierForPoints(500);

        $this->assertNull($aboveCap,
            '3000 points above the only matching tier\'s max_points → null.');
        $this->assertSame($capped->id, $belowCap->id,
            '500 points within max_points cap qualifies.');
    }

    public function test_getTierForPoints_skips_invitation_only_tiers(): void
    {
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 0, 'sort_order' => 1,
        ]);
        $ambassador = LoyaltyTierFactory::new()->create([
            'name' => 'Ambassador', 'min_points' => 100, 'sort_order' => 5,
        ]);
        $ambassador->forceFill(['invitation_only' => true])->save();
        Cache::flush();

        $tier = $this->service->getTierForPoints(500);

        $this->assertSame($bronze->id, $tier->id,
            '500 points must auto-assign Bronze, NOT the invitation-only Ambassador.');
    }

    public function test_getTierForPoints_returns_null_when_no_tier_qualifies(): void
    {
        $platinum = LoyaltyTierFactory::new()->create([
            'name' => 'Platinum', 'min_points' => 100_000, 'sort_order' => 1,
        ]);
        Cache::flush();

        $tier = $this->service->getTierForPoints(50);

        $this->assertNull($tier,
            'Below every tier\'s min_points → null.');
    }

    public function test_getTierForPoints_skips_inactive_tiers(): void
    {
        // cachedActiveForCurrentOrg filters by is_active=true.
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 0, 'sort_order' => 1, 'is_active' => true,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2, 'is_active' => false,
        ]);
        Cache::flush();

        $tier = $this->service->getTierForPoints(2000);

        $this->assertSame($bronze->id, $tier->id,
            'Inactive Silver must be skipped — 2000 falls back to Bronze.');
    }

    /* ─── previewTier ──────────────────────────────────────── */

    public function test_previewTier_points_model_delegates_to_getTierForPoints(): void
    {
        $bronze = LoyaltyTierFactory::new()->create(['name' => 'Bronze', 'min_points' => 0,    'sort_order' => 1]);
        $silver = LoyaltyTierFactory::new()->create(['name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2]);
        Cache::flush();

        $tier = $this->service->previewTier('points', ['points' => 2000]);

        $this->assertSame($silver->id, $tier->id);
    }

    public function test_previewTier_nights_model_uses_min_nights(): void
    {
        // Tier with min_nights=10 → unlocks at 10+ nights stayed.
        // min_points must NOT influence the result.
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze',
            'min_points' => 999_999, // huge → would block on points model
            'min_nights' => 0,
            'sort_order' => 1,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver',
            'min_points' => 999_999,
            'min_nights' => 10,
            'sort_order' => 2,
        ]);
        Cache::flush();

        $tier = $this->service->previewTier('nights', ['nights' => 12]);

        $this->assertSame($silver->id, $tier->id,
            'nights model must select by min_nights, NOT min_points.');
    }

    public function test_previewTier_stays_model_uses_min_stays(): void
    {
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 999_999, 'min_stays' => 0, 'sort_order' => 1,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver', 'min_points' => 999_999, 'min_stays' => 5, 'sort_order' => 2,
        ]);
        Cache::flush();

        $tier = $this->service->previewTier('stays', ['stays' => 7]);

        $this->assertSame($silver->id, $tier->id);
    }

    public function test_previewTier_spend_model_uses_min_spend(): void
    {
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 999_999, 'min_spend' => 0, 'sort_order' => 1,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver', 'min_points' => 999_999, 'min_spend' => 1000, 'sort_order' => 2,
        ]);
        $gold = LoyaltyTierFactory::new()->create([
            'name' => 'Gold', 'min_points' => 999_999, 'min_spend' => 5000, 'sort_order' => 3,
        ]);
        Cache::flush();

        $tier = $this->service->previewTier('spend', ['spend' => 2500]);

        $this->assertSame($silver->id, $tier->id,
            '2500 spend qualifies Silver (min_spend=1000) but not Gold (5000).');
    }

    public function test_previewTier_hybrid_qualifies_via_ANY_threshold(): void
    {
        // Hybrid: most generous — qualifies via points OR nights
        // OR stays OR spend. A member with ONLY 10 nights (zero
        // points) still qualifies for a tier whose min_nights=10.
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 0, 'sort_order' => 1,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver',
            'min_points' => 100_000,
            'min_nights' => 10,
            'sort_order' => 2,
        ]);
        Cache::flush();

        // Only 100 points but 12 nights — hybrid qualifies Silver.
        $tier = $this->service->previewTier('hybrid', [
            'points' => 100, 'nights' => 12, 'stays' => 0, 'spend' => 0,
        ]);

        $this->assertSame($silver->id, $tier->id,
            'Hybrid must qualify Silver via min_nights threshold even when points fall short.');
    }

    public function test_previewTier_hybrid_picks_highest_sort_order_qualifying(): void
    {
        // When multiple tiers qualify via different thresholds,
        // hybrid picks the one with highest sort_order (most
        // generous outcome for the member).
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 0, 'sort_order' => 1,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2,
        ]);
        $gold = LoyaltyTierFactory::new()->create([
            'name' => 'Gold', 'min_points' => 5000, 'sort_order' => 3,
        ]);
        Cache::flush();

        $tier = $this->service->previewTier('hybrid', [
            'points' => 6000, // qualifies for all 3
        ]);

        $this->assertSame($gold->id, $tier->id,
            'Hybrid must pick the highest sort_order tier that qualifies.');
    }

    public function test_previewTier_unknown_model_defaults_to_points(): void
    {
        // The match-arm default branch: any unrecognised model
        // string falls back to points.
        $bronze = LoyaltyTierFactory::new()->create(['name' => 'Bronze', 'min_points' => 0,    'sort_order' => 1]);
        $silver = LoyaltyTierFactory::new()->create(['name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2]);
        Cache::flush();

        $tier = $this->service->previewTier('unrecognised_garbage', ['points' => 1500]);

        $this->assertSame($silver->id, $tier->id,
            'Unknown model must fall back to points lookup.');
    }

    public function test_previewTier_hybrid_skips_invitation_only_tiers(): void
    {
        // The invitation_only exclusion must apply across every
        // model, including hybrid. An ambassador tier shouldn't
        // appear from any auto-qualification path.
        $bronze = LoyaltyTierFactory::new()->create([
            'name' => 'Bronze', 'min_points' => 0, 'sort_order' => 1,
        ]);
        $ambassador = LoyaltyTierFactory::new()->create([
            'name' => 'Ambassador',
            'min_points' => 1, 'min_nights' => 1, 'min_stays' => 1, 'min_spend' => 1,
            'sort_order' => 99,
        ]);
        $ambassador->forceFill(['invitation_only' => true])->save();
        Cache::flush();

        $tier = $this->service->previewTier('hybrid', [
            'points' => 10000, 'nights' => 100, 'stays' => 50, 'spend' => 50000,
        ]);

        $this->assertSame($bronze->id, $tier->id,
            'Even with overwhelming qualification on every axis, invitation_only must be skipped.');
    }
}
