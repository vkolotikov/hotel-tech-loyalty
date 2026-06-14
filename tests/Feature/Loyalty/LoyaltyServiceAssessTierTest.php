<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\TierAssessment;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks LoyaltyService::assessTier — the tier upgrade/downgrade
 * evaluator that fires automatically from inside awardPoints +
 * the member-merge path + every overnight tier-review cron.
 *
 * The points-on-spend math hinges on getting this right: a member
 * who earns past Silver's threshold without being moved to the
 * Silver earn_rate gets fewer points than they're entitled to;
 * a member who lapses past Gold and isn't gracefully soft-landed
 * gets dropped two tiers at once.
 *
 * Coverage:
 *
 *   Default + no-op behaviour:
 *     - No appropriate tier for points → returns false
 *     - Already on the right tier → returns false (idempotent)
 *
 *   First-time assignment:
 *     - Member with NULL tier_id assigned the appropriate tier
 *       without comparison; effective_from + review_date stamped
 *
 *   Upgrade path:
 *     - Lifetime points crossing the next threshold triggers an
 *       upgrade + TierAssessment row created
 *
 *   Downgrade guards:
 *     - tier_locked = true on member prevents downgrade
 *     - tier_override_until in the future prevents downgrade
 *     - Past tier_override_until allows downgrade
 *
 *   Soft landing:
 *     - When current tier has soft_landing=true and points dropped
 *       through multiple thresholds, only ONE tier down (gradual
 *       exit so customer doesn't lose Gold and Silver at once)
 *
 *   Side effects on real change:
 *     - TierAssessment row created with old + new + reason +
 *       qualifying snapshot
 */
class LoyaltyServiceAssessTierTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyService $service;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        // The cachedActiveForCurrentOrg cache MUST be fresh per test
        // — otherwise test 1's tier set leaks into test 2's lookup.
        Cache::flush();

        $this->service = app(LoyaltyService::class);
    }

    protected function tearDown(): void
    {
        Cache::flush();
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /** Seed Bronze (0) + Silver (1000) + Gold (5000) for the standard ladder. */
    private function seedThreeTiers(): array
    {
        $bronze = LoyaltyTierFactory::new()->bronze()->create([
            'min_points' => 0,    'sort_order' => 1,
            'is_active'  => true,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name'       => 'Silver',
            'min_points' => 1000, 'sort_order' => 2,
            'earn_rate'  => 1.25, 'is_active'  => true,
        ]);
        $gold = LoyaltyTierFactory::new()->gold()->create([
            'min_points' => 5000, 'sort_order' => 3,
            'is_active'  => true,
        ]);
        Cache::flush(); // ensure fresh tier set
        return ['bronze' => $bronze, 'silver' => $silver, 'gold' => $gold];
    }

    public function test_returns_false_when_no_tiers_configured(): void
    {
        // No tiers seeded — getTierForMember returns null →
        // assessTier short-circuits to false.
        $member = LoyaltyMemberFactory::new()->withPoints(500)->create();

        $result = $this->service->assessTier($member);

        $this->assertFalse($result);
    }

    public function test_returns_false_when_member_already_on_correct_tier(): void
    {
        // Idempotency: a member already on Silver with 1500 lifetime
        // points doesn't move — assessTier returns false without
        // writing a TierAssessment row.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['silver']->id)
            ->withPoints(1500)
            ->create();
        $member->update(['lifetime_points' => 1500]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertFalse($result);
        $this->assertSame(0, TierAssessment::count(),
            'No-op assessment must NOT write a TierAssessment row.');
    }

    public function test_first_time_assignment_when_member_has_no_tier(): void
    {
        // Member exists with tier_id=null. assessTier picks the
        // appropriate tier from lifetime_points and assigns
        // without comparison. effective_from + review_date stamped.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()->withPoints(2000)->create();
        $member->update(['tier_id' => null, 'lifetime_points' => 2000]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertTrue($result);
        $member->refresh();
        $this->assertSame($tiers['silver']->id, (int) $member->tier_id,
            '2000 lifetime points → Silver (min_points 1000).');
        $this->assertNotNull($member->tier_effective_from);
        $this->assertNotNull($member->tier_review_date);
    }

    public function test_lifetime_points_crossing_threshold_triggers_upgrade(): void
    {
        // Real upgrade path: member at Bronze with 6000 lifetime
        // points → moves to Gold (min_points 5000). Skips Silver
        // because the points exceed Silver's threshold too.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['bronze']->id)
            ->withPoints(6000)
            ->create();
        $member->update(['lifetime_points' => 6000]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertTrue($result);
        $member->refresh();
        $this->assertSame($tiers['gold']->id, (int) $member->tier_id);
    }

    public function test_TierAssessment_row_created_on_real_change(): void
    {
        // Audit trail: every real tier change writes a row with
        // old + new tier ids + reason + qualifying snapshot.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['bronze']->id)
            ->withPoints(1500)
            ->create();
        $member->update([
            'lifetime_points'   => 1500,
            'qualifying_points' => 1500,
        ]);

        $this->service->assessTier($member->fresh(), null, 'manual_review');

        $row = TierAssessment::first();
        $this->assertNotNull($row);
        $this->assertSame($tiers['bronze']->id, (int) $row->old_tier_id);
        $this->assertSame($tiers['silver']->id, (int) $row->new_tier_id);
        $this->assertSame('manual_review', $row->reason);
        $this->assertSame(1500, (int) $row->qualifying_points_at_assessment);
    }

    public function test_tier_locked_prevents_downgrade(): void
    {
        // The locked-tier escape hatch: invitation tiers + admin
        // grants. A locked Gold member with only 100 points stays
        // at Gold even though their lifetime would put them at
        // Bronze.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['gold']->id)
            ->withPoints(100)
            ->create();
        $member->update([
            'tier_id'         => $tiers['gold']->id,
            'lifetime_points' => 100,
            'tier_locked'     => true,
        ]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertFalse($result);
        $member->refresh();
        $this->assertSame($tiers['gold']->id, (int) $member->tier_id,
            'tier_locked member must stay on their tier.');
    }

    public function test_tier_override_until_in_future_prevents_downgrade(): void
    {
        // Admin tier override: "give them Platinum for this stay
        // until next month". The override window blocks downgrade
        // until it expires; upgrades still apply.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['gold']->id)
            ->withPoints(100)
            ->create();
        $member->update([
            'tier_id'              => $tiers['gold']->id,
            'lifetime_points'      => 100,
            'tier_override_until'  => now()->addMonths(1),
        ]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertFalse($result);
        $member->refresh();
        $this->assertSame($tiers['gold']->id, (int) $member->tier_id);
    }

    public function test_tier_override_in_the_past_does_NOT_prevent_downgrade(): void
    {
        // Expired override: a tier_override_until in the past must
        // NOT block downgrade — that's the whole point of having
        // an expiry. Otherwise the override never lifts.
        $tiers = $this->seedThreeTiers();
        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['gold']->id)
            ->withPoints(100)
            ->create();
        $member->update([
            'tier_id'              => $tiers['gold']->id,
            'lifetime_points'      => 100,
            'tier_override_until'  => now()->subMonths(1),
        ]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertTrue($result,
            'Expired tier_override_until must allow downgrade.');
        $member->refresh();
        $this->assertSame($tiers['bronze']->id, (int) $member->tier_id);
    }

    public function test_soft_landing_drops_only_one_tier_at_a_time(): void
    {
        // Customer retention: a Gold member whose lifetime drops
        // to 100 points (would otherwise hit Bronze) instead moves
        // to Silver — the gradual exit per the docblock. They get
        // a year on Silver to climb back rather than losing
        // everything at once.
        $tiers = $this->seedThreeTiers();
        // Mark Gold soft-landing. soft_landing isn't in the model's
        // $fillable array (it's a rarely-toggled admin flag), so use
        // forceFill to bypass mass-assignment guard.
        $tiers['gold']->forceFill(['soft_landing' => true])->save();
        Cache::flush();

        $member = LoyaltyMemberFactory::new()
            ->inTier($tiers['gold']->id)
            ->withPoints(100)
            ->create();
        $member->update([
            'tier_id'         => $tiers['gold']->id,
            'lifetime_points' => 100,
        ]);

        $result = $this->service->assessTier($member->fresh());

        $this->assertTrue($result);
        $member->refresh();
        $this->assertSame($tiers['silver']->id, (int) $member->tier_id,
            'Soft-landing from Gold must land at Silver, not Bronze.');
    }

    public function test_invitation_only_tiers_are_skipped_in_auto_assignment(): void
    {
        // Invitation-only tiers (e.g. ambassador, founder) must
        // never auto-assign from points — they're admin-granted.
        $bronze = LoyaltyTierFactory::new()->bronze()->create([
            'min_points' => 0, 'sort_order' => 1, 'is_active' => true,
        ]);
        $silver = LoyaltyTierFactory::new()->create([
            'name' => 'Silver', 'min_points' => 1000, 'sort_order' => 2,
            'earn_rate' => 1.25, 'is_active' => true,
        ]);
        $ambassador = LoyaltyTierFactory::new()->create([
            'name' => 'Ambassador', 'min_points' => 500,
            'sort_order' => 5, 'earn_rate' => 5.0, 'is_active' => true,
        ]);
        // invitation_only is also outside fillable — set via forceFill.
        $ambassador->forceFill(['invitation_only' => true])->save();
        Cache::flush();

        $member = LoyaltyMemberFactory::new()->withPoints(600)->create();
        $member->update(['tier_id' => null, 'lifetime_points' => 600]);

        $this->service->assessTier($member->fresh());
        $member->refresh();

        $this->assertNotSame($ambassador->id, (int) $member->tier_id,
            'Member must NOT auto-assign into an invitation-only tier.');
        $this->assertSame($bronze->id, (int) $member->tier_id,
            '600 lifetime points must auto-assign Bronze (Silver needs 1000).');
    }
}
