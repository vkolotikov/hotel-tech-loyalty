<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use App\Models\HotelSetting;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables HexaTech Loyalty's SMS campaigns read and write (release 4 §5, R4-4), in sqlite, as the migrations build
 * them: the member's `sms_consent` (2026_10_23_150000), sms_campaigns and sms_campaign_deliveries (2026_10_23_150010).
 * Every table and column is guarded, so a narrower table another suite built first is widened rather than replaced.
 * No foreign keys (the tests' hand-built tables carry none); the unique pair the job's insert-or-skip rests on is kept.
 *
 * Called as buildSmsSchema(), not setUp…(): Laravel calls setUp<TraitName>() itself, before the base tables exist.
 * `twilioSettings()` gives the organisation a made-up Twilio account (never a real one: every request goes to
 * Http::fake in the tests).
 */
trait SmsSchema
{
    /** A made-up Account SID: `AC` like Twilio's, but with letters no real SID has, so it can never be mistaken for one. */
    protected string $twilioSid = 'ACtestsidxxxxxxxxxxxxxxxxxxxxxxxxxx';

    protected function buildSmsSchema(): void
    {
        if (Schema::hasTable('loyalty_members') && !Schema::hasColumn('loyalty_members', 'sms_consent')) {
            Schema::table('loyalty_members', fn (Blueprint $t) => $t->boolean('sms_consent')->nullable()->default(false));
        }

        if (!Schema::hasTable('sms_campaigns')) {
            Schema::create('sms_campaigns', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_segment_id')->nullable();
                $t->string('name', 120);
                $t->text('body');
                $t->string('status', 16)->default('draft');
                $t->unsignedInteger('recipient_count')->default(0);
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->string('error_message', 64)->nullable();
                $t->unsignedBigInteger('created_by_user_id')->nullable();
                $t->unsignedBigInteger('sent_by_user_id')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('sms_campaign_deliveries')) {
            Schema::create('sms_campaign_deliveries', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('campaign_id');
                $t->unsignedBigInteger('member_id');
                $t->string('status', 16)->default('pending');
                $t->string('reason', 40)->nullable();
                $t->string('twilio_sid', 64)->nullable();
                $t->unsignedSmallInteger('segments')->nullable();
                $t->timestamps();
                $t->unique(['campaign_id', 'member_id']);
                $t->index('member_id');
            });
        }
    }

    /**
     * The organisation's Twilio settings, as Settings → Integrations stores them (hotel_settings rows of the group
     * `integrations`); an empty value leaves that row out.
     */
    protected function twilioSettings(int $orgId, ?string $sid = null, ?string $token = 'test-auth-token-not-real', ?string $from = '+15005550006'): void
    {
        $sid ??= $this->twilioSid;
        HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->whereIn('key', ['twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'])->delete();
        foreach (['twilio_account_sid' => $sid, 'twilio_auth_token' => $token, 'twilio_phone_number' => $from] as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $row = new HotelSetting();
            $row->forceFill(['organization_id' => $orgId, 'key' => $key, 'value' => $value, 'type' => 'string', 'group' => 'integrations', 'label' => $key, 'scope' => 'company'])->save();
        }
    }
}
