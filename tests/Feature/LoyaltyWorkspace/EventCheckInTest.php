<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AccessPlace;
use App\Models\AuditLog;
use App\Models\EventAttendance;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Models\Stamp;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Access\AccessVerdict;
use App\Services\Loyalty\Events\EventCheckIn;
use App\Services\Loyalty\Events\EventSignUp;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Checking a member in at an event (release 8, spec 2026-10-25 §4) through EventCheckIn — from the event page by name
 * (`POST events/{id}/check-in`) and as part A's scan calls it: AccessDecision's verdict and nothing of its own, one
 * check-in per member per event (a second answers when they came in), the event's points as a `bonus` line, the visit
 * after the commit (the stamp), one scan log row per attempt, refused ones too, and a key that makes a retry write
 * nothing. The verdicts are AccessDecision's (part A); the tests that refuse hand it the verdict to give.
 */
class EventCheckInTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema, VisitsSchema, CreditSchema, PushSchema, TierCountsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->buildValiditySchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
        $this->buildTierCountsSchema();
    }

    /** AccessDecision answers this verdict, whatever it is asked. */
    private function decides(AccessVerdict $verdict): void
    {
        $this->app->instance(AccessDecision::class, new class($verdict) extends AccessDecision {
            public function __construct(private readonly AccessVerdict $verdict)
            {
            }

            public function decide(LoyaltyMember $member, ?AccessPlace $place = null, ?LoyaltyEvent $event = null): AccessVerdict
            {
                return $this->verdict;
            }
        });
    }

    private function welcome(): AccessVerdict
    {
        return new AccessVerdict(true, AccessVerdict::WELCOME, null, null, ['id' => $this->tiers['silver']->id, 'name' => 'Silver', 'color' => '#9ca3af']);
    }

    /** An event open now (the clock says 09:00): from 08:30 to 12:00 today. */
    private function openEvent(array $more = []): LoyaltyEvent
    {
        return $this->makeEvent($more + ['title' => 'Morning yoga', 'starts_at' => '2026-10-05 08:30:00', 'ends_at' => '2026-10-05 12:00:00', 'points' => 50]);
    }

    private function checkIn(LoyaltyEvent $event, int $memberId, array $more = [], array $headers = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaffMember()->postJson($this->api("events/{$event->id}/check-in"), ['member_id' => $memberId] + $more, $headers);
    }

    public function test_a_signed_up_member_checks_in_once_with_the_events_points_and_a_stamp(): void
    {
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 10], $this->manager);
        $event = $this->openEvent(['sign_up' => true]);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);
        $this->decides($this->welcome());

        $json = $this->checkIn($event, $this->grace->id)->assertOk()->json();
        $attendance = EventAttendance::query()->firstOrFail();
        $row = ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $line = PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();

        $this->assertSame(['granted' => true, 'reason' => 'welcome', 'valid_until' => null, 'expires_in_days' => null, 'tier' => ['id' => $this->tiers['silver']->id, 'name' => 'Silver', 'color' => '#9ca3af'], 'allowed_tiers' => []], $json['verdict']);
        $this->assertSame([true, null, true, 50, (int) $attendance->id, (int) $row->id], [$json['checked_in'], $json['already_in'], $json['signed_up'], $json['points'], $json['attendance_id'], $json['scan_event_id']]);
        $this->assertTrue($json['stamp']['added']);

        $this->assertSame([false, $this->staffMember->id, (int) $row->id, (int) $line->id], [(bool) $attendance->walk_in, (int) $attendance->checked_in_by, (int) $attendance->scan_event_id, (int) $attendance->points_transaction_id]);
        $this->assertSame(['event', $event->id, 'granted', 'welcome', (int) $line->id, $this->staffMember->id], [$row->scan_type, (int) $row->loyalty_event_id, $row->result, $row->action_taken, (int) $row->transaction_id, (int) $row->staff_id]);
        $this->assertSame(['bonus', 50, 0, 'Event: Morning yoga', "event_{$event->id}_{$this->grace->id}", 'loyalty_event_attendance', (int) $attendance->id],
            [$line->type, (int) $line->points, (int) $line->qualifying_points, $line->description, $line->idempotency_key, $line->reference_type, (int) $line->reference_id]);
        $this->assertSame(250, (int) $this->grace->fresh()->current_points);

        $stamp = Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame(['event', 'loyalty_event_attendance', (int) $attendance->id, '2026-10-05'], [$stamp->source, $stamp->reference_type, (int) $stamp->reference_id, $stamp->day()]);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'loyalty.event_check_in')->count());
    }

    public function test_a_second_check_in_says_when_they_came_in_on_the_venues_clock_and_gives_nothing(): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();
        // 09:00 UTC is 12:00 in Riga: an event there from 11:30 to 15:00.
        $event = $this->openEvent(['starts_at' => '2026-10-05 11:30:00', 'ends_at' => '2026-10-05 15:00:00']);
        $this->decides($this->welcome());
        $this->checkIn($event, $this->grace->id)->assertOk()->assertJsonPath('checked_in', true)->assertJsonPath('signed_up', false);

        $this->travel(17)->minutes();
        $again = $this->checkIn($event, $this->grace->id)->assertOk()->json();
        $this->assertSame([true, 'welcome', false, '12:00', false, 0], [$again['verdict']['granted'], $again['verdict']['reason'], $again['checked_in'], $again['already_in'], $again['signed_up'], $again['points']]);
        $this->assertSame(1, EventAttendance::query()->count());
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(['welcome', 'already_in'], ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->orderBy('id')->pluck('action_taken')->all());
        $this->assertTrue((bool) EventAttendance::query()->value('walk_in'), 'not signed up: a walk-in');
    }

    public function test_a_refusal_is_logged_and_gives_nothing(): void
    {
        $event = $this->openEvent(['sign_up' => true, 'walk_ins' => false]);
        $this->decides(new AccessVerdict(false, AccessVerdict::NOT_SIGNED_UP, null, null, ['id' => $this->tiers['silver']->id, 'name' => 'Silver', 'color' => '#9ca3af']));

        $json = $this->checkIn($event, $this->grace->id)->assertOk()->json();
        $this->assertSame([false, 'not_signed_up', false, null, false, 0, null], [$json['verdict']['granted'], $json['verdict']['reason'], $json['checked_in'], $json['already_in'], $json['signed_up'], $json['points'], $json['attendance_id']]);
        $row = ScanEvent::withoutGlobalScopes()->firstOrFail();
        $this->assertSame(['event', 'denied', 'not_signed_up', $event->id, null], [$row->scan_type, $row->result, $row->action_taken, (int) $row->loyalty_event_id, $row->transaction_id]);
        $this->assertSame(0, EventAttendance::query()->count());
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
    }

    public function test_a_member_already_inside_is_let_in_again_when_the_event_filled_but_not_when_they_are_switched_off(): void
    {
        $event = $this->openEvent();
        $this->decides($this->welcome());
        $this->checkIn($event, $this->grace->id)->assertOk();

        $this->decides(new AccessVerdict(false, AccessVerdict::EVENT_FULL, '2027-01-01', null, ['id' => $this->tiers['silver']->id, 'name' => 'Silver', 'color' => '#9ca3af']));
        $this->checkIn($event, $this->grace->id)->assertOk()
            ->assertJsonPath('verdict.granted', true)
            ->assertJsonPath('verdict.reason', 'welcome')
            ->assertJsonPath('verdict.valid_until', '2027-01-01')
            ->assertJsonPath('already_in', '09:00');

        $this->decides(new AccessVerdict(false, AccessVerdict::MEMBER_OFF));
        $this->checkIn($event, $this->grace->id)->assertOk()
            ->assertJsonPath('verdict.granted', false)
            ->assertJsonPath('verdict.reason', 'member_off')
            ->assertJsonPath('checked_in', false)
            ->assertJsonPath('already_in', '09:00');
        $this->assertSame([['granted', 'welcome'], ['granted', 'already_in'], ['denied', 'member_off']],
            ScanEvent::withoutGlobalScopes()->orderBy('id')->get()->map(fn ($r) => [$r->result, $r->action_taken])->all());
    }

    public function test_a_retry_with_its_key_writes_nothing_and_answers_the_first_result(): void
    {
        $event = $this->openEvent();
        $this->decides($this->welcome());
        $first = $this->checkIn($event, $this->grace->id, ['idempotency_key' => 'door-7'])->assertOk()->json();
        $again = $this->checkIn($event, $this->grace->id, ['idempotency_key' => 'door-7'])->assertOk()->json();
        $header = $this->checkIn($event, $this->grace->id, [], ['Idempotency-Key' => 'door-7'])->assertOk()->json();

        $first['stamp'] = null;
        $this->assertSame($first, $again);
        $this->assertSame($first, $header);
        $this->assertSame(1, ScanEvent::withoutGlobalScopes()->count());
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());

        // A refused attempt sent again is refused again, from its own row.
        $this->decides(new AccessVerdict(false, AccessVerdict::EXPIRED, '2026-10-01'));
        $denied = $this->checkIn($event, $this->ada->id, ['idempotency_key' => 'door-8'])->assertOk()->json();
        $this->decides($this->welcome());
        $this->assertSame($denied['verdict']['reason'], $this->checkIn($event, $this->ada->id, ['idempotency_key' => 'door-8'])->json('verdict.reason'));
        $this->assertSame(0, EventAttendance::query()->where('member_id', $this->ada->id)->count());
        // The same key for another member is that member's own attempt.
        $this->checkIn($event, $this->ada->id, ['idempotency_key' => 'door-7'])->assertOk()->assertJsonPath('checked_in', true);
    }

    public function test_an_event_that_counts_no_visit_and_gives_no_points_writes_only_the_check_in(): void
    {
        $this->saveOptionsOn('2026-09-01', $this->org->id, ['stamps_enabled' => true], $this->manager);
        $event = $this->openEvent(['points' => 0, 'counts_as_visit' => false]);
        $this->decides($this->welcome());

        $this->checkIn($event, $this->grace->id)->assertOk()->assertJsonPath('checked_in', true)->assertJsonPath('points', 0)->assertJsonPath('stamp', null);
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(0, Stamp::withoutGlobalScopes()->count());
        $this->assertNull(EventAttendance::query()->value('points_transaction_id'));
    }

    public function test_the_scan_hands_over_its_own_row_and_it_is_filled_in(): void
    {
        $event = $this->openEvent();
        $this->decides($this->welcome());
        $scan = (new ScanEvent())->forceFill(['organization_id' => $this->org->id, 'staff_id' => $this->staffMember->id, 'scan_type' => 'qr', 'token_value' => 'the code read', 'result' => 'success', 'action_taken' => 'none']);
        $scan->save();

        $answer = app(EventCheckIn::class)->checkIn($event, $this->grace, $this->staffMember, 'scan-1', (int) $scan->id);

        $this->assertSame((int) $scan->id, $answer['scan_event_id']);
        $this->assertSame(1, ScanEvent::withoutGlobalScopes()->count());
        $scan->refresh();
        $this->assertSame(['event', 'granted', 'welcome', $event->id, $this->grace->id, 'the code read'], [$scan->scan_type, $scan->result, $scan->action_taken, (int) $scan->loyalty_event_id, (int) $scan->member_id, $scan->token_value]);
        // Called with the four arguments the scan uses, it logs its own row.
        $this->assertTrue(app(EventCheckIn::class)->checkIn($event, $this->ada, $this->staffMember)['checked_in']);
        $this->assertSame(2, ScanEvent::withoutGlobalScopes()->count());
    }

    public function test_every_staff_member_checks_in_by_name_and_only_this_organisations_members(): void
    {
        $event = $this->openEvent();
        $plain = $this->staffUser($this->org, ['role' => 'staff']);
        $this->decides($this->welcome());

        $this->actingAs($plain, 'sanctum')->postJson($this->api("events/{$event->id}/check-in"), ['member_id' => $this->grace->id])->assertOk()->assertJsonPath('checked_in', true);
        $other = $this->otherOrganization();
        $this->checkIn($event, $other['member']->id)->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        $this->asStaffMember()->postJson($this->api('events/999999/check-in'), ['member_id' => $this->grace->id])->assertNotFound();
    }

    public function test_with_access_decision_itself_a_member_is_welcomed_at_an_open_event_for_everyone(): void
    {
        // No verdict handed in: AccessDecision decides (part A's rules; a member on, an event open now, for everyone).
        $event = $this->openEvent();
        $this->checkIn($event, $this->grace->id)->assertOk()
            ->assertJsonPath('verdict.granted', true)
            ->assertJsonPath('verdict.reason', 'welcome')
            ->assertJsonPath('checked_in', true)
            ->assertJsonPath('points', 50);
    }
}
