<?php

namespace Tests\Feature\Member\Portal;

use App\Models\LoyaltyTier;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * POST /api/v1/member/portal/coupons/resolve — CouponResolver::resolveCode()
 * turning a member-typed code into the same coupon summary a claimed offer
 * or redeemed reward already carries, claiming an offer on the spot (or
 * reusing the member's existing unused claim) and throttled per member.
 *
 * Schema: setUpLoyaltySchema() (brands/tiers/members/points) from
 * SetsUpMinimalSchema plus SeedsDiscountFixture::setUpDiscountTables() for
 * special_offers/member_offers/rewards/reward_redemptions — the same table
 * shapes DiscountServiceBookingTest uses, rather than a third inline copy.
 */
class PortalCouponTest extends MemberEndpointTestCase
{
    use SeedsDiscountFixture;

    // $member is inherited (protected LoyaltyMember) from SeedsDiscountFixture;
    // declaring it again here with a different visibility is a fatal trait/class
    // property conflict in PHP, so this test reuses the trait's property.
    private Organization $org;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();

        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
    }

    private function offer(array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id,
            'title' => 'Welcome ten',
            'description' => '-',
            'type' => 'discount',
            'value' => 10,
            'code' => 'WELCOME10',
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'is_active' => true,
        ], $attrs));
    }

    private function resolve(string $code)
    {
        return $this->withToken($this->token)->postJson('/api/v1/member/portal/coupons/resolve', ['code' => $code]);
    }

    public function test_an_offer_code_creates_or_reuses_the_members_claim(): void
    {
        $offer = $this->offer();
        $first = $this->resolve(' welcome10 ')->assertOk();
        $first->assertJsonPath('kind', 'offer')->assertJsonPath('label', 'Welcome ten')->assertJsonPath('value_label', '10% off');
        $claimId = $first->json('coupon.member_offer_id');
        $this->assertSame(1, MemberOffer::where('member_id', $this->member->id)->count());
        $this->resolve('WELCOME10')->assertOk()->assertJsonPath('coupon.member_offer_id', $claimId);
        $this->assertSame(1, $offer->fresh()->times_used);
    }

    public function test_wrong_tier_expired_capacity_and_used_answer_specific_codes(): void
    {
        $gold = LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 5000, 'earn_rate' => 2, 'is_active' => true]);
        $this->offer(['code' => 'GOLDONLY', 'tier_ids' => [$gold->id]]);
        $this->resolve('GOLDONLY')->assertStatus(422)->assertJsonPath('error', 'coupon_wrong_tier');

        $this->offer(['code' => 'OLD', 'end_date' => now()->subDay()->toDateString()]);
        $this->resolve('OLD')->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');

        $this->offer(['code' => 'FULL', 'usage_limit' => 1, 'times_used' => 1]);
        $this->resolve('FULL')->assertStatus(422)->assertJsonPath('error', 'coupon_no_capacity');

        $used = $this->offer(['code' => 'USED']);
        MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $used->id, 'status' => 'used', 'claimed_at' => now(), 'used_at' => now()]);
        $this->resolve('USED')->assertStatus(422)->assertJsonPath('error', 'coupon_used');
    }

    public function test_a_reward_code_resolves_only_for_its_owner_and_only_when_typed(): void
    {
        $reward = Reward::create(['organization_id' => $this->org->id, 'name' => 'Fifteen off', 'points_cost' => 100, 'discount_type' => 'fixed_amount', 'discount_value' => 15, 'is_active' => true]);
        $mine = RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-MINE0001', 'status' => 'pending']);
        $this->resolve('rew-mine0001')->assertOk()->assertJsonPath('kind', 'reward')->assertJsonPath('coupon.redemption_id', $mine->id);

        ['member' => $other] = $this->member($this->org, 'other-pass-123');
        RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $other->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-OTHER001', 'status' => 'pending']);
        $this->resolve('REW-OTHER001')->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');

        $coffee = Reward::create(['organization_id' => $this->org->id, 'name' => 'Free coffee', 'points_cost' => 50, 'is_active' => true]);
        RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'reward_id' => $coffee->id, 'points_spent' => 50, 'code' => 'REW-COFFEE01', 'status' => 'pending']);
        $this->resolve('REW-COFFEE01')->assertStatus(422)->assertJsonPath('error', 'coupon_untyped');
    }

    public function test_a_code_with_a_per_member_limit_never_gives_one_member_two_claims(): void
    {
        $offer = $this->offer(['code' => 'ONCE10', 'per_member_limit' => 1]);

        $first = $this->resolve('ONCE10')->assertOk();
        $claimId = $first->json('coupon.member_offer_id');
        $second = $this->resolve('ONCE10')->assertOk();
        $this->assertSame($claimId, $second->json('coupon.member_offer_id'));
        $this->assertSame(1, MemberOffer::where('member_id', $this->member->id)->where('offer_id', $offer->id)->count());
        $this->assertSame(1, $offer->fresh()->times_used);

        MemberOffer::whereKey($claimId)->update(['used_at' => now(), 'status' => 'used']);
        $this->resolve('ONCE10')->assertStatus(422)->assertJsonPath('error', 'coupon_used');
        $this->assertSame(1, MemberOffer::where('member_id', $this->member->id)->where('offer_id', $offer->id)->count());
        $this->assertSame(1, $offer->fresh()->times_used);
    }

    public function test_the_sixth_failed_resolution_in_a_minute_is_throttled(): void
    {
        foreach (range(1, 5) as $i) {
            $this->resolve("NOPE$i")->assertStatus(422);
        }
        $this->resolve('NOPE6')->assertStatus(429);
    }
}
