<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\Service;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupSettingsEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_a_manager_changes_the_settings(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['slot_step' => 30])->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_the_time_zone_must_be_a_named_zone(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['timezone' => 'UTC'])->assertStatus(422)->assertJsonValidationErrors('timezone');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['timezone' => 'Europe/Riga'])
            ->assertOk()
            ->assertJsonPath('settings.timezone', 'Europe/Riga')
            ->assertJsonPath('checklist.steps.0.done', true);
    }

    public function test_a_lower_case_currency_is_accepted_and_a_bad_one_refused(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings') . '?dry_run=1', ['currency' => 'gbp'])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('services', 1);
        $this->assertSame('EUR', Service::find($this->service->id)->currency);

        $this->asStaff()->patchJson($this->api('setup/settings'), ['currency' => 'gbp'])->assertOk()->assertJsonPath('settings.currency', 'GBP');
        $this->assertSame('GBP', Service::find($this->service->id)->currency);

        foreach (['GB', 'EURO', '£££'] as $bad) {
            $this->asStaff()->patchJson($this->api('setup/settings'), ['currency' => $bad])->assertStatus(422)->assertJsonValidationErrors('currency');
        }
    }

    public function test_booking_rules_keep_to_their_ranges(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['slot_step' => 7])->assertStatus(422)->assertJsonValidationErrors('slot_step');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['lead_minutes' => 20000])->assertStatus(422)->assertJsonValidationErrors('lead_minutes');
        $this->asStaff()->patchJson($this->api('setup/settings'), ['slot_step' => 45, 'lead_minutes' => 0, 'max_advance_days' => 30, 'allow_master_choice' => false, 'points_on_bookings' => false])
            ->assertOk()
            ->assertJsonPath('settings.slot_step', 45)
            ->assertJsonPath('settings.lead_minutes', 0)
            ->assertJsonPath('settings.max_advance_days', 30)
            ->assertJsonPath('settings.allow_master_choice', false)
            ->assertJsonPath('settings.points_on_bookings', false);
    }
}
