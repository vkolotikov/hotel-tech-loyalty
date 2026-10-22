<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Jobs\SendPushMessageChunk;
use App\Models\NotificationCampaign;
use App\Services\Loyalty\Push\ExpoReceipts;
use App\Services\NotificationService;
use Carbon\CarbonImmutable;
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
 * Expo receipts for push messages (release 4 §5). Each accepted push's delivery row keeps Expo's ticket id and the
 * hash of the device token it went to; `php artisan loyalty:push-receipts` asks Expo about tickets older than 15
 * minutes (and younger than a day), marks a refused push failed with Expo's reason, sets the message's count again,
 * and clears a device Expo says is gone — only while it is still that device. A ticket that already says the device is
 * gone clears it at once. Expo is never reached: every request goes to a fake, and a stray one fails the test.
 */
class PushReceiptsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, PushSchema;

    /** What the fake Expo's push endpoint answers, and its receipts endpoint. */
    private \Closure $tickets;
    private \Closure $receipts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        $this->pushOn();
        Queue::fake();
        Http::preventStrayRequests();
        $this->tickets = fn (HttpRequest $r) => Http::response(['data' => array_map(fn ($m) => ['status' => 'ok', 'id' => 'ticket-' . substr($m['to'], 23, -1)], $r->data())], 200);
        $this->receipts = fn () => Http::response(['data' => []], 200);
        Http::fake([
            'exp.host/--/api/v2/push/getReceipts' => fn (HttpRequest $r) => ($this->receipts)($r),
            'exp.host/--/api/v2/push/send'        => fn (HttpRequest $r) => ($this->tickets)($r),
        ]);
    }

    private static function token(string $who): string
    {
        return "ExponentPushToken[test-{$who}]";
    }

    /** A push message to Ada, Grace and two more, sent through the workspace and its job. @return array<string, \App\Models\LoyaltyMember> */
    private function pushedToFour(): array
    {
        $people = [
            'ada'   => $this->ada,
            'grace' => $this->grace,
            'pia'   => $this->makeMember('Pia', 'pia@example.test'),
            'olga'  => $this->makeMember('Olga', 'olga@example.test'),
        ];
        foreach ($people as $name => $m) {
            $m->forceFill(['expo_push_token' => self::token($name)])->save();
        }
        $segment = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);
        $id = $this->asManager()->postJson($this->api('push'), ['name' => 'Autumn'])->json('push.id');
        $this->asManager()->putJson($this->api("push/{$id}"), ['name' => 'Autumn', 'title' => 'Autumn', 'body' => 'Double points.', 'category' => 'offers', 'segment_id' => $segment->id])->assertOk();
        $m = NotificationCampaign::query()->findOrFail($id);
        $this->asManager()->postJson($this->api("push/{$id}/send"), ['recipients' => 4, 'revision' => $m->fresh()->updated_at->toIso8601String()])->assertOk();
        Queue::pushed(SendPushMessageChunk::class)->first()->handle(app(NotificationService::class));

        return $people;
    }

    private function row(int $memberId): object
    {
        return DB::table('push_message_deliveries')->where('member_id', $memberId)->first();
    }

    /** @return list<list<string>> the ticket ids each receipts request asked about */
    private function askedAbout(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_ends_with($r->url(), '/getReceipts'))->map(fn ($pair) => $pair[0]->data()['ids'])->values()->all();
    }

    public function test_each_accepted_push_keeps_its_ticket_and_the_hash_of_its_device(): void
    {
        $people = $this->pushedToFour();

        $row = $this->row($people['ada']->id);
        $this->assertSame(['sent', 'ticket-ada', hash('sha256', self::token('ada'))], [$row->status, $row->ticket_id, $row->token_hash]);
        $this->assertNull($row->receipt_at);
        $this->assertStringNotContainsString('ExponentPushToken', json_encode(DB::table('push_message_deliveries')->get()));
    }

    public function test_a_ticket_that_says_the_device_is_gone_clears_it_at_once(): void
    {
        $this->tickets = fn (HttpRequest $r) => Http::response(['data' => array_map(fn ($m) => str_contains($m['to'], 'grace')
            ? ['status' => 'error', 'message' => 'not registered', 'details' => ['error' => 'DeviceNotRegistered', 'expoPushToken' => $m['to']]]
            : ['status' => 'ok', 'id' => 'ticket-x'], $r->data())], 200);

        $people = $this->pushedToFour();

        $this->assertSame(['failed', 'DeviceNotRegistered'], [$this->row($people['grace']->id)->status, $this->row($people['grace']->id)->reason]);
        $this->assertNull($people['grace']->fresh()->expo_push_token);
        $this->assertSame(self::token('ada'), $people['ada']->fresh()->expo_push_token);
    }

    public function test_receipts_mark_refused_pushes_failed_and_clear_a_gone_device_only_while_it_is_still_that_device(): void
    {
        $people = $this->pushedToFour();
        $message = NotificationCampaign::query()->firstOrFail();
        $this->assertSame(4, (int) $message->fresh()->sent_count);
        // Olga reinstalled the app after the push: her new device must stay.
        $people['olga']->forceFill(['expo_push_token' => self::token('olga-new')])->save();

        // Too early: nothing is asked.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 09:10:00'));
        $this->artisan('loyalty:push-receipts')->assertSuccessful();
        $this->assertSame([], $this->askedAbout());

        $this->travelTo(CarbonImmutable::parse('2026-10-05 09:20:00'));
        $this->receipts = fn () => Http::response(['data' => [
            'ticket-ada'   => ['status' => 'ok'],
            'ticket-grace' => ['status' => 'error', 'message' => 'gone', 'details' => ['error' => 'DeviceNotRegistered']],
            'ticket-olga'  => ['status' => 'error', 'message' => 'gone', 'details' => ['error' => 'DeviceNotRegistered']],
            // Pia's receipt is not ready yet.
        ]], 200);
        $this->artisan('loyalty:push-receipts')->assertSuccessful();

        $this->assertSame([['ticket-ada', 'ticket-grace', 'ticket-pia', 'ticket-olga']], array_map(fn ($ids) => array_values($ids), [$this->askedAbout()[0]]));
        $this->assertSame('sent', $this->row($people['ada']->id)->status);
        $this->assertNotNull($this->row($people['ada']->id)->receipt_at);
        $this->assertSame(['failed', 'DeviceNotRegistered'], [$this->row($people['grace']->id)->status, $this->row($people['grace']->id)->reason]);
        $this->assertNull($people['grace']->fresh()->expo_push_token, 'the device the push went to is gone');
        $this->assertSame(self::token('olga-new'), $people['olga']->fresh()->expo_push_token, 'a device registered since stays');
        $this->assertSame('sent', $this->row($people['pia']->id)->status);
        $this->assertNull($this->row($people['pia']->id)->receipt_at);
        $this->assertSame(2, (int) $message->fresh()->sent_count, 'the count follows the rows');

        // Next time only Pia's is asked about; a day later nobody's.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 09:35:00'));
        $this->receipts = fn () => Http::response(['data' => ['ticket-pia' => ['status' => 'error', 'details' => ['error' => 'MessageRateExceeded']]]], 200);
        $this->artisan('loyalty:push-receipts')->assertSuccessful();
        $this->assertSame(['ticket-pia'], array_values($this->askedAbout()[1]));
        $this->assertSame(['failed', 'MessageRateExceeded'], [$this->row($people['pia']->id)->status, $this->row($people['pia']->id)->reason]);
        $this->assertSame(self::token('pia'), $people['pia']->fresh()->expo_push_token);

        $this->travelTo(CarbonImmutable::parse('2026-10-07 09:00:00'));
        $this->artisan('loyalty:push-receipts')->assertSuccessful();
        $this->assertCount(2, $this->askedAbout());
    }

    public function test_when_expo_cannot_be_reached_nothing_changes_and_the_next_run_asks_again(): void
    {
        $people = $this->pushedToFour();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 09:20:00'));
        $this->receipts = fn () => Http::response(['errors' => [['code' => 'INTERNAL']]], 503);

        $this->artisan('loyalty:push-receipts')->assertSuccessful();

        $this->assertSame('sent', $this->row($people['grace']->id)->status);
        $this->assertNull($this->row($people['grace']->id)->receipt_at);
        $this->assertSame(['asked' => 0, 'ok' => 0, 'failed' => 0, 'cleared' => 0, 'waiting' => 0], app(ExpoReceipts::class)->check());
    }
}
