<?php

namespace Tests\Feature\Notifications;

use App\Models\LoyaltyMember;
use App\Services\NotificationService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\WritesRowsForeignKeysNeed;
use Tests\TestCase;

/**
 * Locks NotificationService::send — the dispatcher behind tier changes, points earned, birthday bonuses, reward nudges,
 * offer announcements and push campaigns — as release 3 §3 (the member inbox) left it.
 *
 *   The inbox: a notification the member did not opt out of is kept in push_notifications for the app's inbox and the
 *   portal's unread count, marked sent (`is_sent` true, `sent_at` set), whatever happens to the push — also for a
 *   member without the app, or with push switched off. (Before, the row said `is_sent` false and nothing ever set it,
 *   so every inbox was empty, and a member without a device got no row at all.)
 *
 *   The push: only with push switched on and a device token; a failed push is logged, the row stays.
 *
 *   Opt-outs (TYPE_TO_CATEGORY): a category the member switched off writes nothing at all. Members who opted out of
 *   "offers" still get tier, points and transactional notifications; an unknown type is transactional and has no
 *   switch of its own; NULL preferences = everything on (the population from before the preferences existed). An
 *   "off" stored by a form-encoded save ("0") counts as off.
 *
 * Expo is never reached: every request goes to Http::fake, and a stray one fails the test.
 */
class NotificationServiceSendTest extends TestCase
{
    use DatabaseTransactions, WritesRowsForeignKeysNeed;
    use SetsUpMinimalSchema;
    use PushSchema;

    private NotificationService $service;

    /** What the fake Expo answers next (a later Http::fake() does not replace an earlier one, so the answer is swapped here). */
    private \Closure $expo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotificationSchema();
        $this->buildPushSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        Http::preventStrayRequests();
        $this->expo = fn () => Http::response(['data' => [['status' => 'ok']]], 200);
        Http::fake(['exp.host/*' => fn (Request $r) => ($this->expo)($r)]);

        $this->service = new NotificationService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function pushyMember(array $overrides = []): LoyaltyMember
    {
        // Default: ready to receive pushes.
        return LoyaltyMemberFactory::new()->create(array_merge([
            'push_notifications' => true,
            'expo_push_token'    => 'ExponentPushToken[test-token-1234]',
        ], $overrides));
    }

    private function pushCount(int $memberId): int
    {
        return DB::table('push_notifications')->where('member_id', $memberId)->count();
    }

    private function pushesToExpo(): int
    {
        return count(Http::recorded(fn (Request $r) => str_starts_with($r->url(), 'https://exp.host/')));
    }

    // ─── The inbox, whatever happens to the push ───────────────────────────

    public function test_push_switched_off_still_keeps_the_notification_in_the_inbox_but_sends_no_push(): void
    {
        $member = $this->pushyMember(['push_notifications' => false]);

        $this->service->send($member, ['type' => 'points_earned', 'title' => 'You earned 100 points', 'body' => 'Bronze stay reward']);

        $row = DB::table('push_notifications')->where('member_id', $member->id)->first();
        $this->assertNotNull($row, 'The inbox must hold the notification even with push switched off.');
        $this->assertTrue((bool) $row->is_sent);
        $this->assertSame(0, $this->pushesToExpo());
    }

    public function test_a_member_without_a_device_still_gets_the_notification_in_the_inbox(): void
    {
        $member = $this->pushyMember(['expo_push_token' => null]);

        $this->service->send($member, ['type' => 'tier_upgrade', 'title' => 'Gold member', 'body' => 'Welcome to Gold']);

        $this->assertSame(1, $this->pushCount($member->id));
        $this->assertTrue((bool) DB::table('push_notifications')->where('member_id', $member->id)->value('is_sent'));
        $this->assertSame(0, $this->pushesToExpo());

        $blank = $this->pushyMember(['expo_push_token' => '  ']);
        $this->service->send($blank, ['type' => 'tier_upgrade', 'title' => 'Gold member', 'body' => '']);
        $this->assertSame(1, $this->pushCount($blank->id));
        $this->assertSame(0, $this->pushesToExpo());
    }

    public function test_a_member_with_push_and_a_device_gets_the_row_and_the_push(): void
    {
        $member = $this->pushyMember();

        $this->service->send($member, ['type' => 'points_earned', 'title' => '+250 points', 'body' => 'From your stay', 'data' => ['points' => 250]]);

        $this->assertSame(1, $this->pushCount($member->id));
        Http::assertSent(fn (Request $r) => $r->url() === 'https://exp.host/--/api/v2/push/send'
            && $r['to'] === 'ExponentPushToken[test-token-1234]' && $r['title'] === '+250 points' && $r['body'] === 'From your stay');
        $this->assertSame(1, $this->pushesToExpo());
    }

