<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AccessPlace;
use App\Models\BenefitDefinition;
use App\Models\LoyaltyEvent;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use App\Models\TierBenefit;
use App\Services\Loyalty\Access\AccessPlaces;
use App\Services\Loyalty\Access\AccessVerdict;
use App\Services\Loyalty\Access\ScanReplay;
use App\Services\Loyalty\Events\EventCheckIn;
use App\Support\SharedCache;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The scan with a context (release 8, spec 2026-10-25 §1): `POST scan` with a place decides the member a code names —
 * whatever their state — and writes the entry; with an event it hands the member to EventCheckIn; without either it is
 * the desk's scan as before. A retry with its key answers the first answer and writes nothing.
 */
class ScanAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema;

    private AccessPlace $door;
    private AccessPlace $lounge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildValiditySchema();
        $this->buildAccessSchema();
        $this->buildEventsSchema();

        $places = app(AccessPlaces::class);
        $this->door = $places->create($this->org->id, ['name' => 'Main entrance', 'admits' => 'all'], $this->manager);
        $this->lounge = $places->create($this->org->id, ['name' => 'VIP lounge', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id, $this->tiers['platinum']->id]], $this->manager);
    }

    /** @param array<string, mixed> $body */
    private function scan(array $body, array $headers = []): TestResponse
    {
        return $this->asStaffMember()->postJson($this->api('scan'), $body, $headers);
    }

    private function lastRow(): ScanEvent
    {
        return ScanEvent::query()->latest('id')->first();
    }

    // ─── At a place ──────────────────────────────────────────────────────

    public function test_a_member_let_in_gets_the_verdict_their_benefits_and_an_entry(): void
    {
        $late = BenefitDefinition::create(['name' => 'Late checkout', 'code' => 'LATE', 'category' => 'accommodation', 'is_active' => true]);
        $off = BenefitDefinition::create(['name' => 'Old perk', 'code' => 'OLD', 'category' => 'other', 'is_active' => false]);
        $drink = BenefitDefinition::create(['name' => 'Welcome drink', 'code' => 'DRINK', 'category' => 'dining', 'is_active' => true]);
        TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $late->id, 'value' => 'Until 2 pm', 'is_active' => true]);
        TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $off->id, 'is_active' => true]);
        TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $drink->id, 'is_active' => false]);
        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['membership_valid_until' => '2026-10-10']);

        $response = $this->scan(['code' => $this->ada->member_number, 'place_id' => $this->lounge->id])->assertOk();

        $row = $this->lastRow();
        $this->assertSame(
            ['access', $this->lounge->id, $this->ada->id, $this->staffMember->id, 'granted', 'welcome', null, null],
            [$row->scan_type, (int) $row->access_place_id, (int) $row->member_id, (int) $row->staff_id, $row->result, $row->action_taken, $row->token_value, $row->loyalty_event_id],
        );
        $response->assertJsonPath('member.id', $this->ada->id)->assertJsonPath('member.name', 'Ada Lovelace');
        $this->assertSame([
            'granted'         => true,
            'reason'          => 'welcome',
            'valid_until'     => '2026-10-10',
            'expires_in_days' => 5,
            'tier'            => ['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'color' => '#d4a017'],
            'allowed_tiers'   => [],
            'place'           => ['id' => $this->lounge->id, 'name' => 'VIP lounge'],
            'entry_id'        => (int) $row->id,
        ], $response->json('verdict'));
        $this->assertSame([['name' => 'Late checkout', 'value' => 'Until 2 pm', 'category' => 'accommodation']], $response->json('benefits'));
        $this->assertNotNull($this->ada->fresh()->last_activity_at);
    }

    public function test_a_switched_off_member_is_shown_with_a_red_verdict_not_refused(): void
    {
        NfcCard::create(['member_id' => $this->grace->id, 'uid' => '04a2b3c4d5', 'is_active' => true]);
        $this->grace->update(['is_active' => false]);

        $this->scan(['code' => '04:A2:B3:C4:D5', 'place_id' => $this->door->id])->assertOk()
            ->assertJsonPath('member.id', $this->grace->id)->assertJsonPath('member.is_active', false)
            ->assertJsonPath('verdict.granted', false)->assertJsonPath('verdict.reason', AccessVerdict::MEMBER_OFF);
        $this->assertSame(['denied', 'member_off', $this->grace->id], [$this->lastRow()->result, $this->lastRow()->action_taken, (int) $this->lastRow()->member_id]);
        $this->assertNull($this->grace->fresh()->last_activity_at);

        // The desk's scan still refuses them, as before.
        $this->scan(['code' => $this->grace->member_number])->assertStatus(404)->assertJsonPath('error', 'inactive');
    }

    public function test_the_wrong_tier_is_refused_with_the_tiers_let_in(): void
    {
        $this->scan(['code' => $this->grace->member_number, 'place_id' => $this->lounge->id])->assertOk()
            ->assertJsonPath('verdict.granted', false)->assertJsonPath('verdict.reason', 'tier_not_allowed')
            ->assertJsonPath('verdict.allowed_tiers', ['Gold', 'Platinum'])->assertJsonPath('verdict.tier.name', 'Silver')
            ->assertJsonPath('benefits', []);
        $this->assertSame('tier_not_allowed', $this->lastRow()->action_taken);
    }

    public function test_a_code_naming_nobody_keeps_its_refusal_and_is_logged_without_the_code(): void
    {
        $this->scan(['code' => 'NOPE-123', 'place_id' => $this->door->id])->assertStatus(404)->assertExactJson(['error' => 'not_found', 'message' => 'No member for this code.']);
        $row = $this->lastRow();
        $this->assertSame(['access', 'denied', 'not_found', null, null, $this->door->id], [$row->scan_type, $row->result, $row->action_taken, $row->member_id, $row->token_value, (int) $row->access_place_id]);

        $token = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('a', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1]);
        $this->scan(['code' => $token->token, 'place_id' => $this->door->id])->assertOk()->assertJsonPath('verdict.granted', true);
        $this->scan(['code' => $token->token, 'place_id' => $this->door->id])->assertStatus(404)->assertJsonPath('error', 'used_up');
        $this->assertSame(['denied', 'used_up', null, null], [$this->lastRow()->result, $this->lastRow()->action_taken, $this->lastRow()->member_id, $this->lastRow()->token_value]);

        // A switched-off card: its holder may not be the member, so it is the card that is refused, as at the desk.
        NfcCard::create(['member_id' => $this->ada->id, 'uid' => '04a2b3c4d5', 'is_active' => false]);
        $this->scan(['code' => '04a2b3c4d5', 'place_id' => $this->door->id])->assertStatus(404)->assertJsonPath('error', 'inactive')->assertJsonPath('card', 'off');
        $this->assertSame(['denied', 'inactive'], [$this->lastRow()->result, $this->lastRow()->action_taken]);
        $this->assertSame(0, ScanEvent::query()->whereNotNull('token_value')->count());
    }

    public function test_the_place_must_be_this_organisations_and_one_context_at_a_time(): void
    {
        $other = $this->otherOrganization();
        $theirs = DB::table('access_places')->insertGetId(['organization_id' => $other['org']->id, 'name' => 'Their door', 'admits' => 'all', 'created_at' => now(), 'updated_at' => now()]);

        $this->scan(['code' => $this->ada->member_number, 'place_id' => $theirs])->assertNotFound()->assertJsonPath('error', 'not_found')->assertJsonPath('gone', 'place');
        $this->scan(['code' => $this->ada->member_number, 'place_id' => $this->door->id, 'event_id' => 5])->assertStatus(422)->assertJsonValidationErrors(['place_id']);
        $this->scan(['code' => $this->ada->member_number, 'place_id' => 'door'])->assertStatus(422);
        $this->assertSame(0, ScanEvent::query()->count());
        // Another organisation's member at our door reads as nobody.
        $this->scan(['code' => $other['member']->member_number, 'place_id' => $this->door->id])->assertNotFound()->assertJsonPath('error', 'not_found');
    }

    public function test_a_retry_with_its_key_answers_the_first_answer_and_writes_no_second_entry(): void
    {
        $token = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('b', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1]);
        $body = ['code' => $token->token, 'place_id' => $this->door->id, 'idempotency_key' => 'door-scan-1'];

        $first = $this->scan($body)->assertOk()->json();
        // The one-use code is not read a second time: the retry is the first scan's answer, not "used up".
        $this->assertSame($first, $this->scan($body)->assertOk()->json());
        $this->assertSame(1, ScanEvent::query()->count());

        $this->scan(['place_id' => $this->lounge->id] + $body)->assertStatus(409)->assertJsonPath('error', 'key_reused');

        $this->scan(['code' => 'NOPE-1', 'place_id' => $this->door->id], ['Idempotency-Key' => 'door-scan-2'])->assertNotFound();
        $this->scan(['code' => 'NOPE-1', 'place_id' => $this->door->id], ['Idempotency-Key' => 'door-scan-2'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->assertSame(2, ScanEvent::query()->count());

        // Without a key every scan is an entry.
        $this->scan(['code' => $this->ada->member_number, 'place_id' => $this->door->id])->assertOk();
        $this->scan(['code' => $this->ada->member_number, 'place_id' => $this->door->id])->assertOk();
        $this->assertSame(4, ScanEvent::query()->count());
    }

    public function test_keys_are_kept_per_organisation(): void
    {
        $this->scan(['code' => $this->ada->member_number, 'place_id' => $this->door->id, 'idempotency_key' => 'same-key'])->assertOk();

        $other = $this->otherOrganization();
        app()->instance('current_organization_id', $other['org']->id);
        $theirDoor = app(AccessPlaces::class)->create($other['org']->id, ['name' => 'Their door', 'admits' => 'all'], $this->manager);
        $theirStaff = $this->staffUser($other['org'], ['role' => 'staff']);
        app()->instance('current_organization_id', $this->org->id);

        $this->actingAs($theirStaff, 'sanctum')->postJson($this->api('scan'), ['code' => $other['member']->member_number, 'place_id' => $theirDoor->id, 'idempotency_key' => 'same-key'])
            ->assertOk()->assertJsonPath('member.id', $other['member']->id);
    }

    public function test_the_desk_scan_is_as_before_and_writes_no_access_entry(): void
    {
        $this->scan(['code' => $this->ada->member_number])->assertOk()->assertExactJson(['member' => $this->scan(['code' => $this->ada->member_number])->json('member')]);
        $row = $this->lastRow();
        $this->assertSame(['manual', 'success', 'verify', null], [$row->scan_type, $row->result, $row->action_taken, $row->access_place_id]);
        $this->assertSame($this->ada->member_number, $row->token_value);
    }

    // ─── At an event ─────────────────────────────────────────────────────

    /** Open now (09:00 on the venue's clock), with no points and no visit: the check-in itself is part E's to test. */
    private function event(): LoyaltyEvent
    {
        $event = (new LoyaltyEvent())->forceFill([
            'organization_id' => $this->org->id, 'title' => 'Autumn tasting', 'starts_at' => '2026-10-05 10:00:00',
            'ends_at' => '2026-10-05 12:00:00', 'status' => LoyaltyEvent::PUBLISHED, 'points' => 0, 'counts_as_visit' => false,
        ]);
        $event->save();

        return $event;
    }

    public function test_a_member_at_an_event_is_checked_in_by_the_check_in_and_its_answer_passed_on(): void
    {
        $event = $this->event();
        $body = ['code' => $this->ada->member_number, 'event_id' => $event->id, 'idempotency_key' => 'event-scan-1'];

        $response = $this->scan($body)->assertOk();
        $row = $this->lastRow();
        $this->assertSame([EventCheckIn::SCAN_TYPE, $event->id, $this->ada->id], [$row->scan_type, (int) $row->loyalty_event_id, (int) $row->member_id]);
        $response->assertJsonPath('member.id', $this->ada->id)
            ->assertJsonPath('verdict.granted', true)->assertJsonPath('verdict.reason', 'welcome')->assertJsonPath('verdict.tier.name', 'Gold')
            ->assertJsonPath('verdict.event', ['id' => $event->id, 'title' => 'Autumn tasting'])->assertJsonPath('verdict.entry_id', (int) $row->id)
            ->assertJsonPath('checked_in', true)->assertJsonPath('already_in', null)->assertJsonPath('signed_up', false)
            ->assertJsonPath('points', 0)->assertJsonPath('benefits', []);

        // A retry answers the first answer and checks no one in again.
        $this->assertSame($response->json(), $this->scan($body)->assertOk()->json());
        $this->assertSame(1, ScanEvent::query()->count());
        $this->assertSame(1, DB::table('loyalty_event_attendances')->where('loyalty_event_id', $event->id)->count());

        // Scanned again later: already in.
        $this->scan(['code' => $this->ada->member_number, 'event_id' => $event->id])->assertOk()
            ->assertJsonPath('checked_in', false)->assertJsonPath('verdict.granted', true);
        $this->assertNotNull($this->scan(['code' => $this->ada->member_number, 'event_id' => $event->id])->json('already_in'));
    }

    public function test_a_keyed_scan_at_an_event_waits_for_the_copy_before_it_and_reads_a_one_use_code_once(): void
    {
        $event = $this->event();
        $token = QrToken::create(['member_id' => $this->ada->id, 'token' => str_repeat('e', 64), 'signature' => 'x', 'issued_at' => now(), 'expires_at' => now()->addMinutes(30), 'max_uses' => 1]);
        $body = ['code' => $token->token, 'event_id' => $event->id, 'idempotency_key' => 'event-scan-2'];
        config(['loyalty.scan_lock_wait' => 0]);

        // The first copy holds the key's lock: the second does not read the code, write, or check anyone in.
        $held = SharedCache::store()->lock((string) ScanReplay::for($this->org->id, 'event-scan-2', [])->lockKey(), 30);
        $this->assertTrue($held->get());
        $this->scan($body)->assertStatus(409)->assertJsonPath('error', 'in_progress');
        $this->assertSame([0, 0, 0], [ScanEvent::query()->count(), DB::table('loyalty_event_attendances')->count(), (int) $token->fresh()->use_count]);
        $held->release();

        // Once it is done, a copy answers its answer: the member checked in, not "used up".
        $first = $this->scan($body)->assertOk()->assertJsonPath('checked_in', true)->json();
        $this->assertSame($first, $this->scan($body)->assertOk()->json());
        $this->assertSame([1, 1, 1], [ScanEvent::query()->count(), DB::table('loyalty_event_attendances')->count(), (int) $token->fresh()->use_count]);
        // The lock was given back each time.
        $this->assertTrue(SharedCache::store()->lock((string) ScanReplay::for($this->org->id, 'event-scan-2', [])->lockKey(), 30)->get());
    }

    public function test_a_kept_success_is_never_replaced_by_a_refusal(): void
    {
        // Two copies of one scan that both ran (a lock outlived): the one that let the member in stands.
        $replay = ScanReplay::for($this->org->id, 'race-1', ['code' => 'x', 'event_id' => 1]);
        $replay->keep(200, ['checked_in' => true]);
        $replay->keep(404, ['error' => 'used_up']);
        $this->assertSame(['status' => 200, 'body' => ['checked_in' => true]], $replay->seen());

        // A refusal kept first gives way to a success, and a second refusal changes nothing.
        $other = ScanReplay::for($this->org->id, 'race-2', ['code' => 'x', 'event_id' => 1]);
        $other->keep(404, ['error' => 'not_found']);
        $other->keep(404, ['error' => 'used_up']);
        $this->assertSame(['status' => 404, 'body' => ['error' => 'not_found']], $other->seen());
        $other->keep(200, ['checked_in' => true]);
        $this->assertSame(200, $other->seen()['status']);
    }

    public function test_a_switched_off_member_at_an_event_is_shown_and_refused(): void
    {
        $event = $this->event();
        $this->grace->update(['is_active' => false]);

        $this->scan(['code' => $this->grace->member_number, 'event_id' => $event->id])->assertOk()
            ->assertJsonPath('member.id', $this->grace->id)->assertJsonPath('verdict.granted', false)
            ->assertJsonPath('verdict.reason', AccessVerdict::MEMBER_OFF)->assertJsonPath('checked_in', false);
        $this->assertSame(0, DB::table('loyalty_event_attendances')->count());
    }

    public function test_a_code_naming_nobody_at_an_event_is_refused_and_logged_on_the_event(): void
    {
        $event = $this->event();

        $this->scan(['code' => 'NOPE-123', 'event_id' => $event->id])->assertNotFound()->assertJsonPath('error', 'not_found');
        $row = $this->lastRow();
        $this->assertSame([EventCheckIn::SCAN_TYPE, 'denied', 'not_found', null, $event->id, null, null], [$row->scan_type, $row->result, $row->action_taken, $row->member_id, (int) $row->loyalty_event_id, $row->access_place_id, $row->token_value]);
        $this->assertSame(0, DB::table('loyalty_event_attendances')->count());

        $other = $this->otherOrganization();
        $theirs = DB::table('loyalty_events')->insertGetId(['organization_id' => $other['org']->id, 'title' => 'Theirs', 'starts_at' => '2026-10-05 10:00:00', 'ends_at' => '2026-10-05 12:00:00', 'status' => 'published', 'created_at' => now(), 'updated_at' => now()]);
        $this->scan(['code' => $this->ada->member_number, 'event_id' => $theirs])->assertNotFound()->assertJsonPath('error', 'not_found')->assertJsonPath('gone', 'event');
    }
}
