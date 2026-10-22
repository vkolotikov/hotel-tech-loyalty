<?php

namespace Tests\Feature\Mail;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\EmailCampaign;
use App\Models\EmailSuppression;
use App\Models\LoyaltyMember;
use App\Services\Email\CampaignTags;
use App\Services\EmailComplianceService;
use App\Services\Loyalty\Campaigns\CampaignBody;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Campaign tags inside a link, and the year (release 6, spec 2026-10-23 §2 item 7): CampaignTags, shared by the
 * workspace's campaigns and the full admin's, fills a tag in an `href` URL-encoded and everywhere else HTML-escaped,
 * and `{{current_year}}` is the year on the venue's clock. The real job sends; its messages land in the `array`
 * transport, as in CampaignDeliveriesTest.
 */
class CampaignTagLinksTest extends TestCase
{
    use CampaignsSchema, DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private MailManager $outbox;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->campaignsOn();
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

    /** A member who agreed to marketing email, with a name and a code that a URL must encode. */
    private function reachable(string $name, string $email, string $code): LoyaltyMember
    {
        $member = $this->makeMember($name, $email, ['marketing_consent' => true, 'email_notifications' => true, 'referral_code' => $code]);
        DB::table('users')->where('id', $member->user_id)->update(['email' => $email]);

        return $member->fresh();
    }

    private function sending(array $attributes): EmailCampaign
    {
        return EmailCampaign::create($attributes + ['name' => 'Autumn', 'subject' => 'Autumn', 'status' => EmailCampaign::STATUS_SENDING, 'recipient_count' => 1]);
    }

    private function runChunk(EmailCampaign $campaign, array $memberIds): void
    {
        (new SendEmailCampaignChunk((int) $campaign->id, $memberIds, 0))->handle(app(EmailComplianceService::class));
    }

    private function venueIn(string $zone): void
    {
        $this->org->forceFill(['timezone' => $zone])->save();
        app()->forgetScopedInstances();
    }

    public function test_a_value_inside_a_link_is_url_encoded_and_everywhere_else_escaped(): void
    {
        $values = ['{{member_name}}' => 'Ada & <Love"lace>', '{{email}}' => 'ada+vip@example.test', '{{referral_code}}' => 'AB 12/3?x=1#y', '{{first_name}}' => 'Ada'];

        $html = '<p>Hi {{member_name}}</p>'
            . '<a href="https://venue.example/join?ref={{referral_code}}&amp;n={{member_name}}#top">Join {{member_name}}</a>'
            . "<a HREF='https://venue.example/{{referral_code}}/card'>card</a>"
            . '<a href=https://venue.example/?m={{member_name}}>bare</a>'
            . '<a href="mailto:{{email}}?subject=Hi%20{{first_name}}&amp;body={{email}}">mail</a>'
            . '<a data-href="{{member_name}}" href="#">x</a><img src="https://venue.example/{{first_name}}.png" alt="{{member_name}}">';

        $this->assertSame(
            '<p>Hi Ada &amp; &lt;Love&quot;lace&gt;</p>'
            . '<a href="https://venue.example/join?ref=AB%2012%2F3%3Fx%3D1%23y&amp;n=Ada%20%26%20%3CLove%22lace%3E#top">Join Ada &amp; &lt;Love&quot;lace&gt;</a>'
            . "<a HREF='https://venue.example/AB%2012%2F3%3Fx%3D1%23y/card'>card</a>"
            . '<a href=https://venue.example/?m=Ada%20%26%20%3CLove%22lace%3E>bare</a>'
            . '<a href="mailto:ada%2Bvip@example.test?subject=Hi%20Ada&amp;body=ada%2Bvip%40example.test">mail</a>'
            . '<a data-href="Ada &amp; &lt;Love&quot;lace&gt;" href="#">x</a><img src="https://venue.example/Ada.png" alt="Ada &amp; &lt;Love&quot;lace&gt;">',
            CampaignTags::html($html, $values),
        );
        // One pass still: a value that reads as a tag is never filled again, in a link or out of one.
        $this->assertSame('<a href="x?n=%7B%7Bemail%7D%7D">{{email}}</a>', CampaignTags::html('<a href="x?n={{member_name}}">{{member_name}}</a>', ['{{member_name}}' => '{{email}}', '{{email}}' => 'a@b']));
        $this->assertSame('<p>{{unknown}} <a href="?q={{unknown}}">y</a></p>', CampaignTags::html('<p>{{unknown}} <a href="?q={{unknown}}">y</a></p>', $values));
    }

