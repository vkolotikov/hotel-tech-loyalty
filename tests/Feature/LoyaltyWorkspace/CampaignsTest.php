<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\EmailComplianceService;
use App\Services\Loyalty\Campaigns\CampaignStart;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Email campaigns (spec 2026-10-21 release 2 §6): the server renders the body from blocks, the confirmation's number
 * is the number the pipeline mails, one press starts a campaign once, and nothing reaches a real mailer or queue.
 */
class CampaignsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema;

    /** The builder's renderBlocksToHtml() for blocks() (campaignsMirror.test.ts pins the builder to the same string). */
    private const GOLDEN = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">'
        . '<h1 style="margin:24px 24px 12px;font-size:32px;font-weight:bold;text-align:center;color:#1a1a1a;line-height:1.25;">Autumn at Lumière</h1>' . "\n"
        . '<p style="margin:0 24px 16px;font-size:15px;line-height:1.6;text-align:left;color:#555555;">Hello &lt;friend&gt; &amp; &quot;guest&quot;<br>See you soon</p>' . "\n"
        . '<div style="text-align:center;padding:8px 24px 16px;"><a href="https://lumiere.example/book?a=1&amp;b=2" style="background:#c9a84c;color:#0e0e0e;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">Book now</a></div>' . "\n"
        . '<div style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" /></div>' . "\n"
        . '<div style="height:24px;line-height:24px;font-size:1px;">&nbsp;</div></div>';

    private MemberSegment $everyone;
    private MailManager $outbox;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->campaignsOn();
        EmailSuppression::query()->delete();
        // Mail::html() is not caught by Mail::fake() (the fake forwards it to the manager), so every message lands in
        // the in-memory `array` transport, through the real Mailer and its MessageSending listeners; it is read there.
        config(['mail.default' => 'array']);
        $this->outbox = app('mail.manager');
        Mail::fake();
        Queue::fake();
        $this->everyone = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);
    }

    /** @return list<array{to: string, subject: string, html: string, unsubscribe: ?string}> Every message the transport took. */
    private function sent(): array
    {
        return $this->outbox->mailer('array')->getSymfonyTransport()->messages()->map(function ($m) {
            $email = $m->getOriginalMessage();

            return [
                'to'          => $email->getTo()[0]->getAddress(),
                'subject'     => (string) $email->getSubject(),
                'html'        => (string) $email->getHtmlBody(),
                'unsubscribe' => $email->getHeaders()->get('List-Unsubscribe')?->getBodyAsString(),
            ];
        })->values()->all();
    }

    /** @return list<array<string, mixed>> One block of each kind the workspace writes. */
    private function blocks(): array
    {
        return [
            ['id' => 'h1', 'type' => 'heading', 'text' => 'Autumn at Lumière', 'level' => 1, 'align' => 'center', 'color' => '#1a1a1a'],
            ['id' => 't1', 'type' => 'text', 'text' => "Hello <friend> & \"guest\"\nSee you soon", 'color' => '#555555', 'align' => 'left', 'fontSize' => 15],
            ['id' => 'b1', 'type' => 'button', 'text' => 'Book now', 'url' => 'https://lumiere.example/book?a=1&b=2', 'bgColor' => '#c9a84c', 'textColor' => '#0e0e0e', 'align' => 'center'],
            ['id' => 'd1', 'type' => 'divider', 'color' => '#e5e5e5'],
            ['id' => 's1', 'type' => 'spacer', 'height' => 24],
        ];
    }

    /** A draft ready to send to a segment, saved through the workspace. */
    private function readyDraft(?MemberSegment $segment = null): EmailCampaign
    {
        $id = $this->asManager()->postJson($this->api('campaigns'), ['name' => 'Autumn'])->assertCreated()->json('campaign.id');
        $this->asManager()->putJson($this->api("campaigns/{$id}"), [
            'name' => 'Autumn', 'subject' => 'Our autumn', 'segment_id' => ($segment ?? $this->everyone)->id, 'body_blocks' => $this->blocks(),
        ])->assertOk();

        return EmailCampaign::query()->findOrFail($id);
    }

    /** A member at exactly this address (the shared helper makes each address unique). */
    private function member(string $name, string $email, array $attributes = []): LoyaltyMember
    {
        $member = $this->makeMember($name, $email, $attributes);
        DB::table('users')->where('id', $member->user_id)->update(['email' => $email]);

        return $member;
    }

    /**
     * Eight active members of the "Everyone" segment, each reached or not for one reason, and one inactive one.
     *
     * @return array<string, LoyaltyMember>
     */
    private function audienceOfEight(): array
    {
        $consent = ['marketing_consent' => true, 'email_notifications' => true];
        $this->ada->update($consent);
        $people = [
            'ada'   => $this->ada,
            'grace' => $this->grace,
            'una'   => $this->member('Una', 'una@example.test', $consent + ['unsubscribed_at' => now()->subDay()]),
            'sam'   => $this->member('Sam', 'sam@example.test', ['marketing_consent' => true, 'email_notifications' => false]),
            'bo'    => $this->member('Bo', 'Bo@Example.test', $consent),
            'cy'    => $this->member('Cy', 'cy@example.test', $consent),
            'di'    => $this->member('Di', 'di@example.test', $consent),
            'ed'    => $this->member('Ed', 'ed@example.test', $consent),
            'off'   => $this->member('Off', 'off@example.test', $consent + ['is_active' => false]),
        ];
        EmailSuppression::suppress('bo@example.test', EmailSuppression::HARD_BOUNCE, null, 'ses');
        EmailSuppression::suppress('cy@example.test', EmailSuppression::UNSUBSCRIBE, $this->org->id, 'app');
        // Another organisation's opt-out and a soft bounce under its limit do not stop a send.
        EmailSuppression::suppress('di@example.test', EmailSuppression::UNSUBSCRIBE, $this->org->id + 1000, 'app');
        EmailSuppression::suppress('ed@example.test', EmailSuppression::SOFT_BOUNCE, null, 'ses');

        return $people;
    }

    // ─── Gate and roles ─────────────────────────────────────────────────────

    public function test_without_the_plans_campaigns_feature_every_campaign_route_is_locked(): void
    {
        $campaign = EmailCampaign::create(['name' => 'Old', 'subject' => 'x', 'body_html' => '', 'status' => 'draft']);
        $this->campaignsOn(false);

        foreach ([['get', 'campaigns'], ['post', 'campaigns'], ['get', "campaigns/{$campaign->id}"], ['get', "campaigns/{$campaign->id}/audience"],
            ['post', "campaigns/{$campaign->id}/send"], ['post', "campaigns/{$campaign->id}/test"], ['delete', "campaigns/{$campaign->id}"]] as [$method, $path]) {
            $this->asManager()->json($method, $this->api($path), ['name' => 'X'])->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        }
        Queue::assertNothingPushed();
        $this->assertSame([], $this->sent());
    }

    public function test_staff_neither_read_nor_change_campaigns(): void
    {
        $campaign = EmailCampaign::create(['name' => 'Draft', 'subject' => 'x', 'body_html' => '', 'status' => 'draft']);

        foreach ([['get', 'campaigns'], ['post', 'campaigns'], ['get', "campaigns/{$campaign->id}"], ['put', "campaigns/{$campaign->id}"],
            ['delete', "campaigns/{$campaign->id}"], ['get', "campaigns/{$campaign->id}/audience"], ['post', "campaigns/{$campaign->id}/test"],
            ['post', "campaigns/{$campaign->id}/send"], ['post', "campaigns/{$campaign->id}/cancel"], ['post', "campaigns/{$campaign->id}/duplicate"]] as [$method, $path]) {
            $this->asStaffMember()->json($method, $this->api($path), ['name' => 'X'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        }
        $this->assertSame(1, EmailCampaign::query()->count());
        Queue::assertNothingPushed();
        $this->assertSame([], $this->sent());
    }

    public function test_another_organisations_campaign_is_not_found_and_its_segment_cannot_be_named(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = EmailCampaign::create(['name' => 'Theirs', 'subject' => 'x', 'body_html' => '<p>x</p>', 'status' => 'draft']);
        $theirSegment = MemberSegment::create(['name' => 'Theirs', 'definition' => ['operator' => 'AND', 'filters' => []]]);
        app()->instance('current_organization_id', $prior);

        foreach ([['get', ''], ['put', ''], ['delete', ''], ['get', '/audience'], ['post', '/test'], ['post', '/send'], ['post', '/cancel'], ['post', '/duplicate']] as [$method, $tail]) {
            $this->asManager()->json($method, $this->api("campaigns/{$theirs->id}{$tail}"), ['name' => 'Mine', 'body_blocks' => [], 'recipients' => 1, 'revision' => 'x'])
                ->assertStatus(404)->assertJsonPath('error', 'not_found');
        }
        $this->assertNotContains('Theirs', array_column($this->asManager()->getJson($this->api('campaigns'))->json('campaigns'), 'name'));

        $mine = $this->readyDraft();
        $this->asManager()->putJson($this->api("campaigns/{$mine->id}"), ['name' => 'Autumn', 'segment_id' => $theirSegment->id, 'body_blocks' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['segment_id']);
        Queue::assertNothingPushed();
    }

    // ─── Drafts and the body ────────────────────────────────────────────────

    public function test_a_new_campaign_is_an_empty_draft_and_the_list_shows_it(): void
    {
        $response = $this->asManager()->postJson($this->api('campaigns?brand_id=all'), ['name' => 'New campaign 21 Oct'])->assertCreated()
            ->assertJsonPath('campaign.name', 'New campaign 21 Oct')
            ->assertJsonPath('campaign.status', 'draft')
            ->assertJsonPath('campaign.subject', '')
            ->assertJsonPath('campaign.body_blocks', [])
            ->assertJsonPath('campaign.body_html', '')
            ->assertJsonPath('campaign.editable_here', true)
            ->assertJsonPath('campaign.missing', ['subject', 'body'])
            ->assertJsonPath('campaign.created_by', 'Staff');
        $id = $response->json('campaign.id');
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_created')->where('subject_id', $id)->exists());

        $this->asManager()->getJson($this->api('campaigns'))->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('campaigns.0.id', $id)->assertJsonPath('campaigns.0.status', 'draft');
        $this->asManager()->postJson($this->api('campaigns'), ['name' => ''])->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    public function test_the_server_renders_the_body_from_the_blocks_as_the_full_admins_builder_does(): void
    {
        $campaign = $this->readyDraft();

        $this->assertSame(self::GOLDEN, $campaign->body_html);
        // Stored in the builder's own shape, so the full admin opens the draft in its visual editor.
        $this->assertSame($this->blocks(), $campaign->body_blocks);
        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}"))->assertOk()
            ->assertJsonPath('campaign.body_html', self::GOLDEN)
            ->assertJsonPath('campaign.subject', 'Our autumn')
            ->assertJsonPath('campaign.segment', ['id' => $this->everyone->id, 'name' => 'Everyone'])
            ->assertJsonPath('campaign.missing', [])
            ->assertJsonPath('campaign.revision', $campaign->updated_at->toIso8601String())
            // The editor's choices come with it: the workspace keeps no copy of the block list or its defaults.
            ->assertJsonPath('options.block_types', ['heading', 'text', 'button', 'divider', 'spacer'])
            ->assertJsonPath('options.new_blocks.button', ['text' => '', 'url' => '', 'bgColor' => '#c9a84c', 'textColor' => '#0e0e0e', 'align' => 'center'])
            ->assertJsonPath('options.font_sizes', [12, 13, 14, 15, 16, 18])
            ->assertJsonPath('options.max_text', ['heading' => 500, 'text' => 5000, 'button' => 200]);
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_updated')->where('subject_id', $campaign->id)->exists());
    }

    public function test_the_client_never_writes_html_and_a_block_cannot_carry_a_script_or_a_style(): void
    {
        $campaign = $this->readyDraft();
        $put = fn (array $blocks, array $more = []) => $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), $more + ['name' => 'Autumn', 'subject' => 'S', 'body_blocks' => $blocks]);

        $put([['id' => 'b', 'type' => 'button', 'text' => 'Go', 'url' => 'javascript:alert(1)']])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.url']);
        $put([['id' => 'b', 'type' => 'button', 'text' => 'Go', 'url' => 'data:text/html,x']])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.url']);
        $put([['id' => 'h', 'type' => 'heading', 'text' => 'Hi', 'color' => 'red;background:url(https://x.example/t.gif)']])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.color']);
        $put([['id' => 'i', 'type' => 'image', 'src' => 'https://x.example/a.png', 'alt' => '', 'width' => 100, 'align' => 'center', 'link' => '']])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.type']);
        $put([['id' => 'h', 'type' => 'heading', 'text' => 'Hi', 'level' => 4]])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.level']);
        $put([['id' => 's', 'type' => 'spacer', 'height' => 500]])->assertStatus(422)->assertJsonValidationErrors(['body_blocks.0.height']);
        $put(array_fill(0, 101, ['id' => 'd', 'type' => 'divider']))->assertStatus(422)->assertJsonValidationErrors(['body_blocks']);

        // HTML sent beside the blocks is not read; the text's markup is escaped.
        $put([['id' => 't', 'type' => 'text', 'text' => '<script>alert(1)</script>'], ['id' => 'b', 'type' => 'button', 'text' => 'Mail us', 'url' => 'mailto:hello@lumiere.example']], ['body_html' => '<script>x</script>'])->assertOk();
        $html = $campaign->fresh()->body_html;
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $html);
        $this->assertStringContainsString('href="mailto:hello@lumiere.example"', $html);
        $this->assertStringNotContainsString('<script', $html);
        // A missing look takes the builder's default.
        $this->assertSame(['id' => 't', 'type' => 'text', 'text' => '<script>alert(1)</script>', 'color' => '#555555', 'align' => 'left', 'fontSize' => 15], $campaign->fresh()->body_blocks[0]);
    }

    public function test_a_draft_made_in_the_full_admin_with_an_image_or_its_own_html_is_read_only_here(): void
    {
        $image = EmailCampaign::create(['name' => 'Image', 'subject' => 'S', 'body_html' => '<p>x</p><img src="https://x.example/a.png">', 'segment_id' => $this->everyone->id, 'status' => 'draft',
            'body_blocks' => [['id' => 'a', 'type' => 'image', 'src' => 'https://x.example/a.png', 'alt' => '', 'width' => 100, 'align' => 'center', 'link' => '']]]);
        $html = EmailCampaign::create(['name' => 'Code', 'subject' => 'S', 'body_html' => '<table><tr><td>Hand made</td></tr></table>', 'segment_id' => $this->everyone->id, 'status' => 'draft']);
        $theirs = EmailCampaign::create(['name' => 'Builder', 'subject' => 'S', 'body_html' => '<p>old</p>', 'status' => 'draft',
            'body_blocks' => [['id' => 'q1', 'type' => 'text', 'text' => 'Hi {{member.name}}', 'color' => '#555555', 'align' => 'left', 'fontSize' => 15]]]);

        foreach ([$image, $html] as $campaign) {
            $this->asManager()->getJson($this->api("campaigns/{$campaign->id}"))->assertOk()
                ->assertJsonPath('campaign.editable_here', false)
                ->assertJsonPath('campaign.body_blocks', null)
                ->assertJsonPath('campaign.body_html', $campaign->body_html);
            $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), ['name' => 'Mine', 'body_blocks' => []])
                ->assertStatus(409)->assertJsonPath('error', 'not_editable_here');
            $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => 1, 'revision' => $campaign->updated_at->toIso8601String()])
                ->assertStatus(409)->assertJsonPath('error', 'not_editable_here');
            $this->assertSame('draft', $campaign->fresh()->status);
        }
        // No blocks but HTML (written through the API, or emptied in code view): the HTML is not the blocks', so not here.
        $empty = EmailCampaign::create(['name' => 'Odd', 'subject' => 'S', 'body_html' => '<p>Kept</p>', 'body_blocks' => [], 'status' => 'draft']);
        $this->asManager()->getJson($this->api("campaigns/{$empty->id}"))->assertJsonPath('campaign.editable_here', false);

        // Blocks the workspace writes itself, made in the full admin: editable here, an untouched "https://" read as no link yet.
        $theirs->update(['body_blocks' => [...$theirs->body_blocks, ['id' => 'q2', 'type' => 'button', 'text' => 'Click here', 'url' => 'https://', 'bgColor' => '#c9a84c', 'textColor' => '#0e0e0e', 'align' => 'center']]]);
        $this->asManager()->getJson($this->api("campaigns/{$theirs->id}"))->assertJsonPath('campaign.editable_here', true)
            ->assertJsonPath('campaign.body_blocks.0.text', 'Hi {{member.name}}')
            ->assertJsonPath('campaign.missing', ['button:1']);
        $this->asManager()->putJson($this->api("campaigns/{$theirs->id}"), ['name' => 'Builder', 'subject' => 'S', 'body_blocks' => $theirs->fresh()->body_blocks])
            ->assertOk()->assertJsonPath('campaign.body_blocks.1.url', '');
        Queue::assertNothingPushed();
    }

    public function test_only_a_draft_is_changed_or_deleted(): void
    {
        $sent = EmailCampaign::create(['name' => 'Sent', 'subject' => 'S', 'body_html' => '<p>x</p>', 'body_blocks' => [], 'status' => 'sent']);

        $this->asManager()->putJson($this->api("campaigns/{$sent->id}"), ['name' => 'Changed', 'body_blocks' => []])
            ->assertStatus(409)->assertJsonPath('error', 'not_a_draft')->assertJsonPath('status', 'sent');
        $this->asManager()->deleteJson($this->api("campaigns/{$sent->id}"))->assertStatus(409)->assertJsonPath('error', 'not_a_draft');
        $this->assertSame('Sent', $sent->fresh()->name);

        $draft = $this->readyDraft();
        $this->asManager()->deleteJson($this->api("campaigns/{$draft->id}"))->assertOk();
        $this->assertNull(EmailCampaign::query()->find($draft->id));
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_deleted')->exists());
    }

    // ─── The audience ───────────────────────────────────────────────────────

    public function test_the_audience_is_the_segments_members_the_pipeline_may_mail_and_says_why_the_rest_are_not(): void
    {
        $this->audienceOfEight();
        $campaign = $this->readyDraft();

        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}/audience"))->assertOk()->assertJsonPath('audience', [
            'segment' => ['id' => $this->everyone->id, 'name' => 'Everyone'], 'members' => 8, 'reached' => 3, 'unsubscribed' => 1,
            'no_consent' => 2, 'suppressed' => 2, 'no_email' => 0, 'limit' => 5000,
        ]);
    }

    public function test_the_audience_refuses_a_campaign_without_a_segment_or_with_a_rule_the_shared_service_would_skip(): void
    {
        $campaign = $this->readyDraft();
        $campaign->update(['segment_id' => null]);
        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}/audience"))->assertStatus(422)->assertJsonPath('error', 'no_audience');

        $lapsed = $this->makeSegment('Lapsed', ['operator' => 'OR', 'filters' => [['type' => 'activity', 'op' => 'inactive_days', 'value' => 60]]]);
        $campaign->update(['segment_id' => $lapsed->id]);
        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}/audience"))
            ->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('index', 0)->assertJsonPath('reason', 'unknown_op');
    }

    // ─── Send ───────────────────────────────────────────────────────────────

    public function test_send_hands_the_pipeline_exactly_the_members_the_confirmation_counted_and_they_are_the_ones_mailed(): void
    {
        $people = $this->audienceOfEight();
        $campaign = $this->readyDraft();

        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => 3, 'revision' => $campaign->updated_at->toIso8601String()])
            ->assertOk()->assertJsonPath('campaign.status', 'sending')->assertJsonPath('campaign.recipient_count', 3)->assertJsonPath('campaign.sent_by', 'Staff');

        $expected = [$people['ada']->id, $people['di']->id, $people['ed']->id];
        sort($expected);
        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
        $job = Queue::pushed(SendEmailCampaignChunk::class)->first();
        $this->assertSame([(int) $campaign->id, $expected, 0], [$job->campaignId, $job->memberIds, $job->offset]);

        $fresh = $campaign->fresh();
        $this->assertSame([EmailCampaign::STATUS_SENDING, 3, 0, 0, $this->manager->id], [$fresh->status, $fresh->recipient_count, $fresh->sent_count, $fresh->failed_count, (int) $fresh->sent_by_user_id]);
        $this->assertNotNull($this->everyone->fresh()->last_sent_at);
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_queued')->where('subject_id', $campaign->id)->exists());
        $this->assertSame([], $this->sent());

        // The shared job, run as the queue would: it mails those three, as marketing, and no one else.
        $job->handle(app(EmailComplianceService::class));
        $sent = $this->sent();
        $adaEmail = (string) DB::table('users')->where('id', $people['ada']->user_id)->value('email');
        $this->assertSame([$adaEmail, 'di@example.test', 'ed@example.test'], array_column($sent, 'to'));
        $this->assertSame(['Our autumn'], array_values(array_unique(array_column($sent, 'subject'))));
        $this->assertStringStartsWith(self::GOLDEN, $sent[0]['html']);
        $this->assertStringContainsString('Unsubscribe from marketing emails', $sent[0]['html']);
        $this->assertNotNull($sent[0]['unsubscribe']);
        $this->assertSame([EmailCampaign::STATUS_SENT, 3, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);

        // Release 3: each of the three has a row, and the queue retrying the chunk mails none of them again.
        $this->assertSame(array_fill_keys($expected, 'sent'), DB::table('email_campaign_deliveries')->where('campaign_id', $campaign->id)->orderBy('member_id')->pluck('status', 'member_id')->all());
        $job->handle(app(EmailComplianceService::class));
        $this->assertCount(3, $this->sent());
        $this->assertSame([3, 0], [$campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_two_presses_start_a_campaign_once(): void
    {
        $this->audienceOfEight();
        $campaign = $this->readyDraft();
        $body = ['recipients' => 3, 'revision' => $campaign->updated_at->toIso8601String()];

        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), $body)->assertOk();
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), $body)
            ->assertStatus(409)->assertJsonPath('error', 'already_started')->assertJsonPath('status', 'sending');

        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
        $this->assertSame(1, AuditLog::query()->where('action', 'email_campaign_queued')->count());
    }

    public function test_two_requests_that_both_read_a_draft_still_start_it_once(): void
    {
        $this->audienceOfEight();
        $campaign = $this->readyDraft();
        // Both requests loaded the row while it was a draft; the first one's write lands before the second one's.
        $first = EmailCampaign::query()->findOrFail($campaign->id);
        $second = EmailCampaign::query()->findOrFail($campaign->id);
        $start = app(CampaignStart::class);

        $start->start($first, $this->manager, 3, $first->updated_at->toIso8601String());
        try {
            $start->start($second, $this->manager, 3, $second->updated_at->toIso8601String());
            $this->fail('The second start went through.');
        } catch (LoyaltyRefused $refused) {
            $this->assertSame(['already_started', 409], [$refused->errorCode, $refused->status]);
        }

        Queue::assertPushed(SendEmailCampaignChunk::class, 1);
    }

    public function test_a_number_or_a_draft_that_changed_since_the_confirmation_starts_nothing(): void
    {
        $people = $this->audienceOfEight();
        $campaign = $this->readyDraft();
        $revision = $campaign->updated_at->toIso8601String();

        // Someone agreed meanwhile: the confirmation said 3, it would now be 4.
        $people['grace']->update(['marketing_consent' => true]);
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => 3, 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'audience_changed')->assertJsonPath('reached', 4);

        $this->travel(5)->seconds();
        $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), ['name' => 'Autumn', 'subject' => 'Changed', 'segment_id' => $this->everyone->id, 'body_blocks' => $this->blocks()])->assertOk();
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => 4, 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'changed');

        $this->assertSame('draft', $campaign->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_send_refuses_what_is_not_ready_and_an_audience_it_cannot_reach(): void
    {
        $campaign = $this->readyDraft();
        $send = fn (int $recipients = 1) => $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => $recipients, 'revision' => $campaign->fresh()->updated_at->toIso8601String()]);

        // Nobody in the segment agreed to marketing email.
        $send()->assertStatus(422)->assertJsonPath('error', 'nobody_to_send_to');

        $campaign->update(['segment_id' => null]);
        $send()->assertStatus(422)->assertJsonPath('error', 'no_audience');

        $campaign->update(['segment_id' => $this->makeSegment('Broken', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => []]]])->id]);
        $send()->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('reason', 'no_value');

        $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), ['name' => 'Autumn', 'subject' => ' ', 'segment_id' => $this->everyone->id, 'body_blocks' => [
            ['id' => 'd', 'type' => 'divider'], ['id' => 'b', 'type' => 'button', 'text' => 'Go', 'url' => ''],
        ]])->assertOk();
        $send()->assertStatus(422)->assertJsonPath('error', 'incomplete')->assertJsonPath('missing', ['subject', 'button:1']);

        // A divider alone says nothing.
        $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), ['name' => 'Autumn', 'subject' => 'S', 'segment_id' => $this->everyone->id, 'body_blocks' => [
            ['id' => 'd', 'type' => 'divider'], ['id' => 't', 'type' => 'text', 'text' => '   '],
        ]])->assertOk();
        $send()->assertStatus(422)->assertJsonPath('error', 'incomplete')->assertJsonPath('missing', ['body']);

        $this->assertSame('draft', $campaign->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_an_audience_over_the_full_admins_cap_is_refused_not_cut(): void
    {
        $platinum = $this->tiers['platinum']->id;
        $now = now()->toDateTimeString();
        foreach (array_chunk(range(1, CampaignsTestLimit::OVER), 500) as $chunk) {
            $first = DB::table('users')->max('id') + 1;
            DB::table('users')->insert(array_map(fn ($i) => ['organization_id' => $this->org->id, 'name' => "Bulk {$i}", 'email' => "bulk{$i}@example.test", 'user_type' => 'member', 'created_at' => $now, 'updated_at' => $now], $chunk));
            DB::table('loyalty_members')->insert(array_map(fn ($n) => ['organization_id' => $this->org->id, 'user_id' => $first + $n, 'tier_id' => $platinum, 'member_number' => 'B-' . ($first + $n),
                'is_active' => true, 'marketing_consent' => true, 'email_notifications' => true, 'created_at' => $now, 'updated_at' => $now], array_keys($chunk)));
        }
        $segment = $this->makeSegment('Platinum', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [$platinum]]]]);
        $campaign = $this->readyDraft($segment);

        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}/audience"))->assertOk()->assertJsonPath('audience.reached', CampaignsTestLimit::OVER);
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => CampaignsTestLimit::OVER, 'revision' => $campaign->updated_at->toIso8601String()])
            ->assertStatus(422)->assertJsonPath('error', 'too_many')->assertJsonPath('limit', 5000);
        Queue::assertNothingPushed();
    }

    // ─── Test, cancel, duplicate ────────────────────────────────────────────

    public function test_send_me_a_test_goes_to_the_signed_in_manager_only_and_changes_nothing(): void
    {
        $this->audienceOfEight();
        $campaign = $this->readyDraft();

        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/test"))->assertOk()->assertJsonPath('sent_to', $this->manager->email);

        $this->assertSame([['to' => $this->manager->email, 'subject' => '[TEST] Our autumn', 'html' => self::GOLDEN, 'unsubscribe' => null]], $this->sent());
        $this->assertSame('draft', $campaign->fresh()->status);
        $this->assertSame(0, $campaign->fresh()->sent_count);
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_test_sent')->where('subject_id', $campaign->id)->exists());
        Queue::assertNothingPushed();

        EmailSuppression::suppress($this->manager->email, EmailSuppression::COMPLAINT, null, 'ses');
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/test"))->assertStatus(422)->assertJsonPath('error', 'suppressed');

        $empty = EmailCampaign::create(['name' => 'Empty', 'subject' => '', 'body_html' => '', 'body_blocks' => [], 'status' => 'draft']);
        $this->asManager()->postJson($this->api("campaigns/{$empty->id}/test"))->assertStatus(422)->assertJsonPath('error', 'incomplete')->assertJsonPath('missing', ['subject', 'body']);
        $this->assertCount(1, $this->sent());
    }

    public function test_the_editor_is_offered_the_tags_and_the_preview_and_the_test_fill_them_with_the_senders_own_sample(): void
    {
        $this->audienceOfEight();
        $this->manager->forceFill(['name' => 'Rita <i>Moreno</i>'])->save();
        $campaign = $this->readyDraft();
        $this->asManager()->putJson($this->api("campaigns/{$campaign->id}"), ['name' => 'Autumn', 'subject' => 'Hi {{first_name}} {{favourite_colour}}', 'segment_id' => $this->everyone->id, 'body_blocks' => [
            ['id' => 'h', 'type' => 'heading', 'text' => 'Autumn at {{hotel_name}}'],
            ['id' => 't', 'type' => 'text', 'text' => 'Dear {{member.name}}, {{points_balance}} points as {{tier_name}}. {{ first_name }}'],
        ]])->assertOk();
        $campaign = $campaign->fresh();

        $response = $this->asManager()->getJson($this->api("campaigns/{$campaign->id}"))->assertOk()
            // The tags the editor offers, served like the block types; every tag that is filled, for its own warning.
            ->assertJsonPath('options.tags.0', ['tag' => '{{member_name}}', 'name' => 'member_name', 'label' => 'Member full name'])
            ->assertJsonPath('options.tags.1.tag', '{{first_name}}')
            ->assertJsonPath('options.known_tags', [...array_keys(\App\Models\EmailTemplate::AVAILABLE_TAGS), '{{member.name}}', '{{member.tier}}', '{{member.points}}'])
            // What is sent keeps its tags; the preview fills them with the viewer's own sample, escaped in the body.
            ->assertJsonPath('campaign.subject', 'Hi {{first_name}} {{favourite_colour}}')
            ->assertJsonPath('campaign.preview_subject', 'Hi Rita {{favourite_colour}}')
            ->assertJsonPath('campaign.unknown_tags', ['{{favourite_colour}}', '{{ first_name }}']);
        $this->assertStringContainsString('Dear {{member.name}}, {{points_balance}} points as {{tier_name}}.', $response->json('campaign.body_html'));
        $preview = (string) $response->json('campaign.preview_html');
        $this->assertStringContainsString('Autumn at Lumière Salon</h1>', $preview);
        $this->assertStringContainsString('Dear Rita &lt;i&gt;Moreno&lt;/i&gt;, 1,250 points as Silver. {{ first_name }}</p>', $preview);
        $this->assertCount(count(\App\Models\EmailTemplate::AVAILABLE_TAGS), $response->json('options.tags'));

        // The test email carries the same sample as the preview.
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/test"))->assertOk()->assertJsonPath('sent_to', $this->manager->email);
        $this->assertSame([['to' => $this->manager->email, 'subject' => '[TEST] Hi Rita {{favourite_colour}}', 'html' => $preview, 'unsubscribe' => null]], $this->sent());

        // Tags change nothing about who it reaches: the confirmation's numbers are the ones without them.
        $this->asManager()->getJson($this->api("campaigns/{$campaign->id}/audience"))->assertOk()
            ->assertJsonPath('audience.members', 8)->assertJsonPath('audience.reached', 3)->assertJsonPath('audience.no_consent', 2)
            ->assertJsonPath('audience.unsubscribed', 1)->assertJsonPath('audience.suppressed', 2);
        $this->assertSame(0, DB::table('email_campaign_deliveries')->count());
        Queue::assertNothingPushed();
    }

    public function test_cancel_stops_a_sending_campaign_only(): void
    {
        $this->audienceOfEight();
        $campaign = $this->readyDraft();
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending')->assertJsonPath('status', 'draft');

        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/send"), ['recipients' => 3, 'revision' => $campaign->updated_at->toIso8601String()])->assertOk();
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/cancel"))->assertOk()->assertJsonPath('campaign.status', 'cancelled');
        $this->asManager()->postJson($this->api("campaigns/{$campaign->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending');
        $this->assertSame(1, AuditLog::query()->where('action', 'email_campaign_cancelled')->count());

        // The job that was queued finds it cancelled and mails no one.
        Queue::pushed(SendEmailCampaignChunk::class)->first()->handle(app(EmailComplianceService::class));
        $this->assertSame([], $this->sent());
        $this->assertSame('cancelled', $campaign->fresh()->status);
    }

    public function test_duplicate_makes_a_fresh_draft_of_any_campaign(): void
    {
        $sent = EmailCampaign::create(['name' => 'Summer', 'subject' => 'Sun', 'body_html' => self::GOLDEN, 'body_blocks' => $this->blocks(), 'segment_id' => $this->everyone->id,
            'status' => 'sent', 'recipient_count' => 40, 'sent_count' => 38, 'failed_count' => 2, 'sent_at' => now(), 'sent_by_user_id' => $this->manager->id, 'error_message' => 'x']);

        $response = $this->asManager()->postJson($this->api("campaigns/{$sent->id}/duplicate"), ['name' => 'Summer (Kopie)'])->assertCreated()
            ->assertJsonPath('campaign.name', 'Summer (Kopie)')
            ->assertJsonPath('campaign.status', 'draft')
            ->assertJsonPath('campaign.subject', 'Sun')
            ->assertJsonPath('campaign.segment_id', $this->everyone->id)
            ->assertJsonPath('campaign.body_html', self::GOLDEN)
            ->assertJsonPath('campaign.recipient_count', 0)
            ->assertJsonPath('campaign.sent_count', 0)
            ->assertJsonPath('campaign.sent_at', null)
            ->assertJsonPath('campaign.sent_by', null);
        $this->assertTrue(AuditLog::query()->where('action', 'email_campaign_duplicated')->where('subject_id', $response->json('campaign.id'))->exists());

        $this->asManager()->postJson($this->api("campaigns/{$sent->id}/duplicate"))->assertCreated()->assertJsonPath('campaign.name', 'Summer (copy)');
        $this->assertSame('sent', $sent->fresh()->status);
    }
}

/** How many members the cap test makes: one past the full admin's 5,000. */
final class CampaignsTestLimit
{
    public const OVER = 5001;
}
