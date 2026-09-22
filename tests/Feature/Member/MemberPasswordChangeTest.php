<?php

namespace Tests\Feature\Member;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * PUT /v1/member/password — the endpoint the mobile Settings screen calls.
 *
 * Before this shipped, the app sent current_password / password /
 * password_confirmation to PUT /v1/member/profile, whose validate() lists
 * none of those keys: Laravel dropped all three, the endpoint answered 200
 * "Profile updated", and the app told the member "Password updated
 * successfully" while the password was never touched. Then the route was
 * added to production without its controller method and answered 500.
 *
 * Every assertion here is on the OUTCOME — what the stored hash verifies
 * against, which token rows survive — never on the status alone.
 */
class MemberPasswordChangeTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/password';

    public function test_the_endpoint_requires_a_signed_in_member(): void
    {
        $this->putJson(self::ENDPOINT, [
            'current_password'      => 'x',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'N3w-Password!',
        ])->assertStatus(401);
    }

    public function test_a_wrong_current_password_is_refused_on_that_field_and_nothing_changes(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());
        $before = $user->fresh()->password;

        $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'not-the-password',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'N3w-Password!',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);

        $this->assertSame($before, $user->fresh()->password, 'A refused change must not touch the stored hash.');
        $this->assertTrue(Hash::check('Sup3rSecret!1', $user->fresh()->password));
    }

    public function test_a_short_or_unconfirmed_new_password_is_refused(): void
    {
        ['token' => $token] = $this->member($this->tenant());

        $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'Sup3rSecret!1',
            'password'              => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'Sup3rSecret!1',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'something-else',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    public function test_the_password_changes_once_and_every_other_session_is_revoked(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());

        // A second device, signed in before the change.
        $otherToken = $user->createToken('other-device');
        $currentId  = (int) DB::table('personal_access_tokens')->where('id', '!=', $otherToken->accessToken->id)->value('id');

        $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'Sup3rSecret!1',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'N3w-Password!',
        ])
            ->assertStatus(200)
            ->assertJson(['message' => 'Password updated']);

        $stored = User::withoutGlobalScopes()->findOrFail($user->id)->password;

        // Hashed exactly ONCE: the model's `hashed` cast did it. A second
        // Hash::make would leave a hash of a hash that nothing can verify.
        $this->assertTrue(Hash::check('N3w-Password!', $stored), 'The new password does not verify — hashed twice, or not stored.');
        $this->assertFalse(Hash::check('Sup3rSecret!1', $stored), 'The old password still verifies.');

        $survivors = DB::table('personal_access_tokens')->where('tokenable_id', $user->id)->pluck('id')->all();
        $this->assertSame([$currentId], $survivors,
            'The session that changed the password must survive; every other session must be revoked.');

        // And the surviving token still resolves, so the member is not thrown
        // out of the app they just used to fix their security.
        $this->assertNotNull(PersonalAccessToken::findToken($token), 'The current session token no longer resolves.');
        $this->assertNull(PersonalAccessToken::findToken($otherToken->plainTextToken), 'The other device is still signed in.');
    }

    public function test_an_imported_member_with_a_placeholder_hash_gets_a_422_not_a_500(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());

        // CSV-imported members carry an unusable placeholder rather than a
        // bcrypt hash; Hash::check throws on it. Written raw, past the cast.
        DB::table('users')->where('id', $user->id)->update(['password' => '!imported:legacy-row']);

        $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'anything',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'N3w-Password!',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);

        $this->assertSame('!imported:legacy-row', DB::table('users')->where('id', $user->id)->value('password'));
    }

    public function test_the_endpoint_is_throttled_as_a_credential_oracle(): void
    {
        ['token' => $token] = $this->member($this->tenant());

        $attempt = fn () => $this->withToken($token)->putJson(self::ENDPOINT, [
            'current_password'      => 'guess',
            'password'              => 'N3w-Password!',
            'password_confirmation' => 'N3w-Password!',
        ]);

        foreach (range(1, 6) as $i) {
            $attempt()->assertStatus(422);
        }

        $attempt()->assertStatus(429);
    }
}
