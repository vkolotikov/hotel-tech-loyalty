<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;

/**
 * The member app's inbox (`GET /v1/member/notifications`, `POST notifications/{id}/read`, `POST notifications/read-all`):
 * its answers are pinned here as the app reads them, written against the code before release 3 §3 changed what fills
 * the inbox. The mobile app's member endpoints keep their shapes (CLAUDE.md): the inbox is Laravel's paginator of the
 * member's push_notifications rows, every column of the row, newest first, only rows marked sent.
 */
class MemberNotificationsTest extends MemberEndpointTestCase
{
    use PushSchema;

    private const INBOX = '/api/v1/member/notifications';

    /** Laravel's paginator, as the app reads it. */
    private const PAGE_KEYS = [
        'current_page', 'data', 'first_page_url', 'from', 'last_page', 'last_page_url', 'links', 'next_page_url', 'path',
        'per_page', 'prev_page_url', 'to', 'total',
    ];

    /** Every column of a push_notifications row (2024_01_01_000011). */
    private const ROW_KEYS = [
        'body', 'campaign_id', 'channel', 'created_at', 'data', 'id', 'is_sent', 'member_id', 'read_at', 'sent_at', 'title',
        'type', 'updated_at',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildPushSchema();
    }

    private function row(LoyaltyMember $member, array $values): int
    {
        return (int) DB::table('push_notifications')->insertGetId($values + [
            'member_id'  => $member->id,
            'type'       => 'points_earned',
            'title'      => 'You earned 100 points!',
            'body'       => 'Keep earning.',
            'data'       => json_encode(['points' => 100]),
            'channel'    => 'push',
            'is_sent'    => true,
            'sent_at'    => '2026-10-01 09:00:00',
            'created_at' => '2026-10-01 09:00:00',
            'updated_at' => '2026-10-01 09:00:00',
        ]);
    }

    private static function sortedKeys(array $row): array
    {
        $keys = array_keys($row);
        sort($keys);

        return $keys;
    }

    public function test_the_inbox_is_the_paginator_of_the_members_sent_rows_newest_first_with_every_column(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);
        ['member' => $someoneElse] = $this->member($org);

        $older = $this->row($member, ['title' => 'Older', 'created_at' => '2026-09-30 08:00:00']);
        $newer = $this->row($member, ['title' => 'Newer', 'created_at' => '2026-10-02 08:00:00', 'read_at' => '2026-10-02 09:30:00', 'campaign_id' => null]);
        $this->row($member, ['title' => 'Not sent', 'is_sent' => false, 'created_at' => '2026-10-03 08:00:00']);
        $this->row($someoneElse, ['title' => 'Theirs']);

        $json = $this->withToken($token)->getJson(self::INBOX)->assertOk()->json();

        $this->assertSame(self::PAGE_KEYS, self::sortedKeys($json));
        $this->assertSame([1, 50, 2, 1], [$json['current_page'], (int) $json['per_page'], $json['total'], $json['last_page']]);
        $this->assertSame(['Newer', 'Older'], array_column($json['data'], 'title'));
        $this->assertSame([$newer, $older], array_column($json['data'], 'id'));

