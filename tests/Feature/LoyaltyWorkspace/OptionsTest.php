<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use App\Models\HotelSetting;
use App\Models\Reward;
use App\Models\SpecialOffer;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** "Ways to earn": the programme's options, read by everyone, changed by a manager (release 7, spec 2026-10-25 §1). */
class OptionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        // LoyaltyPresetService::listPresets() reads the preset stamp from crm_settings.
        $this->setUpLoyaltyPresetSchema();
    }

    public function test_it_answers_the_options_with_their_cards_rules_catalogue_presets_and_the_callers_right(): void
    {
        $dear = Reward::create(['name' => 'Spa ritual', 'points_cost' => 2500, 'is_active' => true]);
        $cheap = Reward::create(['name' => 'Free coffee', 'points_cost' => 100, 'is_active' => true]);
        Reward::create(['name' => 'Retired', 'points_cost' => 50, 'is_active' => false]);
        SpecialOffer::create(['title' => 'Autumn', 'description' => 'An offer.', 'type' => 'discount', 'value' => 10, 'start_date' => '2026-10-01', 'end_date' => '2026-11-30', 'is_active' => true]);
        SpecialOffer::create(['title' => 'Paused', 'description' => 'An offer.', 'type' => 'discount', 'value' => 10, 'start_date' => '2026-10-01', 'end_date' => '2026-11-30', 'is_active' => false]);
        EarnRateEvent::create(['name' => 'Double days', 'multiplier' => 2, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'is_active' => true]);
        EarnRateEvent::create(['name' => 'Summer', 'multiplier' => 2, 'starts_at' => now()->subMonths(3), 'ends_at' => now()->subMonth(), 'is_active' => true]);
        $this->theirReward();

        $response = $this->asStaffMember()->getJson($this->api('options'))->assertOk();

        // A venue that never set anything reads every default.
        $response->assertJsonPath('options.points_on_bookings', true)
            ->assertJsonPath('options.points_per_currency', 1)
            ->assertJsonPath('options.points_expiry_months', 24)
            ->assertJsonPath('options.welcome_bonus_points', 500)
            ->assertJsonPath('options.referral_reward_on', 'first_visit')
            ->assertJsonPath('options.stamps_enabled', false)
            ->assertJsonPath('options.stamp_reward_id', null)
            ->assertJsonPath('options.cashback_percent', 5)
            ->assertJsonPath('options.programme_setup_completed_at', null);

        $this->assertSame(
            ['points_on_spend', 'points_expiry', 'welcome_bonus', 'birthday_bonus', 'referrals', 'stamp_card', 'check_in', 'desk_earn', 'cashback'],
            array_column($response->json('ways'), 'key'),
        );
        $response->assertJsonPath('ways.0', ['key' => 'points_on_spend', 'switch' => 'points_on_bookings', 'zero_off' => null, 'fields' => ['points_per_currency']])
            ->assertJsonPath('ways.1', ['key' => 'points_expiry', 'switch' => null, 'zero_off' => 'points_expiry_months', 'fields' => ['points_expiry_months']]);
        $response->assertJsonPath('fields.referral_reward_on', ['type' => 'enum', 'default' => 'first_visit', 'min' => null, 'max' => null, 'choices' => ['first_visit', 'signup'], 'when' => null])
            ->assertJsonPath('fields.stamps_per_card', ['type' => 'int', 'default' => 10, 'min' => 2, 'max' => 50, 'choices' => null, 'when' => null])
            ->assertJsonPath('fields.stamp_reward_id.when', ['field' => 'stamp_reward_kind', 'is' => 'reward'])
            ->assertJsonPath('fields.cashback_percent.min', 0.1);
        // The wizard's own stamp is not a field anyone changes.
        $this->assertArrayNotHasKey('programme_setup_completed_at', $response->json('fields'));

        $response->assertJsonPath('catalogue', [
            'tiers'   => 3,
            'rewards' => [
                ['id' => $cheap->id, 'name' => 'Free coffee', 'points_cost' => 100],
                ['id' => $dear->id, 'name' => 'Spa ritual', 'points_cost' => 2500],
            ],
            'offers'  => 1,
            'boosts'  => 1,
        ]);

        // The venue's industry (beauty) first and marked, each preset with what it recommends.
        $response->assertJsonPath('presets.0.key', 'beauty')
            ->assertJsonPath('presets.0.recommended', true)
            ->assertJsonPath('presets.0.recommends.stamps_enabled', true)
            ->assertJsonPath('presets.0.recommends.points_expiry_months', 18)
            ->assertJsonPath('presets.0.recommends.welcome_bonus_points', 100)
            ->assertJsonPath('presets.1.key', 'hotel_classic')
            ->assertJsonPath('presets.1.recommended', false)
            ->assertJsonPath('presets.1.recommends.points_per_currency', 10)
            ->assertJsonPath('presets.1.recommends.stamps_enabled', false);
        $this->assertCount(count(\App\Services\LoyaltyPresetService::PRESETS), $response->json('presets'));

        $response->assertJsonPath('setup_done', false)->assertJsonPath('can_change', false);
        $this->asManager()->getJson($this->api('options'))->assertOk()->assertJsonPath('can_change', true);
    }

    public function test_only_a_manager_changes_the_options_applies_the_wizard_or_skips_it(): void
    {
        $calls = [
            ['putJson', 'options', ['options' => ['stamps_enabled' => true]]],
            ['postJson', 'options/setup', ['options' => ['stamps_enabled' => true]]],
            ['postJson', 'options/setup/skip', []],
        ];
        foreach ($calls as [$method, $path, $body]) {
            $this->asStaffMember()->{$method}($this->api($path), $body)->assertStatus(403)->assertJsonPath('error', 'manager_only');
        }

        $this->assertSame(0, HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->whereIn('key', ['stamps_enabled', 'programme_setup_completed_at'])->count());
        $this->assertFalse(AuditLog::query()->where('action', 'like', 'loyalty.%')->exists());
    }

    public function test_a_manager_changes_a_card_and_only_what_changed_is_written_and_audited(): void
    {
        $response = $this->asManager()->putJson($this->api('options'), ['options' => ['cashback_enabled' => true, 'cashback_percent' => '3.5', 'checkin_points' => 0]])
            ->assertOk()
            ->assertJsonPath('options.cashback_enabled', true)
            ->assertJsonPath('options.cashback_percent', 3.5)
            ->assertJsonPath('can_change', true);
        $this->assertArrayHasKey('catalogue', $response->json());

        $rows = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->whereIn('key', ['cashback_enabled', 'cashback_percent', 'checkin_points'])->get()->keyBy('key');
        $this->assertSame('true', $rows['cashback_enabled']->value);
        $this->assertSame('3.5', $rows['cashback_percent']->value);
        $this->assertSame('loyalty', $rows['cashback_percent']->group);
        $this->assertSame('number', $rows['cashback_percent']->type);

        // checkin_points was already 0 (its default): written, but not a change.
        $audit = AuditLog::query()->where('action', 'loyalty.options_changed')->sole();
        // A whole decimal is stored in JSON as a whole number.
        $this->assertSame(['cashback_enabled' => false, 'cashback_percent' => 5], $audit->old_values);
        $this->assertSame(['cashback_enabled' => true, 'cashback_percent' => 3.5], $audit->new_values);
        $this->assertSame($this->manager->id, (int) $audit->causer_id);

        // The same change again (a retry) writes no second audit row.
        $this->asManager()->putJson($this->api('options'), ['options' => ['cashback_enabled' => true, 'cashback_percent' => 3.5]])->assertOk();
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.options_changed')->count());

        // An empty change answers the page as it is.
        $this->asManager()->putJson($this->api('options'), ['options' => []])->assertOk()->assertJsonPath('options.cashback_percent', 3.5);
    }

    public function test_the_engine_and_the_bootstrap_read_a_change_at_once(): void
    {
        // Cached before the change: the save flushes the settings map the engine reads.
        $this->assertSame(1, (int) HotelSetting::getValue('points_per_currency', 1));

        $this->asManager()->putJson($this->api('options'), ['options' => ['points_per_currency' => 4, 'stamps_enabled' => true, 'stamps_per_card' => 6]])->assertOk();

        $this->assertSame(4.0, (float) HotelSetting::getValue('points_per_currency', 1));
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()
            ->assertJsonPath('programme.ways.stamps', true)
            ->assertJsonPath('programme.ways.stamps_per_card', 6)
            ->assertJsonPath('programme.ways.setup_done', false);
    }

    public function test_a_save_writes_the_organisation_named_whatever_tenant_is_bound(): void
    {
        // A console or queued caller may have another tenant bound: a new row must still be the named organisation's.
        $other = $this->otherOrganization()['org'];
        $ours = (int) app('current_organization_id');

        ProgrammeOptions::save($other->id, ['stamps_enabled' => true], null);

        $this->assertSame($ours, (int) app('current_organization_id'), 'the bound tenant is restored');
        $this->assertTrue(ProgrammeOptions::get($other->id, 'stamps_enabled'));
        $this->assertFalse(ProgrammeOptions::get($ours, 'stamps_enabled'));
        $this->assertSame(1, HotelSetting::withoutGlobalScopes()->where('organization_id', $other->id)->where('key', 'stamps_enabled')->count());
        $this->assertSame(0, HotelSetting::withoutGlobalScopes()->where('organization_id', $ours)->where('key', 'stamps_enabled')->count());
    }

    public function test_a_way_that_earns_on_a_booking_counts_visits_from_the_day_it_was_switched_on(): void
    {
        $orgId = $this->org->id;
        $today = \App\Services\Portal\PortalBootstrap::venueToday($orgId)->toDateString();
        $before = \App\Services\Portal\PortalBootstrap::venueToday($orgId)->subMonths(2)->toDateString();
        $this->assertFalse(ProgrammeOptions::countsVisitOn($orgId, 'stamps_enabled', $today), 'off: nothing counts');

        $this->asManager()->putJson($this->api('options'), ['options' => ['stamps_enabled' => true, 'cashback_enabled' => true]])->assertOk();

        $this->assertSame($today, ProgrammeOptions::onSince($orgId, 'stamps_enabled'));
        $this->assertSame($today, ProgrammeOptions::onSince($orgId, 'cashback_enabled'));
        $this->assertTrue(ProgrammeOptions::countsVisitOn($orgId, 'stamps_enabled', $today));
        $this->assertFalse(ProgrammeOptions::countsVisitOn($orgId, 'stamps_enabled', $before), 'a booking from before the switch earns no stamp');
        $this->assertFalse(ProgrammeOptions::countsVisitOn($orgId, 'cashback_enabled', $before));

        // Saving it on again is no switch: the day stays. The page shows none of this.
        HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'stamps_enabled_since')->update(['value' => $before]);
        HotelSetting::flushCacheFor($orgId);
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamps_enabled' => true]])->assertOk()
            ->assertJsonMissingPath('options.stamps_enabled_since');
        $this->assertSame($before, ProgrammeOptions::onSince($orgId, 'stamps_enabled'));

        // Off and on again: visits count from the new day.
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamps_enabled' => false]])->assertOk();
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamps_enabled' => true]])->assertOk();
        $this->assertSame($today, ProgrammeOptions::onSince($orgId, 'stamps_enabled'));

        // An option on before the day was kept (no row) refuses no visit.
        HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'cashback_enabled_since')->delete();
        $this->assertTrue(ProgrammeOptions::countsVisitOn($orgId, 'cashback_enabled', $before));
    }

    public function test_every_field_is_checked_and_a_refused_change_writes_nothing(): void
    {
        $retired = Reward::create(['name' => 'Retired', 'points_cost' => 50, 'is_active' => false]);
        $theirs = $this->theirReward();

        $this->asManager()->putJson($this->api('options'), ['options' => [
            'points_per_currency'          => 0,
            'stamps_per_card'              => 1,
            'welcome_bonus_points'         => '-5',
            'birthday_bonus_points'        => 2.5,
            'referral_reward_on'           => 'never',
            'cashback_percent'             => 51,
            'checkin_enabled'              => 'yes',
            'made_up'                      => 1,
            'programme_setup_completed_at' => '2026-10-05T09:00:00+00:00',
            'stamps_enabled'               => true,
        ]])->assertStatus(422)->assertJsonValidationErrors([
            'points_per_currency', 'stamps_per_card', 'welcome_bonus_points', 'birthday_bonus_points', 'referral_reward_on',
            'cashback_percent', 'checkin_enabled', 'made_up', 'programme_setup_completed_at',
        ]);

        // A full card that gives a reward needs one of this organisation's active rewards.
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_kind' => 'reward']])
            ->assertStatus(422)->assertJsonValidationErrors(['stamp_reward_id']);
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_kind' => 'reward', 'stamp_reward_id' => null]])
            ->assertStatus(422)->assertJsonValidationErrors(['stamp_reward_id']);
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_kind' => 'reward', 'stamp_reward_id' => $theirs->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['stamp_reward_id']);
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_kind' => 'reward', 'stamp_reward_id' => $retired->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['stamp_reward_id']);
        $this->asManager()->putJson($this->api('options'), [])->assertStatus(422)->assertJsonValidationErrors(['options']);

        $this->assertSame(0, HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->whereIn('key', array_keys(ProgrammeOptions::OPTIONS))->count());
        $this->assertFalse(AuditLog::query()->where('action', 'loyalty.options_changed')->exists());
    }

    public function test_a_stamp_card_that_gives_a_reward_keeps_it_until_the_kind_changes(): void
    {
        $reward = Reward::create(['name' => 'Free coffee', 'points_cost' => 100, 'is_active' => true]);

        $this->asManager()->putJson($this->api('options'), ['options' => ['stamps_enabled' => true, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => (string) $reward->id]])
            ->assertOk()
            ->assertJsonPath('options.stamp_reward_kind', 'reward')
            ->assertJsonPath('options.stamp_reward_id', $reward->id);

        // Emptying the reward while the card still gives one is refused; switching to points may leave it.
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_id' => null]])
            ->assertStatus(422)->assertJsonValidationErrors(['stamp_reward_id']);
        $this->asManager()->putJson($this->api('options'), ['options' => ['stamp_reward_kind' => 'points', 'stamp_reward_points' => 150]])
            ->assertOk()
            ->assertJsonPath('options.stamp_reward_kind', 'points')
            ->assertJsonPath('options.stamp_reward_points', 150);
    }

    public function test_every_presets_recommendation_passes_the_options_own_checks(): void
    {
        foreach (array_keys(\App\Services\LoyaltyPresetService::PRESETS) as $key) {
            $recommends = app(\App\Services\LoyaltyPresetService::class)->recommendedOptions($key);
            $this->assertSame($recommends, ProgrammeOptions::validate($this->org->id, $recommends), $key);
        }
    }

    /** An active reward of another organisation, created under its own tenant (the model stamps the bound one). */
    private function theirReward(): Reward
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $reward = Reward::create(['name' => 'Not ours', 'points_cost' => 10, 'is_active' => true]);
        app()->instance('current_organization_id', $prior);

        return $reward;
    }
}
