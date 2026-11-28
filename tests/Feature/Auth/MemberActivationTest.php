<?php

namespace Tests\Feature\Auth;

use App\Mail\VerificationCodeMail;
use App\Models\EmailVerificationCode;
use App\Models\User;
use App\Support\SharedCache;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MemberActivationTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Mail::fake();
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

    private function claimPayload(User $user, string $code): array
    {
        return ['email' => strtoupper($user->email), 'code' => $code, 'password' => 'Replacement123!',
            'password_confirmation' => 'Replacement123!'];
    }

    public function test_the_portal_can_activate_a_member_using_its_requested_code_after_a_wrong_entry(): void
    {
        $user = $this->member->user;
        $this->postJson('/api/v1/auth/send-code', ['email' => strtoupper($user->email), 'purpose' => 'claim'])->assertOk();
        $code = EmailVerificationCode::where('email', $user->email)->firstOrFail();
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, 'badbad'))->assertUnprocessable();
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $code->code))
            ->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonPath('member.id', $this->member->id);
        $this->assertTrue(Hash::check('Replacement123!', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $code->code))->assertUnprocessable();
    }

    public function test_claim_resends_keep_the_same_code_and_original_expiry_so_queued_mail_order_does_not_matter(): void
    {
        $user = $this->member->user;
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertOk();
        $first = EmailVerificationCode::where('email', $user->email)->firstOrFail();
        $this->travel(2)->minutes();
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertOk();
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertStatus(429);
        $rows = EmailVerificationCode::where('email', $user->email)->get();
        $this->assertCount(1, $rows);
        $this->assertSame($first->id, $rows->first()->id);
        $this->assertTrue($first->expires_at->equalTo($rows->first()->expires_at));
        Mail::assertQueued(VerificationCodeMail::class, 2);
        $this->assertTrue(Mail::queued(VerificationCodeMail::class)->every(fn ($mail) => $mail->code === $first->code));
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $first->code))->assertOk();
    }

    public function test_claim_request_does_not_create_a_staff_or_unbound_grant_and_has_the_same_public_response(): void
    {
        $staffPassword = $this->staff->password;
        $member = $this->postJson('/api/v1/auth/send-code', ['email' => $this->member->user->email, 'purpose' => 'claim'])->assertOk();
        $staff = $this->postJson('/api/v1/auth/send-code', ['email' => $this->staff->email, 'purpose' => 'claim'])->assertOk();
        $missing = $this->postJson('/api/v1/auth/send-code', ['email' => 'missing@example.test', 'purpose' => 'claim'])->assertOk();
        $this->assertSame($member->json(), $staff->json());
        $this->assertSame($member->json(), $missing->json());
        $this->assertSame($staffPassword, $this->staff->fresh()->password);
        $this->assertSame(0, EmailVerificationCode::where('email', $this->staff->email)->count());
        $this->assertSame(0, EmailVerificationCode::whereNull('user_id')->count());
        $record = EmailVerificationCode::firstOrFail();
        $this->assertSame($this->member->user_id, $record->user_id);
        $this->assertSame('claim', $record->purpose);
        $this->postJson('/api/v1/auth/verify-code', ['email' => $record->email, 'code' => $record->code])->assertUnprocessable();
        $this->postJson('/api/v1/auth/reset-password', $this->claimPayload($this->member->user, $record->code))->assertUnprocessable();
    }

    public function test_claim_transport_failure_keeps_the_same_response_and_resend_limit_for_known_and_unknown_members(): void
    {
        Mail::swap(new \Illuminate\Mail\MailManager($this->app));
        config(['mail.default' => 'no-such-transport']);
        $known = ['email' => $this->member->user->email, 'purpose' => 'claim'];
        $unknown = ['email' => 'missing@example.test', 'purpose' => 'claim'];
        $member = $this->postJson('/api/v1/auth/send-code', $known)->assertOk();
        $missing = $this->postJson('/api/v1/auth/send-code', $unknown)->assertOk();
        $this->assertSame($member->json(), $missing->json());
        $this->postJson('/api/v1/auth/send-code', $known)->assertStatus(429);
        $this->postJson('/api/v1/auth/send-code', $unknown)->assertStatus(429);
    }

    public function test_a_bound_claim_uses_its_member_identity_even_with_a_same_email_staff_identity(): void
    {
        if (Schema::hasIndex('users', 'users_email_unique')) {
            (require database_path('migrations/2026_05_25_120000_users_email_unique_per_org_for_staff.php'))->up();
        }
        $user = $this->member->user;
        $this->staff->update(['email' => $user->email]);
        $original = $this->staff->password;
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertOk();
        $code = EmailVerificationCode::where('user_id', $user->id)->firstOrFail();
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $code->code))->assertOk()->assertJsonPath('user.id', $user->id);
        $this->assertSame($original, $this->staff->fresh()->password);
    }

    public function test_expired_claims_are_refused_and_resending_after_expiry_issues_a_new_short_lived_grant(): void
    {
        $user = $this->member->user;
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertOk();
        $old = EmailVerificationCode::where('email', $user->email)->firstOrFail();
        $this->travel(16)->minutes();
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $old->code))->assertUnprocessable();
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email, 'purpose' => 'claim'])->assertOk();
        $new = EmailVerificationCode::where('user_id', $user->id)->firstOrFail();
        $this->assertNotSame($old->id, $new->id);
        $this->assertTrue($new->expires_at->equalTo(now()->addMinutes(15)->startOfSecond()));
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $new->code))->assertOk();
    }

    public function test_sign_up_verification_does_not_authorize_an_existing_members_password_change(): void
    {
        $user = $this->member->user;
        $original = $user->password;
        $this->postJson('/api/v1/auth/send-code', ['email' => $user->email])->assertOk();
        $code = EmailVerificationCode::where('email', $user->email)->firstOrFail();
        $this->postJson('/api/v1/auth/claim', $this->claimPayload($user, $code->code))->assertUnprocessable();
        $this->assertSame($original, $user->fresh()->password);
    }

    public function test_successful_leading_zero_verification_clears_the_shared_attempt_counter(): void
    {
        config(['cache.stores.verification_shared' => ['driver' => 'array'], 'cache.shared' => 'verification_shared']);
        EmailVerificationCode::create(['email' => 'zero@example.test', 'code' => '012345', 'purpose' => 'verify', 'expires_at' => now()->addMinutes(15)]);
        SharedCache::store()->put('verify_attempts:zero@example.test', 4, now()->addMinutes(15));
        $this->postJson('/api/v1/auth/verify-code', ['email' => ' ZERO@Example.Test ', 'code' => '012345'])->assertOk();
        $this->assertSame(0, (int) SharedCache::store()->get('verify_attempts:zero@example.test', 0));
        $this->postJson('/api/v1/auth/verify-code', ['email' => 'zero@example.test', 'code' => '000000'])->assertUnprocessable();
    }
}
