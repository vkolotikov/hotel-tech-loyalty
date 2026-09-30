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

    public function test_staff_of_an_enabled_organisation_are_told_where_to_land(): void
    {
        $this->setUpAppointments();

        $this->me($this->staff)->assertJsonPath('workspaces', ['appointments' => ['landing' => false]]);

        $this->org->setWorkspace('appointments', true, landing: true);
        $this->me($this->staff)->assertJsonPath('workspaces.appointments.landing', true);
    }

    public function test_an_organisation_that_never_opted_in_gets_the_answer_it_always_got(): void
    {
        $this->setUpAppointments(enabled: false);

        $this->assertArrayNotHasKey('workspaces', $this->me($this->staff)->json());
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
        $this->assertArrayNotHasKey('workspaces', $answer);
    }
}
