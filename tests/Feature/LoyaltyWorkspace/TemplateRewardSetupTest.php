<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Programme\ProgrammeSetup;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class TemplateRewardSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildProgrammeAdviceSchema();
        $this->setUpLoyaltyPresetSchema();
    }

    public function test_template_suggestions_are_business_specific_without_writing_the_catalogue(): void
    {
        Reward::create(['name' => 'Late Checkout', 'points_cost' => 600, 'is_active' => true]);
        $before = Reward::withoutGlobalScopes()->count();

        $presets = $this->asManager()->getJson($this->api('options'))->assertOk()->json('presets');
        $byKey = array_column($presets, null, 'key');

        $this->assertSame([
            ['index' => 0, 'name' => 'Free Coffee', 'points_cost' => 100],
            ['index' => 1, 'name' => 'Free Dessert', 'points_cost' => 200],
            ['index' => 2, 'name' => 'Free Starter', 'points_cost' => 350],
            ['index' => 3, 'name' => '20% Off the Bill', 'points_cost' => 700],
            ['index' => 4, 'name' => 'Dinner for Two', 'points_cost' => 1800],
        ], $byKey['restaurant']['stamp_rewards'] ?? null);
        $this->assertSame(['index' => 0, 'name' => 'Late Checkout', 'points_cost' => 600], $byKey['hotel_classic']['stamp_rewards'][0]);
        $this->assertSame($before, Reward::withoutGlobalScopes()->count(), 'preview never creates suggested rewards');
    }

    public function test_restaurant_selection_adds_only_the_chosen_reward_to_an_existing_hotel_programme(): void
    {
        $hotel = Reward::create(['name' => 'Late Checkout', 'points_cost' => 600, 'description' => 'Our hotel terms', 'is_active' => true]);
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => $hotel->id], $this->manager);
        $tiers = LoyaltyTier::query()->orderBy('id')->get()->toArray();
        $member = $this->ada->fresh()->getAttributes();
        $benefits = BenefitDefinition::query()->count();

        $response = $this->asManager()->postJson($this->api('options/setup'), $this->selection())->assertOk()
            ->assertJsonPath('setup.preset_applied', false)->assertJsonPath('setup.reason', 'has_tiers')
            ->assertJsonPath('setup.summary', null)->assertJsonPath('setup.stamp_reward_created', true)
            ->assertJsonPath('options.programme_setup_template', 'restaurant');

        $reward = Reward::query()->where('name', 'Free Dessert')->sole();
        $this->assertSame(200, $reward->points_cost);
        $this->assertSame('Any dessert from the menu.', $reward->description);
        $response->assertJsonPath('options.stamp_reward_id', $reward->id)->assertJsonPath('setup.stamp_reward_id', $reward->id);
        $this->assertSame(2, Reward::query()->count());
        $this->assertSame('Our hotel terms', $hotel->fresh()->description);
        $this->assertSame($tiers, LoyaltyTier::query()->orderBy('id')->get()->toArray());
        $this->assertSame($member, $this->ada->fresh()->getAttributes());
        $this->assertSame($benefits, BenefitDefinition::query()->count());
    }

    public function test_matching_active_own_reward_is_reused_without_overwriting_customisations(): void
    {
        $reward = Reward::create(['name' => 'Free Dessert', 'points_cost' => 200, 'description' => 'Custom dessert', 'terms' => 'Weekdays only', 'stock' => 7, 'is_active' => true]);
        $before = $reward->fresh()->getAttributes();

        $this->asManager()->postJson($this->api('options/setup'), $this->selection())->assertOk()
            ->assertJsonPath('setup.stamp_reward_id', $reward->id)->assertJsonPath('setup.stamp_reward_created', false);

        $this->assertSame($before, $reward->fresh()->getAttributes());
        $this->assertSame(1, Reward::query()->count());
    }

    public function test_disabled_and_differently_priced_rows_are_kept_and_never_reactivated_or_overwritten(): void
    {
        $off = Reward::create(['name' => 'Free Dessert', 'points_cost' => 200, 'description' => 'Retired', 'is_active' => false]);
        $custom = Reward::create(['name' => 'Free Dessert', 'points_cost' => 900, 'description' => 'Custom price', 'is_active' => true]);

        $response = $this->asManager()->postJson($this->api('options/setup'), $this->selection())->assertOk()->assertJsonPath('setup.stamp_reward_created', true);

        $this->assertNotContains($response->json('setup.stamp_reward_id'), [$off->id, $custom->id]);
        $this->assertFalse($off->fresh()->is_active);
        $this->assertSame('Retired', $off->fresh()->description);
        $this->assertSame(900, $custom->fresh()->points_cost);
        $this->assertSame('Custom price', $custom->fresh()->description);
        $this->assertSame(3, Reward::query()->count());
    }

    public function test_unavailable_matching_rewards_are_retained_but_do_not_replace_a_fresh_template_choice(): void
    {
        $empty = Reward::create(['name' => 'Free Dessert', 'points_cost' => 200, 'stock' => 0, 'is_active' => true]);
        $expired = Reward::create(['name' => 'Free Dessert', 'points_cost' => 200, 'expires_at' => now()->subDay(), 'is_active' => true]);
        $this->asManager()->getJson($this->api('options'))->assertOk()
            ->assertJsonPath('catalogue.rewards.0.is_redeemable', false)->assertJsonPath('catalogue.rewards.1.is_redeemable', false);
        $response = $this->asManager()->postJson($this->api('options/setup'), $this->selection())->assertOk()
            ->assertJsonPath('setup.stamp_reward_created', true);
        $selected = Reward::findOrFail($response->json('setup.stamp_reward_id'));
        $this->assertNotContains($selected->id, [$empty->id, $expired->id]);
        $this->assertTrue($selected->isRedeemable());
        $this->assertSame(0, $empty->fresh()->stock);
        $this->assertTrue($expired->fresh()->expires_at->isPast());
        $this->assertSame(3, Reward::query()->count());
    }

    public function test_template_writes_use_the_named_organisation_and_restore_the_bound_tenant_and_brand(): void
    {
        $other = $this->otherOrganization();
        $foreign = Reward::create(['name' => 'Free Dessert', 'points_cost' => 200, 'is_active' => true]);
        $ours = (int) app('current_organization_id');
        app()->instance('current_brand_id', $this->brandId);

        $outcome = app(ProgrammeSetup::class)->apply($other['org']->id, 'restaurant', $this->selection()['options'], $this->manager, 'other-template', 1);

        $this->assertSame($ours, (int) app('current_organization_id'));
        $this->assertSame($this->brandId, app('current_brand_id'));
        $selected = Reward::withoutGlobalScopes()->findOrFail($outcome['stamp_reward_id']);
        $this->assertNotSame($foreign->id, $selected->id);
        $this->assertSame($other['org']->id, $selected->organization_id);
        $this->assertNotSame($this->brandId, $selected->brand_id);
        $this->assertSame($selected->id, ProgrammeOptions::get($other['org']->id, 'stamp_reward_id'));
        $this->assertNull(ProgrammeOptions::get($ours, 'stamp_reward_id'));
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('organization_id', $other['org']->id)->where('action', 'loyalty.programme_setup')->count());
    }

    public function test_a_saved_reward_that_became_unavailable_is_rechecked_on_apply_and_option_save(): void
    {
        foreach ([['stock' => 0], ['expires_at' => now()->subDay()]] as $unavailable) {
            $reward = Reward::create($unavailable + ['name' => 'Saved treat', 'points_cost' => 200, 'is_active' => true]);
            $options = ['stamps_enabled' => true, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => $reward->id];
            $this->asManager()->putJson($this->api('options'), ['options' => $options])->assertUnprocessable()->assertJsonValidationErrors('stamp_reward_id');
            $this->asManager()->postJson($this->api('options/setup'), ['preset' => 'restaurant', 'options' => $options, 'idempotency_key' => 'stale-'.$reward->id])
                ->assertUnprocessable()->assertJsonValidationErrors('stamp_reward_id');
        }
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'stamp_reward_id'));
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'programme_setup_completed_at'));
    }

    public function test_malformed_unknown_and_noncanonical_template_references_are_refused_without_writes(): void
    {
        foreach ([-1, 99, 'Free Dessert', 1.5, ['index' => 1]] as $index) {
            $body = $this->selection();
            $body['stamp_reward_template_index'] = $index;
            $this->asManager()->postJson($this->api('options/setup'), $body)->assertUnprocessable()->assertJsonValidationErrors('stamp_reward_template_index');
        }
        foreach ([null, 'hotel', 'castle'] as $preset) {
            $body = $this->selection();
            $body['preset'] = $preset;
            $this->asManager()->postJson($this->api('options/setup'), $body)->assertUnprocessable();
        }
        $this->assertSame(0, Reward::query()->count());
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'programme_setup_completed_at'));
    }

    public function test_template_selection_requires_enabled_reward_stamps_and_no_existing_reward_id(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $foreign = Reward::create(['name' => 'Elsewhere dessert', 'points_cost' => 200, 'is_active' => true]);
        app()->instance('current_organization_id', $prior);
        $own = Reward::create(['name' => 'Our saved treat', 'points_cost' => 300, 'is_active' => true]);
        foreach ([['stamps_enabled' => false], ['stamp_reward_kind' => 'points'], ['stamp_reward_id' => $own->id], ['stamp_reward_id' => $foreign->id]] as $changes) {
            $body = $this->selection();
            $body['options'] = array_replace($body['options'], $changes);
            $this->asManager()->postJson($this->api('options/setup'), $body)->assertUnprocessable();
        }
        $this->assertSame([$own->id], Reward::query()->pluck('id')->all());
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'programme_setup_completed_at'));
    }

    public function test_invalid_option_rolls_back_selected_reward_and_all_new_preset_data(): void
    {
        [$venue, $manager] = $this->newVenue();
        $body = $this->selection();
        $body['options']['cashback_percent'] = 99;
        $body['idempotency_key'] = 'rollback-template';

        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $body)->assertUnprocessable()->assertJsonValidationErrors('cashback_percent');

        $this->assertSame(0, LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(0, Reward::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(0, BenefitDefinition::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(0, HotelSetting::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        unset($body['options']['cashback_percent']);
        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $body)->assertOk()->assertJsonPath('setup.replayed', false);
    }

    public function test_new_venue_selects_the_reward_created_by_the_preset_without_a_duplicate(): void
    {
        [$venue, $manager] = $this->newVenue();

        $response = $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $this->selection())->assertOk()
            ->assertJsonPath('setup.preset_applied', true)->assertJsonPath('setup.summary.rewards_added', 5)
            ->assertJsonPath('setup.stamp_reward_created', true);

        $this->assertSame(5, Reward::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(1, Reward::withoutGlobalScopes()->where('organization_id', $venue->id)->where('name', 'Free Dessert')->count());
        $this->assertSame('Free Dessert', Reward::withoutGlobalScopes()->findOrFail($response->json('options.stamp_reward_id'))->name);
    }

    public function test_invalid_option_rolls_back_a_reward_added_to_an_existing_programme(): void
    {
        $body = $this->selection();
        $body['options']['cashback_percent'] = 99;

        $this->asManager()->postJson($this->api('options/setup'), $body)->assertUnprocessable()->assertJsonValidationErrors('cashback_percent');

        $this->assertSame(0, Reward::query()->count());
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'programme_setup_completed_at'));
        $this->assertNull(ProgrammeOptions::get($this->org->id, 'programme_setup_template'));
        $this->assertFalse(AuditLog::query()->where('action', 'loyalty.programme_setup')->exists());
    }

    public function test_new_venue_summary_counts_the_selected_reward_beside_a_preserved_custom_price(): void
    {
        [$venue, $manager] = $this->newVenue();
        app()->instance('current_organization_id', $venue->id);
        $custom = Reward::create(['name' => 'Free Dessert', 'points_cost' => 900, 'is_active' => true]);

        $response = $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $this->selection())->assertOk()
            ->assertJsonPath('setup.summary.rewards_added', 5)->assertJsonPath('setup.stamp_reward_created', true);

        $this->assertSame(6, Reward::query()->count());
        $this->assertSame(900, $custom->fresh()->points_cost);
        $this->assertSame(200, Reward::findOrFail($response->json('setup.stamp_reward_id'))->points_cost);
    }

    public function test_same_key_replays_the_selected_reward_and_changed_selection_is_key_reuse(): void
    {
        $body = $this->selection();
        $body['idempotency_key'] = 'restaurant-template-1';
        $first = $this->asManager()->postJson($this->api('options/setup'), $body)->assertOk()->json('setup');

        $this->asManager()->postJson($this->api('options/setup'), $body)->assertOk()
            ->assertJsonPath('setup.replayed', true)->assertJsonPath('setup.stamp_reward_id', $first['stamp_reward_id'])
            ->assertJsonPath('setup.stamp_reward_created', true)->assertJsonPath('setup.completed_at', $first['completed_at']);
        $body['stamp_reward_template_index'] = 2;
        $this->asManager()->postJson($this->api('options/setup'), $body)->assertUnprocessable()->assertJsonPath('error', 'key_reused');
        $this->assertSame(['Free Dessert'], Reward::query()->pluck('name')->all());
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.programme_setup')->count());
    }

    private function selection(): array
    {
        return ['preset' => 'restaurant', 'options' => ['stamps_enabled' => true, 'stamp_reward_kind' => 'reward'], 'stamp_reward_template_index' => 1];
    }

    /** @return array{Organization, User} */
    private function newVenue(): array
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $venue = Organization::create(['name' => 'Ember Bistro', 'slug' => 'new-' . uniqid('', true), 'industry' => 'restaurant']);
        app()->instance('current_organization_id', $venue->id);
        $manager = $this->staffUser($venue, ['can_award_points' => true, 'can_redeem_points' => true]);
        app()->instance('current_organization_id', $prior);

        return [$venue, $manager];
    }
}
