<?php

namespace Tests\Concerns;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Shared fixture for tests that exercise DiscountService's booking flavour
 * and the coupon machinery around it (CouponResolver, CouponSelection).
 *
 * Builds an org, a Gold tier and a member on top of SetsUpMinimalSchema's
 * setUpLoyaltySchema(), plus the schema for every discount source that
 * quoteForBooking() reads from: tier_benefits, special_offers +
 * member_offers, and rewards + reward_redemptions — each carrying the
 * phase-2 columns (code / applies_to / used_reference / discount_type /
 * discount_value) that the real 2026_09_25_100000_member_portal_phase_2
 * migration adds. setUpLoyaltySchema() itself only builds the tier/member
 * ladder (loyalty_tiers, loyalty_members, brands, points_transactions) —
 * it does not create benefit_definitions/tier_benefits/special_offers/
 * member_offers, so every one of those is built here.
 *
 * Requires the consumer to also `use SetsUpMinimalSchema` — this trait
 * calls setUpLoyaltySchema() from that trait rather than redeclaring it.
 */
trait SeedsDiscountFixture
{
    protected int $orgId;
    protected LoyaltyMember $member;

    protected function setUpDiscountFixture(): void
    {
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();

        $this->orgId = Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $this->orgId);

        $tier = LoyaltyTier::create([
            'organization_id' => $this->orgId,
            'name' => 'Gold',
            'min_points' => 0,
            'earn_rate' => 1.5,
            'is_active' => true,
        ]);

        $user = User::create([
            'name' => 'Ada',
            'email' => 'ada@example.test',
            'password' => bcrypt('secret-pass-1'),
            'user_type' => 'member',
            'organization_id' => $this->orgId,
        ]);

        $this->member = LoyaltyMember::create([
            'organization_id' => $this->orgId,
            'user_id' => $user->id,
            'tier_id' => $tier->id,
            'member_number' => 'HL-1',
            'current_points' => 500,
        ]);
    }

    /**
     * benefit_definitions, tier_benefits, special_offers, member_offers,
     * rewards, reward_redemptions — sqlite-safe. Public on its own so a
     * consumer that builds its org/tier/member another way (e.g.
     * MemberEndpointTestCase's tenant()/member()) can still reuse these
     * table shapes without going through setUpDiscountFixture()'s own
     * fixture data.
     */
    protected function setUpDiscountTables(): void
    {
        if (!Schema::hasTable('benefit_definitions')) {
            Schema::create('benefit_definitions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('category')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('tier_benefits')) {
            Schema::create('tier_benefits', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('tier_id');
                $t->unsignedBigInteger('benefit_id');
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('value')->nullable();
                $t->string('value_type', 24)->default('text');
                $t->decimal('value_amount', 12, 2)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->text('custom_description')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('special_offers')) {
            Schema::create('special_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->string('type', 32)->nullable();
                $t->decimal('value', 12, 2)->default(0);
                $t->string('code', 24)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->text('tier_ids')->nullable();
                $t->date('start_date');
                $t->date('end_date');
                $t->integer('usage_limit')->nullable();
                $t->integer('times_used')->default(0);
                $t->integer('per_member_limit')->nullable();
                $t->boolean('is_active')->default(true);
                $t->boolean('is_featured')->default(false);
                $t->boolean('ai_generated')->default(false);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('member_offers')) {
            Schema::create('member_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('offer_id')->nullable();
                $t->boolean('ai_generated')->default(false);
                $t->text('ai_reason')->nullable();
                $t->timestamp('claimed_at')->nullable();
                $t->timestamp('used_at')->nullable();
                $t->string('used_reference', 32)->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->string('status', 32)->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('rewards')) {
            Schema::create('rewards', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->integer('points_cost');
                $t->integer('stock')->nullable();
                $t->integer('per_member_limit')->nullable();
                $t->string('discount_type', 20)->nullable();
                $t->decimal('discount_value', 10, 2)->nullable();
                $t->string('applies_to', 12)->default('all');
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('reward_redemptions')) {
            Schema::create('reward_redemptions', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('reward_id');
                $t->unsignedBigInteger('fulfilled_by_user_id')->nullable();
                $t->unsignedBigInteger('cancelled_by_user_id')->nullable();
                $t->integer('points_spent');
                $t->string('code', 16);
                $t->string('status', 16)->default('pending');
                $t->text('notes')->nullable();
                $t->timestamp('fulfilled_at')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->timestamps();
            });
        }
    }

    protected function benefit(string $type, float $amount, string $appliesTo = 'all'): TierBenefit
    {
        $def = BenefitDefinition::create([
            'organization_id' => $this->orgId,
            'name' => "$amount $type",
            'code' => 'b' . uniqid(),
            'category' => 'discount',
            'is_active' => true,
        ]);

        return TierBenefit::create([
            'organization_id' => $this->orgId,
            'tier_id' => $this->member->tier_id,
            'benefit_id' => $def->id,
            'value_type' => $type,
            'value_amount' => $amount,
            'applies_to' => $appliesTo,
            'is_active' => true,
        ]);
    }

    protected function claimedOffer(string $type, float $value, string $appliesTo = 'all'): MemberOffer
    {
        $offer = SpecialOffer::create([
            'organization_id' => $this->orgId,
            'title' => "Offer $value",
            'description' => '-',
            'type' => $type,
            'value' => $value,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDays(7)->toDateString(),
            'is_active' => true,
            'applies_to' => $appliesTo,
        ]);

        return MemberOffer::create([
            'organization_id' => $this->orgId,
            'member_id' => $this->member->id,
            'offer_id' => $offer->id,
            'status' => 'claimed',
            'claimed_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);
    }

    protected function redemption(?string $type, ?float $value): RewardRedemption
    {
        $reward = Reward::create([
            'organization_id' => $this->orgId,
            'name' => 'Reward',
            'points_cost' => 100,
            'discount_type' => $type,
            'discount_value' => $value,
            'is_active' => true,
        ]);

        return RewardRedemption::create([
            'organization_id' => $this->orgId,
            'member_id' => $this->member->id,
            'reward_id' => $reward->id,
            'points_spent' => 100,
            'code' => 'REW-TEST0001',
            'status' => 'pending',
        ]);
    }
}
