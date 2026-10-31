<?php

namespace Tests\Feature\Member;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Signing out of the members' app (HexaTech Loyalty, owner 2026-10-31) forgets this phone: the member's push token is
 * cleared, but only while it is the one this phone sent — a phone that registered since keeps it.
 */
class PushTokenForgetTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private const URL = '/api/v1/auth/push-token';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_the_phone_signing_out_clears_its_own_token(): void
    {
        $this->actingAs($this->ada->user, 'sanctum')->postJson(self::URL, ['expo_push_token' => 'ExponentPushToken[phone-a-000000]'])->assertOk();
        $this->assertSame('ExponentPushToken[phone-a-000000]', $this->ada->fresh()->expo_push_token);

        $this->actingAs($this->ada->user, 'sanctum')->deleteJson(self::URL, ['expo_push_token' => 'ExponentPushToken[phone-a-000000]'])
            ->assertOk()->assertExactJson(['cleared' => true]);
        $this->assertNull($this->ada->fresh()->expo_push_token);
    }

    public function test_an_older_phone_signing_out_leaves_the_newer_phones_token(): void
    {
        $this->actingAs($this->ada->user, 'sanctum')->postJson(self::URL, ['expo_push_token' => 'ExponentPushToken[phone-b-000000]'])->assertOk();

        $this->actingAs($this->ada->user, 'sanctum')->deleteJson(self::URL, ['expo_push_token' => 'ExponentPushToken[phone-a-000000]'])
            ->assertOk()->assertExactJson(['cleared' => false]);
        $this->assertSame('ExponentPushToken[phone-b-000000]', $this->ada->fresh()->expo_push_token);
    }

    public function test_another_members_token_is_never_touched(): void
    {
        $this->actingAs($this->grace->user, 'sanctum')->postJson(self::URL, ['expo_push_token' => 'ExponentPushToken[grace-000000]'])->assertOk();

        $this->actingAs($this->ada->user, 'sanctum')->deleteJson(self::URL, ['expo_push_token' => 'ExponentPushToken[grace-000000]'])
            ->assertOk()->assertExactJson(['cleared' => false]);
        $this->assertSame('ExponentPushToken[grace-000000]', $this->grace->fresh()->expo_push_token);
    }

    public function test_a_token_is_required(): void
    {
        $this->actingAs($this->ada->user, 'sanctum')->deleteJson(self::URL, [])->assertStatus(422)->assertJsonValidationErrors(['expo_push_token']);
    }
}
