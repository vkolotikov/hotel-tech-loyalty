<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use App\Models\User;

/**
 * DELETE /v1/member/account — a member deletes their own account from the app or the portal: the user is anonymised,
 * the membership switched off, every token revoked. `loyalty_members.qr_code_token` is NOT NULL and unique in
 * production (2024_01_01_000003); writing null there made PostgreSQL refuse the whole deletion (a 500, and the member
 * stayed). The old QR code must stop naming the member, so a fresh value replaces it.
 */
class MemberAccountDeletionTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/account';

    protected function setUp(): void
    {
        parent::setUp();
        // The columns the deletion clears, as production has them (the shared test schema leaves some out).
        foreach (['avatar_url' => 'string', 'nationality' => 'string', 'date_of_birth' => 'date'] as $column => $type) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('users', $column)) {
                \Illuminate\Support\Facades\Schema::table('users', fn ($t) => $t->{$type}($column)->nullable());
            }
        }
    }

    public function test_a_member_deletes_their_account_and_the_old_qr_code_no_longer_names_them(): void
    {
        $org = $this->tenant();
        ['user' => $user, 'member' => $member, 'token' => $token] = $this->member($org);
        $oldCode = (string) $member->qr_code_token;
        $this->assertNotSame('', $oldCode, 'registration gives the member a QR code');

        $this->withToken($token)->deleteJson(self::ENDPOINT, ['password' => 'Sup3rSecret!1', 'confirmation' => 'DELETE'])
            ->assertOk()
            ->assertJsonPath('message', 'Your account has been deleted. We are sorry to see you go.');

        $member = LoyaltyMember::withoutGlobalScopes()->findOrFail($member->id);
        $user = User::withoutGlobalScopes()->findOrFail($user->id);
        $this->assertFalse((bool) $member->is_active);
        $this->assertNotSame($oldCode, $member->qr_code_token);
        $this->assertStringStartsWith('erased-', (string) $member->qr_code_token);
        $this->assertSame('Deleted Member', $user->name);
        $this->assertStringEndsWith('@deleted.local', $user->email);
        $this->assertSame(0, $user->tokens()->count(), 'every session is signed out');
    }

    public function test_a_wrong_password_deletes_nothing(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);

        $this->withToken($token)->deleteJson(self::ENDPOINT, ['password' => 'not-it', 'confirmation' => 'DELETE'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->assertTrue((bool) LoyaltyMember::withoutGlobalScopes()->findOrFail($member->id)->is_active);
    }
}
