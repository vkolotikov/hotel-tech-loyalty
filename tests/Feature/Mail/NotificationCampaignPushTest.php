<?php

namespace Tests\Feature\Mail;

use App\Jobs\SendNotificationCampaignChunk;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\NotificationCampaign;
use App\Models\Organization;
use App\Models\User;
use App\Services\EmailComplianceService;
use App\Services\MailIdentityService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The queued notification campaign's PUSH path, end to end through the real
 * NotificationService.
 *
 * The first version of SendNotificationCampaignChunk built its push payload
 * without a `type`. NotificationService::send() records every push under
 * `$notification['type']` before it calls Expo, so each recipient threw on
 * an undefined key, was marked failed, and the campaign still finished as
 * "sent" with a sent_count of zero. No test drove the job, so nothing
 * noticed. This one does.
 */
class NotificationCampaignPushTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpLoyaltySchema();
        $this->setUpNotificationSchema();   // push_notifications + the member's push columns
        $this->setUpBookingRefundSchema();  // hotel_settings, read by MailIdentityService

        if (!Schema::hasColumn('loyalty_members', 'push_notifications')) {
            Schema::table('loyalty_members', fn ($t) => $t->boolean('push_notifications')->default(true));
        }
        if (!Schema::hasColumn('loyalty_members', 'email_notifications')) {
            Schema::table('loyalty_members', fn ($t) => $t->boolean('email_notifications')->default(true));
        }

        if (!Schema::hasTable('notification_campaigns')) {
            Schema::create('notification_campaigns', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('name')->nullable();
                $t->text('segment_rules')->nullable();
                $t->string('title');
                $t->text('body')->nullable();
                $t->text('data')->nullable();
                $t->string('channel', 16)->default('push');
                $t->unsignedBigInteger('email_template_id')->nullable();
                $t->string('email_subject')->nullable();
                $t->unsignedInteger('email_sent_count')->default(0);
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->unsignedInteger('target_count')->default(0);
                $t->unsignedInteger('sent_count')->default(0);
                $t->unsignedInteger('opened_count')->default(0);
                $t->string('status', 16)->default('draft');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('campaign_recipients')) {
            Schema::create('campaign_recipients', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('campaign_id');
                $t->unsignedBigInteger('loyalty_member_id');
                $t->string('channel', 16);
                $t->string('email')->nullable();
                $t->string('status', 16)->default('sent');
                $t->timestamp('sent_at')->nullable();
                $t->timestamp('opened_at')->nullable();
                $t->unsignedInteger('open_count')->default(0);
                $t->text('error')->nullable();
                $t->timestamps();
            });
        }

        // Expo is never reached: every push goes to a fake that says "ok".
        Http::fake(['https://exp.host/*' => Http::response(['data' => [['status' => 'ok']]], 200)]);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_a_push_campaign_records_each_push_under_the_campaign_type_and_counts_it_sent(): void
    {
        $org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'org-' . uniqid(), 'subscription_status' => 'ACTIVE']);
        LoyaltyTier::create(['organization_id' => $org->id, 'name' => 'Bronze', 'min_points' => 0, 'is_active' => true]);

        $user = User::create([
            'organization_id' => $org->id, 'name' => 'App Member',
            'email' => 'member_' . uniqid('', true) . '@example.test', 'password' => 'Sup3rSecret!1',
        ]);

        $member = LoyaltyMember::withoutGlobalScopes()->create([
            'organization_id' => $org->id, 'user_id' => $user->id, 'is_active' => true,
        ]);
        DB::table('loyalty_members')->where('id', $member->id)->update([
            'expo_push_token'    => 'ExponentPushToken[test-device]',
            'push_notifications' => true,
        ]);

        $campaign = NotificationCampaign::withoutGlobalScopes()->create([
            'organization_id' => $org->id,
            'title'           => 'Weekend double points',
            'body'            => 'Every stay this weekend earns double.',
            'channel'         => 'push',
            'status'          => 'sending',
            'target_count'    => 1,
        ]);

        $job = new SendNotificationCampaignChunk($campaign->id, [$member->id]);
        $job->handle(app(EmailComplianceService::class), app(NotificationService::class), app(MailIdentityService::class));

        $push = DB::table('push_notifications')->where('member_id', $member->id)->first();
        $this->assertNotNull($push, 'No push was recorded for the member.');
        $this->assertSame('campaign', $push->type, 'The push must be recorded under the campaign type.');
        $this->assertSame('Weekend double points', $push->title);

        $recipient = DB::table('campaign_recipients')->where('campaign_id', $campaign->id)->where('loyalty_member_id', $member->id)->first();
        $this->assertNotNull($recipient);
        $this->assertSame('sent', $recipient->status, 'The recipient was marked failed: ' . ($recipient->error ?? ''));
        $this->assertNull($recipient->error);

        $fresh = NotificationCampaign::withoutGlobalScopes()->find($campaign->id);
        $this->assertSame(1, (int) $fresh->sent_count);
        $this->assertSame('sent', $fresh->status);

        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://exp.host/'));
    }
}
