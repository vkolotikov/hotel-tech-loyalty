<?php
namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use App\Models\EarnRateEvent;
use App\Services\Booking\CouponResolver;
use App\Services\Booking\CouponException;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponSelection;
use App\Services\DiscountService;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\TestCase;

class BoundedPackageBenefitsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp(); $this->setUpLoyaltyWorkspace(); $this->buildMembershipSchema(); $this->buildValiditySchema();
        if (!Schema::hasColumn('loyalty_members', 'membership_mode')) Schema::table('loyalty_members', fn ($t) => $t->string('membership_mode')->default('earned'));
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_mode' => 'assigned', 'tier_id' => $this->tiers['gold']->id, 'membership_valid_from' => '2026-10-06', 'membership_valid_until' => '2026-10-20']);
        $this->grace = $this->grace->fresh();
    }

    private function offer(array $extra = []): SpecialOffer
    {
        return SpecialOffer::create($extra + ['title' => 'Package perk', 'description' => '-', 'code' => 'TERM10', 'type' => 'discount', 'value' => 10,
            'tier_ids' => [$this->grace->tier_id], 'start_date' => '2026-10-01', 'end_date' => '2026-10-20', 'is_active' => true]);
    }

    public function test_a_scheduled_member_cannot_claim_a_level_bonus(): void
    {
        $offer = $this->offer(['type' => 'bonus_points', 'value' => 50]);
        $this->actingAs($this->grace->user, 'sanctum')->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertForbidden()->assertJsonPath('error', 'membership_not_started');
        $this->assertSame(0, MemberOffer::where('offer_id', $offer->id)->count());
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
    }

    public function test_an_unrestricted_offer_remains_available_without_an_active_package_term(): void
    {
        $offer = $this->offer(['type' => 'bonus_points', 'value' => 50, 'tier_ids' => null]);
        $this->actingAs($this->grace->user, 'sanctum')->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk()->assertJsonPath('points_awarded', 50);
    }

    public function test_a_level_code_cannot_be_claimed_before_the_term_starts(): void
    {
        $this->offer();
        try { app(CouponResolver::class)->resolveCode($this->grace, 'TERM10'); $this->fail('Scheduled level code was accepted.'); }
        catch (CouponException $e) { $this->assertSame('coupon_membership_inactive', $e->errorCode); }
        $this->assertSame(0, MemberOffer::where('member_id', $this->grace->id)->count());
    }

    public function test_a_claimed_level_code_is_rechecked_when_used_after_expiry(): void
    {
        $offer = $this->offer();
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-01', 'membership_valid_until' => '2026-10-05']);
        $this->grace = $this->grace->fresh();
        $claim = MemberOffer::create(['member_id' => $this->grace->id, 'offer_id' => $offer->id, 'status' => 'claimed']);
        $resolver = app(CouponResolver::class);
        $candidate = $resolver->candidate($this->grace, new CouponSelection($claim->id, null), BookingScope::Services);
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-04']);
        try { $resolver->consume($candidate, 'local-term-test'); $this->fail('Expired package code was consumed.'); }
        catch (CouponException $e) { $this->assertSame('coupon_membership_inactive', $e->errorCode); }
        $this->assertNull($claim->fresh()->used_at);
    }

    public function test_a_scheduled_level_does_not_supply_its_earning_rate_or_tier_boost(): void
    {
        EarnRateEvent::create(['name' => 'Level boost', 'multiplier' => 3, 'tier_ids' => [$this->grace->tier_id], 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'is_active' => true]);
        $this->assertSame(100, app(LoyaltyService::class)->pointsForSpend($this->grace, 100));
    }

    public function test_a_previously_claimed_level_multiplier_is_inactive_outside_the_package_term(): void
    {
        $offer = $this->offer(['type' => 'points_multiplier', 'value' => 5]);
        MemberOffer::create(['member_id' => $this->grace->id, 'offer_id' => $offer->id, 'status' => 'claimed']);
        $this->assertSame(1.0, app(LoyaltyService::class)->bestOfferMultiplier($this->grace));
    }

    public function test_a_claimed_level_discount_only_applies_within_the_membership_term(): void
    {
        $offer = $this->offer();
        MemberOffer::create(['member_id' => $this->grace->id, 'offer_id' => $offer->id, 'status' => 'claimed']);
        $this->assertSame(0.0, (float) app(DiscountService::class)->quote($this->grace, 100)['discount']);
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-05']);
        $this->assertSame(10.0, (float) app(DiscountService::class)->quote($this->grace->fresh(), 100)['discount']);
    }

    public function test_an_unrestricted_earning_promotion_still_applies_to_base_earning(): void
    {
        EarnRateEvent::create(['name' => 'Everyone boost', 'multiplier' => 2, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'is_active' => true]);
        $this->assertSame(200, app(LoyaltyService::class)->pointsForSpend($this->grace, 100));
    }
}