        $first = $json['data'][0];
        $this->assertSame(self::ROW_KEYS, self::sortedKeys($first));
        $this->assertSame($member->id, $first['member_id']);
        $this->assertSame('points_earned', $first['type']);
        $this->assertSame('Keep earning.', $first['body']);
        $this->assertSame(['points' => 100], $first['data']);
        $this->assertSame('push', $first['channel']);
        $this->assertTrue($first['is_sent']);
        $this->assertNull($first['campaign_id']);
        $this->assertStringStartsWith('2026-10-02T09:30:00', $first['read_at']);
        $this->assertStringStartsWith('2026-10-01T09:00:00', $first['sent_at']);
        $this->assertNull($json['data'][1]['read_at']);
    }

    public function test_per_page_pages_the_inbox(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);
        foreach (range(1, 3) as $i) {
            $this->row($member, ['title' => "N{$i}", 'created_at' => "2026-10-0{$i} 08:00:00"]);
        }

        $json = $this->withToken($token)->getJson(self::INBOX . '?per_page=2&page=2')->assertOk()->json();

        $this->assertSame([2, 2, 3, 2], [$json['current_page'], (int) $json['per_page'], $json['total'], $json['last_page']]);
        $this->assertSame(['N1'], array_column($json['data'], 'title'));
    }

    public function test_mark_read_answers_as_before_and_reaches_only_the_members_own_rows(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);
        ['member' => $someoneElse] = $this->member($org);
        $mine = $this->row($member, []);
        $theirs = $this->row($someoneElse, []);

        $this->withToken($token)->postJson(self::INBOX . "/{$mine}/read")->assertOk()->assertExactJson(['message' => 'Marked as read']);
        $this->assertNotNull(DB::table('push_notifications')->where('id', $mine)->value('read_at'));

        $this->withToken($token)->postJson(self::INBOX . "/{$theirs}/read")->assertNotFound();
        $this->assertNull(DB::table('push_notifications')->where('id', $theirs)->value('read_at'));
    }

    // ─── What fills the inbox (release 3 §3) ────────────────────────────────

    public function test_a_notification_reaches_the_inbox_of_a_member_with_or_without_the_app_and_not_of_one_who_opted_out(): void
    {
        Http::preventStrayRequests();
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]], 200)]);
        $org = $this->tenant();
        ['member' => $withApp, 'token' => $appToken] = $this->member($org);
        ['member' => $portalOnly, 'token' => $portalToken] = $this->member($org);
        ['member' => $optedOut, 'token' => $optedOutToken] = $this->member($org);
        LoyaltyMember::withoutGlobalScopes()->whereKey($withApp->id)->update(['push_notifications' => true, 'expo_push_token' => 'ExponentPushToken[test-device]']);
        LoyaltyMember::withoutGlobalScopes()->whereKey($optedOut->id)->update(['notification_preferences' => json_encode(['tier' => false])]);
        app()->instance('current_organization_id', $org->id);
        $notices = app(NotificationService::class);
        foreach ([$withApp, $portalOnly, $optedOut] as $member) {
            $notices->send(LoyaltyMember::withoutGlobalScopes()->findOrFail($member->id), ['type' => 'tier_upgrade', 'title' => "Congratulations! You're now Gold!", 'body' => 'Enjoy your new Gold benefits.']);
        }
        app()->forgetInstance('current_organization_id');

        foreach ([$appToken, $portalToken] as $token) {
            $json = $this->withToken($token)->getJson(self::INBOX)->assertOk()->json();
            $this->assertSame(1, $json['total']);
            $this->assertSame(["Congratulations! You're now Gold!"], array_column($json['data'], 'title'));
            $this->assertTrue($json['data'][0]['is_sent']);
            $this->assertNull($json['data'][0]['read_at']);
            $this->assertNotNull($json['data'][0]['sent_at']);
            $this->assertSame(self::ROW_KEYS, self::sortedKeys($json['data'][0]));
            $this->app['auth']->forgetGuards();
        }
        $this->assertSame(0, $this->withToken($optedOutToken)->getJson(self::INBOX)->assertOk()->json('total'));
        // Only the member with the app was pushed to.
        $this->assertCount(1, Http::recorded());
        Http::assertSent(fn ($request) => $request['to'] === 'ExponentPushToken[test-device]');
    }

    public function test_rows_from_before_the_fix_show_as_sent_and_already_read(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);
        $old = $this->row($member, ['title' => 'Old', 'is_sent' => false, 'sent_at' => null, 'created_at' => '2026-06-01 10:00:00']);
        $readOld = $this->row($member, ['title' => 'Old, read', 'is_sent' => false, 'sent_at' => null, 'created_at' => '2026-06-02 10:00:00', 'read_at' => '2026-06-03 08:00:00']);
        $new = $this->row($member, ['title' => 'New', 'created_at' => '2026-10-04 10:00:00']);
        $this->assertSame(1, $this->withToken($token)->getJson(self::INBOX)->json('total'));

        $migration = require base_path('database/migrations/2026_10_22_110100_mark_earlier_push_notifications_sent_and_read.php');
        $migration->up();

        $rows = DB::table('push_notifications')->whereIn('id', [$old, $readOld, $new])->orderBy('id')->get()->keyBy('id');
        $this->assertTrue((bool) $rows[$old]->is_sent);
        $this->assertSame(['2026-06-01 10:00:00', '2026-06-01 10:00:00'], [(string) $rows[$old]->sent_at, (string) $rows[$old]->read_at]);
        // A row already read keeps when it was read.
        $this->assertSame('2026-06-03 08:00:00', (string) $rows[$readOld]->read_at);
        // A row written sent is left as it was: unread.
        $this->assertNull($rows[$new]->read_at);

        $this->app['auth']->forgetGuards();
        $json = $this->withToken($token)->getJson(self::INBOX)->assertOk()->json();
        $this->assertSame(['New', 'Old, read', 'Old'], array_column($json['data'], 'title'));
        $this->assertSame(1, count(array_filter($json['data'], fn ($r) => $r['read_at'] === null)));

        // A second run changes nothing.
        $before = DB::table('push_notifications')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $migration->up();
        $this->assertSame($before, DB::table('push_notifications')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all());
    }

    public function test_read_all_answers_as_before_and_marks_only_the_members_own_rows(): void
    {
        $org = $this->tenant();
        ['member' => $member, 'token' => $token] = $this->member($org);
        ['member' => $someoneElse] = $this->member($org);
        $this->row($member, []);
        $this->row($member, []);
        $theirs = $this->row($someoneElse, []);

        $this->withToken($token)->postJson(self::INBOX . '/read-all')->assertOk()->assertExactJson(['message' => 'All notifications marked as read']);

        $this->assertSame(0, DB::table('push_notifications')->where('member_id', $member->id)->whereNull('read_at')->count());
        $this->assertNull(DB::table('push_notifications')->where('id', $theirs)->value('read_at'));
    }
}
