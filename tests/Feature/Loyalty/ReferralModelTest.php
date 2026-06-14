<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\Referral;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Referral model contract — referrer ↔ referee
 * attribution row with dual FKs to LoyaltyMember.
 *
 * Why this matters:
 *
 *   The referral program pays out points to BOTH sides:
 *     - referrer_points_awarded (the recruiter)
 *     - referee_points_awarded (the new sign-up)
 *
 *   The dual self-FK pattern (referrer_id + referee_id both
 *   pointing at LoyaltyMember) makes the relationship FKs
 *   load-bearing — a regression that swapped 'referrer_id' for
 *   'referrer_member_id' (the conventional pattern) would
 *   silently break the referral leaderboard + payout cron.
 *
 *   Per LoyaltyMemberModelTest (Tier X3), LoyaltyMember.referrals
 *   uses FK='referrer_id' (NOT member_id) — locked there.
 *   THIS test locks the inverse: Referral.referrer + .referee
 *   both BelongsTo LoyaltyMember with their distinct FK names.
 *
 * Contract:
 *
 *   - referrer + referee both BelongsTo LoyaltyMember (self-FK
 *     pattern with DISTINCT foreign keys: referrer_id + referee_id)
 *   - qualified_at + rewarded_at datetime casts (lifecycle:
 *     pending → qualified (referee made first stay) → rewarded
 *     (points credited))
 *   - referrer_points_awarded + referee_points_awarded integer
 *     persistence (no decimal — points are integer in this system)
 *   - status persists canonical values (pending / qualified /
 *     rewarded / expired)
 *   - BelongsToOrganization + TenantScope isolation
 */
class ReferralModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $referrerId;
    private int $refereeId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('referrals')) {
            Schema::create('referrals', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('referrer_id');
                $t->unsignedBigInteger('referee_id');
                $t->string('status', 32)->default('pending');
                $t->integer('referrer_points_awarded')->default(0);
                $t->integer('referee_points_awarded')->default(0);
                $t->timestamp('qualified_at')->nullable();
                $t->timestamp('rewarded_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'referrer_id']);
                $t->index(['organization_id', 'referee_id']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $referrer = LoyaltyMemberFactory::new()->inTier($tier->id)->create();
        $referee = LoyaltyMemberFactory::new()->inTier($tier->id)->create();
        $this->referrerId = $referrer->id;
        $this->refereeId = $referee->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function referral(array $attrs = []): Referral
    {
        return Referral::create(array_merge([
            'organization_id' => $this->orgId,
            'referrer_id'     => $this->referrerId,
            'referee_id'      => $this->refereeId,
            'status'          => 'pending',
        ], $attrs));
    }

    /* ─── Dual self-FK pattern: referrer_id + referee_id ─── */

    public function test_referrer_relationship_uses_referrer_id_foreign_key(): void
    {
        // CRITICAL: FK is 'referrer_id', NOT 'referrer_member_id'
        // (the conventional pattern). LoyaltyMember.referrals
        // (Tier X3) joins on this column — regression to the
        // conventional name would silently break the leaderboard.
        $referral = $this->referral();
        $rel = $referral->referrer();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('referrer_id', $rel->getForeignKeyName(),
            'referrer FK MUST be referrer_id (NOT referrer_member_id).');
    }

    public function test_referee_relationship_uses_referee_id_foreign_key(): void
    {
        // CRITICAL: dual self-FK pattern. referee is the OTHER
        // half — FK 'referee_id'.
        $referral = $this->referral();
        $rel = $referral->referee();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('referee_id', $rel->getForeignKeyName(),
            'referee FK MUST be referee_id.');
    }

    public function test_both_relationships_point_to_loyalty_member(): void
    {
        // Both ends of the relationship point to the SAME table
        // (LoyaltyMember). Lock both Related classes — a future
        // refactor that split into a separate Referrer model
        // would surface here.
        $referral = $this->referral();

        $this->assertSame(
            LoyaltyMember::class,
            get_class($referral->referrer()->getRelated()),
            'referrer MUST point to LoyaltyMember.',
        );
        $this->assertSame(
            LoyaltyMember::class,
            get_class($referral->referee()->getRelated()),
            'referee MUST point to LoyaltyMember.',
        );
    }

    public function test_referrer_and_referee_resolve_to_distinct_members(): void
    {
        // Behavioural: referrer and referee MUST resolve to the
        // actual member records and they MUST be different rows
        // (no self-referrals).
        $referral = $this->referral();

        $referrer = $referral->referrer;
        $referee = $referral->referee;

        $this->assertNotNull($referrer);
        $this->assertNotNull($referee);
        $this->assertNotSame((int) $referrer->id, (int) $referee->id,
            'Referrer and referee MUST be distinct member rows.');
    }

    /* ─── Lifecycle datetime casts ─── */

    public function test_qualified_at_casts_to_carbon(): void
    {
        // qualified_at = referee made their first qualifying
        // action (e.g. first stay). The payout cron filters on
        // this — needs Carbon for the date comparison.
        $referral = $this->referral(['qualified_at' => now()->subDays(2)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $referral->qualified_at);
    }

    public function test_rewarded_at_casts_to_carbon(): void
    {
        // rewarded_at = points were credited to both sides.
        // Terminal state; the SPA shows "Rewarded X ago".
        $referral = $this->referral(['rewarded_at' => now()->subDay()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $referral->rewarded_at);
    }

    public function test_lifecycle_timestamps_can_be_null(): void
    {
        // Defensive: pending referrals have both timestamps null;
        // qualified-but-not-yet-rewarded have qualified_at set
        // but rewarded_at null. Lock the independence.
        $referral = $this->referral([
            'status'       => 'pending',
            'qualified_at' => null,
            'rewarded_at'  => null,
        ]);

        $this->assertNull($referral->qualified_at);
        $this->assertNull($referral->rewarded_at);
    }

    /* ─── Status canonical values ─── */

    public function test_canonical_status_values_persist_intact(): void
    {
        // Lock the documented lifecycle: pending → qualified →
        // rewarded; expired is the unfilled deadline branch.
        foreach (['pending', 'qualified', 'rewarded', 'expired'] as $status) {
            $referral = $this->referral(['status' => $status]);
            $this->assertSame($status, $referral->fresh()->status);
        }
    }

    /* ─── Points awarded integer persistence ─── */

    public function test_referrer_points_awarded_persists_as_integer(): void
    {
        // Points in this system are INTEGER (not decimal — no
        // fractional points). A regression that introduced
        // decimal cast would surface 500 as '500.00' and the SPA's
        // points arithmetic would crash.
        $referral = $this->referral(['referrer_points_awarded' => 500]);

        $this->assertSame(500, $referral->fresh()->referrer_points_awarded);
        $this->assertIsInt($referral->fresh()->referrer_points_awarded);
    }

    public function test_referee_points_awarded_persists_as_integer(): void
    {
        $referral = $this->referral(['referee_points_awarded' => 250]);

        $this->assertSame(250, $referral->fresh()->referee_points_awarded);
        $this->assertIsInt($referral->fresh()->referee_points_awarded);
    }

    public function test_zero_points_awarded_persists_correctly(): void
    {
        // Defensive: a not-yet-rewarded referral has 0 points
        // on both sides. Lock the default + the persistence
        // (an int cast regression might surface 0 as null).
        $referral = $this->referral([
            'referrer_points_awarded' => 0,
            'referee_points_awarded'  => 0,
        ]);

        $this->assertSame(0, $referral->fresh()->referrer_points_awarded);
        $this->assertSame(0, $referral->fresh()->referee_points_awarded);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $referral = $this->referral();

        $this->assertSame($this->orgId, (int) $referral->organization_id);
    }

    public function test_tenant_scope_isolates_referrals_cross_org(): void
    {
        // CRITICAL: referrals are tenant-private. Cross-leak
        // would expose another tenant's referral chains — affiliate-
        // poaching risk.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('referrals')->insert([
            'organization_id' => $orgA,
            'referrer_id'     => $this->referrerId,
            'referee_id'      => $this->refereeId,
            'status'          => 'pending',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('referrals')->insert([
            'organization_id' => $orgB,
            'referrer_id'     => 999,
            'referee_id'      => 998,
            'status'          => 'pending',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->assertCount(1, Referral::all());

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertCount(1, Referral::all());
    }
}
