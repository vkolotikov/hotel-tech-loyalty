<?php

namespace Tests\Feature\Mail;

use App\Jobs\SendNotificationCampaignChunk;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\NotificationCampaign;
use App\Models\EmailTemplate;
use App\Models\Organization;
use App\Models\User;
use App\Services\EmailComplianceService;
use App\Services\MailIdentityService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
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
    use DatabaseTransactions, SetsUpMinimalSchema, PushSchema;

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

        // push_notifications as the migrations build it (the inbox row carries sent_at since release 3 §3).
        $this->buildPushSchema();

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

        $member = LoyaltyMember::withoutGlobalScopes()->create($this->memberRequired([
            'organization_id' => $org->id, 'user_id' => $user->id, 'member_number' => 'M-' . $user->id, 'is_active' => true,
        ]));
        DB::table('loyalty_members')->where('id', $member->id)->update([
            'expo_push_token'    => 'ExponentPushToken[test-device]',
            'push_notifications' => true,
        ]);

        $campaign = NotificationCampaign::withoutGlobalScopes()->create([
            'organization_id' => $org->id,
            'name'            => 'Weekend double points',
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
        $this->assertTrue((bool) $push->is_sent, 'The push must be kept in the member\'s inbox, marked sent.');

        $recipient = DB::table('campaign_recipients')->where('campaign_id', $campaign->id)->where('loyalty_member_id', $member->id)->first();
        $this->assertNotNull($recipient);
        $this->assertSame('sent', $recipient->status, 'The recipient was marked failed: ' . ($recipient->error ?? ''));
        $this->assertNull($recipient->error);

        $fresh = NotificationCampaign::withoutGlobalScopes()->find($campaign->id);
        $this->assertSame(1, (int) $fresh->sent_count);
        $this->assertSame('sent', $fresh->status);

        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://exp.host/'));
    }

    private function retryFixture(string $channel = 'push'): array
    {
        Queue::fake();
        config(['cache.shared' => 'array', 'mail.campaign_hourly_limit_per_org' => 10000, 'mail.campaign_hourly_limit_global' => 10000]);
        $org = Organization::create(['name' => 'Retry fixture', 'slug' => 'retry-' . uniqid(), 'subscription_status' => 'ACTIVE']);
        app()->instance('current_organization_id', $org->id);
        $user = User::create(['organization_id' => $org->id, 'name' => 'Retry Member', 'email' => uniqid() . '@example.test', 'password' => 'FixturePassword123!']);
        $member = LoyaltyMember::create($this->memberRequired(['organization_id' => $org->id, 'user_id' => $user->id, 'member_number' => 'M-' . $user->id, 'is_active' => true]));
        DB::table('loyalty_members')->where('id', $member->id)->update(['expo_push_token' => 'ExponentPushToken[test-device]']);
        $templateId = null;
        if ($channel === 'both') {
            if (!Schema::hasTable('email_templates')) {
                Schema::create('email_templates', function ($t) {
                    $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable();
                    $t->string('name'); $t->string('subject'); $t->text('html_body'); $t->boolean('is_active')->default(true); $t->timestamps();
                });
            }
            $templateId = EmailTemplate::create(['name' => 'Retry fixture', 'subject' => 'Fixture', 'html_body' => '<p>Hello {{member_name}}</p>'])->id;
        }
        $campaign = NotificationCampaign::create(['name' => 'Retry fixture', 'title' => 'Fixture', 'body' => 'Fixture', 'channel' => $channel,
            'status' => 'sending', 'target_count' => 101, 'email_template_id' => $templateId]);
        // Keep the campaign sending after the first slice, like a retried mid-campaign worker.
        $job = new SendNotificationCampaignChunk($campaign->id, array_merge([$member->id], array_fill(0, 100, PHP_INT_MAX)));
        return [$org, $member, $campaign, $job];
    }

    public function test_a_retried_slice_sends_push_and_email_once_and_counts_each_settled_recipient_once(): void
    {
        [, $member, $campaign, $job] = $this->retryFixture('both');
        $notifications = $this->mock(NotificationService::class);
        $notifications->shouldReceive('send')->once()->andReturnUsing(function () use ($campaign, $member) {
            $this->assertDatabaseHas('campaign_recipients', ['campaign_id' => $campaign->id, 'loyalty_member_id' => $member->id,
                'channel' => 'push', 'status' => 'pending', 'sent_at' => null]);
        });
        $compliance = $this->mock(EmailComplianceService::class);
        $compliance->shouldReceive('canReceive')->andReturn(true);
        $compliance->shouldReceive('footerHtml')->once()->andReturn('');
        Mail::shouldReceive('html')->once()->andReturn(new \stdClass());
        $job->handle($compliance, $notifications, app(MailIdentityService::class));
        $job->handle($compliance, $notifications, app(MailIdentityService::class));
        $this->assertSame(2, DB::table('campaign_recipients')->where('campaign_id', $campaign->id)->count());
        $this->assertSame(1, (int) $campaign->fresh()->sent_count);
        $this->assertSame(1, (int) $campaign->fresh()->email_sent_count);
        $this->assertSame('sending', $campaign->fresh()->status);
    }

    public function test_pending_and_failed_delivery_outcomes_are_never_resent_or_counted_as_sent(): void
    {
        foreach (['pending', 'failed'] as $status) {
            [$org, $member, $campaign, $job] = $this->retryFixture('both');
            foreach (['push', 'email'] as $channel) {
                DB::table('campaign_recipients')->insert(['organization_id' => $org->id, 'campaign_id' => $campaign->id,
                    'loyalty_member_id' => $member->id, 'channel' => $channel, 'status' => $status, 'created_at' => now(), 'updated_at' => now()]);
            }
            $notifications = $this->mock(NotificationService::class);
            $notifications->shouldNotReceive('send');
            $compliance = $this->mock(EmailComplianceService::class);
            $compliance->shouldReceive('canReceive')->andReturn(true);
            Mail::shouldReceive('html')->never();
            $job->handle($compliance, $notifications, app(MailIdentityService::class));
            $this->assertSame(2, DB::table('campaign_recipients')->where('campaign_id', $campaign->id)->count());
            $this->assertSame(0, (int) $campaign->fresh()->sent_count);
            $this->assertSame(0, (int) $campaign->fresh()->email_sent_count);
        }
    }

    public function test_cancellation_during_delivery_stops_new_claims_without_losing_the_completed_count(): void
    {
        [$org, $member, $campaign] = $this->retryFixture();
        $user = User::create(['organization_id' => $org->id, 'name' => 'Later Member', 'email' => uniqid() . '@example.test', 'password' => 'FixturePassword123!']);
        $later = LoyaltyMember::create($this->memberRequired(['organization_id' => $org->id, 'user_id' => $user->id, 'member_number' => 'M-' . $user->id, 'is_active' => true]));
        DB::table('loyalty_members')->where('id', $later->id)->update(['expo_push_token' => 'ExponentPushToken[later-test-device]']);
        $notifications = $this->mock(NotificationService::class);
        $notifications->shouldReceive('send')->once()->andReturnUsing(fn () => $campaign->update(['status' => 'cancelled']));
        $job = new SendNotificationCampaignChunk($campaign->id, [$member->id, $later->id]);
        $job->handle(app(EmailComplianceService::class), $notifications, app(MailIdentityService::class));
        $this->assertSame('cancelled', $campaign->fresh()->status);
        $this->assertSame(1, (int) $campaign->fresh()->sent_count);
        $this->assertSame(1, DB::table('campaign_recipients')->where('campaign_id', $campaign->id)->count());
        $this->assertDatabaseMissing('campaign_recipients', ['campaign_id' => $campaign->id, 'loyalty_member_id' => $later->id]);
    }

    public function test_marketing_push_opt_out_creates_no_delivery_claim_and_is_not_counted(): void
    {
        [, $member, $campaign, $job] = $this->retryFixture();
        DB::table('loyalty_members')->where('id', $member->id)->update(['notification_preferences' => json_encode(['offers' => false])]);
        $notifications = $this->mock(NotificationService::class);
        $notifications->shouldNotReceive('send');
        $this->assertSame('offers', NotificationService::categoryOf('campaign'));
        $job->handle(app(EmailComplianceService::class), $notifications, app(MailIdentityService::class));
        $this->assertSame(0, (int) $campaign->fresh()->sent_count);
        $this->assertDatabaseMissing('campaign_recipients', ['campaign_id' => $campaign->id, 'loyalty_member_id' => $member->id]);
    }
}
