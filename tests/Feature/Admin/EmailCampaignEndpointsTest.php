<?php

namespace Tests\Feature\Admin;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\MemberSegment;
use App\Services\EmailComplianceService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's email-campaign endpoints (`/v1/admin/email-campaigns`), pinned on the release 2 code before the
 * shared SendEmailCampaignChunk learned to mail each member once and fill tags (HexaTech Loyalty release 3 §4), and
 * kept passing after: the test send's and Send's answers, who a test goes to, what Send hands the job, and the
 * reset's warning. The owner's decision is that the full admin's campaigns, too, now go once per member with their
 * tags filled; its answers stay as they were.
 */
class EmailCampaignEndpointsTest extends TestCase
{
    use CampaignsSchema, DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private MailManager $outbox;
    private MemberSegment $everyone;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->campaignsOn();
        EmailSuppression::query()->delete();
        // Mail::html() goes past Mail::fake() to the manager: every message lands in the `array` transport.
        config(['mail.default' => 'array']);
        $this->outbox = app('mail.manager');
        Mail::fake();
        Queue::fake();
        $this->everyone = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);
    }

    private function admin(string $path = ''): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/email-campaigns' . ($path !== '' ? '/' . $path : '');
    }

    /** @return list<array{to: string, subject: string, html: string}> */
    private function sent(): array
    {
        return $this->outbox->mailer('array')->getSymfonyTransport()->messages()->map(function ($m) {
            $email = $m->getOriginalMessage();

            return ['to' => $email->getTo()[0]->getAddress(), 'subject' => (string) $email->getSubject(), 'html' => (string) $email->getHtmlBody()];
        })->values()->all();
    }

    private function campaign(array $attributes = []): EmailCampaign
    {
        return EmailCampaign::create($attributes + [
            'name' => 'Spring', 'subject' => 'Spring at Lumière', 'body_html' => '<p>Hello &amp; welcome</p>',
            'segment_id' => $this->everyone->id, 'status' => EmailCampaign::STATUS_DRAFT, 'created_by_user_id' => $this->manager->id,
        ]);
    }

    /** @return array<string, mixed> the model as the controller answers it */
    private static function asJson(EmailCampaign $campaign): array
    {
        return json_decode(json_encode($campaign->fresh()), true);
    }

    // ─── Test ───────────────────────────────────────────────────────────────

    public function test_a_test_answers_success_and_mails_the_caller_alone_with_test_before_the_subject(): void
    {
        $campaign = $this->campaign();

        $this->asManager()->postJson($this->admin("{$campaign->id}/test"))->assertOk()
            ->assertExactJson(['success' => true, 'message' => "Test sent to {$this->manager->email}"]);

        // The body as it stands: no member footer, no unsubscribe link.
        $this->assertSame([['to' => $this->manager->email, 'subject' => '[TEST] Spring at Lumière', 'html' => '<p>Hello &amp; welcome</p>']], $this->sent());
        $this->assertSame([EmailCampaign::STATUS_DRAFT, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count]);
        $this->assertSame(0, DB::table('email_campaign_deliveries')->count());
        Queue::assertNothingPushed();
    }

    public function test_a_test_without_an_address_on_file_is_refused(): void
    {
        $campaign = $this->campaign();
        $this->manager->forceFill(['email' => ''])->save();

        $this->asManager()->postJson($this->admin("{$campaign->id}/test"))->assertStatus(422)
            ->assertExactJson(['message' => 'Your staff account has no email on file.']);
        $this->assertSame([], $this->sent());
    }

    // ─── Send ───────────────────────────────────────────────────────────────

    public function test_send_queues_the_segments_members_and_answers_as_before(): void
    {
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $campaign = $this->campaign();

        $response = $this->asManager()->postJson($this->admin("{$campaign->id}/send"))->assertOk();
        $response->assertExactJson([
            'campaign'   => self::asJson($campaign),
            'queued'     => true,
            'recipients' => 2,
            'message'    => 'Sending to 2 recipients. Progress updates as it goes.',
        ]);
        $this->assertSame([EmailCampaign::STATUS_SENDING, 2, 0, 0], [$response->json('campaign.status'), $response->json('campaign.recipient_count'), $response->json('campaign.sent_count'), $response->json('campaign.failed_count')]);

        // Every active member of the segment is handed over; the job checks consent before each chunk.
        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
        $job = Queue::pushed(SendEmailCampaignChunk::class)->first();
        // The segment's members in no particular order (the query has none; PostgreSQL's row order is not SQLite's).
        $handedOver = $job->memberIds;
        sort($handedOver);
        $expected = [$this->ada->id, $this->grace->id];
        sort($expected);
        $this->assertSame([(int) $campaign->id, $expected, 0], [$job->campaignId, $handedOver, $job->offset]);
        $this->assertSame([], $this->sent());

        $job->handle(app(EmailComplianceService::class));
        $adaEmail = (string) DB::table('users')->where('id', $this->ada->user_id)->value('email');
        $this->assertSame([$adaEmail], array_column($this->sent(), 'to'));
        $this->assertSame(['Spring at Lumière'], array_column($this->sent(), 'subject'));
        $this->assertStringStartsWith('<p>Hello &amp; welcome</p>', $this->sent()[0]['html']);
        $this->assertSame([EmailCampaign::STATUS_SENT, 1, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_send_refuses_a_campaign_that_is_not_a_draft_or_has_nobody_to_send_to(): void
    {
        $sent = $this->campaign(['status' => EmailCampaign::STATUS_SENT]);
        $this->asManager()->postJson($this->admin("{$sent->id}/send"))->assertStatus(422)
            ->assertExactJson(['message' => 'Campaign is already sent.']);

        $empty = $this->campaign(['segment_id' => $this->makeSegment('Nobody', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [999999]]]])->id]);
        $this->asManager()->postJson($this->admin("{$empty->id}/send"))->assertStatus(422)
            ->assertExactJson(['message' => 'No recipients — link a segment with members or provide member_ids.']);

        Queue::assertNothingPushed();
        $this->assertSame(EmailCampaign::STATUS_DRAFT, $empty->fresh()->status);
    }

    // ─── Release 3: once per member, tags filled (owner's decision) ──────────

    public function test_a_test_fills_the_tags_with_the_senders_own_sample_and_answers_as_before(): void
    {
        $this->manager->forceFill(['name' => 'Rita Moreno'])->save();
        $campaign = $this->campaign(['subject' => 'Hi {{first_name}}', 'body_html' => '<p>Dear {{member.name}}, {{points_balance}} points, {{member.tier}}, {{unknown}}</p>']);

        $this->asManager()->postJson($this->admin("{$campaign->id}/test"))->assertOk()
            ->assertExactJson(['success' => true, 'message' => "Test sent to {$this->manager->email}"]);

        $this->assertSame([['to' => $this->manager->email, 'subject' => '[TEST] Hi Rita', 'html' => '<p>Dear Rita Moreno, 1,250 points, Silver, {{unknown}}</p>']], $this->sent());
    }

    public function test_its_campaigns_now_go_once_per_member_with_their_tags_filled(): void
    {
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true]);
        $campaign = $this->campaign(['subject' => 'Hi {{first_name}}', 'body_html' => '<p>Dear {{member.name}}, {{tier_name}}</p>']);
        $this->asManager()->postJson($this->admin("{$campaign->id}/send"))->assertOk()->assertJsonPath('recipients', 2);
        $job = Queue::pushed(SendEmailCampaignChunk::class)->first();

        $job->handle(app(EmailComplianceService::class));
        // A retry of the same chunk mails nobody a second time.
        $job->handle(app(EmailComplianceService::class));

        $this->assertCount(1, $this->sent());
        $this->assertSame('Hi Ada', $this->sent()[0]['subject']);
        $this->assertStringStartsWith('<p>Dear Ada Lovelace, Gold</p>', $this->sent()[0]['html']);
        $this->assertSame([$this->ada->id => 'sent'], DB::table('email_campaign_deliveries')->where('campaign_id', $campaign->id)->pluck('status', 'member_id')->all());
        $this->assertSame([EmailCampaign::STATUS_SENT, 1, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_reset_clears_the_record_of_that_send_so_sending_again_reaches_everyone_as_its_warning_says(): void
    {
        $campaign = $this->campaign(['status' => EmailCampaign::STATUS_CANCELLED, 'recipient_count' => 2, 'sent_count' => 1]);
        $other = $this->campaign(['name' => 'Other', 'status' => EmailCampaign::STATUS_SENT]);
        DB::table('email_campaign_deliveries')->insert([
            ['campaign_id' => $campaign->id, 'member_id' => $this->ada->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => $other->id, 'member_id' => $this->ada->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->asManager()->postJson($this->admin("{$campaign->id}/reset"))->assertOk()
            ->assertJsonPath('warning', '1 recipients already received this. Sending again will email them a second time.');

        $this->assertSame([(int) $other->id], DB::table('email_campaign_deliveries')->pluck('campaign_id')->map(fn ($id) => (int) $id)->all());
    }

    public function test_reset_hands_a_cancelled_campaign_back_as_a_draft_with_its_warning(): void
    {
        $campaign = $this->campaign(['status' => EmailCampaign::STATUS_CANCELLED, 'recipient_count' => 5, 'sent_count' => 3, 'error_message' => 'Cancelled by Staff']);

        $response = $this->asManager()->postJson($this->admin("{$campaign->id}/reset"))->assertOk();
        $response->assertExactJson([
            'campaign' => self::asJson($campaign),
            'warning'  => '3 recipients already received this. Sending again will email them a second time.',
        ]);
        $this->assertSame([EmailCampaign::STATUS_DRAFT, null], [$campaign->fresh()->status, $campaign->fresh()->error_message]);

        $this->asManager()->postJson($this->admin("{$campaign->id}/reset"))->assertStatus(422)
            ->assertExactJson(['message' => 'Only a failed or cancelled campaign can be reset — this one is draft.']);
    }
}
