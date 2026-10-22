<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Jobs\SendSmsCampaignChunk;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Models\SmsCampaign;
use App\Services\MemberMergeService;
use App\Services\Sms\TwilioSms;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * SMS campaigns from HexaTech Loyalty (release 4 §5, owner decision R4-4): a manager's, behind the plan's `campaigns`;
 * sent through the venue's own Twilio account (Settings → Integrations) only; to members who turned "Offers by SMS"
 * on and have a number in international form; the confirmation counts who it reaches, why the rest are not, and the
 * SMS parts it comes to; one press starts it once, to the number confirmed; the job records each member before their
 * SMS, so a retried chunk never texts twice. Twilio is never reached: every request goes to Http::fake, and a stray one
 * fails the test; nothing reaches a real queue.
 */
class SmsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, MembershipSchema, SmsSchema;

    private MemberSegment $everyone;

    /** What the fake Twilio answers (swapped here: a later Http::fake() does not replace an earlier one). */
    private \Closure $twilio;

    private int $sids = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildSmsSchema();
        $this->campaignsOn();
        $this->twilioSettings($this->org->id);
        Queue::fake();
        Http::preventStrayRequests();
        $this->twilio = fn (HttpRequest $r) => Http::response(['sid' => 'SMtest' . ++$this->sids, 'status' => 'queued', 'num_segments' => '1'], 201);
        Http::fake(['api.twilio.com/*' => fn (HttpRequest $r) => ($this->twilio)($r)]);
        $this->everyone = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);
    }

    /** @return list<HttpRequest> every request the fake Twilio took */
    private function twilioRequests(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://api.twilio.com/'))->map(fn ($pair) => $pair[0])->values()->all();
    }

    /** @return list<string> the numbers texted, in order */
    private function texted(): array
    {
        return array_map(fn (HttpRequest $r) => (string) $r->data()['To'], $this->twilioRequests());
    }

    private function withPhone(LoyaltyMember $m, ?string $phone, bool $consent = true): LoyaltyMember
    {
        $m->user->forceFill(['phone' => $phone])->save();
        $m->forceFill(['sms_consent' => $consent])->save();

        return $m->fresh(['user']);
    }

    /**
     * Six active members of "Everyone", each texted or not for one reason, and one inactive one.
     *
     * @return array<string, LoyaltyMember>
     */
    private function audienceOfSix(): array
    {
        return [
            'ada'   => $this->withPhone($this->ada, '+44 20 7946 0958'),
            'grace' => $this->withPhone($this->grace, '+44 20 7946 0959', false),
            'pia'   => $this->withPhone($this->makeMember('Pia', 'pia@example.test'), null),
            'olga'  => $this->withPhone($this->makeMember('Olga', 'olga@example.test'), '020 7946 0960'),
            'tom'   => $this->withPhone($this->makeMember('Tomasz Kilburn', 'tom@example.test'), '+371 2612 3456'),
            'twin'  => $this->withPhone($this->makeMember('Ada Twin', 'twin@example.test'), '0044 20 7946 0958'),
            'off'   => $this->withPhone($this->makeMember('Off', 'off@example.test', ['is_active' => false]), '+371 2612 0000'),
        ];
    }

    private function readyDraft(string $body = 'Hi {{first_name}}, double points at {{hotel_name}} this week.', ?MemberSegment $segment = null): SmsCampaign
    {
        $id = $this->asManager()->postJson($this->api('sms'), ['name' => 'Autumn'])->assertCreated()->json('sms.id');
        $this->asManager()->putJson($this->api("sms/{$id}"), ['name' => 'Autumn', 'body' => $body, 'segment_id' => ($segment ?? $this->everyone)->id])->assertOk();

        return SmsCampaign::query()->findOrFail($id);
    }

    private function send(SmsCampaign $c, int $recipients): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->postJson($this->api("sms/{$c->id}/send"), ['recipients' => $recipients, 'revision' => $c->fresh()->updated_at->toIso8601String()]);
    }

    private function queuedJob(int $index = 0): SendSmsCampaignChunk
    {
        return Queue::pushed(SendSmsCampaignChunk::class)->values()->get($index) ?? $this->fail('No SMS chunk was queued.');
    }

    private function runJob(SendSmsCampaignChunk $job): void
    {
        $job->handle(app(TwilioSms::class));
    }

    /** @return array<int, string> delivery status by member id */
    private function deliveries(SmsCampaign $c): array
    {
        return DB::table('sms_campaign_deliveries')->where('campaign_id', $c->id)->orderBy('member_id')->pluck('status', 'member_id')->map(fn ($s) => (string) $s)->all();
    }

    /** @return list<array{0: string, 1: string}> */
    private function routes(int $id): array
    {
        return [['get', 'sms'], ['post', 'sms'], ['get', "sms/{$id}"], ['put', "sms/{$id}"], ['delete', "sms/{$id}"], ['get', "sms/{$id}/audience"],
            ['post', "sms/{$id}/test"], ['post', "sms/{$id}/send"], ['post', "sms/{$id}/schedule"], ['post', "sms/{$id}/unschedule"],
            ['post', "sms/{$id}/cancel"], ['post', "sms/{$id}/duplicate"]];
    }

    // ─── Gate and roles ─────────────────────────────────────────────────────

    public function test_without_the_plans_campaigns_feature_every_sms_route_is_locked(): void
    {
        $c = $this->readyDraft();
        $this->campaignsOn(false);
        $this->manager->setRelations([]);

        foreach ($this->routes($c->id) as [$method, $path]) {
            $this->asManager()->json($method, $this->api($path), ['name' => 'X'])->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        }
        Queue::assertNothingPushed();
        $this->assertSame([], $this->twilioRequests());
    }

    public function test_staff_neither_read_nor_change_sms_campaigns(): void
    {
        $c = $this->readyDraft();

        foreach ($this->routes($c->id) as [$method, $path]) {
            $this->asStaffMember()->json($method, $this->api($path), ['name' => 'X', 'recipients' => 1, 'revision' => 'x', 'send_at' => '2026-10-06T10:00'])
                ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        }
        $this->assertSame('draft', $c->fresh()->status);
        Queue::assertNothingPushed();
        $this->assertSame([], $this->twilioRequests());
    }

    public function test_another_organisations_campaign_is_not_found_and_its_segment_cannot_be_named(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = SmsCampaign::create(['name' => 'Theirs', 'body' => 'Hello', 'status' => 'draft']);
        $theirSegment = MemberSegment::create(['name' => 'Theirs', 'definition' => ['operator' => 'AND', 'filters' => []]]);
        app()->instance('current_organization_id', $prior);

        foreach ([['get', ''], ['put', ''], ['delete', ''], ['get', '/audience'], ['post', '/test'], ['post', '/send'], ['post', '/schedule'], ['post', '/unschedule'], ['post', '/cancel'], ['post', '/duplicate']] as [$method, $tail]) {
            $this->asManager()->json($method, $this->api("sms/{$theirs->id}{$tail}"), ['name' => 'Mine', 'recipients' => 1, 'revision' => 'x', 'send_at' => '2026-10-06T10:00'])
                ->assertStatus(404)->assertJsonPath('error', 'not_found');
        }
        $this->assertNotContains('Theirs', array_column($this->asManager()->getJson($this->api('sms'))->json('messages'), 'name'));

        $mine = $this->readyDraft();
        $this->asManager()->putJson($this->api("sms/{$mine->id}"), ['name' => 'Autumn', 'segment_id' => $theirSegment->id])
            ->assertStatus(422)->assertJsonValidationErrors(['segment_id']);
        $this->assertSame('Hello', SmsCampaign::withoutGlobalScopes()->find($theirs->id)->body);
    }

    // ─── Drafts and the venue's Twilio account ──────────────────────────────

    public function test_a_new_draft_carries_the_tags_the_sample_the_limits_and_whether_twilio_is_set_up_never_the_token(): void
    {
        $response = $this->asManager()->postJson($this->api('sms?brand_id=all'), ['name' => 'New SMS, 5 Oct 2026'])->assertCreated()
            ->assertJsonPath('sms.name', 'New SMS, 5 Oct 2026')
            ->assertJsonPath('sms.status', 'draft')
            ->assertJsonPath('sms.body', '')
            ->assertJsonPath('sms.segment', null)
            ->assertJsonPath('sms.missing', ['body'])
            ->assertJsonPath('sms.length', ['encoding' => 'gsm7', 'units' => 0, 'segments' => 0, 'per_segment' => 160, 'unicode' => []])
            ->assertJsonPath('options.max_body', 918)
            ->assertJsonPath('options.limit', 5000)
            ->assertJsonPath('options.gsm', ['single' => 160, 'part' => 153])
            ->assertJsonPath('options.ucs2', ['single' => 70, 'part' => 67])
            ->assertJsonPath('options.twilio', ['ready' => true, 'missing' => [], 'wrong' => [], 'from' => '+15005550006'])
            ->assertJsonPath('options.sample.{{first_name}}', 'Staff');
        $this->assertContains('{{first_name}}', $response->json('options.known_tags'));
        $this->assertStringNotContainsString('test-auth-token-not-real', $response->getContent());
        $this->assertStringNotContainsString($this->twilioSid, $response->getContent());
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_created')->exists());

        $list = $this->asManager()->getJson($this->api('sms'))->assertOk()->assertJsonPath('total', 1)
            ->assertJsonPath('messages.0.results', ['sent' => 0, 'failed' => 0, 'skipped' => 0, 'pending' => 0])
            ->assertJsonPath('twilio.ready', true);
        $this->assertStringNotContainsString('test-auth-token-not-real', $list->getContent());
    }

    public function test_without_twilio_the_list_says_what_is_missing_and_nothing_can_be_sent_tested_or_scheduled(): void
    {
        $c = $this->readyDraft();
        $this->withPhone($this->ada, '+44 20 7946 0958');
        $this->manager->forceFill(['phone' => '+44 20 7946 0000'])->save();
        $this->twilioSettings($this->org->id, sid: 'not-a-sid', token: null, from: '555-0006');

        $this->asManager()->getJson($this->api('sms'))->assertOk()
            ->assertJsonPath('twilio', ['ready' => false, 'missing' => ['auth_token'], 'wrong' => ['account_sid', 'phone_number'], 'from' => null]);
        $this->send($c, 1)->assertStatus(409)->assertJsonPath('error', 'not_ready')->assertJsonPath('missing', ['auth_token']);
        $this->asManager()->postJson($this->api("sms/{$c->id}/test"))->assertStatus(409)->assertJsonPath('error', 'not_ready');
        $this->asManager()->postJson($this->api("sms/{$c->id}/schedule"), ['send_at' => '2026-10-06T10:00', 'revision' => $c->fresh()->updated_at->toIso8601String()])
            ->assertStatus(409)->assertJsonPath('error', 'not_ready');

        // Only the venue's own rows count: the platform's environment is never a fallback.
        $this->twilioSettings($this->org->id, sid: '', token: '', from: '');
        $this->asManager()->getJson($this->api('sms'))->assertOk()->assertJsonPath('twilio.missing', ['account_sid', 'auth_token', 'phone_number']);
        $this->assertSame('draft', $c->fresh()->status);
        Queue::assertNothingPushed();
        $this->assertSame([], $this->twilioRequests());
    }

    public function test_a_draft_saves_its_text_and_segment_and_the_page_measures_it(): void
    {
        $c = $this->readyDraft("Hi {{first_name}},\r\nit’s double points at {{hotel_name}}. {{nope}}");

        $this->asManager()->getJson($this->api("sms/{$c->id}"))->assertOk()
            ->assertJsonPath('sms.body', "Hi {{first_name}},\nit’s double points at {{hotel_name}}. {{nope}}")
            ->assertJsonPath('sms.segment', ['id' => $this->everyone->id, 'name' => 'Everyone'])
            ->assertJsonPath('sms.missing', [])
            ->assertJsonPath('sms.length.encoding', 'ucs2')
            ->assertJsonPath('sms.length.unicode', ['’'])
            ->assertJsonPath('sms.preview', "Hi Staff,\nit’s double points at Lumière Salon. {{nope}}")
            ->assertJsonPath('sms.unknown_tags', ['{{nope}}'])
            ->assertJsonPath('sms.excerpt', 'Hi {{first_name}},')
            ->assertJsonPath('sms.revision', $c->fresh()->updated_at->toIso8601String());
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_updated')->where('subject_id', $c->id)->exists());

        $put = fn (array $body) => $this->asManager()->putJson($this->api("sms/{$c->id}"), $body + ['name' => 'Autumn']);
        $put(['body' => str_repeat('x', 919)])->assertStatus(422)->assertJsonValidationErrors(['body']);
        $put(['segment_id' => 999999])->assertStatus(422)->assertJsonValidationErrors(['segment_id']);
        $put(['name' => ''])->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    public function test_only_a_draft_is_changed_or_deleted_and_a_duplicate_is_a_new_draft(): void
    {
        $sent = $this->readyDraft();
        $sent->forceFill(['status' => 'sent', 'recipient_count' => 3])->save();

        $this->asManager()->putJson($this->api("sms/{$sent->id}"), ['name' => 'Changed'])->assertStatus(409)->assertJsonPath('error', 'not_a_draft')->assertJsonPath('status', 'sent');
        $this->asManager()->deleteJson($this->api("sms/{$sent->id}"))->assertStatus(409)->assertJsonPath('error', 'not_a_draft');

        $copy = $this->asManager()->postJson($this->api("sms/{$sent->id}/duplicate"), ['name' => 'Autumn again'])->assertCreated()
            ->assertJsonPath('sms.name', 'Autumn again')->assertJsonPath('sms.status', 'draft')->assertJsonPath('sms.recipient_count', 0)
            ->assertJsonPath('sms.body', $sent->body)->assertJsonPath('sms.segment_id', $this->everyone->id)->json('sms.id');
        $this->asManager()->deleteJson($this->api("sms/{$copy}"))->assertOk();
        $this->assertNull(SmsCampaign::query()->find($copy));
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_duplicated')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_deleted')->exists());
    }

    // ─── The audience ───────────────────────────────────────────────────────

    public function test_the_audience_counts_who_an_sms_reaches_why_the_rest_are_not_and_the_parts_it_comes_to(): void
    {
        $this->audienceOfSix();
        $c = $this->readyDraft();

        // Ada and Tom; Grace has not turned SMS on, Pia has no number, Olga's has no country code, Ada Twin shares
        // Ada's number. Each copy is one SMS with its own name filled in.
        $this->asManager()->getJson($this->api("sms/{$c->id}/audience"))->assertOk()->assertJsonPath('audience', [
            'segment' => ['id' => $this->everyone->id, 'name' => 'Everyone'],
            'members' => 6, 'reached' => 2, 'no_consent' => 1, 'no_phone' => 1, 'bad_phone' => 1, 'same_phone' => 1, 'segments' => 2, 'limit' => 5000,
        ]);

        // 155 letters, a space and the first name: 159 for Ada (one SMS), 162 for Tomasz (two parts): three in all.
        $long = $this->readyDraft(str_repeat('x', 155) . ' {{first_name}}');
        $this->asManager()->getJson($this->api("sms/{$long->id}/audience"))->assertOk()->assertJsonPath('audience.segments', 3);
    }

    public function test_the_audience_refuses_a_campaign_without_a_segment_or_with_a_rule_the_shared_service_would_skip(): void
    {
        $c = $this->readyDraft();
        $c->forceFill(['member_segment_id' => null])->save();
        $this->asManager()->getJson($this->api("sms/{$c->id}/audience"))->assertStatus(422)->assertJsonPath('error', 'no_audience');

        $lapsed = $this->makeSegment('Lapsed', ['operator' => 'OR', 'filters' => [['type' => 'activity', 'op' => 'inactive_days', 'value' => 60]]]);
        $c->forceFill(['member_segment_id' => $lapsed->id])->save();
        $this->asManager()->getJson($this->api("sms/{$c->id}/audience"))->assertStatus(422)->assertJsonPath('error', 'bad_rule');
    }

    // ─── Send and the job ───────────────────────────────────────────────────

    public function test_send_starts_once_to_the_number_confirmed_and_the_job_texts_each_member_once_with_their_own_tags(): void
    {
        $people = $this->audienceOfSix();
        $c = $this->readyDraft();

        $this->send($c, 3)->assertStatus(409)->assertJsonPath('error', 'audience_changed')->assertJsonPath('reached', 2);
        $this->asManager()->postJson($this->api("sms/{$c->id}/send"), ['recipients' => 2, 'revision' => 'stale'])->assertStatus(409)->assertJsonPath('error', 'changed');
        Queue::assertNothingPushed();

        $this->send($c, 2)->assertOk()->assertJsonPath('sms.status', 'sending')->assertJsonPath('sms.recipient_count', 2)->assertJsonPath('sms.sent_by', 'Staff');
        $this->send($c, 2)->assertStatus(409)->assertJsonPath('error', 'already_started')->assertJsonPath('status', 'sending');
        Queue::assertPushed(SendSmsCampaignChunk::class, 1);
        $job = $this->queuedJob();
        $this->assertSame([(int) $c->id, [$people['ada']->id, $people['tom']->id], 0], [$job->campaignId, $job->memberIds, $job->offset]);
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_queued')->where('subject_id', $c->id)->exists());
        $this->assertSame([], $this->twilioRequests());

        $this->runJob($job);

        $this->assertSame(['+442079460958', '+37126123456'], $this->texted());
        $first = $this->twilioRequests()[0];
        $this->assertSame('https://api.twilio.com/2010-04-01/Accounts/' . $this->twilioSid . '/Messages.json', $first->url());
        $this->assertSame(['To' => '+442079460958', 'Body' => 'Hi Ada, double points at Lumière Salon this week.', 'From' => '+15005550006'], $first->data());
        $this->assertTrue($first->hasHeader('Authorization', 'Basic ' . base64_encode($this->twilioSid . ':test-auth-token-not-real')));
        $this->assertSame('Hi Tomasz, double points at Lumière Salon this week.', $this->twilioRequests()[1]->data()['Body']);
        $this->assertSame([$people['ada']->id => 'sent', $people['tom']->id => 'sent'], $this->deliveries($c));
        $row = DB::table('sms_campaign_deliveries')->where('campaign_id', $c->id)->where('member_id', $people['ada']->id)->first();
        $this->assertSame(['SMtest1', 1], [$row->twilio_sid, (int) $row->segments]);
        $this->assertSame('sent', $c->fresh()->status);
        $this->assertNotNull($c->fresh()->sent_at);

        // The same job again (a retry, a second worker): nobody is texted twice.
        $this->runJob($job);
        $this->assertCount(2, $this->twilioRequests());
        $this->asManager()->getJson($this->api("sms/{$c->id}"))->assertOk()
            ->assertJsonPath('sms.results', ['sent' => 2, 'failed' => 0, 'skipped' => 0, 'pending' => 0])
            ->assertJsonPath('sms.segments_sent', 2);
    }

    public function test_the_job_checks_each_member_again_and_passes_over_who_changed_their_mind(): void
    {
        $people = $this->audienceOfSix();
        $c = $this->readyDraft();
        $this->send($c, 2)->assertOk();
        $people['tom']->forceFill(['sms_consent' => false])->save();

        $this->runJob($this->queuedJob());

        $this->assertSame(['+442079460958'], $this->texted());
        $this->assertSame([$people['ada']->id => 'sent', $people['tom']->id => 'skipped'], $this->deliveries($c));
        $this->assertSame('no_consent', DB::table('sms_campaign_deliveries')->where('member_id', $people['tom']->id)->value('reason'));
    }

    public function test_a_number_that_replied_stop_turns_the_members_sms_off_and_a_refused_number_is_recorded(): void
    {
        $people = $this->audienceOfSix();
        $c = $this->readyDraft();
        $this->send($c, 2)->assertOk();
        $this->twilio = fn (HttpRequest $r) => $r->data()['To'] === '+442079460958'
            ? Http::response(['code' => 21610, 'message' => 'Attempt to send to unsubscribed recipient', 'status' => 400], 400)
            : Http::response(['code' => 21408, 'message' => 'Permission to send an SMS has not been enabled for the region', 'status' => 400], 400);

        $this->runJob($this->queuedJob());

        $this->assertSame([$people['ada']->id => 'failed', $people['tom']->id => 'failed'], $this->deliveries($c));
        $this->assertSame(['twilio_21610', 'twilio_21408'], DB::table('sms_campaign_deliveries')->where('campaign_id', $c->id)->orderBy('member_id')->pluck('reason')->all());
        $this->assertFalse((bool) $people['ada']->fresh()->sms_consent, 'STOP is the member saying no more SMS');
        $this->assertTrue((bool) $people['tom']->fresh()->sms_consent);
        $this->assertSame('sent', $c->fresh()->status);
        $this->asManager()->getJson($this->api("sms/{$c->id}"))->assertOk()
            ->assertJsonPath('sms.failures', [['reason' => 'twilio_21408', 'count' => 1], ['reason' => 'twilio_21610', 'count' => 1]]);
    }

    public function test_when_twilio_asks_to_slow_down_nothing_is_recorded_and_the_slice_is_tried_again(): void
    {
        $people = $this->audienceOfSix();
        $c = $this->readyDraft();
        $this->send($c, 2)->assertOk();
        $this->twilio = fn (HttpRequest $r) => $r->data()['To'] === '+37126123456'
            ? Http::response(['code' => 20429, 'message' => 'Too Many Requests', 'status' => 429], 429)
            : Http::response(['sid' => 'SMada', 'status' => 'queued', 'num_segments' => '1'], 201);

        $this->runJob($this->queuedJob());

        $this->assertSame([$people['ada']->id => 'sent'], $this->deliveries($c), 'Tom was not taken: no row, so the retry texts him');
        Queue::assertPushed(SendSmsCampaignChunk::class, 2);
        $again = $this->queuedJob(1);
        $this->assertSame(0, $again->offset);
        $this->assertSame('sending', $c->fresh()->status);

        $this->twilio = fn (HttpRequest $r) => Http::response(['sid' => 'SMtom', 'status' => 'queued', 'num_segments' => '2'], 201);
        $this->runJob($again);
        $this->assertSame(['+442079460958', '+37126123456', '+37126123456'], $this->texted(), 'Ada once; Tom refused once, then sent');
        $this->assertSame([$people['ada']->id => 'sent', $people['tom']->id => 'sent'], $this->deliveries($c));
        $this->assertSame('sent', $c->fresh()->status);
    }

    public function test_an_account_twilio_refuses_stops_the_campaign_and_texts_nobody_more(): void
    {
        $people = $this->audienceOfSix();
        $c = $this->readyDraft();
        $this->send($c, 2)->assertOk();
        $this->twilio = fn () => Http::response(['code' => 20003, 'message' => 'Authenticate', 'status' => 401], 401);

        $this->runJob($this->queuedJob());

        $this->assertCount(1, $this->twilioRequests());
        $this->assertSame([], $this->deliveries($c), 'Twilio took nothing: nobody is recorded as texted');
        $this->assertSame(['failed', 'twilio_20003'], [$c->fresh()->status, $c->fresh()->error_message]);
        $this->asManager()->getJson($this->api("sms/{$c->id}"))->assertOk()->assertJsonPath('sms.problem', 'twilio_20003');
        Queue::assertPushed(SendSmsCampaignChunk::class, 1);
        $this->assertTrue((bool) $people['ada']->fresh()->sms_consent);
    }

    public function test_cancel_stops_a_sending_campaign_once_and_the_job_sends_nothing_after(): void
    {
        $this->audienceOfSix();
        $c = $this->readyDraft();
        $this->asManager()->postJson($this->api("sms/{$c->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending');
        $this->send($c, 2)->assertOk();

        $this->asManager()->postJson($this->api("sms/{$c->id}/cancel"))->assertOk()->assertJsonPath('sms.status', 'cancelled');
        $this->asManager()->postJson($this->api("sms/{$c->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending');
        $this->runJob($this->queuedJob());

        $this->assertSame([], $this->twilioRequests());
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_cancelled')->where('subject_id', $c->id)->exists());
    }

    // ─── The test SMS ───────────────────────────────────────────────────────

    public function test_a_test_goes_to_the_senders_own_phone_with_their_own_sample_and_is_refused_plainly_without_one(): void
    {
        $c = $this->readyDraft();

        $this->asManager()->postJson($this->api("sms/{$c->id}/test"))->assertStatus(422)->assertJsonPath('error', 'no_phone');
        $this->manager->forceFill(['phone' => '020 7946 0000'])->save();
        $this->asManager()->postJson($this->api("sms/{$c->id}/test"))->assertStatus(422)->assertJsonPath('error', 'bad_phone');
        $this->assertSame([], $this->twilioRequests());

        $this->manager->forceFill(['phone' => '+44 20 7946 0000'])->save();
        $this->asManager()->postJson($this->api("sms/{$c->id}/test"))->assertOk()->assertJsonPath('sent_to', '+442079460000')->assertJsonPath('segments', 1);
        $this->assertSame(['To' => '+442079460000', 'Body' => '[TEST] Hi Staff, double points at Lumière Salon this week.', 'From' => '+15005550006'], $this->twilioRequests()[0]->data());
        $this->assertTrue(AuditLog::query()->where('action', 'sms_campaign_test_sent')->where('subject_id', $c->id)->exists());
        $this->assertSame('draft', $c->fresh()->status);
        $this->assertSame([], $this->deliveries($c));

        $this->twilio = fn () => Http::response(['code' => 21608, 'message' => 'unverified', 'status' => 400], 400);
        $this->asManager()->postJson($this->api("sms/{$c->id}/test"))->assertStatus(502)->assertJsonPath('error', 'test_failed')->assertJsonPath('reason', 'twilio_21608');

        $empty = $this->asManager()->postJson($this->api('sms'), ['name' => 'Empty'])->json('sms.id');
        $this->asManager()->postJson($this->api("sms/{$empty}/test"))->assertStatus(422)->assertJsonPath('error', 'incomplete');
    }

    // ─── A merge ────────────────────────────────────────────────────────────

    public function test_a_merge_keeps_one_row_per_campaign_the_sent_one(): void
    {
        $this->buildMembershipSchema();
        $c = $this->readyDraft();
        $loser = $this->makeMember('Ada Again', 'ada2@example.test');
        DB::table('sms_campaign_deliveries')->insert([
            ['campaign_id' => $c->id, 'member_id' => $this->ada->id, 'status' => 'failed', 'reason' => 'twilio_21408', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => $c->id, 'member_id' => $loser->id, 'status' => 'sent', 'reason' => null, 'created_at' => now(), 'updated_at' => now()],
        ]);

        app(MemberMergeService::class)->merge($this->ada, $loser);

        $rows = DB::table('sms_campaign_deliveries')->where('campaign_id', $c->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame([(int) $this->ada->id, 'sent'], [(int) $rows[0]->member_id, $rows[0]->status]);
    }
}
