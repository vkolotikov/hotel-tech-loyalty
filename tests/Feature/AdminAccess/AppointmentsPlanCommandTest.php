<?php

namespace Tests\Feature\AdminAccess;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_says_what_stops_and_asks_first(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true])
            ->expectsOutputToContain('loyalty programme: on, and it will be off')
            ->expectsOutputToContain('loyalty members who lose the member portal and points: 1')
            ->expectsOutputToContain('active staff accounts who lose the full admin (they keep the workspace): 1')
            ->expectsConfirmation('Mark it appointments-only?', 'no')
            ->expectsOutputToContain('Nothing changed.')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--force' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on, appointments-only: yes (operator)')
            ->assertSuccessful();
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
    }

    public function test_not_only_and_plan_decides_set_and_clear_the_mark(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on, appointments-only: yes (plan)')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--not-only' => true])
            ->expectsOutputToContain('appointments-only: no (operator)')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--plan-decides' => true])
            ->expectsOutputToContain('appointments-only: yes (plan)')
            ->assertSuccessful();
        $this->assertNull(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
    }

    public function test_a_full_customer_says_no(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON, landing off, appointments-only: no')
            ->assertSuccessful();
    }

    public function test_the_workspace_of_an_appointments_only_organisation_cannot_be_switched_off(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('--not-only')
            ->assertFailed();
        $this->assertTrue($this->org->fresh()->workspaceEnabled('appointments'));
    }

    public function test_two_marks_at_once_or_only_with_off_are_refused(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--not-only' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--not-only' => true, '--plan-decides' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--off' => true, '--force' => true])->assertFailed();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());
    }

    public function test_the_list_shows_who_is_appointments_only_and_why(): void
    {
        $other = $this->otherOrganization();
        $other->forceFill(['entitled_products' => ['appointments']])->save();
        $this->org->setAppointmentsOnly(false);

        $this->artisan('workspace:appointments', ['--list' => true])
            ->expectsOutputToContain('appointments-only')
            ->expectsOutputToContain('yes (plan)')
            ->expectsOutputToContain('no (operator)')
            ->assertSuccessful();
    }
}
