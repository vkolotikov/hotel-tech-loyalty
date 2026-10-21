<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The switch, the command and what sign-in carries (spec 2026-10-21 §6.3). Sign-in and /auth/me build the workspaces
 * from the same Organization::workspacesPayload(); SignInWorkspacesTest drives the sign-in itself.
 */
class SwitchTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function me(User $user): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_the_command_reports_switches_and_lists_the_exceptions(): void
    {
        $plain = Organization::create(['name' => 'Other Studio', 'slug' => 'plain-' . uniqid(), 'industry' => 'beauty']);

        $this->artisan('workspace:loyalty', ['--list' => true])
            ->expectsOutputToContain('Every organization has HexaTech Loyalty on, landing on the full admin.')
            ->assertSuccessful();
        $this->artisan('workspace:loyalty', ['org' => $plain->id, '--status' => true])
            ->expectsOutputToContain('HexaTech Loyalty ON, landing off')
            ->assertSuccessful();

        $this->org->setWorkspace('content', true, landing: true);
        $this->artisan('workspace:loyalty', ['org' => $this->org->id, '--on' => true, '--landing' => true])
            ->expectsOutputToContain('HexaTech Loyalty ON, landing on')
            ->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('loyalty'));
        // One landing per organisation.
        $this->assertFalse($this->org->fresh()->workspace('content')['landing']);

        $this->artisan('workspace:loyalty', ['--list' => true])
            ->expectsOutputToContain('Lumière Salon')
            ->doesntExpectOutputToContain('Other Studio')
            ->assertSuccessful();

        $this->artisan('workspace:loyalty', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('HexaTech Loyalty off')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('loyalty'));

        $this->artisan('workspace:loyalty', ['org' => 999999, '--on' => true])->assertFailed();
        $this->artisan('workspace:loyalty', ['org' => $this->org->id, '--on' => true, '--off' => true])->assertFailed();
    }

    public function test_the_command_will_not_switch_it_on_for_the_appointments_plan(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->artisan('workspace:loyalty', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('is on the Appointments plan')
            ->assertFailed();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('loyalty'));
    }

    public function test_staff_are_told_it_is_there_and_where_they_land(): void
    {
        $this->me($this->staffMember)->assertJsonPath('workspaces.loyalty', ['landing' => false]);

        $this->org->setWorkspace('loyalty', true, landing: true);
        $this->me($this->staffMember)->assertJsonPath('workspaces.loyalty.landing', true);

        $this->org->fresh()->setWorkspace('loyalty', false);
        $this->assertArrayNotHasKey('loyalty', $this->me($this->staffMember)->json('workspaces') ?? []);
    }

    public function test_an_appointments_only_organisation_has_no_loyalty_workspace(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->assertArrayNotHasKey('loyalty', $this->me($this->staffMember)->json('workspaces'));
        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->fresh()->workspace('loyalty'));
    }
}
