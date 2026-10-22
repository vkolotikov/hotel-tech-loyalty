<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\HotelSetting;
use App\Services\Booking\PayAtVenueFallback;
use App\Services\Booking\Setup\BookingRules;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * Release 4, part C: "Take bookings to pay at the venue when online payment
 * is unavailable" — a booking rule, off by default, switched by a manager in
 * the workspace's Setup → Settings, stored where the portal reads it.
 */
class PayAtVenueFallbackSettingTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function stored(): ?string
    {
        return HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', PayAtVenueFallback::SETTING)->value('value');
    }

    public function test_it_is_off_until_a_manager_switches_it_on(): void
    {
        $this->assertFalse(BookingRules::read($this->org->fresh())['pay_at_venue_when_unavailable']);
        $this->assertFalse(PayAtVenueFallback::enabled());
        $this->asStaff()->getJson($this->api('setup'))->assertOk()->assertJsonPath('settings.pay_at_venue_when_unavailable', false);
        $this->assertNull($this->stored(), 'nothing is written until someone saves it');
    }

    public function test_a_manager_switches_it_on_and_off_and_the_portal_reads_the_same_key(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => true])
            ->assertOk()->assertJsonPath('settings.pay_at_venue_when_unavailable', true);
        $this->assertSame('true', $this->stored());
        $this->assertTrue(PayAtVenueFallback::enabled());

        $this->asStaff()->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => false])
            ->assertOk()->assertJsonPath('settings.pay_at_venue_when_unavailable', false);
        $this->assertSame('false', $this->stored());
        $this->assertFalse(PayAtVenueFallback::enabled());
    }

    public function test_saving_another_setting_leaves_it_as_it_was(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => true])->assertOk();
        $this->asStaff()->patchJson($this->api('setup/settings'), ['lead_minutes' => 90])
            ->assertOk()->assertJsonPath('settings.pay_at_venue_when_unavailable', true);
        $this->assertSame('true', $this->stored());
    }

    public function test_other_staff_may_not_change_it_and_only_a_yes_or_no_is_accepted(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => true])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => 'maybe'])->assertStatus(422);
        $this->assertNull($this->stored());
    }

    public function test_it_is_this_organisations_own(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['pay_at_venue_when_unavailable' => true])->assertOk();
        $other = $this->otherOrganization();

        $this->assertNull(HotelSetting::withoutGlobalScopes()->where('organization_id', $other->id)->where('key', PayAtVenueFallback::SETTING)->value('value'));
    }
}
