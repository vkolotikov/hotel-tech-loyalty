<?php

namespace Tests\Feature\Mail;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Services\Email\CampaignTags;
use App\Services\EmailComplianceService;
use App\Services\Loyalty\Campaigns\CampaignBody;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\MailManager;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\RawMessage;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The shared SendEmailCampaignChunk mails each member once and fills their tags (HexaTech Loyalty release 3 §4), for
 * the full admin's campaigns and the workspace's alike. Every test runs the real job; its messages go through the real
 * Mailer (Mail::html() is forwarded past Mail::fake() to the manager) into the in-memory `array` transport, so the
 * MessageSending listeners — the suppression one among them — fire as in production.
 */
class CampaignDeliveriesTest extends TestCase
{
    use CampaignsSchema, DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private MailManager $outbox;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        EmailSuppression::query()->delete();
        config(['mail.default' => 'array', 'cache.default' => 'array']);
        Cache::store('array')->flush();
        $this->outbox = app('mail.manager');
        Mail::fake();
        Queue::fake();
    }

    /** @return list<array{to: string, subject: string, html: string}> */
    private function sent(): array
    {
        return $this->outbox->mailer('array')->getSymfonyTransport()->messages()->map(function ($m) {
            $email = $m->getOriginalMessage();

            return ['to' => $email->getTo()[0]->getAddress(), 'subject' => (string) $email->getSubject(), 'html' => (string) $email->getHtmlBody()];
        })->values()->all();
    }

    /** A member who agreed to marketing email, at exactly this address. */
    private function reachable(string $name, string $email, array $attributes = []): LoyaltyMember
    {
        $member = $this->makeMember($name, $email, $attributes + ['marketing_consent' => true, 'email_notifications' => true]);
        DB::table('users')->where('id', $member->user_id)->update(['email' => $email]);

        return $member->fresh();
    }

    /** A campaign that is sending, its body rendered from a text block as the workspace saves it. */
    private function sending(string $subject, string $text, int $recipients): EmailCampaign
    {
        [$blocks] = CampaignBody::read([['id' => 't1', 'type' => 'text', 'text' => $text]]);

        return EmailCampaign::create([
            'name' => 'Autumn', 'subject' => $subject, 'body_html' => CampaignBody::render($blocks), 'body_blocks' => $blocks,
            'status' => EmailCampaign::STATUS_SENDING, 'recipient_count' => $recipients,
        ]);
    }

    private function runChunk(EmailCampaign $campaign, array $memberIds, int $offset = 0): void
    {
        (new SendEmailCampaignChunk((int) $campaign->id, $memberIds, $offset))->handle(app(EmailComplianceService::class));
    }

    /** @return array<int, string> member id => status */
    private function deliveries(EmailCampaign $campaign): array
    {
        return DB::table('email_campaign_deliveries')->where('campaign_id', $campaign->id)->orderBy('member_id')
            ->pluck('status', 'member_id')->mapWithKeys(fn ($s, $id) => [(int) $id => (string) $s])->all();
    }

    // ─── Once per member ────────────────────────────────────────────────────

    public function test_the_same_chunk_run_twice_emails_nobody_the_second_time_and_its_counts_stay_right(): void
    {
        $bo = $this->reachable('Bo', 'bo@example.test');
        $cy = $this->reachable('Cy', 'cy@example.test');
        $di = $this->reachable('Di', 'di@example.test');
        $ids = [$bo->id, $cy->id, $di->id];
        $campaign = $this->sending('Our autumn', 'See you soon', 3);

        $this->runChunk($campaign, $ids);
        $this->assertSame(['bo@example.test', 'cy@example.test', 'di@example.test'], array_column($this->sent(), 'to'));
        $this->assertSame([$bo->id => 'sent', $cy->id => 'sent', $di->id => 'sent'], $this->deliveries($campaign));
        $this->assertSame([EmailCampaign::STATUS_SENT, 3, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);

        // The queue retries the same chunk (tries = 3): every member has a row, so nobody is emailed again.
        $this->runChunk($campaign, $ids);
        $this->assertCount(3, $this->sent());
        $this->assertSame([3, 0], [$campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
        $this->assertSame(3, DB::table('email_campaign_deliveries')->count());
    }

    public function test_a_chunk_that_stopped_partway_resumes_with_the_members_it_had_not_reached_and_keeps_its_count(): void
    {
        $bo = $this->reachable('Bo', 'bo@example.test');
        $cy = $this->reachable('Cy', 'cy@example.test');
        $di = $this->reachable('Di', 'di@example.test');
        $campaign = $this->sending('Our autumn', 'See you soon', 3);
        // The worker died after mailing Bo (counted) and while mailing Cy (her row written, the outcome unknown).
        DB::table('email_campaign_deliveries')->insert([
            ['campaign_id' => $campaign->id, 'member_id' => $bo->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => $campaign->id, 'member_id' => $cy->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
        ]);
        $campaign->forceFill(['sent_count' => 1])->save();

        $this->runChunk($campaign, [$bo->id, $cy->id, $di->id]);

        // At most once: Cy may have had hers, so she is not tried again.
        $this->assertSame(['di@example.test'], array_column($this->sent(), 'to'));
        $this->assertSame([$bo->id => 'sent', $cy->id => 'pending', $di->id => 'sent'], $this->deliveries($campaign));
        $this->assertSame([EmailCampaign::STATUS_SENT, 2, 0], [$campaign->fresh()->status, $campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_no_address_a_mailer_error_and_a_suppressed_address_each_get_a_row_and_are_not_tried_again(): void
    {
        $nobody = $this->reachable('Nobody', 'nobody@example.test');
        DB::table('users')->where('id', $nobody->user_id)->update(['email' => '']);
        $boom = $this->reachable('Boom', 'boom@example.test');
        $gone = $this->reachable('Gone', 'gone@example.test');
        $fine = $this->reachable('Fine', 'fine@example.test');
        $campaign = $this->sending('Our autumn', 'See you soon', 4);
        // Bounced after Send: the transport's listener cancels it.
        EmailSuppression::suppress('gone@example.test', EmailSuppression::HARD_BOUNCE, null, 'ses');
        // A relay that refuses one address.
        $relay = new class extends ArrayTransport {
            public function send(RawMessage $message, ?Envelope $envelope = null): ?SentMessage
            {
                if ($message instanceof Email && $message->getTo()[0]->getAddress() === 'boom@example.test') {
                    throw new TransportException('relay said no');
                }

                return parent::send($message, $envelope);
            }
        };
        Mail::extend('flaky', fn () => $relay);
        config(['mail.mailers.flaky' => ['transport' => 'flaky'], 'mail.default' => 'flaky']);
        $to = fn () => $relay->messages()->map(fn ($m) => $m->getOriginalMessage()->getTo()[0]->getAddress())->values()->all();
        $ids = [$nobody->id, $boom->id, $gone->id, $fine->id];

        $this->runChunk($campaign, $ids);
        $this->assertSame(['fine@example.test'], $to());
        $this->assertSame([$nobody->id => 'failed', $boom->id => 'failed', $gone->id => 'suppressed', $fine->id => 'sent'], $this->deliveries($campaign));
        // A suppressed address is neither sent nor failed: the results show it as not emailed.
        $this->assertSame([1, 2], [$campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);

        $this->runChunk($campaign, $ids);
        $this->assertSame(['fine@example.test'], $to());
        $this->assertSame([1, 2], [$campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_a_cancelled_campaign_and_an_exhausted_hourly_budget_still_send_nothing_and_write_no_row(): void
    {
        $bo = $this->reachable('Bo', 'bo@example.test');
        $campaign = $this->sending('Our autumn', 'See you soon', 1);

        config(['mail.campaign_hourly_limit_per_org' => 1]);
        app(\App\Services\CampaignRateLimiter::class)->record((int) $this->org->id, 1);
        $this->runChunk($campaign, [$bo->id]);
        // Later, never dropped: the same chunk is queued again, and nobody was marked.
        Queue::assertPushed(SendEmailCampaignChunk::class, fn (SendEmailCampaignChunk $job) => $job->offset === 0 && $job->memberIds === [$bo->id]);
        $this->assertSame([], $this->sent());
        $this->assertSame([], $this->deliveries($campaign));

        Cache::store('array')->flush();
        $campaign->forceFill(['status' => EmailCampaign::STATUS_CANCELLED])->save();
        $this->runChunk($campaign, [$bo->id]);
        $this->assertSame([], $this->sent());
        $this->assertSame([], $this->deliveries($campaign));
        $this->assertSame(EmailCampaign::STATUS_CANCELLED, $campaign->fresh()->status);
    }

    // ─── Tags ───────────────────────────────────────────────────────────────

    public function test_each_member_gets_their_own_tags_escaped_in_the_body_and_plain_in_the_subject(): void
    {
        $this->ada->update(['marketing_consent' => true, 'email_notifications' => true, 'referral_code' => 'ADA-1']);
        $odd = $this->reachable('<b>x</b>', 'odd@example.test', ['current_points' => 1234567]);
        $campaign = $this->sending(
            'Hi {{first_name}}, {{tier_name}} news from {{hotel_name}}',
            "Dear {{member.name}} ({{member_name}}), you hold {{points_balance}} points as a {{member.tier}} member.\n"
            . 'Card {{member_number}}, code {{referral_code}}, {{email}}, {{current_year}}. {{favourite_colour}} {{ first_name }}',
            2,
        );

        $this->runChunk($campaign, [$this->ada->id, $odd->id]);
        [$ada, $x] = $this->sent();
        $adaEmail = (string) DB::table('users')->where('id', $this->ada->user_id)->value('email');

        $this->assertSame('Hi Ada, Gold news from Lumière Salon', $ada['subject']);
        $this->assertStringContainsString("Dear Ada Lovelace (Ada Lovelace), you hold 1,500 points as a Gold member.<br>Card {$this->ada->member_number}, code ADA-1, {$adaEmail}, 2026.", $ada['html']);

        // A name that is markup: plain text in the subject, escaped in the body, never markup.
        $this->assertSame('Hi <b>x</b>, Silver news from Lumière Salon', $x['subject']);
        $this->assertStringContainsString('Dear &lt;b&gt;x&lt;/b&gt; (&lt;b&gt;x&lt;/b&gt;), you hold 1,234,567 points as a Silver member.', $x['html']);
        $this->assertStringNotContainsString('<b>x</b>', $x['html']);

        // What no tag fills stays as written — a tag is matched exactly — and the footer is still added after.
        foreach ([$ada, $x] as $mail) {
            $this->assertStringContainsString('{{favourite_colour}} {{ first_name }}</p>', $mail['html']);
            $this->assertStringContainsString('Unsubscribe from marketing emails', $mail['html']);
        }
        $this->assertSame([2, 0], [$campaign->fresh()->sent_count, $campaign->fresh()->failed_count]);
    }

    public function test_every_tag_that_counts_as_known_is_filled_for_a_member_and_for_the_sample(): void
    {
        // EmailTemplate's tags, in its order, then the full admin builder's own.
        $this->assertSame([...array_keys(EmailTemplate::AVAILABLE_TAGS), '{{member.name}}', '{{member.tier}}', '{{member.points}}'], CampaignTags::known());
        $all = implode(' ', CampaignTags::known());

        $member = CampaignTags::forMember($this->ada->load(['user', 'tier']), 'Lumière Salon');
        $sample = CampaignTags::sample($this->manager, (int) $this->org->id);
        foreach ([$member, $sample] as $values) {
            $this->assertStringNotContainsString('{{', CampaignTags::html($all, $values));
            $this->assertStringNotContainsString('{{', CampaignTags::subject($all, $values));
        }
        // The sample: the sender's own name and address, the entry tier, marked numbers, the venue's real name.
        $this->assertSame(['Staff', 'Staff', $this->manager->email, 'Silver', 'SAMPLE-0001', '1,250', 'Lumière Salon'],
            [$sample['{{member.name}}'], $sample['{{first_name}}'], $sample['{{email}}'], $sample['{{tier_name}}'], $sample['{{member_number}}'], $sample['{{points_balance}}'], $sample['{{hotel_name}}']]);

        $this->assertSame(['{{x}}', '{{ first_name }}', '{{}}'], CampaignTags::unknown('a {{x}} {{first_name}} {{member.name}}', '{{ first_name }} {{x}} {{}} {{ unclosed'));
        $this->assertSame(['tag' => '{{member_name}}', 'name' => 'member_name', 'label' => 'Member full name'], CampaignTags::options()['tags'][0]);
    }

    public function test_a_value_is_never_read_as_a_tag_and_never_breaks_the_subject_onto_a_new_line(): void
    {
        $tricky = $this->reachable("{{email}}\r\nBcc: evil@example.test", 'tricky@example.test');
        $campaign = $this->sending('Hello {{member.name}}', 'Hello {{member.name}} & {{hotel_name}}', 1);
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'mail_from_name', 'value' => 'Lumière & Co', 'created_at' => now(), 'updated_at' => now()]);

        $this->runChunk($campaign, [$tricky->id]);
        [$mail] = $this->sent();

        // One pass: the member's "{{email}}" is their name, not their address; the line break is a space.
        $this->assertSame('Hello {{email}} Bcc: evil@example.test', $mail['subject']);
        $this->assertStringContainsString("Hello {{email}}\r\nBcc: evil@example.test &amp; Lumière &amp; Co</p>", $mail['html']);
        $this->assertStringNotContainsString('tricky@example.test', $mail['html']);
    }
}
