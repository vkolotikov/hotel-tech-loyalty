<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Reward;
use App\Models\RewardRedemption;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** The rewards catalogue (spec 2026-10-21 §4.6, §5, §6.4). */
class RewardsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_it_lists_the_catalogue_with_its_counts_and_the_options(): void
    {
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => Reward::create(['name' => 'Their reward', 'points_cost' => 10]));
        $voucher = Reward::create([
            'name' => 'Spa voucher', 'description' => 'A morning at the spa.', 'terms' => 'Weekdays only.', 'category' => 'wellness',
            'points_cost' => 500, 'stock' => 10, 'per_member_limit' => 2, 'discount_type' => 'percent_discount', 'discount_value' => 15,
            'applies_to' => 'services', 'expires_at' => '2026-12-31 22:00:00', 'sort_order' => 1,
        ]);
        $coffee = Reward::create(['name' => 'Coffee', 'points_cost' => 50, 'sort_order' => 2, 'is_active' => false]);
        foreach (['fulfilled', 'pending', 'cancelled'] as $i => $status) {
            RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $voucher->id, 'points_spent' => 500, 'code' => "REW-{$i}", 'status' => $status]);
        }

        $response = $this->asStaffMember()->getJson($this->api('rewards?brand_id=all'))->assertOk();

        $this->assertSame(['Spa voucher', 'Coffee'], array_column($response->json('rewards'), 'name'));
        $response->assertJsonPath('rewards.0', [
            'id' => $voucher->id, 'name' => 'Spa voucher', 'description' => 'A morning at the spa.', 'terms' => 'Weekdays only.',
            'category' => 'wellness', 'points_cost' => 500, 'stock' => 10, 'per_member_limit' => 2, 'discount_type' => 'percent_discount',
            'discount_value' => 15, 'applies_to' => 'services', 'expires_at' => '2026-12-31T22:00:00+00:00', 'is_active' => true,
            'image_url' => null, 'redeemed' => 3, 'fulfilled' => 1,
        ])
            ->assertJsonPath('rewards.1.id', $coffee->id)
            ->assertJsonPath('rewards.1.is_active', false)
            ->assertJsonPath('rewards.1.discount_value', null)
            ->assertJsonPath('rewards.1.redeemed', 0)
            ->assertJsonPath('options', ['discount_types' => ['percent_discount', 'fixed_amount'], 'applies_to' => ['all', 'services', 'stays']]);
    }

    public function test_staff_with_manage_offers_add_a_reward_on_the_default_brand(): void
    {
        $response = $this->asManager()->postJson($this->api('rewards?brand_id=all'), [
            'name' => 'Free coffee', 'category' => 'dining', 'points_cost' => 120, 'stock' => 5, 'discount_type' => 'fixed_amount',
            'discount_value' => 4.5, 'applies_to' => null, 'expires_at' => '2026-11-30T23:59:00+00:00',
        ])->assertCreated();

        $id = $response->json('reward.id');
        $response->assertJsonPath('reward', [
            'id' => $id, 'name' => 'Free coffee', 'description' => null, 'terms' => null, 'category' => 'dining', 'points_cost' => 120,
            'stock' => 5, 'per_member_limit' => null, 'discount_type' => 'fixed_amount', 'discount_value' => 4.5, 'applies_to' => 'all',
            'expires_at' => '2026-11-30T23:59:00+00:00', 'is_active' => true, 'image_url' => null, 'redeemed' => 0, 'fulfilled' => 0,
        ]);
        $this->assertSame($this->brandId, (int) Reward::withoutGlobalScopes()->find($id)->brand_id);

        // A staff member whose flag is set may too; the role is not what counts here.
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_manage_offers' => true]);
        $this->asStaffMember()->postJson($this->api('rewards'), ['name' => 'Tea', 'points_cost' => 40])->assertCreated();
    }

    public function test_staff_without_manage_offers_are_refused(): void
    {
        $reward = Reward::create(['name' => 'Coffee', 'points_cost' => 50]);

        $this->asStaffMember()->postJson($this->api('rewards'), ['name' => 'Tea', 'points_cost' => 40])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed')->assertJsonPath('need', 'can_manage_offers');
        $this->asStaffMember()->putJson($this->api("rewards/{$reward->id}"), ['name' => 'Tea', 'points_cost' => 40])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->assertSame(1, Reward::query()->count());
        $this->assertSame('Coffee', $reward->fresh()->name);
    }

    public function test_the_form_keeps_the_full_admins_rules(): void
    {
        $this->asManager()->postJson($this->api('rewards'), ['name' => 'Half off', 'points_cost' => 100, 'discount_type' => 'percent_discount', 'discount_value' => 150])
            ->assertStatus(422)->assertJsonValidationErrors(['discount_value']);
        $this->asManager()->postJson($this->api('rewards'), ['name' => 'Half off', 'points_cost' => 100, 'discount_type' => 'percent_discount'])
            ->assertStatus(422)->assertJsonValidationErrors(['discount_value']);
        $this->asManager()->postJson($this->api('rewards'), ['name' => '', 'points_cost' => 0, 'discount_type' => 'free_item', 'applies_to' => 'rooms', 'per_member_limit' => 0])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'points_cost', 'discount_type', 'applies_to', 'per_member_limit']);

        $this->assertSame(0, Reward::query()->count());
    }

    public function test_a_change_can_clear_the_discount_and_a_stored_percentage_stays_under_100(): void
    {
        $reward = Reward::create(['name' => 'Spa voucher', 'points_cost' => 500, 'discount_type' => 'percent_discount', 'discount_value' => 15, 'applies_to' => 'services']);

        // The stored type is a percentage: a value above 100 is refused even when the type is not sent again.
        $this->asManager()->putJson($this->api("rewards/{$reward->id}"), ['name' => 'Spa voucher', 'points_cost' => 500, 'discount_value' => 120])
            ->assertStatus(422)->assertJsonValidationErrors(['discount_value']);

        $this->asManager()->putJson($this->api("rewards/{$reward->id}"), ['name' => 'Spa morning', 'points_cost' => 450, 'discount_type' => null, 'is_active' => false])
            ->assertOk()
            ->assertJsonPath('reward.name', 'Spa morning')
            ->assertJsonPath('reward.points_cost', 450)
            ->assertJsonPath('reward.discount_type', null)
            ->assertJsonPath('reward.discount_value', null)
            ->assertJsonPath('reward.applies_to', 'services')
            ->assertJsonPath('reward.is_active', false);
    }

    public function test_another_organisations_reward_is_not_found(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->inOrganization($other['org']->id, fn () => Reward::create(['name' => 'Their reward', 'points_cost' => 10]));

        $this->asManager()->putJson($this->api("rewards/{$theirs->id}"), ['name' => 'Mine now', 'points_cost' => 1])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertSame('Their reward', Reward::withoutGlobalScopes()->find($theirs->id)->name);
    }

    /** Runs $make under another organisation's tenant and hands back what it made, ours restored. */
    protected function inOrganization(int $orgId, callable $make): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $make();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }
}