    public function test_a_push_that_fails_leaves_the_row_in_the_inbox_marked_sent(): void
    {
        $this->expo = fn () => Http::response(['errors' => [['code' => 'INTERNAL_SERVER_ERROR']]], 500);
        $member = $this->pushyMember();

        $this->service->send($member, ['type' => 'tier_upgrade', 'title' => 'Gold', 'body' => '']);

        $this->assertSame(1, $this->pushCount($member->id));
        $this->assertTrue((bool) DB::table('push_notifications')->where('member_id', $member->id)->value('is_sent'));

        $this->expo = fn () => throw new \RuntimeException('connection refused');
        $this->service->send($member, ['type' => 'tier_upgrade', 'title' => 'Gold again', 'body' => '']);
        $this->assertSame(2, $this->pushCount($member->id));
    }

    // ─── Opt-outs ───────────────────────────────────────────────────────────

    public function test_category_opt_out_writes_nothing_and_sends_nothing(): void
    {
        $member = $this->pushyMember(['notification_preferences' => ['tier' => false]]);

        $this->service->send($member, ['type' => 'tier_upgrade', 'title' => 'Gold member', 'body' => '']);
        $this->service->send($member, ['type' => 'tier_downgrade', 'title' => 'Silver member', 'body' => '']);

        $this->assertSame(0, $this->pushCount($member->id), 'tier_upgrade must be suppressed when tier=false.');
        $this->assertSame(0, $this->pushesToExpo());
    }

    public function test_an_opt_out_counts_for_a_member_without_the_app_too(): void
    {
        $member = $this->pushyMember(['expo_push_token' => null, 'push_notifications' => false, 'notification_preferences' => ['offers' => false]]);

        $this->service->send($member, ['type' => 'new_offer', 'title' => 'Special offer just for you!', 'body' => 'Spa day']);

        $this->assertSame(0, $this->pushCount($member->id));
    }

    public function test_an_off_stored_as_a_form_value_counts_as_off(): void
    {
        foreach ([0, '0', 'false'] as $off) {
            $member = $this->pushyMember(['notification_preferences' => ['points' => $off]]);
            $this->service->send($member, ['type' => 'points_earned', 'title' => '+1', 'body' => '']);
            $this->assertSame(0, $this->pushCount($member->id), 'points=' . var_export($off, true) . ' must read as off');
        }
        // On, or never chosen, stays on.
        foreach ([true, 1, '1'] as $on) {
            $member = $this->pushyMember(['notification_preferences' => ['points' => $on]]);
            $this->service->send($member, ['type' => 'points_earned', 'title' => '+1', 'body' => '']);
            $this->assertSame(1, $this->pushCount($member->id));
        }
    }

    public function test_unrelated_category_opt_out_does_NOT_suppress_other_types(): void
    {
        $member = $this->pushyMember(['notification_preferences' => ['offers' => false]]);

        $this->service->send($member, ['type' => 'points_earned', 'title' => '+250 points', 'body' => 'From your stay']);

        $this->assertSame(1, $this->pushCount($member->id), 'offers=false must NOT suppress points_earned.');
    }

    public function test_transactional_type_bypasses_per_category_opt_outs(): void
    {
        $member = $this->pushyMember(['notification_preferences' => ['offers' => false, 'tier' => false, 'points' => false, 'stays' => false]]);

        $this->service->send($member, ['type' => 'welcome', 'title' => 'Welcome to the program', 'body' => 'You have 500 starting points']);
        // The full admin's push campaigns keep the type `campaign`, which is transactional (release 3 left them so).
        $this->service->send($member, ['type' => 'campaign', 'title' => 'Weekend', 'body' => 'Double points']);

        $this->assertSame(2, $this->pushCount($member->id), 'Transactional types must bypass per-category opt-outs.');
    }

    public function test_null_preferences_default_to_everything_on_back_compat(): void
    {
        $member = $this->pushyMember(['notification_preferences' => null]);

        $this->service->send($member, ['type' => 'tier_upgrade', 'title' => 'Gold', 'body' => '']);

        $this->assertSame(1, $this->pushCount($member->id));
    }

    public function test_unknown_notification_type_routes_to_transactional(): void
    {
        $member = $this->pushyMember(['notification_preferences' => ['points' => false, 'tier' => false, 'offers' => false]]);

        $this->service->send($member, ['type' => 'completely_new_type_we_invented', 'title' => 'Hello', 'body' => 'Should send despite prefs']);

        $this->assertSame(1, $this->pushCount($member->id), 'Unknown type must route to transactional (default catch-all) and send.');
    }

    public function test_a_push_message_type_maps_to_its_category_so_the_opt_out_applies(): void
    {
        foreach (NotificationService::CATEGORIES as $category) {
            $type = NotificationService::MESSAGE_TYPES[$category];
            $this->assertSame($category, NotificationService::categoryOf($type));

            $out = $this->pushyMember(['notification_preferences' => [$category => false]]);
            $this->service->send($out, ['type' => $type, 'title' => 'T', 'body' => 'B']);
            $this->assertSame(0, $this->pushCount($out->id), "{$type} must respect {$category}=false");
        }
        $this->assertSame(NotificationService::CATEGORIES, array_keys(NotificationService::MESSAGE_TYPES));
    }

