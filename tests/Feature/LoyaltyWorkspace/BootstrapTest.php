<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** What the workspace knows before it draws (spec 2026-10-21 §6.4). */
class BootstrapTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_it_names_the_workspace_the_organisation_the_venue_and_the_ladder(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'primary_color', 'value' => '#7C3AED']);

        $this->asManager()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('name', 'HexaTech Loyalty')
            ->assertJsonPath('organization.name', 'Lumière Salon')
            ->assertJsonPath('accent', '#7c3aed')
            ->assertJsonPath('venue.today', '2026-10-05')
            ->assertJsonPath('programme.on', true)
            ->assertJsonPath('programme.tiers.0.name', 'Silver')
            ->assertJsonPath('programme.tiers.2.min_points', 5000)
            ->assertJsonPath('counts.members', 2);
    }

    public function test_it_says_what_the_person_may_do(): void
    {
        $this->asManager()->getJson($this->api('bootstrap'))
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('staff.can', [
                'award' => true, 'redeem' => true, 'reverse' => true, 'manage_program' => true, 'manage_rewards' => true,
                'manage_members' => true, 'view_insights' => true, 'manage_campaigns' => true, 'manage_app' => true,
            ]);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertJsonPath('staff.role', 'staff')
            ->assertJsonPath('staff.can', [
                'award' => true, 'redeem' => true, 'reverse' => false, 'manage_program' => false, 'manage_rewards' => false,
                'manage_members' => false, 'view_insights' => false, 'manage_campaigns' => false, 'manage_app' => false,
            ]);
    }

    public function test_insights_follow_the_full_admins_analytics_flag(): void
    {
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_view_analytics' => true]);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertJsonPath('staff.can.view_insights', true)
            ->assertJsonPath('staff.can.manage_members', false);
    }

    public function test_it_names_the_venues_currency_as_the_portal_does_and_the_plans_features(): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update([
            'currency' => 'gbp', 'plan_features' => json_encode(['campaigns' => true, 'wallet' => 'false', 'push_notifications' => true]),
        ]);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertJsonPath('venue.currency', 'GBP')
            ->assertJsonPath('features', ['campaigns' => true, 'wallet' => false, 'push' => true]);

        DB::table('organizations')->where('id', $this->org->id)->update(['currency' => null, 'plan_features' => null]);
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'services_currency', 'value' => 'chf']);

        $this->asStaffMember()->getJson($this->api('bootstrap'))
            ->assertJsonPath('venue.currency', 'CHF')
            ->assertJsonPath('features', ['campaigns' => false, 'wallet' => false, 'push' => false]);
    }

    public function test_a_flag_switched_off_or_a_deactivated_row_counts_for_nothing(): void
    {
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_award_points' => false]);
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('staff.can.award', false);

        DB::table('staff')->where('user_id', $this->manager->id)->update(['is_active' => false]);
        $this->asManager()->getJson($this->api('bootstrap'))->assertJsonPath('staff.can.reverse', false)->assertJsonPath('staff.can.award', false);
    }

    public function test_it_counts_the_requests_waiting(): void
    {
        $benefit = BenefitDefinition::create(['name' => 'Welcome drink', 'code' => 'drink', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
        BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $benefit->id, 'status' => 'pending']);
        BenefitEntitlement::create(['member_id' => $this->grace->id, 'benefit_id' => $benefit->id, 'status' => 'approved']);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertJsonPath('counts.requests_waiting', 1);
    }

    public function test_a_programme_without_an_active_tier_is_not_on(): void
    {
        foreach ($this->tiers as $tier) {
            $tier->update(['is_active' => false]);
        }

        $this->asManager()->getJson($this->api('bootstrap'))->assertJsonPath('programme.on', false);
    }
}
