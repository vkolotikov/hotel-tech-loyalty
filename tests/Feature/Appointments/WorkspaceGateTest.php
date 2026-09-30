<?php

namespace Tests\Feature\Appointments;

use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class WorkspaceGateTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    public function test_an_organisation_without_the_flag_is_refused(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertStatus(403)
            ->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_an_enabled_organisation_gets_its_bootstrap(): void
    {
        $this->setUpAppointments();

        $this->asStaff()->getJson($this->api('bootstrap'))
            ->assertOk()
            ->assertJsonPath('name', 'HexaTech Appointments')
            ->assertJsonPath('organization.name', 'Lumière Salon')
            ->assertJsonPath('organization.industry', 'beauty')
            ->assertJsonPath('venue.timezone', 'UTC')
            ->assertJsonPath('venue.timezone_named', false)
            ->assertJsonPath('venue.today', '2026-10-05')
            ->assertJsonPath('venue.currency', 'EUR')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('loyalty.programme_on', true)
            ->assertJsonPath('loyalty.points_on_bookings', true)
            ->assertJsonPath('readiness.services', 1)
            ->assertJsonPath('readiness.team', 1)
            ->assertJsonPath('readiness.bookable', true);
    }

    public function test_switching_the_flag_off_refuses_the_next_call(): void
    {
        $this->setUpAppointments();
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();

        $this->org->setWorkspace('appointments', false);

        $this->asStaff()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_a_member_and_an_anonymous_caller_never_reach_it(): void
    {
        $this->setUpAppointments();
        $memberUser = User::find($this->member->user_id);

        $this->getJson($this->api('bootstrap'))->assertStatus(401);
        $this->actingAs($memberUser, 'sanctum')->getJson($this->api('bootstrap'))->assertStatus(403);
    }

    public function test_another_organisations_flag_does_not_open_this_one(): void
    {
        $this->setUpAppointments();
        $otherStaff = $this->staffUser($this->otherOrganization());

        $this->actingAs($otherStaff, 'sanctum')->getJson($this->api('bootstrap'))
            ->assertStatus(403)->assertJsonPath('error', 'workspace_disabled');
    }

    public function test_every_appointments_route_carries_the_gate(): void
    {
        $routes = collect(Route::getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/appointments/'));

        $this->assertNotEmpty($routes);
        foreach ($routes as $route) {
            $this->assertContains('workspace:appointments', $route->gatherMiddleware(), "{$route->uri()} is reachable without the workspace flag");
        }
    }

    public function test_the_venues_today_follows_its_own_zone(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 22:30:00')); // 01:30 on the 6th in Riga (UTC+3)

        $this->assertSame('Europe/Riga', VenueClock::zone($this->org->id));
        $this->assertTrue(VenueClock::isNamed($this->org->id));
        $this->assertSame('2026-10-06', VenueClock::today($this->org->id));
        $this->assertSame('2026-10-06 01:30:00', VenueClock::now($this->org->id)->format('Y-m-d H:i:s'));

        // 29 March 2026: Riga's clocks jump from 03:00 to 04:00.
        $this->assertFalse(VenueClock::exists(VenueClock::parse('2026-03-29T03:30'), $this->org->id));
        $this->assertTrue(VenueClock::exists(VenueClock::parse('2026-03-29T04:30'), $this->org->id));
    }

    public function test_the_organisation_helpers_default_to_off(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->workspace('appointments'));
        $this->assertNull($this->org->workspacesPayload());

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->assertSame(['appointments' => ['landing' => true]], $this->org->fresh()->workspacesPayload());

        // Landing means nothing while the workspace is off.
        $this->org->setWorkspace('appointments', false, landing: true);
        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->fresh()->workspace('appointments'));
        $this->assertNull($this->org->fresh()->workspacesPayload());
    }

    public function test_the_command_switches_reports_and_lists(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--on' => true, '--landing' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on')
            ->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('appointments'));

        $this->artisan('workspace:appointments', ['--list' => true])
            ->expectsOutputToContain('Lumière Salon')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('appointments workspace off')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('appointments'));

        $this->artisan('workspace:appointments', ['org' => 999999, '--on' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--on' => true, '--off' => true])->assertFailed();
    }
}
