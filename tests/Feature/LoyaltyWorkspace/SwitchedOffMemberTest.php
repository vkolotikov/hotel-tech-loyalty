<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\Reward;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A member staff have switched off keeps their card, points and history, and the desk refuses them (`inactive`); their
 * own requests that spend or earn something are refused too (security review, 2026-11-04: the app and the portal still
 * let them redeem a reward, claim an offer and ask for a benefit).
 */
class SwitchedOffMemberTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private TierBenefit $drink;
    private Reward $coffee;
    private SpecialOffer $offer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        Http::fake();

        $benefit = BenefitDefinition::create(['name' => 'Welcome drink', 'code' => 'drink', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
        $this->drink = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $benefit->id, 'is_active' => true]);
        $this->coffee = Reward::create(['name' => 'Free coffee', 'points_cost' => 100, 'is_active' => true]);
        $this->offer = SpecialOffer::create(['title' => 'Autumn treat', 'description' => 'Fifty points to welcome the season.', 'type' => 'bonus_points', 'value' => 50, 'is_active' => true,
            'start_date' => now()->subDay(), 'end_date' => now()->addMonth()]);
        $this->ada->update(['is_active' => false]);
    }

    public function test_a_switched_off_member_cannot_redeem_claim_or_ask(): void
    {
        $as = $this->actingAs($this->ada->user, 'sanctum');
        $as->postJson("/api/v1/member/rewards/{$this->coffee->id}/redeem")->assertStatus(403)->assertJsonPath('error', 'member_inactive');
        $as->postJson("/api/v1/member/offers/{$this->offer->id}/claim")->assertStatus(403)->assertJsonPath('error', 'member_inactive');
        $as->postJson("/api/v1/member/benefits/{$this->drink->id}/request")->assertStatus(403)->assertJsonPath('error', 'member_inactive');

        $this->assertSame(1500, (int) $this->ada->fresh()->current_points);
        $this->assertSame(0, DB::table('reward_redemptions')->count());
        $this->assertSame(0, DB::table('benefit_entitlements')->count());
        $as->getJson('/api/v1/member/points')->assertOk();
    }

    public function test_switched_on_again_they_can(): void
    {
        $this->ada->update(['is_active' => true]);

        $this->actingAs($this->ada->user, 'sanctum')->postJson("/api/v1/member/rewards/{$this->coffee->id}/redeem")->assertSuccessful();
        $this->assertSame(1400, (int) $this->ada->fresh()->current_points);
    }
}
