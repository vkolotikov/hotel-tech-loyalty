<?php

namespace Tests\Feature\Auth;

use App\Mail\PasswordResetCodeMail;
use App\Models\EmailVerificationCode;
use App\Models\Organization;
use App\Models\User;
use App\Services\Auth\AccountRecovery;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class IdentityRecoveryTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config(['services.saas.api_url' => null]);
        Http::preventStrayRequests();
        Mail::fake();
        if (Schema::hasIndex('users', 'users_email_unique')) {
            (require database_path('migrations/2026_05_25_120000_users_email_unique_per_org_for_staff.php'))->up();
        }
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', fn ($t) => $t->timestamp('email_verified_at')->nullable());
        }
        if (!Schema::hasTable('email_verification_codes')) {
            Schema::create('email_verification_codes', function ($t) {
                $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('purpose', 16)->nullable();
                $t->string('email'); $t->string('code', 6); $t->timestamp('expires_at');
                $t->timestamp('verified_at')->nullable(); $t->timestamps();
            });
        }
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($t) {
                $t->id(); $t->morphs('tokenable'); $t->string('name'); $t->string('token', 64)->unique();
                $t->text('abilities')->nullable(); $t->timestamp('last_used_at')->nullable();
                $t->timestamp('expires_at')->nullable(); $t->timestamps();
            });
        }
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
    }

    private function otherIdentity(): User
    {
        $org = Organization::create(['name' => 'Second tenant', 'slug' => 'second-identity', 'saas_org_id' => 'identity-b', 'subscription_status' => 'ACTIVE']);
        $user = $this->staffUser($org);
        $user->update(['email' => $this->staff->email, 'password' => 'OtherPassword123!']);
        return $user;
    }

    private function recoveryPayload(string $code): array
    {
        return ['email' => $this->staff->email, 'code' => $code, 'password' => 'Replacement123!', 'password_confirmation' => 'Replacement123!'];
    }

    public function test_password_reset_invalidates_old_claims_but_preserves_other_identities_and_signup_verification(): void
    {
        $other = $this->otherIdentity();
        $otherClaim = EmailVerificationCode::issueFor($other, 'claim', now()->addDay());
        $claim = EmailVerificationCode::issueFor($this->staff, 'claim', now()->addDay());
        $reset = EmailVerificationCode::issueFor($this->staff, 'reset', now()->addMinutes(15));
        $verify = EmailVerificationCode::create(['email' => $this->staff->email, 'code' => '777777', 'purpose' => 'verify', 'expires_at' => now()->addHour()]);
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($reset->code))->assertOk();
        $this->postJson('/api/v1/auth/claim', $this->recoveryPayload($claim->code))->assertUnprocessable();
        $this->assertTrue(Hash::check('Replacement123!', $this->staff->fresh()->password));
        $this->assertNull($otherClaim->fresh()->verified_at);
        $this->assertNull($verify->fresh()->verified_at);
    }

    public function test_claim_also_invalidates_older_reset_and_legacy_credential_grants(): void
    {
        $reset = EmailVerificationCode::issueFor($this->staff, 'reset', now()->addMinutes(15));
        $legacy = EmailVerificationCode::create(['email' => $this->staff->email, 'code' => '888888', 'expires_at' => now()->addHour()]);
        $claim = EmailVerificationCode::issueFor($this->staff, 'claim', now()->addDay());
        $this->postJson('/api/v1/auth/claim', $this->recoveryPayload($claim->code))->assertOk();
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($reset->code))->assertUnprocessable();
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($legacy->code))->assertUnprocessable();
    }

    public function test_email_changes_clear_both_provenance_fields_even_on_a_partially_selected_model(): void
    {
        if (!Schema::hasColumn('users', 'platform_operator_granted_at')) {
            Schema::table('users', fn ($t) => $t->timestamp('platform_operator_granted_at')->nullable());
        }
        $this->staff->forceFill(['email_verified_at' => now(), 'platform_operator_granted_at' => now()])->save();
        config(['services.saas.platform_admin_emails' => 'reserved-new@example.test']);
        User::select(['id', 'email'])->findOrFail($this->staff->id)->update(['email' => 'reserved-new@example.test']);
        $fresh = $this->staff->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertNull($fresh->platform_operator_granted_at);
        $this->assertFalse($fresh->isPlatformAdmin());
    }

    public function test_saas_fallback_is_bound_to_verified_organization_and_staff_type(): void
    {
        $other = $this->otherIdentity();
        $original = $this->staff->password;
        config(['services.saas.api_url' => 'https://saas.example.test/api', 'services.saas.jwt_secret' => 'test-signing-placeholder']);
        Http::fake(['saas.example.test/*' => Http::response(['user' => ['email' => $this->staff->email], 'organization' => ['id' => 'identity-b', 'role' => 'OWNER']])]);
        $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'SaasPassword123!'])
            ->assertOk()->assertJsonPath('user.id', $other->id);
        $this->assertSame($original, $this->staff->fresh()->password);
        $this->assertTrue(Hash::check('SaasPassword123!', $other->fresh()->password));
        $this->assertDatabaseMissing('staff', ['user_id' => $this->staff->id, 'organization_id' => $other->organization_id]);
    }

    public function test_login_matches_credentials_and_refuses_ambiguous_or_wrong_selectors(): void
    {
        $other = $this->otherIdentity();
        $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'OtherPassword123!'])
            ->assertOk()->assertJsonPath('user.id', $other->id);
        $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'OtherPassword123!', 'organization_id' => $this->org->id])->assertUnprocessable();
        $this->staff->update(['password' => 'OtherPassword123!']);
        $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'OtherPassword123!'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'OtherPassword123!', 'organization_id' => $this->org->id, 'user_type' => 'staff'])
            ->assertOk()->assertJsonPath('user.id', $this->staff->id);
    }

    public function test_member_and_staff_with_same_email_remain_distinct_and_saas_cannot_modify_member(): void
    {
        $memberUser = $this->member->user;
        $this->staff->update(['email' => $memberUser->email]);
        $memberUser->update(['password' => 'MemberPassword123!']);
        $original = $memberUser->fresh()->password;
        $this->postJson('/api/v1/auth/login', ['email' => $memberUser->email, 'password' => 'MemberPassword123!', 'user_type' => 'member'])
            ->assertOk()->assertJsonPath('user.id', $memberUser->id);
        $this->postJson('/api/v1/auth/login', ['email' => $memberUser->email, 'password' => 'secret-pass-1', 'user_type' => 'staff'])
            ->assertOk()->assertJsonPath('user.id', $this->staff->id);
        $other = Organization::create(['name' => 'SaaS verified tenant', 'slug' => 'saas-new-staff', 'saas_org_id' => 'saas-new-staff']);
        config(['services.saas.api_url' => 'https://saas.example.test/api', 'services.saas.jwt_secret' => 'test-signing-placeholder']);
        Http::fake(['saas.example.test/*' => Http::response(['user' => ['email' => $memberUser->email], 'organization' => ['id' => 'saas-new-staff', 'role' => 'OWNER']])]);
        $this->postJson('/api/v1/auth/login', ['email' => $memberUser->email, 'password' => 'SaasPassword123!', 'organization_id' => $this->org->id])->assertUnprocessable();
        $this->assertDatabaseMissing('users', ['email' => $memberUser->email, 'organization_id' => $other->id]);
        // Retain the previous login's context: creation hooks still must bind the verified tenant.
        $response = $this->postJson('/api/v1/auth/login', ['email' => $memberUser->email, 'password' => 'SaasPassword123!'])->assertOk();
        $this->assertNotSame($memberUser->id, $response->json('user.id'));
        $this->assertSame($original, $memberUser->fresh()->password);
        $this->assertDatabaseHas('users', ['id' => $response->json('user.id'), 'user_type' => 'staff', 'organization_id' => $other->id]);
        $this->assertDatabaseHas('staff', ['user_id' => $response->json('user.id'), 'organization_id' => $other->id]);
    }

    public function test_bound_claim_changes_only_its_identity_and_revokes_its_old_tokens(): void
    {
        $other = $this->otherIdentity();
        $original = $this->staff->password;
        $kept = $this->staff->createToken('other-account')->accessToken;
        $revoked = $other->createToken('old-session')->accessToken;
        $code = EmailVerificationCode::issueFor($other, 'claim', now()->addHour());
        $this->postJson('/api/v1/auth/claim', $this->recoveryPayload($code->code))->assertOk()->assertJsonPath('user.id', $other->id);
        $this->assertSame($original, $this->staff->fresh()->password);
        $this->assertTrue(Hash::check('Replacement123!', $other->fresh()->password));
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $kept->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $revoked->id]);
        $this->assertNotNull($other->fresh()->email_verified_at);
        $this->postJson('/api/v1/auth/claim', $this->recoveryPayload($code->code))->assertUnprocessable();
    }

    public function test_legacy_ambiguous_and_wrong_purpose_codes_cannot_change_credentials(): void
    {
        $this->otherIdentity();
        EmailVerificationCode::create(['email' => $this->staff->email, 'code' => '123456', 'expires_at' => now()->addHour()])
            ->forceFill(['created_at' => now()->subMinutes(2)])->save();
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload('123456'))->assertUnprocessable();
        $code = EmailVerificationCode::issueFor($this->staff, 'claim', now()->addHour());
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($code->code))->assertUnprocessable();
        $this->postJson('/api/v1/auth/verify-code', ['email' => $this->staff->email, 'code' => $code->code])->assertUnprocessable();
        $this->postJson('/api/v1/auth/send-code', ['email' => $this->staff->email])->assertOk();
        $this->assertDatabaseHas('email_verification_codes', ['id' => $code->id, 'verified_at' => null]);
    }

    public function test_reset_revokes_old_bearer_token_and_grant_cannot_be_replayed(): void
    {
        $token = $this->staff->createToken('old-session');
        $code = EmailVerificationCode::issueFor($this->staff, 'reset', now()->addMinutes(15));
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($code->code))->assertOk();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->accessToken->id]);
        $this->withToken($token->plainTextToken)->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($code->code))->assertUnprocessable();
    }

    public function test_recovery_rolls_back_password_tokens_and_grant_if_completion_fails(): void
    {
        $original = $this->staff->password;
        $token = $this->staff->createToken('existing')->accessToken;
        $code = EmailVerificationCode::issueFor($this->staff, 'reset', now()->addHour());
        try {
            AccountRecovery::consume($this->staff->email, $code->code, 'Replacement123!', 'reset', fn () => throw new \RuntimeException('simulated audit failure'));
            $this->fail('Completion must throw.');
        } catch (\RuntimeException $error) {
            $this->assertSame('simulated audit failure', $error->getMessage());
        }
        $this->assertSame($original, $this->staff->fresh()->password);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $token->id]);
        $this->assertNull($code->fresh()->verified_at);
    }

    public function test_forgot_password_sends_separate_account_bound_grants_with_generic_response(): void
    {
        $other = $this->otherIdentity();
        $known = $this->postJson('/api/v1/auth/forgot-password', ['email' => $other->email])->assertOk();
        $unknown = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk();
        $this->assertSame($known->json(), $unknown->json());
        Mail::assertQueued(PasswordResetCodeMail::class, 2);
        $this->assertSame(2, EmailVerificationCode::where('email', $other->email)->where('purpose', 'reset')->distinct()->count('user_id'));
        Mail::assertQueued(PasswordResetCodeMail::class, fn ($mail) => str_contains($mail->accountLabel, 'Second tenant'));
    }

    public function test_inactive_staff_cannot_login(): void
    {
        DB::table('staff')->where('user_id', $this->staff->id)->update(['is_active' => false]);
        $this->postJson('/api/v1/auth/login', ['email' => $this->staff->email, 'password' => 'secret-pass-1'])->assertUnprocessable();
    }

    public function test_trial_cannot_claim_an_existing_organization_through_an_incomplete_staff_identity(): void
    {
        DB::table('staff')->where('user_id', $this->staff->id)->delete();
        $original = $this->staff->password;
        foreach (['WrongPassword123!', 'secret-pass-1'] as $password) {
            $this->postJson('/api/v1/auth/trial', ['email' => $this->staff->email, 'name' => 'Signup', 'phone' => '+12025550123', 'hotel_name' => 'Existing org', 'password' => $password])->assertUnprocessable();
        }
        $this->assertSame($original, $this->staff->fresh()->password);
        $this->assertDatabaseMissing('staff', ['user_id' => $this->staff->id]);
    }

    public function test_trial_with_member_email_creates_separate_staff_identity_without_modifying_member(): void
    {
        $memberUser = $this->member->user;
        $original = $memberUser->password;
        $this->addColumnsIfMissing('organizations', [
            'trial_end' => fn ($t) => $t->timestamp('trial_end')->nullable(),
            'period_end' => fn ($t) => $t->timestamp('period_end')->nullable(),
            'trial_started_at' => fn ($t) => $t->timestamp('trial_started_at')->nullable(),
            'entitlements_synced_at' => fn ($t) => $t->timestamp('entitlements_synced_at')->nullable(),
        ]);
        $response = $this->postJson('/api/v1/auth/trial', ['email' => $memberUser->email, 'name' => 'Signup', 'phone' => '+12025550123', 'hotel_name' => 'Separate signup', 'password' => 'NewAccount123!'])->assertCreated();
        $this->assertNotSame($memberUser->id, $response->json('user.id'));
        $this->assertSame($original, $memberUser->fresh()->password);
        $this->assertDatabaseMissing('staff', ['user_id' => $memberUser->id]);
        $newUser = User::findOrFail($response->json('user.id'));
        $this->assertNotSame($memberUser->organization_id, $newUser->organization_id);
        $this->assertSame('staff', $newUser->user_type);
    }

    public function test_operator_allowlist_needs_staff_and_verified_provenance_and_is_not_publicly_claimable(): void
    {
        $memberUser = $this->member->user;
        config(['services.saas.platform_admin_emails' => $memberUser->email.','.$this->staff->email.',reserved@example.test']);
        $memberUser->email_verified_at = now();
        $this->assertFalse($memberUser->isPlatformAdmin(), 'A verified member/import with an operator email is never an operator.');
        $this->assertFalse($this->staff->isPlatformAdmin(), 'An unverified staff identity is not an operator merely because its email matches.');
        $this->postJson('/api/v1/auth/register', ['name' => 'Anonymous', 'email' => 'reserved@example.test', 'password' => 'NewAccount123!', 'password_confirmation' => 'NewAccount123!'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/trial', ['email' => 'reserved@example.test', 'name' => 'Anonymous', 'phone' => '+12025550123', 'hotel_name' => 'Signup', 'password' => 'NewAccount123!'])->assertUnprocessable();
        $this->assertDatabaseMissing('users', ['email' => 'reserved@example.test']);
        $code = EmailVerificationCode::issueFor($this->staff, 'reset', now()->addHour());
        $this->postJson('/api/v1/auth/reset-password', $this->recoveryPayload($code->code))->assertOk();
        $this->assertTrue($this->staff->fresh()->isPlatformAdmin(), 'A bound mailbox recovery proves the configured staff identity.');
    }

    public function test_legacy_operator_migration_preserves_only_preexisting_configured_staff(): void
    {
        config(['services.saas.platform_admin_emails' => $this->staff->email.','.$this->member->user->email]);
        if (Schema::hasColumn('users', 'platform_operator_granted_at')) {
            Schema::table('users', fn ($t) => $t->dropColumn('platform_operator_granted_at'));
        }
        (require database_path('migrations/2026_10_29_160200_record_legacy_platform_operators.php'))->up();
        $this->assertTrue($this->staff->fresh()->isPlatformAdmin());
        $this->assertNull($this->staff->fresh()->email_verified_at);
        $this->assertFalse($this->member->user->fresh()->isPlatformAdmin());
        $this->assertNull($this->member->user->fresh()->platform_operator_granted_at);
        $this->assertArrayNotHasKey('platform_operator_granted_at', $this->staff->fresh()->toArray());
        $this->staff->refresh()->update(['email' => 'another-operator@example.test']);
        config(['services.saas.platform_admin_emails' => 'another-operator@example.test']);
        $this->assertNull($this->staff->fresh()->platform_operator_granted_at);
        $this->assertFalse($this->staff->fresh()->isPlatformAdmin(), 'Legacy trust must not follow an email change.');
    }

    public function test_saas_invite_activation_is_bound_to_verified_tenant_and_does_not_upgrade_role(): void
    {
        $other = $this->otherIdentity();
        $oldToken = $other->createToken('before-activation')->accessToken;
        $original = $this->staff->password;
        DB::table('staff')->where('user_id', $other->id)->delete();
        config(['services.saas.api_url' => 'https://saas.example.test/api']);
        Http::fake(['saas.example.test/api/auth/reset-password' => Http::response([
            'user' => ['email' => $other->email], 'organization' => ['id' => 'identity-b', 'role' => 'STAFF'],
        ])]);
        $this->postJson('/api/v1/auth/activate', ['email' => $other->email, 'token' => 'test-invite-placeholder', 'password' => 'Activated123!'])
            ->assertOk()->assertJsonPath('user.id', $other->id)->assertJsonPath('staff.role', 'receptionist');
        $this->assertSame($original, $this->staff->fresh()->password);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $oldToken->id]);
        $this->assertNotNull($other->fresh()->email_verified_at);
        $this->assertDatabaseMissing('staff', ['user_id' => $this->staff->id, 'organization_id' => $other->organization_id]);
    }
}
