<?php

namespace Tests\Feature\Auth;

use App\Models\EmailVerificationCode;
use App\Models\User;
use App\Services\Auth\AccountRecovery;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * POST /v1/auth/claim — proving control of an email by code is what turns
 * an unverified address into a verified one.
 *
 * Why this matters beyond the claim flow itself: MemberBookingQuery's
 * email-ownership rule (member-portal-v2 phase 1, task 4 review finding)
 * only trusts a member's email once users.email_verified_at is set.
 * POST /v1/auth/register never sets it — that endpoint hands out a token
 * for any address nobody has used yet, with no verification step at all.
 * claimAccount() is the one path that proves control of the address (the
 * code was emailed to it), so it is the one place that stamp may come
 * from. This is the regression guard for that stamp.
 */
class ClaimAccountTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const CLAIM = '/api/v1/auth/claim';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        // The minimal users table doesn't carry this column at all.
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', fn ($table) => $table->timestamp('email_verified_at')->nullable());
        }

        if (!Schema::hasTable('email_verification_codes')) {
            Schema::create('email_verification_codes', function ($table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('purpose', 16)->nullable();
                $table->string('email')->index();
                $table->string('code', 6);
                $table->timestamp('expires_at');
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();
            });
        }

        // claimAccount() mints a real Sanctum token on success
        // ($user->createToken('mobile-app')) — not Sanctum::actingAs(),
        // which never touches this table.
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($table) {
                $table->bigIncrements('id');
                $table->string('tokenable_type');
                $table->unsignedBigInteger('tokenable_id');
                $table->text('name');
                $table->string('token', 64)->unique();
                $table->text('abilities')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
                $table->index(['tokenable_type', 'tokenable_id']);
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    public function test_claiming_the_account_verifies_the_email_the_code_was_sent_to(): void
    {
        $user = User::create([
            'name'     => 'Invited Member',
            'email'    => 'invited@example.test',
            'password' => 'OldPlaceholder1!',
            'user_type'=> 'member',
        ]);
        $this->assertNull($user->email_verified_at, 'the fixture must start unverified for this test to prove anything');

        EmailVerificationCode::create([
            'email'      => 'invited@example.test',
            'code'       => '482913',
            'expires_at' => now()->addHour(),
        ]);

        $this->postJson(self::CLAIM, [
            'email'                 => 'invited@example.test',
            'code'                  => '482913',
            'password'              => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])->assertOk();

        $this->assertNotNull(
            $user->fresh()->email_verified_at,
            'claiming the account with a code sent to the address must verify that address.'
        );
    }

    public function test_a_wrong_code_claims_nothing_and_leaves_the_email_unverified(): void
    {
        $user = User::create([
            'name'     => 'Invited Member',
            'email'    => 'invited2@example.test',
            'password' => 'OldPlaceholder1!',
            'user_type'=> 'member',
        ]);
        EmailVerificationCode::create([
            'email'      => 'invited2@example.test',
            'code'       => '482913',
            'expires_at' => now()->addHour(),
        ]);

        $this->postJson(self::CLAIM, [
            'email'                 => 'invited2@example.test',
            'code'                  => '000000',
            'password'              => 'NewPassword1!',
            'password_confirmation' => 'NewPassword1!',
        ])->assertStatus(422);

        $this->assertNull($user->fresh()->email_verified_at, 'a wrong code must not verify the email');
    }

    public function test_after_ten_wrong_codes_for_an_address_even_the_right_one_waits_an_hour(): void
    {
        // 2026-11-04: the routes' limits are per IP; a six-digit code could be guessed from many addresses.
        $user = User::create(['name' => 'Invited Member', 'email' => 'invited3@example.test', 'password' => 'OldPlaceholder1!', 'user_type' => 'member']);
        EmailVerificationCode::create(['email' => 'invited3@example.test', 'code' => '482913', 'expires_at' => now()->addHours(3)]);
        $try = fn (string $code) => AccountRecovery::consume('invited3@example.test', $code, 'NewPassword1!', 'claim', fn () => 'claimed');

        for ($i = 0; $i < AccountRecovery::FAILURES; $i++) {
            try {
                $try(sprintf('%06d', $i));
                $this->fail('a wrong code was accepted');
            } catch (ValidationException) {
            }
        }
        try {
            $try('482913');
            $this->fail('the right code was accepted past the limit');
        } catch (ValidationException $e) {
            $this->assertStringContainsString('Too many wrong codes', $e->errors()['code'][0]);
        }
        $this->assertNull($user->fresh()->email_verified_at);

        // Another purpose and another address keep their own count.
        try {
            AccountRecovery::consume('someone@example.test', '000000', 'NewPassword1!', 'claim', fn () => 'claimed');
        } catch (ValidationException $e) {
            $this->assertStringNotContainsString('Too many', $e->errors()['code'][0]);
        }

        $this->travel(61)->minutes();
        $this->assertSame('claimed', $try('482913'));
        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
