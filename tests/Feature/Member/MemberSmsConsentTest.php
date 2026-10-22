<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;

/**
 * "Offers by SMS" (HexaTech Loyalty release 4, owner decision R4-4): the member's own SMS opt-in, `sms_consent` on
 * PUT /v1/member/profile, off until the member turns it on. The answer keeps its shape (`message`, `user`, `member`);
 * a save that does not name the switch leaves it as it is; nothing but a boolean is taken.
 */
class MemberSmsConsentTest extends MemberEndpointTestCase
{
    use SmsSchema;

    private const ENDPOINT = '/api/v1/member/profile';

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildSmsSchema();
    }

    private function consent(int $memberId): mixed
    {
        return LoyaltyMember::withoutGlobalScopes()->whereKey($memberId)->value('sms_consent');
    }

    public function test_a_new_member_has_sms_off(): void
    {
        ['member' => $member] = $this->member($this->tenant());

        $this->assertFalse((bool) $this->consent($member->id));
    }

    public function test_the_member_turns_sms_on_and_off(): void
    {
        ['member' => $member, 'token' => $token] = $this->member($this->tenant());

        $this->withToken($token)->putJson(self::ENDPOINT, ['sms_consent' => true])
            ->assertOk()
            ->assertJsonPath('message', 'Profile updated')
            ->assertJsonPath('member.sms_consent', true)
            ->assertJsonStructure(['message', 'user' => ['id', 'name', 'email', 'phone'], 'member']);
        $this->assertTrue((bool) $this->consent($member->id));

        $this->withToken($token)->putJson(self::ENDPOINT, ['sms_consent' => false])->assertOk()->assertJsonPath('member.sms_consent', false);
        $this->assertFalse((bool) $this->consent($member->id));
    }

    public function test_a_save_without_the_switch_leaves_it_and_only_a_boolean_is_taken(): void
    {
        ['member' => $member, 'token' => $token] = $this->member($this->tenant());
        $this->withToken($token)->putJson(self::ENDPOINT, ['sms_consent' => true])->assertOk();

        $this->withToken($token)->putJson(self::ENDPOINT, ['name' => 'App Member Renamed'])->assertOk();
        $this->assertTrue((bool) $this->consent($member->id));

        $this->withToken($token)->putJson(self::ENDPOINT, ['sms_consent' => 'please'])->assertStatus(422)->assertJsonValidationErrors(['sms_consent']);
        $this->assertTrue((bool) $this->consent($member->id));
    }
}
