<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's two "message these members" sends (HexaTech Loyalty release 4 §5): the members list's bulk message
 * (MemberAdminController::bulkMessage, `POST members/bulk-message`) and a segment's send (SegmentAdminController::send,
 * `POST segments/{id}/send`).
 *
 * The answers were pinned on the code as it was, before release 4 changed it, and are unchanged: `total` is the
 * members named (or the segment's), `push_sent` the members with push switched on and a device token (counted as
 * before, also when the member switched the message's kind off and so got nothing), `skipped` the others (push off, or
 * no device), `email_sent` and `email_skipped` the email's as before.
 *
 * What release 4 changed: the message is kept in the inbox of every member it reaches, app or no app, through
 * NotificationService (send() → keep()), as the workspace's push messages are. Before, only a member with push on and
 * a device got an inbox row. A member who switched the message's kind off still gets nothing, and the push itself
 * still needs push on and a device. Expo is never reached: every request goes to a fake.
 */
class BulkMessageInboxTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CampaignsSchema, PushSchema;

    /** @var array<string, LoyaltyMember> */
    private array $m = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpCampaignsSchema();
        $this->buildPushSchema();
        Mail::fake();
        Http::preventStrayRequests();
        Http::fake(['exp.host/*' => fn (HttpRequest $r) => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket-1']], 200)]);

        $this->ada->update(['expo_push_token' => 'ExponentPushToken[test-ada]', 'marketing_consent' => true]);
        $this->grace->update(['expo_push_token' => null]);
        $this->m = [
            'ada'   => $this->ada,
            'grace' => $this->grace,
            'pia'   => $this->makeMember('Pia', 'pia@example.test', ['push_notifications' => false, 'expo_push_token' => 'ExponentPushToken[test-pia]']),
            'olga'  => $this->makeMember('Olga', 'olga@example.test', ['expo_push_token' => 'ExponentPushToken[test-olga]', 'notification_preferences' => ['offers' => false]]),
        ];
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/' . ltrim($path, '/');
    }

    /** @return array<string, int> inbox rows by member name */
    private function inbox(): array
    {
        $out = [];
        foreach ($this->m as $name => $member) {
            $out[$name] = DB::table('push_notifications')->where('member_id', $member->id)->count();
        }

        return $out;
    }

    /** @return list<string> the device tokens Expo was asked to push to */
    private function pushed(): array
    {
        return Http::recorded(fn (HttpRequest $r) => str_starts_with($r->url(), 'https://exp.host/'))
            ->map(fn ($pair) => (string) ($pair[0]->data()['to'] ?? ''))->values()->all();
    }

    private function bulk(array $body): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->postJson($this->admin('members/bulk-message'), $body + [
            'member_ids' => array_map(fn (LoyaltyMember $m) => $m->id, array_values($this->m)),
            'title'      => 'Autumn weekend',
            'body'       => 'Double points until Sunday.',
        ]);
    }

    // ─── The answers, pinned on the code before release 4 ───────────────────

    public function test_bulk_message_answers_as_before(): void
    {
        $this->bulk(['category' => 'offers', 'send_email' => true])->assertOk()->assertExactJson([
            'total'         => 4,
            'push_sent'     => 2,
            'email_sent'    => 1,
            'skipped'       => 2,
            'email_skipped' => 3,
        ]);
        $this->assertSame(['ExponentPushToken[test-ada]'], $this->pushed(), 'Olga switched offers off: counted, as before, but not pushed.');
        $this->assertSame(1, AuditLog::query()->where('action', 'members_bulk_message')->count());

        $this->bulk([])->assertOk()->assertExactJson([
            'total' => 4, 'push_sent' => 2, 'email_sent' => 0, 'skipped' => 2, 'email_skipped' => 0,
        ]);
    }

    public function test_segment_send_answers_as_before(): void
    {
        $segment = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);

        $this->asManager()->postJson($this->admin("segments/{$segment->id}/send"), ['title' => 'Autumn weekend', 'body' => 'Double points.', 'category' => 'offers', 'send_email' => true])
            ->assertOk()->assertExactJson([
                'total'         => 4,
                'push_sent'     => 2,
                'email_sent'    => 1,
                'skipped'       => 2,
                'email_skipped' => 3,
            ]);
        $this->assertSame(['ExponentPushToken[test-ada]'], $this->pushed());
        $this->assertSame(3, (int) $segment->fresh()->total_sent_count, 'push_sent + email_sent, as before');
        $this->assertSame(1, AuditLog::query()->where('action', 'segment_campaign_sent')->count());

        $empty = $this->makeSegment('Nobody', ['operator' => 'AND', 'filters' => [['type' => 'current_points', 'op' => 'min', 'value' => 999999]]]);
        $this->asManager()->postJson($this->admin("segments/{$empty->id}/send"), ['title' => 'T', 'body' => 'B'])
            ->assertOk()->assertExactJson(['total' => 0, 'push_sent' => 0, 'email_sent' => 0, 'skipped' => 0, 'message' => 'Segment is empty — nothing sent.']);
    }

    // ─── Release 4: the inbox, app or no app ────────────────────────────────

    public function test_bulk_message_keeps_the_message_in_every_inbox_it_reaches_but_not_where_the_kind_is_off(): void
    {
        $this->bulk(['category' => 'offers'])->assertOk()->assertJsonPath('push_sent', 2)->assertJsonPath('skipped', 2);

        $this->assertSame(['ada' => 1, 'grace' => 1, 'pia' => 1, 'olga' => 0], $this->inbox());
        $row = DB::table('push_notifications')->where('member_id', $this->m['grace']->id)->first();
        $this->assertSame('new_offer', $row->type);
        $this->assertSame('Autumn weekend', $row->title);
        $this->assertTrue((bool) $row->is_sent);
        $this->assertSame(['ExponentPushToken[test-ada]'], $this->pushed(), 'the push still needs push on and a device');
    }

    public function test_a_transactional_bulk_message_reaches_every_inbox(): void
    {
        $this->bulk([])->assertOk();

        $this->assertSame(['ada' => 1, 'grace' => 1, 'pia' => 1, 'olga' => 1], $this->inbox());
        $this->assertSame('admin_broadcast', DB::table('push_notifications')->where('member_id', $this->m['pia']->id)->value('type'));
        $this->assertSame(['ExponentPushToken[test-ada]', 'ExponentPushToken[test-olga]'], $this->pushed());
    }

    public function test_segment_send_keeps_the_message_in_every_inbox_it_reaches(): void
    {
        $segment = $this->makeSegment('Everyone', ['operator' => 'AND', 'filters' => []]);

        $this->asManager()->postJson($this->admin("segments/{$segment->id}/send"), ['title' => 'Autumn weekend', 'body' => 'Double points.', 'category' => 'offers'])
            ->assertOk()->assertJsonPath('push_sent', 2)->assertJsonPath('skipped', 2);

        $this->assertSame(['ada' => 1, 'grace' => 1, 'pia' => 1, 'olga' => 0], $this->inbox());
        $data = json_decode((string) DB::table('push_notifications')->where('member_id', $this->m['pia']->id)->value('data'), true);
        $this->assertSame(['source' => 'segment_campaign', 'segment_id' => $segment->id, 'category' => 'offers'], $data);
    }
}
