<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** The setup wizard's apply and skip (release 7, spec 2026-10-25 §1). */
class OptionsSetupTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // Ways to earn's checks read what can be booked and the events (ProgrammeAdvice).
        $this->buildProgrammeAdviceSchema();
        // LoyaltyPresetService writes and reads its stamps in crm_settings.
        $this->setUpLoyaltyPresetSchema();
    }

    public function test_a_new_venue_gets_the_preset_then_its_options_and_the_stamp(): void
    {
        [$venue, $manager] = $this->newVenue();

        $response = $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), [
            'preset'  => 'restaurant',
            'options' => ['welcome_bonus_points' => 75, 'stamps_enabled' => true, 'stamps_per_card' => 8, 'desk_earn_enabled' => true, 'birthday_bonus_points' => 0],
        ])->assertOk();

        $response->assertJsonPath('setup.preset', 'restaurant')
            ->assertJsonPath('setup.preset_applied', true)
            ->assertJsonPath('setup.reason', null)
            ->assertJsonPath('setup.replayed', false)
            ->assertJsonPath('setup.summary.tiers_added', 3)
            ->assertJsonPath('setup.summary.rewards_added', 5)
            ->assertJsonPath('setup_done', true)
            ->assertJsonPath('catalogue.tiers', 3)
            ->assertJsonPath('options.stamps_enabled', true)
            ->assertJsonPath('options.desk_earn_enabled', true)
            ->assertJsonPath('options.birthday_bonus_points', 0)
            // The preset's own economics, then the wizard's choice over its welcome bonus (50).
            ->assertJsonPath('options.points_per_currency', 20)
            ->assertJsonPath('options.welcome_bonus_points', 75);
        $this->assertNotNull($response->json('setup.completed_at'));
        $this->assertSame($response->json('setup.completed_at'), $response->json('options.programme_setup_completed_at'));

        $this->assertSame(['Regular', 'Loyalist', 'Insider'], LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->orderBy('sort_order')->pluck('name')->all());
        $this->assertSame(5, Reward::withoutGlobalScopes()->where('organization_id', $venue->id)->count());

        $audit = AuditLog::query()->withoutGlobalScopes()->where('organization_id', $venue->id)->where('action', 'loyalty.programme_setup')->sole();
        $this->assertSame('restaurant', $audit->new_values['preset']);
        $this->assertTrue($audit->new_values['preset_applied']);
        $this->assertSame(500, $audit->old_values['welcome_bonus_points']);
        $this->assertSame(75, $audit->new_values['welcome_bonus_points']);
        $this->assertSame($manager->id, (int) $audit->causer_id);
    }

    public function test_a_venue_with_tiers_keeps_them_and_its_rewards_and_says_the_preset_was_not_applied(): void
    {
        $reward = Reward::create(['name' => 'House treat', 'points_cost' => 300, 'is_active' => true]);

        $this->asManager()->postJson($this->api('options/setup'), ['preset' => 'hotel_classic', 'options' => ['checkin_enabled' => true, 'checkin_points' => 5]])
            ->assertOk()
            ->assertJsonPath('setup.preset_applied', false)
            ->assertJsonPath('setup.reason', 'has_tiers')
            ->assertJsonPath('setup.summary', null)
            ->assertJsonPath('options.checkin_enabled', true)
            ->assertJsonPath('options.checkin_points', 5)
            // Not the hotel preset's 10 points per unit: the preset was not applied at all.
            ->assertJsonPath('options.points_per_currency', 1)
            ->assertJsonPath('setup_done', true);

        $this->assertSame(['Silver', 'Gold', 'Platinum'], LoyaltyTier::query()->orderBy('sort_order')->pluck('name')->all());
        $this->assertSame([$reward->id], Reward::query()->pluck('id')->all());
    }

    public function test_keeping_the_tiers_needs_no_preset_and_a_venue_without_tiers_must_name_one(): void
    {
        $this->asManager()->postJson($this->api('options/setup'), ['options' => []])
            ->assertOk()->assertJsonPath('setup.preset', null)->assertJsonPath('setup.reason', null)->assertJsonPath('setup_done', true);

        [$venue, $manager] = $this->newVenue();
        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), ['options' => ['stamps_enabled' => true]])
            ->assertStatus(422)->assertJsonValidationErrors(['preset']);
        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), ['preset' => 'castle', 'options' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['preset']);

        $this->assertNull(ProgrammeOptions::get($venue->id, 'programme_setup_completed_at'));
        $this->assertNull(ProgrammeOptions::for($venue->id)['programme_setup_completed_at']);
        $this->assertFalse(HotelSetting::withoutGlobalScopes()->where('organization_id', $venue->id)->where('key', 'stamps_enabled')->exists());
    }

    public function test_a_wrong_option_leaves_a_new_venue_as_it_was_preset_and_all(): void
    {
        [$venue, $manager] = $this->newVenue();

        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), ['preset' => 'beauty', 'options' => ['stamps_per_card' => 99, 'programme_setup_completed_at' => null]])
            ->assertStatus(422)->assertJsonValidationErrors(['stamps_per_card', 'programme_setup_completed_at']);

        $this->assertSame(0, LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(0, Reward::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertNull(ProgrammeOptions::get($venue->id, 'programme_setup_completed_at'));
    }

    public function test_a_retry_with_the_same_key_answers_the_first_outcome_and_writes_nothing(): void
    {
        [$venue, $manager] = $this->newVenue();
        $body = ['preset' => 'fitness', 'options' => ['checkin_enabled' => true, 'checkin_points' => 10], 'idempotency_key' => 'setup-press-1'];

        $first = $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $body)->assertOk()->json('setup');
        $this->travel(5)->minutes();
        $again = $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), $body)->assertOk();

        $again->assertJsonPath('setup.replayed', true)
            ->assertJsonPath('setup.preset_applied', true)
            ->assertJsonPath('setup.summary', $first['summary'])
            ->assertJsonPath('setup.completed_at', $first['completed_at'])
            ->assertJsonPath('options.programme_setup_completed_at', $first['completed_at']);
        $this->assertSame(3, LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->count());
        $this->assertSame(1, AuditLog::query()->withoutGlobalScopes()->where('organization_id', $venue->id)->where('action', 'loyalty.programme_setup')->count());

        // The key as a header does the same; the same key with another body is refused, not answered with this setup.
        $this->actingAs($manager, 'sanctum')->withHeader('Idempotency-Key', 'setup-press-1')
            ->postJson($this->api('options/setup'), ['preset' => 'fitness', 'options' => ['checkin_enabled' => true, 'checkin_points' => 10]])
            ->assertOk()->assertJsonPath('setup.replayed', true);
        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), ['options' => ['checkin_points' => 20], 'idempotency_key' => 'setup-press-1'])
            ->assertStatus(422)->assertJsonPath('error', 'key_reused');
        $this->assertSame(10, ProgrammeOptions::get($venue->id, 'checkin_points'));

        // Another organisation's press with the same key is its own setup.
        $this->asManager()->postJson($this->api('options/setup'), $body)->assertOk()
            ->assertJsonPath('setup.replayed', false)->assertJsonPath('setup.reason', 'has_tiers');
    }

    public function test_not_now_stamps_the_wizard_as_done_and_changes_nothing_else(): void
    {
        $before = ProgrammeOptions::for($this->org->id);

        $response = $this->asManager()->postJson($this->api('options/setup/skip'))->assertOk()->assertJsonPath('setup_done', true);
        $stamp = $response->json('options.programme_setup_completed_at');
        $this->assertNotNull($stamp);
        $this->assertSame(array_merge($before, ['programme_setup_completed_at' => $stamp]), ProgrammeOptions::for($this->org->id));
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.programme_setup_skipped')->count());
        $this->assertFalse(AuditLog::query()->where('action', 'loyalty.options_changed')->exists());

        // Pressed again (or after the wizard was applied): nothing new.
        $this->travel(1)->hours();
        $this->asManager()->postJson($this->api('options/setup/skip'))->assertOk()->assertJsonPath('options.programme_setup_completed_at', $stamp);
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.programme_setup_skipped')->count());
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('programme.ways.setup_done', true);
    }

    /**
     * An organisation with no tier and no member yet, and its manager.
     *
     * @return array{0: Organization, 1: User}
     */
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