    public function test_a_workspace_campaigns_button_link_is_url_encoded_for_each_member_in_the_send_and_the_preview(): void
    {
        $bo = $this->reachable('Bo Ek & Søn', 'bo@example.test', 'BO 7/8');
        [$blocks] = CampaignBody::read([
            ['id' => 't1', 'type' => 'text', 'text' => 'Hello {{member_name}}'],
            ['id' => 'b1', 'type' => 'button', 'text' => 'Join {{first_name}}', 'url' => 'https://venue.example/join/{{referral_code}}?name={{member_name}}&tier={{tier_name}}'],
        ]);
        $this->assertNotSame([], $blocks);
        $campaign = $this->sending(['body_html' => CampaignBody::render($blocks), 'body_blocks' => $blocks]);

        $this->runChunk($campaign, [$bo->id]);
        [$mail] = $this->sent();
        $this->assertStringContainsString('Hello Bo Ek &amp; Søn</p>', $mail['html']);
        $this->assertStringContainsString('<a href="https://venue.example/join/BO%207%2F8?name=Bo%20Ek%20%26%20S%C3%B8n&amp;tier=Silver"', $mail['html']);
        $this->assertStringContainsString('>Join Bo</a>', $mail['html']);

        // The workspace's preview fills the same link with the viewer's sample, encoded the same way.
        $this->manager->forceFill(['name' => 'Rita Moreno'])->save();
        $draft = EmailCampaign::create(['name' => 'Draft', 'subject' => 'Hi', 'body_html' => CampaignBody::render($blocks), 'body_blocks' => $blocks, 'status' => EmailCampaign::STATUS_DRAFT]);
        $preview = (string) $this->asManager()->getJson($this->api("campaigns/{$draft->id}"))->assertOk()->json('campaign.preview_html');
        $this->assertStringContainsString('<a href="https://venue.example/join/SAMPLE?name=Rita%20Moreno&amp;tier=Silver"', $preview);
    }

    public function test_a_full_admin_campaigns_links_are_url_encoded_in_the_send_and_its_test(): void
    {
        $bo = $this->reachable('Bo Ek & Søn', 'bo@example.test', 'BO 7/8');
        // As the full admin's EmailBlockBuilder renders a button and a linked picture.
        $body = '<div style="text-align:center;padding:8px 24px 16px;"><a href="https://venue.example/r?code={{referral_code}}&amp;n={{member.name}}" style="color:#fff;">Hi {{member.name}}</a></div>'
            . '<div style="text-align:center;padding:8px 24px;"><a href="https://venue.example/card/{{member_number}}"><img src="https://venue.example/p.png" alt="{{member.name}}" /></a></div>';
        $campaign = $this->sending(['body_html' => $body]);

        $this->runChunk($campaign, [$bo->id]);
        [$mail] = $this->sent();
        $this->assertStringContainsString('<a href="https://venue.example/r?code=BO%207%2F8&amp;n=Bo%20Ek%20%26%20S%C3%B8n" style="color:#fff;">Hi Bo Ek &amp; Søn</a>', $mail['html']);
        $this->assertStringContainsString('<a href="https://venue.example/card/' . $bo->member_number . '"><img src="https://venue.example/p.png" alt="Bo Ek &amp; Søn" /></a>', $mail['html']);

        // The full admin's test send fills the sender's sample the same way.
        $this->manager->forceFill(['name' => 'Rita Moreno'])->save();
        $draft = EmailCampaign::create(['name' => 'Draft', 'subject' => 'Hi', 'body_html' => $body, 'status' => EmailCampaign::STATUS_DRAFT, 'created_by_user_id' => $this->manager->id]);
        $this->asManager()->postJson(rtrim((string) config('app.url'), '/') . "/api/v1/admin/email-campaigns/{$draft->id}/test")->assertOk();
        $test = $this->sent()[1];
        $this->assertSame($this->manager->email, $test['to']);
        $this->assertStringContainsString('<a href="https://venue.example/r?code=SAMPLE&amp;n=Rita%20Moreno"', $test['html']);
        $this->assertStringContainsString('<a href="https://venue.example/card/SAMPLE-0001">', $test['html']);
    }

    public function test_the_current_year_is_the_year_on_the_venues_clock_for_members_and_the_sample(): void
    {
        $bo = $this->reachable('Bo', 'bo@example.test', 'BO1');
        $campaign = $this->sending(['body_html' => '<p>© {{current_year}} <a href="https://venue.example/{{current_year}}">archive</a></p>', 'recipient_count' => 2]);

        // 31 December 11:30 UTC is already 1 January 00:30 in Auckland.
        $this->travelTo(CarbonImmutable::parse('2026-12-31 11:30:00', 'UTC'));
        $this->venueIn('Pacific/Auckland');
        $this->assertSame('2027', CampaignTags::forMember($bo->load(['user', 'tier']), 'Lumière Salon')['{{current_year}}']);
        $this->assertSame('2027', CampaignTags::sample($this->manager, (int) $this->org->id)['{{current_year}}']);
        $this->runChunk($campaign, [$bo->id]);
        $this->assertStringContainsString('<p>© 2027 <a href="https://venue.example/2027">archive</a></p>', $this->sent()[0]['html']);

        // 1 January 05:00 UTC is still 31 December in Los Angeles; at a venue on UTC it is the new year.
        $this->travelTo(CarbonImmutable::parse('2027-01-01 05:00:00', 'UTC'));
        $this->venueIn('America/Los_Angeles');
        $this->assertSame('2026', CampaignTags::forMember($bo, 'Lumière Salon')['{{current_year}}']);
        $this->assertSame('2026', CampaignTags::sample($this->manager, (int) $this->org->id)['{{current_year}}']);
        $this->venueIn('UTC');
        $this->assertSame('2027', CampaignTags::forMember($bo, 'Lumière Salon')['{{current_year}}']);
    }
}
