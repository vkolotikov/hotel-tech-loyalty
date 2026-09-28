<?php

namespace Tests\Feature\Admin;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\TierBenefit;
use App\Models\User;
use Tests\Concerns\MakesAdminCaller;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Task 12: assignTierBenefit() must let a re-assign that only carries a new
 * `value` (the human sentence) keep the previously-stored typed value —
 * before this task, updateOrCreate() always reset value_type to 'text' and
 * value_amount to null on every save, which quietly turned an enforceable
 * discount back into decoration. Only a request that itself carries
 * `value_type` (or `applies_to`) may change those columns.
 *
 * Also covers the reward-discount validation added alongside it (rewards
 * gain the same typed discount_type/discount_value/applies_to as tier
 * benefits and offers).
 */
class TypedBenefitsTest extends MemberEndpointTestCase
{
    use MakesAdminCaller, SeedsDiscountFixture;

    private Organization $org;
    private User $admin;
    private LoyaltyTier $tier;
    private BenefitDefinition $def;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->org = $this->tenant();
        $this->admin = $this->staffUser($this->org, ['can_manage_offers' => true]);
        $this->tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $this->def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => 'Treatment discount', 'code' => 'treat', 'category' => 'discount', 'is_active' => true]);
    }

    private function assign(array $body)
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/tier-benefits', array_merge(['tier_id' => $this->tier->id, 'benefit_id' => $this->def->id], $body));
    }

    public function test_a_typed_assignment_is_stored_and_survives_a_prose_only_reassign(): void
    {
        $this->assign(['value' => '10% off treatments', 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services'])->assertOk()->assertJsonPath('tier_benefit.applies_to', 'services');
        $this->assign(['value' => '10% off treatments (updated)'])->assertOk();
        $tb = TierBenefit::where('tier_id', $this->tier->id)->where('benefit_id', $this->def->id)->firstOrFail();
        $this->assertSame('percent_discount', $tb->value_type);
        $this->assertSame(10.0, (float) $tb->value_amount);
        $this->assertSame('services', $tb->applies_to);
        $this->assertSame('10% off treatments (updated)', $tb->value);
    }

    public function test_an_explicit_text_type_resets_the_amount(): void
    {
        $this->assign(['value_type' => 'fixed_amount', 'value_amount' => 5])->assertOk();
        $this->assign(['value_type' => 'text', 'value' => 'A warm welcome'])->assertOk();
        $tb = TierBenefit::where('tier_id', $this->tier->id)->firstOrFail();
        $this->assertSame('text', $tb->value_type);
        $this->assertNull($tb->value_amount);
    }

    /**
     * Final review, Important 5: LoyaltyPresetService creates benefits with
     * category `discount`, and the admin form sends the category back on
     * every save — so `discount` must be a category the admin accepts.
     */
    public function test_a_discount_category_benefit_can_be_edited_in_admin(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/v1/admin/benefits/{$this->def->id}", ['name' => 'Treatment discount (renamed)', 'category' => 'discount'])
            ->assertOk()->assertJsonPath('benefit.category', 'discount');
        $this->assertSame('Treatment discount (renamed)', $this->def->fresh()->name);
    }

    public function test_a_reward_discount_is_validated(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/rewards', ['name' => 'Big', 'points_cost' => 100, 'discount_type' => 'percent_discount', 'discount_value' => 150])->assertStatus(422);
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/rewards', ['name' => 'Fifteen', 'points_cost' => 100, 'discount_type' => 'percent_discount', 'discount_value' => 15])->assertStatus(201)->assertJsonPath('reward.applies_to', 'all');
    }

    /**
     * Task 19's own backend addition: before this, `discount_type: null`
     * on an update left `discount_value` in place, because `discount_value`
     * simply wasn't present in that request — the admin's "remove this
     * reward's discount" control had no way to actually clear it.
     */
    public function test_a_rewards_discount_can_be_cleared(): void
    {
        $reward = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/admin/rewards', [
                'name' => 'Spa hour', 'points_cost' => 100,
                'discount_type' => 'percent_discount', 'discount_value' => 15,
            ])->assertStatus(201)->json('reward');

        // RewardAdminController::validatePayload() requires `name` and
        // `points_cost` on every save (no partial-update rule set for
        // `update()`, unlike Offers) — the admin frontend always resubmits
        // the whole form, so this mirrors a real request.
        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/v1/admin/rewards/{$reward['id']}", [
                'name' => $reward['name'], 'points_cost' => $reward['points_cost'], 'discount_type' => null,
            ])
            ->assertOk()
            ->assertJsonPath('reward.discount_type', null)
            ->assertJsonPath('reward.discount_value', null);

        $this->assertDatabaseHas('rewards', [
            'id' => $reward['id'], 'discount_type' => null, 'discount_value' => null,
        ]);
    }

    /** An update that only touches the name must leave a stored discount exactly as it was. */
    public function test_updating_only_the_name_leaves_the_discount_as_it_was(): void
    {
        $reward = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/admin/rewards', [
                'name' => 'Spa hour', 'points_cost' => 100,
                'discount_type' => 'fixed_amount', 'discount_value' => 20,
            ])->assertStatus(201)->json('reward');

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/v1/admin/rewards/{$reward['id']}", [
                'name' => 'Spa hour (renamed)', 'points_cost' => $reward['points_cost'],
            ])
            ->assertOk()
            ->assertJsonPath('reward.discount_type', 'fixed_amount')
            ->assertJsonPath('reward.discount_value', '20.00');
    }
}
