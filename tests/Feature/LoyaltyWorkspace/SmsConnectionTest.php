<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The venue's Twilio account set from HexaTech Loyalty (2026-11-02), for an organisation on modules that has no full
 * admin: the full admin's own rows, the Auth Token encrypted at rest and never answered or audited, an empty token kept.
 */
class SmsConnectionTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, MembershipSchema, SmsSchema;

    private const TOKEN = 'test-auth-token-not-a-real-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildSmsSchema();
        $this->campaignsOn();
        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', 'like', 'twilio_%')->delete();
    }

    private function row(string $key): ?HotelSetting
    {
        return HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first();
    }

    public function test_a_manager_sets_the_twilio_account_and_the_token_is_never_answered(): void
    {
        $response = $this->asManager()->putJson($this->api('sms/connection'), [
            'account_sid' => $this->twilioSid, 'auth_token' => self::TOKEN, 'phone_number' => '+15005550006',
        ])->assertOk()->assertJsonPath('twilio.ready', true)->assertJsonPath('twilio.from', '+15005550006');

        $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
        $this->assertSame(self::TOKEN, $this->row('twilio_auth_token')->value);
        $this->assertNotSame(self::TOKEN, DB::table('hotel_settings')->where('organization_id', $this->org->id)->where('key', 'twilio_auth_token')->value('value'), 'encrypted at rest');
        $audit = AuditLog::where('action', 'sms_connection_saved')->latest('id')->first();
        $this->assertNotNull($audit);
        $this->assertStringNotContainsString(self::TOKEN, json_encode($audit->toArray()));
    }

    public function test_an_empty_token_keeps_the_stored_one_and_is_needed_the_first_time(): void
    {
        $this->asManager()->putJson($this->api('sms/connection'), ['account_sid' => $this->twilioSid, 'phone_number' => '+15005550006'])
            ->assertStatus(422)->assertJsonPath('error', 'token_required');

        $this->asManager()->putJson($this->api('sms/connection'), ['account_sid' => $this->twilioSid, 'auth_token' => self::TOKEN, 'phone_number' => '+15005550006'])->assertOk();
        $this->asManager()->putJson($this->api('sms/connection'), ['account_sid' => $this->twilioSid, 'auth_token' => '', 'phone_number' => '+447700900123'])
            ->assertOk()->assertJsonPath('twilio.from', '+447700900123');
        $this->assertSame(self::TOKEN, $this->row('twilio_auth_token')->value);
    }

    public function test_a_wrong_sender_or_sid_is_refused_and_staff_may_not_set_it(): void
    {
        $this->asManager()->putJson($this->api('sms/connection'), ['account_sid' => $this->twilioSid, 'auth_token' => self::TOKEN, 'phone_number' => '07700 900123'])
            ->assertStatus(422)->assertJsonPath('error', 'wrong_sender');
        $this->asManager()->putJson($this->api('sms/connection'), ['account_sid' => 'not-a-sid', 'auth_token' => self::TOKEN, 'phone_number' => '+15005550006'])
            ->assertStatus(422)->assertJsonValidationErrors('account_sid');
        $this->asStaffMember()->putJson($this->api('sms/connection'), ['account_sid' => $this->twilioSid, 'auth_token' => self::TOKEN, 'phone_number' => '+15005550006'])
            ->assertForbidden();
        $this->assertNull($this->row('twilio_auth_token'));
    }
}
