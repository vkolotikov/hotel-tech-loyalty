<?php

namespace Tests\Feature\Appointments;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SignInWorkspacesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private function me(User $user): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_staff_are_told_the_workspace_is_there_where_to_land_and_whether_the_venue_has_services(): void
    {
        $this->setUpAppointments();

        // Never switched on or off: on, landing on the full admin.
        $this->me($this->staff)->assertJsonPath('workspaces', ['appointments' => ['landing' => false, 'has_services' => true, 'only' => false], 'content' => ['landing' => false]]);

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->me($this->staff)->assertJsonPath('workspaces.appointments.landing', true);
    }

    public function test_a_venue_without_an_active_service_is_told_so(): void
    {
        // The full admin shows its way into the workspace only where it can book something.
        $this->setUpAppointments();
        $fresh = $this->otherOrganization();
        $staff = $this->staffUser($fresh);

        $this->me($staff)->assertJsonPath('workspaces', ['appointments' => ['landing' => false, 'has_services' => false, 'only' => false], 'content' => ['landing' => false]]);
    }

    public function test_an_organisation_with_appointments_switched_off_gets_no_appointments_key(): void
    {
        $this->setUpAppointments(enabled: false);

        $workspaces = $this->me($this->staff)->json('workspaces');
        $this->assertArrayNotHasKey('appointments', $workspaces);
        $this->assertSame(['landing' => false], $workspaces['content']);
    }

    public function test_the_key_costs_no_extra_read_of_the_organisation(): void
    {
        // Sign-in and /auth/me run for every user of every organisation: the
        // workspace key reuses the organisation the answer already loaded.
        $this->setUpAppointments();
        $this->org->setWorkspace('appointments', true, landing: true);

        $reads = function (callable $request): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $request();
            $log = DB::getQueryLog();
            DB::disableQueryLog();

            return collect($log)->filter(fn (array $q) => preg_match('/from "organizations" where "organizations"\."id" = \?/', $q['query']))->count();
        };

        $this->assertSame(1, $reads(fn () => $this->me($this->staff)->assertJsonPath('workspaces.appointments.landing', true)));
    }

    public function test_a_member_never_gets_the_key(): void
    {
        $this->setUpAppointments();
        $this->org->setWorkspace('appointments', true, landing: true);

        $this->assertArrayNotHasKey('workspaces', $this->me(User::findOrFail($this->member->user_id))->json());
    }

    public function test_the_login_answer_carries_it_inside_user(): void
    {
        $this->setUpAppointments();
        $this->org->setWorkspace('appointments', true, landing: true);
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($t) {
                $t->id();
                $t->morphs('tokenable');
                $t->string('name');
                $t->string('token', 64)->unique();
                $t->text('abilities')->nullable();
                $t->timestamp('last_used_at')->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->timestamps();
            });
        }

        $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'secret-pass-1'])
            ->assertOk()
            ->assertJsonPath('user.workspaces.appointments.landing', true)
            ->assertJsonStructure(['token', 'user', 'staff']);

        $this->org->setWorkspace('appointments', false);
        $answer = $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'secret-pass-1'])->assertOk()->json('user');
        $this->assertArrayNotHasKey('appointments', $answer['workspaces'] ?? []);
    }

    public function test_staff_are_told_about_content_and_landing_there_takes_the_landing_from_appointments(): void
    {
        $this->setUpAppointments();
        $this->me($this->staff)->assertJsonPath('workspaces.content', ['landing' => false]);

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->org->fresh()->setWorkspace('content', true, landing: true);
        $this->me($this->staff)
            ->assertJsonPath('workspaces.content.landing', true)
            ->assertJsonPath('workspaces.appointments.landing', false);

        // And back: landing on Appointments takes it from Content.
        $this->org->fresh()->setWorkspace('appointments', true, landing: true);
        $this->me($this->staff)
            ->assertJsonPath('workspaces.appointments.landing', true)
            ->assertJsonPath('workspaces.content.landing', false);
    }

    public function test_an_appointments_only_organisation_has_no_content(): void
    {
        $this->setUpAppointments();
        $this->org->setAppointmentsOnly(true);

        $workspaces = $this->me($this->staff)->json('workspaces');
        $this->assertArrayHasKey('appointments', $workspaces);
        $this->assertArrayNotHasKey('content', $workspaces);
        $this->assertSame(['enabled' => false, 'landing' => false], $this->org->fresh()->workspace('content'));
    }
}
