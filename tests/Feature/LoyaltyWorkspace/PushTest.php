<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Jobs\SendPushMessageChunk;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Models\NotificationCampaign;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Push\PushStart;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Push messages from HexaTech Loyalty (spec 2026-10-22 release 3 §5): a manager's, behind the plan's
 * `push_notifications`; the confirmation counts who a push can reach and why the rest cannot; one press starts a
 * message once, to the number confirmed; the job records each member once, so a retried chunk never pushes twice;
 * every push also lands in the member's inbox under a type whose category the member can switch off. Expo is never
 * reached (every request goes to a fake, and a stray one fails the test) and nothing reaches a real queue.
 */
class PushTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, PushSchema;

    private MemberSegment $everyone;

    /** What the fake Expo answers (swapped here: a later Http::fake() does not replace an earlier one). */
    private \Closure $expo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        $this->pushOn();
        Queue::fake();
        Http::preventStrayRequests();
        $this->expo = fn (HttpRequest $r) => Http::response(['data' => array_fill(0, count($r->data()), ['status' => 'ok'])], 200);
        Http::fake(['exp.host/*' => fn (HttpRequest $r) => ($this->expo)($r)]);
        $this->everyone = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);
    }

    /** @return list<HttpRequest> every request the fake Expo took */
    private function expoRequests(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://exp.host/'))->map(fn ($pair) => $pair[0])->values()->all();
    }

    /** @return list<string> the device tokens pushed to, in order */
    private function pushedTokens(): array
    {
        return array_merge([], ...array_map(fn (HttpRequest $r) => array_column($r->data(), 'to'), $this->expoRequests()));
    }

    /** A made-up device token (never a real one). */
    private static function token(string $who): string
    {
        return "ExponentPushToken[test-{$who}]";
    }

    /**
     * Five active members of "Everyone", each reached or not for one reason, and one inactive one.
     *
     * @return array<string, LoyaltyMember>
     */
    private function audienceOfFive(): array
    {
        $this->ada->update(['expo_push_token' => self::token('ada')]);
        $this->grace->update(['expo_push_token' => null]);

        return [
            'ada'   => $this->ada,
            'grace' => $this->grace,
            'pia'   => $this->makeMember('Pia', 'pia@example.test', ['push_notifications' => false, 'expo_push_token' => self::token('pia')]),
            'olga'  => $this->makeMember('Olga', 'olga@example.test', ['expo_push_token' => self::token('olga'), 'notification_preferences' => ['offers' => false]]),
            'tom'   => $this->makeMember('Tom', 'tom@example.test', ['expo_push_token' => self::token('tom'), 'notification_preferences' => ['points' => false, 'offers' => true]]),
            'off'   => $this->makeMember('Off', 'off@example.test', ['expo_push_token' => self::token('off'), 'is_active' => false]),
        ];
    }

    /** A message ready to send, saved through the workspace. */
    private function readyDraft(string $category = 'offers', ?MemberSegment $segment = null): NotificationCampaign
    {
        $id = $this->asManager()->postJson($this->api('push'), ['name' => 'Autumn'])->assertCreated()->json('push.id');
        $this->asManager()->putJson($this->api("push/{$id}"), [
            'name' => 'Autumn', 'title' => 'Autumn at Lumière', 'body' => 'Double points on every visit this week.',
            'category' => $category, 'segment_id' => ($segment ?? $this->everyone)->id,
        ])->assertOk();

        return NotificationCampaign::query()->findOrFail($id);
    }

    private function send(NotificationCampaign $m, int $recipients): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->postJson($this->api("push/{$m->id}/send"), ['recipients' => $recipients, 'revision' => $m->fresh()->updated_at->toIso8601String()]);
    }

    private function queuedJob(int $index = 0): SendPushMessageChunk
    {
        return Queue::pushed(SendPushMessageChunk::class)->values()->get($index) ?? $this->fail('No push chunk was queued.');
    }

    private function runJob(SendPushMessageChunk $job): void
    {
        $job->handle(app(NotificationService::class));
    }

    /** @return array<int, string> delivery status by member id */
    private function deliveries(NotificationCampaign $m): array
    {
        return DB::table('push_message_deliveries')->where('campaign_id', $m->id)->orderBy('member_id')->pluck('status', 'member_id')->map(fn ($s) => (string) $s)->all();
    }

    // ─── Gate and roles ─────────────────────────────────────────────────────

    /** @return list<array{0: string, 1: string}> every push route, as method and path */
    private function routes(int $id): array
    {
        return [['get', 'push'], ['post', 'push'], ['get', "push/{$id}"], ['put', "push/{$id}"], ['delete', "push/{$id}"], ['get', "push/{$id}/audience"],
            ['post', "push/{$id}/send"], ['post', "push/{$id}/cancel"], ['post', "push/{$id}/duplicate"]];
    }

    public function test_without_the_plans_push_feature_every_push_route_is_locked(): void
    {
        $message = $this->readyDraft();
        $this->pushOn(false);
        // The signed-in user keeps the organisation it loaded on the requests above; the plan is read afresh.
        $this->manager->setRelations([]);

        foreach ($this->routes($message->id) as [$method, $path]) {
            $this->asManager()->json($method, $this->api($path), ['name' => 'X'])->assertStatus(402)->assertJsonPath('code', 'feature_locked');
        }
        $this->assertSame('draft', $message->fresh()->status);
        Queue::assertNothingPushed();
        $this->assertSame([], $this->expoRequests());
    }

    public function test_staff_neither_read_nor_change_push_messages(): void
    {
        $message = $this->readyDraft();

        foreach ($this->routes($message->id) as [$method, $path]) {
            $this->asStaffMember()->json($method, $this->api($path), ['name' => 'X', 'recipients' => 1, 'revision' => 'x'])
                ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        }
        $this->assertSame(1, NotificationCampaign::query()->count());
        $this->assertSame('draft', $message->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_another_organisations_message_and_the_full_admins_campaigns_are_not_found_and_their_segment_cannot_be_named(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = new NotificationCampaign();
        $theirs->forceFill(['name' => 'Theirs', 'title' => 'T', 'body' => 'B', 'channel' => 'push', 'source' => 'loyalty', 'status' => 'draft'])->save();
        $theirSegment = MemberSegment::create(['name' => 'Theirs', 'definition' => ['operator' => 'AND', 'filters' => []]]);
        app()->instance('current_organization_id', $prior);
        // The full admin's push campaign of this organisation: a row of the same table, without a source.
        $fullAdmins = NotificationCampaign::create(['name' => 'Weekend', 'title' => 'T', 'body' => 'B', 'channel' => 'push', 'status' => 'sent']);

        foreach ([$theirs, $fullAdmins] as $row) {
            foreach ([['get', ''], ['put', ''], ['delete', ''], ['get', '/audience'], ['post', '/send'], ['post', '/cancel'], ['post', '/duplicate']] as [$method, $tail]) {
                $this->asManager()->json($method, $this->api("push/{$row->id}{$tail}"), ['name' => 'Mine', 'recipients' => 1, 'revision' => 'x'])
                    ->assertStatus(404)->assertJsonPath('error', 'not_found');
            }
        }
        $names = array_column($this->asManager()->getJson($this->api('push'))->json('messages'), 'name');
        $this->assertNotContains('Theirs', $names);
        $this->assertNotContains('Weekend', $names);

        $mine = $this->readyDraft();
        $this->asManager()->putJson($this->api("push/{$mine->id}"), ['name' => 'Autumn', 'segment_id' => $theirSegment->id])
            ->assertStatus(422)->assertJsonValidationErrors(['segment_id']);
        $this->assertSame('draft', NotificationCampaign::withoutGlobalScopes()->find($theirs->id)->status);
        Queue::assertNothingPushed();
    }

    // ─── Drafts ─────────────────────────────────────────────────────────────

    public function test_a_new_message_is_an_empty_draft_with_the_servers_choices_and_the_list_shows_it(): void
    {
        $response = $this->asManager()->postJson($this->api('push?brand_id=all'), ['name' => 'New push message, 5 Oct 2026'])->assertCreated()
            ->assertJsonPath('push.name', 'New push message, 5 Oct 2026')
            ->assertJsonPath('push.status', 'draft')
            ->assertJsonPath('push.title', '')
            ->assertJsonPath('push.body', '')
            ->assertJsonPath('push.category', null)
            ->assertJsonPath('push.segment', null)
            ->assertJsonPath('push.missing', ['title', 'body', 'category'])
            ->assertJsonPath('push.created_by', 'Staff')
            ->assertJsonPath('options', [
                'categories' => ['offers', 'points', 'tier', 'stays'], 'max_name' => 120, 'max_title' => 100, 'title_guide' => 40,
                'max_body' => 500, 'body_guide' => 150, 'limit' => 5000,
            ]);
        $id = $response->json('push.id');
        $row = NotificationCampaign::query()->findOrFail($id);
        $this->assertSame(['loyalty', 'push', $this->org->id], [$row->source, $row->channel, (int) $row->organization_id]);
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_created')->where('subject_id', $id)->exists());

        $this->asManager()->getJson($this->api('push'))->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('messages.0.id', $id)->assertJsonPath('messages.0.status', 'draft')
            ->assertJsonPath('messages.0.results', ['sent' => 0, 'failed' => 0, 'inbox_only' => 0, 'skipped' => 0, 'pending' => 0]);
        $this->asManager()->postJson($this->api('push'), ['name' => ''])->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    public function test_a_draft_saves_its_words_category_and_segment_and_the_server_checks_them(): void
    {
        $message = $this->readyDraft('tier');

        $this->asManager()->getJson($this->api("push/{$message->id}"))->assertOk()
            ->assertJsonPath('push.title', 'Autumn at Lumière')
            ->assertJsonPath('push.body', 'Double points on every visit this week.')
            ->assertJsonPath('push.category', 'tier')
            ->assertJsonPath('push.segment', ['id' => $this->everyone->id, 'name' => 'Everyone'])
            ->assertJsonPath('push.segment_id', $this->everyone->id)
            ->assertJsonPath('push.missing', [])
            ->assertJsonPath('push.revision', $message->updated_at->toIso8601String());
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_updated')->where('subject_id', $message->id)->exists());

        $put = fn (array $body) => $this->asManager()->putJson($this->api("push/{$message->id}"), $body + ['name' => 'Autumn']);
        $put(['category' => 'campaign'])->assertStatus(422)->assertJsonValidationErrors(['category']);
        $put(['category' => 'transactional'])->assertStatus(422)->assertJsonValidationErrors(['category']);
        $put(['title' => str_repeat('x', 101)])->assertStatus(422)->assertJsonValidationErrors(['title']);
        $put(['body' => str_repeat('x', 501)])->assertStatus(422)->assertJsonValidationErrors(['body']);
        $put(['segment_id' => 999999])->assertStatus(422)->assertJsonValidationErrors(['segment_id']);
        $this->assertSame('tier', $message->fresh()->category);
    }

    public function test_only_a_draft_is_changed_or_deleted(): void
    {
        $sent = $this->readyDraft();
        $sent->forceFill(['status' => 'sent'])->save();

        $this->asManager()->putJson($this->api("push/{$sent->id}"), ['name' => 'Changed'])
            ->assertStatus(409)->assertJsonPath('error', 'not_a_draft')->assertJsonPath('status', 'sent');
        $this->asManager()->deleteJson($this->api("push/{$sent->id}"))->assertStatus(409)->assertJsonPath('error', 'not_a_draft');
        $this->assertSame('Autumn', $sent->fresh()->name);

        $draft = $this->readyDraft();
        $this->asManager()->deleteJson($this->api("push/{$draft->id}"))->assertOk();
        $this->assertNull(NotificationCampaign::query()->find($draft->id));
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_deleted')->exists());
    }

    // ─── The audience ───────────────────────────────────────────────────────

    public function test_the_audience_counts_who_a_push_reaches_and_why_the_rest_are_not(): void
    {
        $this->audienceOfFive();

        $this->asManager()->getJson($this->api("push/{$this->readyDraft('offers')->id}/audience"))->assertOk()->assertJsonPath('audience', [
            'segment' => ['id' => $this->everyone->id, 'name' => 'Everyone'], 'category' => 'offers',
            'members' => 5, 'reached' => 2, 'push_off' => 1, 'no_device' => 1, 'opted_out' => 1, 'limit' => 5000,
        ]);
        // The same segment under another category: Olga is reached, Tom (points off) is not.
        $this->asManager()->getJson($this->api("push/{$this->readyDraft('points')->id}/audience"))->assertOk()
            ->assertJsonPath('audience.reached', 2)->assertJsonPath('audience.opted_out', 1);
    }

    public function test_the_audience_refuses_a_message_without_a_segment_or_category_or_with_a_rule_the_shared_service_would_skip(): void
    {
        $message = $this->readyDraft();
        $message->forceFill(['member_segment_id' => null])->save();
        $this->asManager()->getJson($this->api("push/{$message->id}/audience"))->assertStatus(422)->assertJsonPath('error', 'no_audience');

        $message->forceFill(['member_segment_id' => $this->everyone->id, 'category' => null])->save();
        $this->asManager()->getJson($this->api("push/{$message->id}/audience"))->assertStatus(422)->assertJsonPath('error', 'no_category');

        $lapsed = $this->makeSegment('Lapsed', ['operator' => 'OR', 'filters' => [['type' => 'activity', 'op' => 'inactive_days', 'value' => 60]]]);
        $message->forceFill(['member_segment_id' => $lapsed->id, 'category' => 'offers'])->save();
        $this->asManager()->getJson($this->api("push/{$message->id}/audience"))
            ->assertStatus(422)->assertJsonPath('error', 'bad_rule')->assertJsonPath('index', 0)->assertJsonPath('reason', 'unknown_op');
    }

    // ─── Send and the job ───────────────────────────────────────────────────

    public function test_send_hands_the_job_exactly_the_members_counted_and_each_push_lands_in_the_inbox_under_its_category(): void
    {
        $people = $this->audienceOfFive();
        $message = $this->readyDraft('offers');

        $this->send($message, 2)->assertOk()->assertJsonPath('push.status', 'sending')->assertJsonPath('push.recipient_count', 2)
            ->assertJsonPath('push.sent_by', 'Staff');

        Queue::assertPushed(SendPushMessageChunk::class, 1);
        $job = $this->queuedJob();
        $this->assertSame([(int) $message->id, [$people['ada']->id, $people['tom']->id], 0], [$job->messageId, $job->memberIds, $job->offset]);
        $fresh = $message->fresh();
        $this->assertSame(['sending', 2, 0, $this->manager->id], [$fresh->status, (int) $fresh->target_count, (int) $fresh->sent_count, (int) $fresh->sent_by_user_id]);
        $this->assertNotNull($this->everyone->fresh()->last_sent_at);
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_queued')->where('subject_id', $message->id)->exists());
        $this->assertSame([], $this->expoRequests());

        $this->runJob($job);

        // One request to Expo for the chunk, to those two devices only.
        $this->assertCount(1, $this->expoRequests());
        $this->assertSame([self::token('ada'), self::token('tom')], $this->pushedTokens());
        $first = $this->expoRequests()[0]->data()[0];
        $this->assertSame(['Autumn at Lumière', 'Double points on every visit this week.'], [$first['title'], $first['body']]);
        $this->assertSame(['campaign_id' => (int) $message->id, 'category' => 'offers'], (array) $first['data']);

        $this->assertSame([$people['ada']->id => 'sent', $people['tom']->id => 'sent'], $this->deliveries($message));
        // Each push is in the member's inbox: sent, unread, linked to the message, under the type whose category is offers.
        $inbox = DB::table('push_notifications')->where('campaign_id', $message->id)->orderBy('member_id')->get();
        $this->assertSame([$people['ada']->id, $people['tom']->id], $inbox->pluck('member_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(['message_offers'], $inbox->pluck('type')->unique()->values()->all());
        $this->assertSame('offers', NotificationService::categoryOf('message_offers'));
        $this->assertTrue((bool) $inbox[0]->is_sent);
        $this->assertNull($inbox[0]->read_at);
        $this->assertSame('Autumn at Lumière', $inbox[0]->title);

        $fresh = $message->fresh();
        $this->assertSame(['sent', 2], [$fresh->status, (int) $fresh->sent_count]);
        $this->assertNotNull($fresh->sent_at);
        Queue::assertPushed(SendPushMessageChunk::class, 1);
        $this->asManager()->getJson($this->api("push/{$message->id}"))->assertOk()
            ->assertJsonPath('push.results', ['sent' => 2, 'failed' => 0, 'inbox_only' => 0, 'skipped' => 0, 'pending' => 0]);
    }

    public function test_two_presses_start_a_message_once(): void
    {
        $this->audienceOfFive();
        $message = $this->readyDraft();
        $revision = $message->updated_at->toIso8601String();

        $this->asManager()->postJson($this->api("push/{$message->id}/send"), ['recipients' => 2, 'revision' => $revision])->assertOk();
        $this->asManager()->postJson($this->api("push/{$message->id}/send"), ['recipients' => 2, 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'already_started')->assertJsonPath('status', 'sending');

        Queue::assertPushed(SendPushMessageChunk::class, 1);
        $this->assertSame(1, AuditLog::query()->where('action', 'push_message_queued')->count());
    }

    public function test_two_requests_that_both_read_a_draft_still_start_it_once(): void
    {
        $this->audienceOfFive();
        $message = $this->readyDraft();
        $first = NotificationCampaign::query()->findOrFail($message->id);
        $second = NotificationCampaign::query()->findOrFail($message->id);
        $start = app(PushStart::class);

        $start->start($first, $this->manager, 2, $first->updated_at->toIso8601String());
        try {
            $start->start($second, $this->manager, 2, $second->updated_at->toIso8601String());
            $this->fail('The second start went through.');
        } catch (LoyaltyRefused $refused) {
            $this->assertSame(['already_started', 409], [$refused->errorCode, $refused->status]);
        }

        Queue::assertPushed(SendPushMessageChunk::class, 1);
    }

    public function test_a_number_or_a_draft_that_changed_since_the_confirmation_starts_nothing(): void
    {
        $people = $this->audienceOfFive();
        $message = $this->readyDraft();
        $revision = $message->updated_at->toIso8601String();

        // Grace installed the app meanwhile: the confirmation said 2, it would now be 3.
        $people['grace']->update(['expo_push_token' => self::token('grace')]);
        $this->asManager()->postJson($this->api("push/{$message->id}/send"), ['recipients' => 2, 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'audience_changed')->assertJsonPath('reached', 3);

        $this->travel(5)->seconds();
        $this->asManager()->putJson($this->api("push/{$message->id}"), ['name' => 'Autumn', 'title' => 'Changed', 'body' => 'B', 'category' => 'offers', 'segment_id' => $this->everyone->id])->assertOk();
        $this->asManager()->postJson($this->api("push/{$message->id}/send"), ['recipients' => 3, 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'changed');

        $this->assertSame('draft', $message->fresh()->status);
        Queue::assertNothingPushed();
    }

    public function test_send_refuses_what_is_not_ready_and_an_audience_it_cannot_reach(): void
    {
        $message = $this->readyDraft();

        // Nobody in the segment has the app.
        $this->send($message, 1)->assertStatus(422)->assertJsonPath('error', 'nobody_to_send_to');

        $message->forceFill(['title' => ' ', 'category' => null])->save();
        $this->send($message, 1)->assertStatus(422)->assertJsonPath('error', 'incomplete')->assertJsonPath('missing', ['title', 'category']);

        $message->forceFill(['title' => 'T', 'category' => 'offers', 'member_segment_id' => null])->save();
        $this->send($message, 1)->assertStatus(422)->assertJsonPath('error', 'no_audience');

        $this->assertSame('draft', $message->fresh()->status);
        Queue::assertNothingPushed();
        $this->assertSame([], $this->expoRequests());
    }

    public function test_a_retried_chunk_never_pushes_a_member_twice_nor_keeps_a_second_inbox_row(): void
    {
        $people = $this->audienceOfFive();
        $message = $this->readyDraft();
        $this->send($message, 2)->assertOk();
        $job = $this->queuedJob();

        // An earlier try recorded Ada and stopped before her push: she stays as she was, never pushed by a retry.
        DB::table('push_message_deliveries')->insert(['campaign_id' => $message->id, 'member_id' => $people['ada']->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
        $this->runJob($job);
        $this->assertSame([self::token('tom')], $this->pushedTokens());
        $this->assertSame([$people['ada']->id => 'pending', $people['tom']->id => 'sent'], $this->deliveries($message));

        // The same chunk once more, as a queue retry would run it after a crash before the message was marked sent.
        $message->fresh()->forceFill(['status' => 'sending'])->save();
        $this->runJob($job);
        $this->assertSame([self::token('tom')], $this->pushedTokens(), 'a retried chunk pushed again');
        $this->assertSame(1, DB::table('push_notifications')->where('campaign_id', $message->id)->count());
        $this->assertSame(1, (int) $message->fresh()->sent_count);
        $this->assertSame('sent', $message->fresh()->status);
    }

    public function test_the_job_checks_each_member_again_and_keeps_the_inbox_row_when_the_push_fails(): void
    {
        $people = $this->audienceOfFive();
        $message = $this->readyDraft();
        $this->send($message, 2)->assertOk();

        // After Send: Tom switched offers off; Ada's device is no longer registered with Expo.
        $people['tom']->update(['notification_preferences' => ['offers' => false]]);
        $this->expo = fn () => Http::response(['data' => [['status' => 'error', 'message' => 'gone', 'details' => ['error' => 'DeviceNotRegistered']]]], 200);
        $this->runJob($this->queuedJob());

        $this->assertSame([self::token('ada')], $this->pushedTokens());
        $this->assertSame([$people['ada']->id => 'failed', $people['tom']->id => 'skipped'], $this->deliveries($message));
        $this->assertSame('DeviceNotRegistered', DB::table('push_message_deliveries')->where('member_id', $people['ada']->id)->value('reason'));
        $this->assertSame('opted_out', DB::table('push_message_deliveries')->where('member_id', $people['tom']->id)->value('reason'));
        // Ada still has it in her inbox; Tom, who switched the category off, has nothing.
        $this->assertSame([$people['ada']->id], DB::table('push_notifications')->where('campaign_id', $message->id)->pluck('member_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame([0, 'sent'], [(int) $message->fresh()->sent_count, $message->fresh()->status]);
        $this->asManager()->getJson($this->api("push/{$message->id}"))->assertJsonPath('push.results', ['sent' => 0, 'failed' => 1, 'inbox_only' => 0, 'skipped' => 1, 'pending' => 0]);
    }

    public function test_a_member_who_switched_push_off_after_send_keeps_it_in_the_inbox_without_a_push(): void
    {
        $people = $this->audienceOfFive();
        $message = $this->readyDraft();
        $this->send($message, 2)->assertOk();
        $people['ada']->update(['push_notifications' => false]);
        $people['tom']->update(['is_active' => false]);

        $this->runJob($this->queuedJob());

        $this->assertSame([], $this->expoRequests());
        $this->assertSame([$people['ada']->id => 'inbox_only', $people['tom']->id => 'skipped'], $this->deliveries($message));
        $this->assertSame(1, DB::table('push_notifications')->where('campaign_id', $message->id)->where('member_id', $people['ada']->id)->count());
    }

    public function test_a_large_audience_goes_out_in_chunks_of_one_hundred_one_request_each(): void
    {
        $now = now()->toDateTimeString();
        $first = (int) DB::table('users')->max('id') + 1;
        $password = bcrypt('secret-pass-1'); // NOT NULL in production, as the members' card codes below are
        DB::table('users')->insert(array_map(fn ($i) => ['organization_id' => $this->org->id, 'name' => "Bulk {$i}", 'email' => "bulk{$i}@example.test", 'password' => $password, 'user_type' => 'member', 'created_at' => $now, 'updated_at' => $now], range(1, 130)));
        DB::table('loyalty_members')->insert(array_map(fn ($n) => ['organization_id' => $this->org->id, 'user_id' => $first + $n, 'tier_id' => $this->tiers['silver']->id, 'member_number' => 'B-' . ($first + $n),
            'qr_code_token' => 'bulk-qr-' . ($first + $n), 'referral_code' => 'BULK' . ($first + $n),
            'is_active' => true, 'push_notifications' => true, 'expo_push_token' => self::token("bulk-{$n}"), 'created_at' => $now, 'updated_at' => $now], range(0, 129)));
        $message = $this->readyDraft();
        $this->send($message, 130)->assertOk();

        $this->runJob($this->queuedJob(0));
        $this->assertCount(1, $this->expoRequests());
        $this->assertCount(100, $this->expoRequests()[0]->data());
        $next = $this->queuedJob(1);
        $this->assertSame(100, $next->offset);
        $this->assertSame('sending', $message->fresh()->status);

        $this->runJob($next);
        $this->assertCount(2, $this->expoRequests());
        $this->assertCount(30, $this->expoRequests()[1]->data());
        $this->assertSame(['sent', 130], [$message->fresh()->status, (int) $message->fresh()->sent_count]);
        $this->assertSame(130, DB::table('push_notifications')->where('campaign_id', $message->id)->count());
    }

    public function test_cancel_stops_a_sending_message_only_and_the_queued_chunk_then_sends_nothing(): void
    {
        $this->audienceOfFive();
        $message = $this->readyDraft();
        $this->asManager()->postJson($this->api("push/{$message->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending')->assertJsonPath('status', 'draft');

        $this->send($message, 2)->assertOk();
        $this->asManager()->postJson($this->api("push/{$message->id}/cancel"))->assertOk()->assertJsonPath('push.status', 'cancelled');
        $this->asManager()->postJson($this->api("push/{$message->id}/cancel"))->assertStatus(409)->assertJsonPath('error', 'not_sending');
        $this->assertSame(1, AuditLog::query()->where('action', 'push_message_cancelled')->count());

        $this->runJob($this->queuedJob());
        $this->assertSame([], $this->expoRequests());
        $this->assertSame([], $this->deliveries($message));
        $this->assertSame('cancelled', $message->fresh()->status);
    }

    public function test_a_chunk_that_gives_up_marks_the_message_failed(): void
    {
        $this->audienceOfFive();
        $message = $this->readyDraft();
        $this->send($message, 2)->assertOk();

        $this->queuedJob()->failed(new \RuntimeException('worker lost'));

        $this->assertSame('failed', $message->fresh()->status);
    }

    public function test_duplicate_makes_a_fresh_draft_of_any_message(): void
    {
        $this->audienceOfFive();
        $message = $this->readyDraft('stays');
        // Under stays, Olga (offers off) and Tom (points off) are reached beside Ada.
        $this->send($message, 3)->assertOk();
        $this->runJob($this->queuedJob());

        $response = $this->asManager()->postJson($this->api("push/{$message->id}/duplicate"), ['name' => 'Autumn (Kopie)'])->assertCreated()
            ->assertJsonPath('push.name', 'Autumn (Kopie)')
            ->assertJsonPath('push.status', 'draft')
            ->assertJsonPath('push.title', 'Autumn at Lumière')
            ->assertJsonPath('push.category', 'stays')
            ->assertJsonPath('push.segment_id', $this->everyone->id)
            ->assertJsonPath('push.recipient_count', 0)
            ->assertJsonPath('push.results.sent', 0)
            ->assertJsonPath('push.sent_at', null)
            ->assertJsonPath('push.sent_by', null);
        $this->assertTrue(AuditLog::query()->where('action', 'push_message_duplicated')->where('subject_id', $response->json('push.id'))->exists());

        $this->asManager()->postJson($this->api("push/{$message->id}/duplicate"))->assertCreated()->assertJsonPath('push.name', 'Autumn (copy)');
        $this->assertSame('sent', $message->fresh()->status);
    }
}
