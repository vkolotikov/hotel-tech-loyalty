<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * The SPA's `is_platform_admin` flag: HexaTech's own operators (the
 * services.saas.platform_admin_emails allowlist, User::isPlatformAdmin()),
 * never an organisation's owner. Staff role super_admin is every owner's
 * role, so it gated the Clean light device preview for every customer
 * (final review C1, 2026-10-09); the preview now reads this flag.
 */
class PlatformAdminFlagTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config()->set('services.saas.platform_admin_emails', 'owner@example.test');
    }

    private function me(User $user): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
    }

    private function ownerOfTheOrganisation(): User
    {
        $owner = $this->staffUser($this->org);
        DB::table('staff')->where('user_id', $owner->id)->update(['role' => 'super_admin']);

        return $owner;
    }

    public function test_a_platform_admin_is_told_so(): void
    {
        $this->staff->forceFill(['email' => 'owner@example.test'])->save();

        $this->me($this->staff)->assertJsonPath('is_platform_admin', true);
    }

    public function test_an_organisation_owner_is_not_a_platform_admin(): void
    {
        $this->me($this->ownerOfTheOrganisation())
            ->assertJsonPath('staff.role', 'super_admin')
            ->assertJsonPath('is_platform_admin', false);
    }

    public function test_the_login_answer_carries_the_flag_inside_user(): void
    {
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
        $owner = $this->ownerOfTheOrganisation();

        $this->postJson('/api/v1/auth/login', ['email' => $owner->email, 'password' => 'secret-pass-1'])
            ->assertOk()
            ->assertJsonPath('user.is_platform_admin', false);

        $this->staff->forceFill(['email' => 'owner@example.test'])->save();
        $this->postJson('/api/v1/auth/login', ['email' => 'owner@example.test', 'password' => 'secret-pass-1'])
            ->assertOk()
            ->assertJsonPath('user.is_platform_admin', true);
    }
}