    // ─── The row ────────────────────────────────────────────────────────────

    public function test_DB_row_carries_type_title_body_data_channel_and_is_marked_sent(): void
    {
        $member = $this->pushyMember();
        $payload = [
            'type'  => 'reward_nudge',
            'title' => "You're 100 points from a free night",
            'body'  => 'One more stay and the Spa Package is yours',
            'data'  => ['reward_id' => 42, 'points_to_go' => 100],
        ];

        $this->service->send($member, $payload);

        $row = DB::table('push_notifications')->where('member_id', $member->id)->first();
        $this->assertNotNull($row);
        $this->assertSame('reward_nudge', $row->type);
        $this->assertSame("You're 100 points from a free night", $row->title);
        $this->assertSame('One more stay and the Spa Package is yours', $row->body);
        $this->assertSame('push', $row->channel);
        $this->assertTrue((bool) $row->is_sent, 'is_sent means "kept in the inbox"; it is set when the row is written.');
        $this->assertSame(now()->toDateTimeString(), (string) $row->sent_at);
        $this->assertNull($row->read_at);
        $this->assertNull($row->campaign_id);

        $data = json_decode($row->data, true);
        $this->assertSame(42, $data['reward_id']);
        $this->assertSame(100, $data['points_to_go']);
    }

    public function test_empty_data_array_persists_as_empty_JSON(): void
    {
        $member = $this->pushyMember();

        $this->service->send($member, ['type' => 'welcome', 'title' => 'Hello', 'body' => 'No data attached']);

        $row = DB::table('push_notifications')->where('member_id', $member->id)->first();
        $this->assertNotNull($row->data);
        $decoded = json_decode($row->data, true);
        $this->assertIsArray($decoded);
        $this->assertEmpty($decoded);
    }

    public function test_keep_links_the_row_to_a_campaign_when_told(): void
    {
        $member = $this->pushyMember();
        $this->rowsExist('notification_campaigns', [77]); // the campaign the row is kept for

        $id = $this->service->keep($member, ['type' => 'message_offers', 'title' => 'T', 'body' => 'B', 'campaign_id' => 77]);

        $this->assertSame(77, (int) DB::table('push_notifications')->where('id', $id)->value('campaign_id'));
        $this->assertSame(0, $this->pushesToExpo());
    }

    // ─── Many pushes in one request ─────────────────────────────────────────

    public function test_push_many_sends_one_request_and_reads_each_ticket_in_order(): void
    {
        $this->expo = fn () => Http::response(['data' => [
            ['status' => 'ok', 'id' => 'a'],
            ['status' => 'error', 'message' => 'not registered', 'details' => ['error' => 'DeviceNotRegistered']],
            ['status' => 'ok', 'id' => 'c'],
        ]], 200);

        $out = $this->service->pushMany([
            ['to' => 'ExponentPushToken[a]', 'title' => 'T', 'body' => 'B', 'data' => ['campaign_id' => 1]],
            ['to' => 'ExponentPushToken[b]', 'title' => 'T', 'body' => 'B'],
            ['to' => 'ExponentPushToken[c]', 'title' => 'T', 'body' => 'B'],
        ]);

        // Release 4: an accepted push's ticket id comes back too (its receipt is read later by it).
        $this->assertSame([['ok' => true, 'error' => null, 'ticket' => 'a'], ['ok' => false, 'error' => 'DeviceNotRegistered', 'ticket' => null], ['ok' => true, 'error' => null, 'ticket' => 'c']], $out);
        $this->assertSame(1, $this->pushesToExpo());
        Http::assertSent(fn (Request $r) => count($r->data()) === 3 && $r->data()[0]['to'] === 'ExponentPushToken[a]');
        $this->assertSame([], $this->service->pushMany([]));
    }

    public function test_push_many_counts_every_push_as_not_accepted_when_the_request_fails(): void
    {
        $this->expo = fn () => Http::response(['errors' => []], 503);
        $this->assertSame([['ok' => false, 'error' => 'http_503', 'ticket' => null], ['ok' => false, 'error' => 'http_503', 'ticket' => null]],
            $this->service->pushMany([['to' => 'x', 'title' => 'T', 'body' => 'B'], ['to' => 'y', 'title' => 'T', 'body' => 'B']]));

        $this->expo = fn () => throw new \RuntimeException('connection refused');
        $this->assertSame([['ok' => false, 'error' => 'unreachable', 'ticket' => null]], $this->service->pushMany([['to' => 'x', 'title' => 'T', 'body' => 'B']]));

        $this->expo = fn () => Http::response(['data' => [['status' => 'ok']]], 200);
        $this->assertSame([['ok' => true, 'error' => null, 'ticket' => null], ['ok' => false, 'error' => 'no_ticket', 'ticket' => null]],
            $this->service->pushMany([['to' => 'x', 'title' => 'T', 'body' => 'B'], ['to' => 'y', 'title' => 'T', 'body' => 'B']]));
    }
}
