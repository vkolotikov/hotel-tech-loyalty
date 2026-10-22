<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Jobs\SendEmailCampaignChunk;
use App\Jobs\SendPushMessageChunk;
use App\Jobs\SendSmsCampaignChunk;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\MemberSegment;
use App\Models\NotificationCampaign;
use App\Models\SmsCampaign;
use App\Services\Loyalty\Campaigns\CampaignStart;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Send later (release 4 §5) for email campaigns, push messages and SMS campaigns: a manager picks a time on the
 * venue's clock (here Riga, three hours ahead of UTC in October); it is stored as the instant (UTC) and answered both
 * ways; `php artisan loyalty:send-scheduled` starts it when it is due, through the kind's own start service, once — a
 * second run at the same minute, or a second worker with the same stale row, starts nothing — to whoever is eligible
 * at that moment; while it waits it can be moved or taken back to a draft; one that cannot start then is marked failed
 * with the reason. The clock is Monday 5 October 2026, 09:00 UTC (12:00 in Riga). Nothing reaches a real queue,
 * Expo or Twilio.
 */
class SendLaterTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, PushSchema, SmsSchema;

    private MemberSegment $everyone;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        $this->buildSmsSchema();
        DB::table('organizations')->where('id', $this->org->id)->update([
            'timezone'      => 'Europe/Riga',
            'plan_features' => json_encode(['campaigns' => true, 'push_notifications' => true]),
        ]);
        app()->forgetScopedInstances();
        $this->twilioSettings($this->org->id);
        EmailSuppression::query()->delete();
        Queue::fake();
        Http::preventStrayRequests();
        Http::fake();
        $this->everyone = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);

        // Ada can be emailed, pushed and texted; Grace none of them, for now.
        $this->ada->forceFill(['marketing_consent' => true, 'expo_push_token' => 'ExponentPushToken[test-ada]', 'sms_consent' => true])->save();
        $this->ada->user->forceFill(['phone' => '+44 20 7946 0958'])->save();
        $this->grace->forceFill(['marketing_consent' => false, 'expo_push_token' => null, 'sms_consent' => false])->save();
    }

    private function emailDraft(?MemberSegment $segment = null): EmailCampaign
    {
        $id = $this->asManager()->postJson($this->api('campaigns'), ['name' => 'Autumn'])->assertCreated()->json('campaign.id');
        $this->asManager()->putJson($this->api("campaigns/{$id}"), [
            'name' => 'Autumn', 'subject' => 'Our autumn', 'segment_id' => ($segment ?? $this->everyone)->id,
            'body_blocks' => [['id' => 't1', 'type' => 'text', 'text' => 'Hello {{first_name}}', 'color' => '#555555', 'align' => 'left', 'fontSize' => 15]],
        ])->assertOk();

        return EmailCampaign::query()->findOrFail($id);
    }

    private function pushDraft(): NotificationCampaign
    {
        $id = $this->asManager()->postJson($this->api('push'), ['name' => 'Autumn'])->assertCreated()->json('push.id');
        $this->asManager()->putJson($this->api("push/{$id}"), [
            'name' => 'Autumn', 'title' => 'Autumn', 'body' => 'Double points.', 'category' => 'offers', 'segment_id' => $this->everyone->id,
        ])->assertOk();

        return NotificationCampaign::query()->findOrFail($id);
    }

    private function smsDraft(): SmsCampaign
    {
        $id = $this->asManager()->postJson($this->api('sms'), ['name' => 'Autumn'])->assertCreated()->json('sms.id');
        $this->asManager()->putJson($this->api("sms/{$id}"), ['name' => 'Autumn', 'body' => 'Hi {{first_name}}', 'segment_id' => $this->everyone->id])->assertOk();

        return SmsCampaign::query()->findOrFail($id);
    }

    private function schedule(string $area, int $id, string $at, ?string $revision): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->postJson($this->api("{$area}/{$id}/schedule"), ['send_at' => $at, 'revision' => $revision]);
    }

    private function run_(): void
    {
        $this->artisan('loyalty:send-scheduled')->assertSuccessful();
    }

    // ─── Scheduling ─────────────────────────────────────────────────────────

    public function test_an_email_campaign_is_scheduled_on_the_venues_clock_stored_as_the_instant_and_says_about_how_many_now(): void
    {
        $c = $this->emailDraft();

        $this->schedule('campaigns', $c->id, '2026-10-05T15:30', $c->updated_at->toIso8601String())->assertOk()
            ->assertJsonPath('about', 1)
            ->assertJsonPath('campaign.status', 'scheduled')
            ->assertJsonPath('campaign.scheduled_at', '2026-10-05T12:30:00+00:00')
            ->assertJsonPath('campaign.scheduled_for', '2026-10-05T15:30')
            ->assertJsonPath('campaign.sent_by', 'Staff')
            ->assertJsonPath('campaign.recipient_count', 0);
        $this->assertSame('2026-10-05 12:30:00', (string) DB::table('email_campaigns')->where('id', $c->id)->value('scheduled_at'));
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_scheduled')->where('subject_id', $c->id)->exists());
        Queue::assertNothingPushed();

        // While it waits it is not a draft: not edited, not sent, not deleted here; it can be moved or taken back.
        $fresh = $c->fresh();
        $this->asManager()->putJson($this->api("campaigns/{$c->id}"), ['name' => 'X', 'body_blocks' => []])->assertStatus(409)->assertJsonPath('error', 'not_a_draft');
        $this->asManager()->postJson($this->api("campaigns/{$c->id}/send"), ['recipients' => 1, 'revision' => $fresh->updated_at->toIso8601String()])
            ->assertStatus(409)->assertJsonPath('error', 'already_started')->assertJsonPath('status', 'scheduled');
        $this->asManager()->deleteJson($this->api("campaigns/{$c->id}"))->assertStatus(409)->assertJsonPath('error', 'not_a_draft');

        $this->schedule('campaigns', $c->id, '2026-10-06T09:00', $fresh->updated_at->toIso8601String())->assertOk()
            ->assertJsonPath('campaign.scheduled_for', '2026-10-06T09:00')->assertJsonPath('campaign.scheduled_at', '2026-10-06T06:00:00+00:00');
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_rescheduled')->exists());

        $this->asManager()->postJson($this->api("campaigns/{$c->id}/unschedule"))->assertOk()
            ->assertJsonPath('campaign.status', 'draft')->assertJsonPath('campaign.scheduled_at', null)->assertJsonPath('campaign.sent_by', null);
        $this->asManager()->postJson($this->api("campaigns/{$c->id}/unschedule"))->assertStatus(409)->assertJsonPath('error', 'not_scheduled')->assertJsonPath('status', 'draft');
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_unscheduled')->exists());
        Queue::assertNothingPushed();
    }

    public function test_a_time_must_be_on_the_venues_clock_at_least_two_minutes_ahead_and_within_a_year(): void
    {
        $c = $this->emailDraft();
        $rev = $c->updated_at->toIso8601String();

        foreach (['5 Oct 2026 15:30' => 'format', '2026-10-05T15:30:00' => 'format', '2026-02-30T10:00' => 'format',
            '2026-10-05T12:01' => 'past', '2026-10-04T15:30' => 'past', '2027-10-06T10:00' => 'too_far',
            // Riga's clock goes from 03:00 to 04:00 on 28 March 2027.
            '2027-03-28T03:30' => 'not_on_clock'] as $at => $reason) {
            $this->schedule('campaigns', $c->id, $at, $rev)->assertStatus(422)->assertJsonPath('error', 'bad_time')->assertJsonPath('reason', $reason);
        }
        $this->schedule('campaigns', $c->id, '2026-10-05T12:03', $rev)->assertOk()->assertJsonPath('campaign.scheduled_at', '2026-10-05T09:03:00+00:00');

        $other = $this->emailDraft();
        $this->schedule('campaigns', $other->id, '2026-10-06T10:00', 'stale')->assertStatus(409)->assertJsonPath('error', 'changed');
        $other->forceFill(['segment_id' => null])->save();
        $this->schedule('campaigns', $other->id, '2026-10-06T10:00', $other->fresh()->updated_at->toIso8601String())->assertStatus(422)->assertJsonPath('error', 'no_audience');
        $this->assertSame('draft', $other->fresh()->status);
    }

    public function test_staff_cannot_schedule_or_take_back(): void
    {
        $c = $this->emailDraft();
        $this->asStaffMember()->postJson($this->api("campaigns/{$c->id}/schedule"), ['send_at' => '2026-10-06T10:00', 'revision' => 'x'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("campaigns/{$c->id}/unschedule"))->assertStatus(403);
        $p = $this->pushDraft();
        $this->asStaffMember()->postJson($this->api("push/{$p->id}/schedule"), ['send_at' => '2026-10-06T10:00', 'revision' => 'x'])->assertStatus(403);
        $this->assertSame('draft', $c->fresh()->status);
    }

    // ─── The scheduler ──────────────────────────────────────────────────────

    public function test_a_scheduled_campaign_starts_once_when_due_to_whoever_is_eligible_then_even_if_the_command_runs_twice(): void
    {
        $c = $this->emailDraft();
        $this->schedule('campaigns', $c->id, '2026-10-05T15:30', $c->updated_at->toIso8601String())->assertOk()->assertJsonPath('about', 1);

        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:29:00'));
        $this->run_();
        Queue::assertNothingPushed();

        // Grace agrees to marketing email after it was scheduled: she is eligible when it starts.
        $this->grace->forceFill(['marketing_consent' => true])->save();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:30:20'));
        $this->run_();
        $this->run_();

        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
        $job = Queue::pushed(SendEmailCampaignChunk::class)->first();
        $this->assertSame([(int) $c->id, [$this->ada->id, $this->grace->id]], [$job->campaignId, $job->memberIds]);
        $fresh = $c->fresh();
        $this->assertSame(['sending', 2, $this->manager->id], [$fresh->status, (int) $fresh->recipient_count, (int) $fresh->sent_by_user_id]);
        $queued = AuditLog::query()->where('action', 'email_campaign_queued')->where('subject_id', $c->id)->get();
        $this->assertCount(1, $queued);
        $this->assertTrue((bool) ($queued[0]->new_values['scheduled'] ?? false));
        $this->assertSame($this->manager->id, (int) $queued[0]->causer_id);
    }

    public function test_two_workers_with_the_same_due_row_start_it_once(): void
    {
        $c = $this->emailDraft();
        $this->schedule('campaigns', $c->id, '2026-10-05T15:30', $c->updated_at->toIso8601String())->assertOk();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:31:00'));

        $stale = EmailCampaign::query()->findOrFail($c->id);
        $again = EmailCampaign::query()->findOrFail($c->id);
        $start = app(CampaignStart::class);

        $this->assertSame('started', $start->startScheduled($stale));
        $this->assertSame('left', $start->startScheduled($again), 'the conditional update finds it no longer scheduled');
        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
    }

    public function test_one_that_cannot_start_when_due_is_marked_failed_with_the_reason(): void
    {
        $c = $this->emailDraft();
        $this->schedule('campaigns', $c->id, '2026-10-05T15:30', $c->updated_at->toIso8601String())->assertOk();
        // By then nobody can be emailed.
        $this->ada->forceFill(['marketing_consent' => false])->save();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:30:00'));
        $this->run_();

        Queue::assertNothingPushed();
        $this->assertSame(['failed', 'Scheduled send did not start: nobody_to_send_to'], [$c->fresh()->status, $c->fresh()->error_message]);
        $this->asManager()->getJson($this->api("campaigns/{$c->id}"))->assertOk()
            ->assertJsonPath('campaign.schedule_problem', 'nobody_to_send_to')->assertJsonPath('campaign.scheduled_for', '2026-10-05T15:30');
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_schedule_failed')->where('subject_id', $c->id)->exists());
        $this->run_();
        $this->assertSame(1, AuditLog::query()->where('action', 'email_campaign_schedule_failed')->count());
    }

    public function test_a_push_message_is_scheduled_and_started_once(): void
    {
        $p = $this->pushDraft();
        $this->schedule('push', $p->id, '2026-10-05T18:00', $p->updated_at->toIso8601String())->assertOk()
            ->assertJsonPath('about', 1)->assertJsonPath('push.status', 'scheduled')
            ->assertJsonPath('push.scheduled_at', '2026-10-05T15:00:00+00:00')->assertJsonPath('push.scheduled_for', '2026-10-05T18:00');
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_scheduled')->exists());

        $this->travelTo(CarbonImmutable::parse('2026-10-05 15:00:30'));
        $this->run_();
        $this->run_();

        Queue::assertPushed(SendPushMessageChunk::class, 1);
        $this->assertSame([$this->ada->id], Queue::pushed(SendPushMessageChunk::class)->first()->memberIds);
        $this->assertSame(['sending', 1], [$p->fresh()->status, (int) $p->fresh()->target_count]);

        $q = $this->pushDraft();
        $this->schedule('push', $q->id, '2026-10-05T19:00', $q->updated_at->toIso8601String())->assertOk();
        $this->asManager()->postJson($this->api("push/{$q->id}/unschedule"))->assertOk()->assertJsonPath('push.status', 'draft')->assertJsonPath('push.scheduled_at', null);
    }

    public function test_a_push_message_that_cannot_start_says_why(): void
    {
        $p = $this->pushDraft();
        $this->schedule('push', $p->id, '2026-10-05T18:00', $p->updated_at->toIso8601String())->assertOk();
        $this->everyone->delete();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 15:01:00'));
        // The foreign key's ON DELETE SET NULL, as PostgreSQL does it.
        DB::table('notification_campaigns')->where('id', $p->id)->update(['member_segment_id' => null]);
        $this->run_();

        Queue::assertNothingPushed();
        $this->asManager()->getJson($this->api("push/{$p->id}"))->assertOk()->assertJsonPath('push.status', 'failed')->assertJsonPath('push.schedule_problem', 'no_audience');
    }

    public function test_an_sms_campaign_is_scheduled_and_started_once_and_without_twilio_then_it_fails_with_that_reason(): void
    {
        $s = $this->smsDraft();
        $this->schedule('sms', $s->id, '2026-10-05T15:30', $s->updated_at->toIso8601String())->assertOk()
            ->assertJsonPath('about', 1)->assertJsonPath('about_segments', 1)->assertJsonPath('sms.status', 'scheduled')->assertJsonPath('sms.scheduled_for', '2026-10-05T15:30');

        $t = $this->smsDraft();
        $this->schedule('sms', $t->id, '2026-10-05T15:45', $t->updated_at->toIso8601String())->assertOk();

        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:31:00'));
        $this->run_();
        $this->run_();
        Queue::assertPushed(SendSmsCampaignChunk::class, 1);
        $this->assertSame([(int) $s->id, [$this->ada->id]], [Queue::pushed(SendSmsCampaignChunk::class)->first()->campaignId, Queue::pushed(SendSmsCampaignChunk::class)->first()->memberIds]);

        // The venue removed its Twilio account before the second was due.
        $this->twilioSettings($this->org->id, token: null);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:46:00'));
        $this->run_();
        Queue::assertPushed(SendSmsCampaignChunk::class, 1);
        $this->assertSame(['failed', 'not_ready'], [$t->fresh()->status, $t->fresh()->error_message]);
        $this->asManager()->getJson($this->api("sms/{$t->id}"))->assertOk()->assertJsonPath('sms.problem', 'not_ready');
        $this->assertSame([], Http::recorded()->all());
    }

    public function test_another_organisations_due_campaign_is_started_under_its_own_organisation(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirSegment = MemberSegment::create(['name' => 'All', 'definition' => ['operator' => 'AND', 'filters' => []]]);
        $other['member']->forceFill(['marketing_consent' => true])->save();
        $theirs = EmailCampaign::create(['name' => 'Theirs', 'subject' => 'S', 'body_html' => '<p>B</p>', 'body_blocks' => [['id' => 't', 'type' => 'text', 'text' => 'B']],
            'segment_id' => $theirSegment->id, 'status' => 'scheduled']);
        DB::table('email_campaigns')->where('id', $theirs->id)->update(['scheduled_at' => '2026-10-05 08:59:00']);
        app()->instance('current_organization_id', $prior);

        $this->run_();

        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
        $this->assertSame([$other['member']->id], Queue::pushed(SendEmailCampaignChunk::class)->first()->memberIds);
        $this->assertSame('sending', EmailCampaign::withoutGlobalScopes()->find($theirs->id)->status);
        $this->assertSame($prior, app('current_organization_id'), 'the binding is put back');
    }
}
