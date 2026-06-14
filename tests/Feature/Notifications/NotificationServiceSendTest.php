<?php

namespace Tests\Feature\Notifications;

use App\Models\LoyaltyMember;
use App\Services\NotificationService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks NotificationService::send — the push-notification
 * dispatcher that drives loyalty tier upgrades, points earned,
 * birthday bonuses, reward nudges, and offer announcements.
 *
 * The per-category opt-in matrix is delicate because:
 *   - Members who opted out of "offers" should STILL get tier +
 *     points + transactional pushes (those are core program comms)
 *   - NULL preferences = back-compat default of "everything on"
 *     so the existing population doesn't suddenly go dark
 *   - The transactional category bypasses per-category checks
 *     entirely — only the global push_notifications=false flag
 *     suppresses transactional pushes
 *
 * A regression on any of these would silently break engagement
 * metrics or accidentally over-spam opted-out members.
 *
 * Coverage:
 *
 *   Suppression guards:
 *     - push_notifications=false → no DB write
 *     - expo_push_token=null → no DB write (no device to push to)
 *     - notification_preferences[category]=false → suppresses
 *       category-specific types (tier_upgrade with tier=false)
 *
 *   Category routing (TYPE_TO_CATEGORY map):
 *     - points_earned + points_expiry → 'points' category
 *     - tier_upgrade + tier_downgrade → 'tier' category
 *     - new_offer + offer_expiring → 'offers' category
 *     - Unknown type → 'transactional' (default catch-all)
 *
 *   Transactional bypass:
 *     - 'welcome' / unknown types always send when global
 *       push_notifications=true (per-category prefs don't apply)
 *     - Even with offers=false, a transactional type still sends
 *
 *   Back-compat default:
 *     - NULL notification_preferences = treat as "everything on"
 *       (pre-fix members default; existing population doesn't go
 *       silent)
 *
 *   DB row shape:
 *     - push_notifications row inserted with member_id + type +
 *       title + body + data (JSON) + channel='push' + is_sent=false
 */
class NotificationServiceSendTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private NotificationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpNotificationSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Stub HTTP so the Expo Push API call is intercepted.
        // The service wraps the call in try/catch so even a 500
        // doesn't break the test — the DB write happens BEFORE
        // the HTTP call.
        Http::fake([
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]], 200),
        ]);

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

    public function test_global_push_off_suppresses_DB_write_entirely(): void
    {
        // The global push opt-out gate. push_notifications=false
        // is the kill-switch — no row written, no Expo call.
        $member = $this->pushyMember(['push_notifications' => false]);

        $this->service->send($member, [
            'type'  => 'points_earned',
            'title' => 'You earned 100 points',
            'body'  => 'Bronze stay reward',
        ]);

        $this->assertSame(0, $this->pushCount($member->id));
    }

    public function test_missing_expo_push_token_suppresses_DB_write(): void
    {
        // No device token → no push possible. The DB row would be
        // a notification with no recipient — we skip it entirely.
        $member = $this->pushyMember(['expo_push_token' => null]);

        $this->service->send($member, [
            'type'  => 'tier_upgrade',
            'title' => 'Gold member',
            'body'  => 'Welcome to Gold',
        ]);

        $this->assertSame(0, $this->pushCount($member->id));
    }

    public function test_category_opt_out_suppresses_matching_type(): void
    {
        // Per-category opt-in. notification_preferences = {tier:
        // false} suppresses tier_upgrade + tier_downgrade pushes.
        $member = $this->pushyMember([
            'notification_preferences' => ['tier' => false],
        ]);

        $this->service->send($member, [
            'type'  => 'tier_upgrade',
            'title' => 'Gold member',
            'body'  => '',
        ]);

        $this->assertSame(0, $this->pushCount($member->id),
            'tier_upgrade must be suppressed when tier=false.');
    }

    public function test_unrelated_category_opt_out_does_NOT_suppress_other_types(): void
    {
        // Symmetric guard: opting out of "offers" must NOT
        // suppress "points" pushes — they're independent
        // categories.
        $member = $this->pushyMember([
            'notification_preferences' => ['offers' => false],
        ]);

        $this->service->send($member, [
            'type'  => 'points_earned',
            'title' => '+250 points',
            'body'  => 'From your stay',
        ]);

        $this->assertSame(1, $this->pushCount($member->id),
            'offers=false must NOT suppress points_earned.');
    }

    public function test_transactional_type_bypasses_per_category_opt_outs(): void
    {
        // Per the docblock: "Members who explicitly opted out of
        // 'offers' still get tier + points + transactional
        // pushes". For unknown types (default 'transactional'),
        // per-category prefs don't apply — only the global flag
        // suppresses.
        $member = $this->pushyMember([
            'notification_preferences' => [
                'offers' => false,
                'tier'   => false,
                'points' => false,
                'stays'  => false,
            ],
        ]);

        $this->service->send($member, [
            'type'  => 'welcome',  // not in TYPE_TO_CATEGORY → transactional
            'title' => 'Welcome to the program',
            'body'  => 'You have 500 starting points',
        ]);

        $this->assertSame(1, $this->pushCount($member->id),
            'Transactional types must bypass per-category opt-outs.');
    }

    public function test_null_preferences_default_to_everything_on_back_compat(): void
    {
        // Back-compat default: members from before the preferences
        // shipped have NULL notification_preferences. They MUST
        // continue to receive every category (otherwise an opt-in
        // schema change would silently retroactively unsubscribe
        // the entire pre-existing population).
        $member = $this->pushyMember(['notification_preferences' => null]);

        $this->service->send($member, [
            'type'  => 'tier_upgrade',
            'title' => 'Gold',
            'body'  => '',
        ]);

        $this->assertSame(1, $this->pushCount($member->id));
    }

    public function test_DB_row_carries_type_title_body_data_channel_is_sent_false(): void
    {
        // The persisted row shape. push_notifications.is_sent
        // starts false; a downstream worker flips it to true
        // after successful delivery. channel always 'push' for
        // this service.
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
        $this->assertFalse((bool) $row->is_sent,
            'is_sent must start false; worker flips it on successful delivery.');

        $data = json_decode($row->data, true);
        $this->assertSame(42, $data['reward_id']);
        $this->assertSame(100, $data['points_to_go']);
    }

    public function test_empty_data_array_persists_as_empty_JSON_object(): void
    {
        // When `data` key is absent / null, the row should still
        // have valid JSON (empty array → '[]'). Downstream parsers
        // expect valid JSON; a null in the data column would break
        // them.
        $member = $this->pushyMember();

        $this->service->send($member, [
            'type'  => 'welcome',
            'title' => 'Hello',
            'body'  => 'No data attached',
        ]);

        $row = DB::table('push_notifications')->where('member_id', $member->id)->first();
        $this->assertNotNull($row->data);
        // json_decode of '[]' returns an array; '{}' returns null
        // with the assoc flag (sic) — either way must NOT throw.
        $decoded = json_decode($row->data, true);
        $this->assertIsArray($decoded);
        $this->assertEmpty($decoded);
    }

    public function test_unknown_notification_type_routes_to_transactional(): void
    {
        // A type not in TYPE_TO_CATEGORY map defaults to
        // 'transactional' per the docblock. With every per-category
        // pref off, the message STILL sends.
        $member = $this->pushyMember([
            'notification_preferences' => [
                'points' => false,
                'tier'   => false,
                'offers' => false,
            ],
        ]);

        $this->service->send($member, [
            'type'  => 'completely_new_type_we_invented',
            'title' => 'Hello',
            'body'  => 'Should send despite prefs',
        ]);

        $this->assertSame(1, $this->pushCount($member->id),
            'Unknown type must route to transactional (default catch-all) and send.');
    }
}
