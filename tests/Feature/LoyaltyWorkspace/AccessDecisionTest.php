<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AccessPlace;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\Access\AccessDecision;
use App\Services\Loyalty\Access\AccessPlaces;
use App\Services\Loyalty\Access\AccessVerdict;
use App\Services\Loyalty\Events\EventClock;
use App\Services\Loyalty\Members\MemberErasure;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Who gets in (release 8, spec 2026-10-25 §1): AccessDecision's table, row by row and in its order — deleted, switched
 * off, expired, the place off, the tier, then an event's window, capacity and sign-up — and what every verdict carries.
 * The clock is Monday 5 October 2026, 09:00 UTC.
 */
class AccessDecisionTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildValiditySchema();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
    }

    private function decide(LoyaltyMember $member, ?AccessPlace $place = null, ?LoyaltyEvent $event = null): AccessVerdict
    {
        return app(AccessDecision::class)->decide($member->fresh(), $place?->fresh(), $event?->fresh());
    }

    /** @param list<string> $tiers names of the tiers it admits; none: every member */
    private function place(string $name, array $tiers = [], bool $active = true): AccessPlace
    {
        return app(AccessPlaces::class)->create($this->org->id, [
            'name'      => $name,
            'admits'    => $tiers === [] ? AccessPlace::ADMITS_ALL : AccessPlace::ADMITS_TIERS,
            'tier_ids'  => array_map(fn (string $t) => $this->tiers[$t]->id, $tiers),
            'is_active' => $active,
        ], $this->manager);
    }

    /** @param array<string, mixed> $columns */
    private function event(array $columns = [], array $tiers = []): LoyaltyEvent
    {
        $event = (new LoyaltyEvent())->forceFill($columns + [
            'organization_id' => $this->org->id,
            'title'           => 'Autumn tasting',
            'starts_at'       => '2026-10-05 10:00:00',
            'ends_at'         => '2026-10-05 12:00:00',
            'admits'          => $tiers === [] ? 'all' : 'tiers',
            'status'          => LoyaltyEvent::PUBLISHED,
        ]);
        $event->save();
        foreach ($tiers as $tier) {
            DB::table('loyalty_event_tiers')->insert(['loyalty_event_id' => $event->id, 'tier_id' => $this->tiers[$tier]->id]);
        }

        return $event;
    }

    private function validUntil(LoyaltyMember $member, ?string $day): void
    {
        DB::table('loyalty_members')->where('id', $member->id)->update(['membership_valid_until' => $day]);
    }

    private function onVenueClock(string $zone): void
    {
        $this->org->forceFill(['timezone' => $zone])->save();
        app()->forgetScopedInstances();
    }

    // ─── What every verdict carries ───────────────────────────────────────

    public function test_a_member_at_an_every_member_place_is_welcome_with_their_tier_and_no_end_date(): void
    {
        $verdict = $this->decide($this->ada, $this->place('Main entrance'));

        $this->assertSame([
            'granted'         => true,
            'reason'          => 'welcome',
            'valid_until'     => null,
            'expires_in_days' => null,
            'tier'            => ['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'color' => '#d4a017'],
            'allowed_tiers'   => [],
        ], $verdict->toArray());
    }

    // ─── 1. Deleted ──────────────────────────────────────────────────────

    public function test_a_member_deleted_by_staff_or_by_themselves_is_refused_before_anything_else(): void
    {
        $place = $this->place('Main entrance');
        DB::table('users')->where('id', $this->ada->user_id)->update(['email' => MemberErasure::stubEmail($this->ada->id)]);
        $this->ada->update(['is_active' => false]);
        $this->validUntil($this->ada, '2026-01-01');
        $this->assertSame('member_erased', $this->decide($this->ada, $place)->reason);

        DB::table('users')->where('id', $this->grace->user_id)->update(['email' => MemberErasure::selfDeletedEmail($this->grace->user_id)]);
        $verdict = $this->decide($this->grace, $place);
        $this->assertFalse($verdict->granted);
        $this->assertSame('member_erased', $verdict->reason);
    }

    // ─── 2. Switched off ─────────────────────────────────────────────────

    public function test_a_switched_off_member_is_refused_even_where_every_member_may_enter(): void
    {
        $this->grace->update(['is_active' => false]);
        $this->validUntil($this->grace, '2026-01-01');

        $verdict = $this->decide($this->grace, $this->place('Main entrance', [], false));
        $this->assertFalse($verdict->granted);
        $this->assertSame('member_off', $verdict->reason);
        $this->assertSame('Silver', $verdict->tier['name']);
    }

    // ─── 3. Expired ──────────────────────────────────────────────────────

    public function test_the_last_day_still_lets_in_and_the_day_after_is_expired(): void
    {
        $place = $this->place('Main entrance', [], false);
        $open = $this->place('Lounge');

        $this->validUntil($this->ada, '2026-10-05');
        $verdict = $this->decide($this->ada, $open);
        $this->assertTrue($verdict->granted);
        $this->assertSame(['2026-10-05', 0], [$verdict->validUntil, $verdict->expiresInDays]);

        $this->validUntil($this->ada, '2026-10-04');
        $verdict = $this->decide($this->ada, $place);
        $this->assertSame(['expired', false, '2026-10-04', null], [$verdict->reason, $verdict->granted, $verdict->validUntil, $verdict->expiresInDays]);
    }

    public function test_the_days_left_are_said_only_within_two_weeks(): void
    {
        $place = $this->place('Main entrance');

        $this->validUntil($this->ada, '2026-10-19');
        $this->assertSame(14, $this->decide($this->ada, $place)->expiresInDays);
        $this->validUntil($this->ada, '2026-10-20');
        $this->assertNull($this->decide($this->ada, $place)->expiresInDays);
        $this->assertSame('2026-10-20', $this->decide($this->ada, $place)->validUntil);
    }

    public function test_expiry_follows_the_venues_day_not_utcs(): void
    {
        // 22:00 UTC on 5 October is already 01:00 on the 6th in Riga.
        $this->travelTo(CarbonImmutable::parse('2026-10-05 22:00:00'));
        $place = $this->place('Main entrance');
        $this->validUntil($this->ada, '2026-10-05');
        $this->assertTrue($this->decide($this->ada, $place)->granted);

        $this->onVenueClock('Europe/Riga');
        $this->assertSame('expired', $this->decide($this->ada, $place)->reason);
    }

    public function test_at_an_event_the_membership_is_judged_on_the_day_it_begins_as_its_sign_up_is(): void
    {
        // A night from 22:00 on the 5th to 02:00 on the 6th; Ada's membership ends on the 5th.
        $event = $this->event(['starts_at' => '2026-10-05 22:00:00', 'ends_at' => '2026-10-06 02:00:00', 'sign_up' => true, 'walk_ins' => true]);
        $this->validUntil($this->ada, '2026-10-05');
        $this->travelTo(CarbonImmutable::parse('2026-10-05 21:30:00'));
        $this->assertNull(\App\Services\Loyalty\Events\EventSignUp::refusal($event->fresh(), $this->ada->fresh()));
        $this->assertTrue($this->decide($this->ada, null, $event)->granted);
        // After midnight the door says the same (it used to say "expired", even to a member already inside).
        $this->travelTo(CarbonImmutable::parse('2026-10-06 00:30:00'));
        $this->assertSame('welcome', $this->decide($this->ada, null, $event)->reason);
        // A place judges the venue's today: the 6th is past her end.
        $this->assertSame('expired', $this->decide($this->ada, $this->place('Main entrance'))->reason);

        // An event that begins after her last day refuses at sign-up and at the door alike.
        $later = $this->event(['starts_at' => '2026-10-07 18:00:00', 'ends_at' => '2026-10-07 20:00:00', 'sign_up' => true, 'walk_ins' => true]);
        $this->travelTo(CarbonImmutable::parse('2026-10-07 17:00:00'));
        $this->assertSame('membership_expired', \App\Services\Loyalty\Events\EventSignUp::refusal($later->fresh(), $this->ada->fresh())?->errorCode);
        $this->assertSame('expired', $this->decide($this->ada, null, $later)->reason);
    }

    // ─── 4. The place switched off ───────────────────────────────────────

    public function test_a_switched_off_place_lets_nobody_in(): void
    {
        $verdict = $this->decide($this->ada, $this->place('Spa', ['gold'], false));
        $this->assertSame(['place_off', false], [$verdict->reason, $verdict->granted]);
    }

    // ─── 5. The tier ─────────────────────────────────────────────────────

    public function test_a_place_for_chosen_tiers_names_them_in_the_ladders_order_when_it_refuses(): void
    {
        $place = $this->place('VIP lounge', ['platinum', 'gold']);

        $verdict = $this->decide($this->grace, $place);
        $this->assertSame(['tier_not_allowed', false, ['Gold', 'Platinum']], [$verdict->reason, $verdict->granted, $verdict->allowedTiers]);
        $this->assertSame('Silver', $verdict->tier['name']);

        $this->assertTrue($this->decide($this->ada, $place)->granted);
        $this->assertSame([], $this->decide($this->ada, $place)->allowedTiers);
    }

    public function test_a_tier_change_changes_the_answer_at_once(): void
    {
        $place = $this->place('VIP lounge', ['gold']);
        $grace = $this->grace->fresh(['tier']);
        $this->assertSame('tier_not_allowed', app(AccessDecision::class)->decide($grace, $place)->reason);

        // The same model, its tier changed since its relation was read.
        $grace->tier_id = $this->tiers['gold']->id;
        $verdict = app(AccessDecision::class)->decide($grace, $place);
        $this->assertTrue($verdict->granted);
        $this->assertSame('Gold', $verdict->tier['name']);

        // And back: the member row is what counts, not a relation read before.
        $grace->tier_id = $this->tiers['silver']->id;
        $this->assertSame('tier_not_allowed', app(AccessDecision::class)->decide($grace, $place)->reason);
    }

    public function test_the_answer_is_the_same_without_a_bound_organisation(): void
    {
        // A job or a command binds no tenant: the tiers are read under the member's own organisation.
        $place = $this->place('VIP lounge', ['gold', 'platinum']);
        $event = $this->event([], ['gold']);
        $ada = $this->ada->fresh();
        $grace = $this->grace->fresh();
        $place = $place->fresh();
        $event = $event->fresh();
        app()->forgetInstance('current_organization_id');

        $verdict = app(AccessDecision::class)->decide($ada, $place);
        $this->assertSame([true, 'Gold'], [$verdict->granted, $verdict->tier['name']]);
        $this->assertSame(['Gold', 'Platinum'], app(AccessDecision::class)->decide($grace, $place)->allowedTiers);
        $this->assertTrue(app(AccessDecision::class)->decide($ada, null, $event)->granted);
        app()->instance('current_organization_id', $this->org->id);
    }

    // ─── 6. An event ─────────────────────────────────────────────────────

    public function test_an_event_is_open_from_two_hours_before_its_start_until_its_end_only_when_published(): void
    {
        // Now is 09:00 on the venue's clock (UTC).
        $this->assertTrue($this->decide($this->ada, null, $this->event(['starts_at' => '2026-10-05 11:00:00', 'ends_at' => '2026-10-05 13:00:00']))->granted);
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $this->event(['starts_at' => '2026-10-05 11:01:00', 'ends_at' => '2026-10-05 13:00:00']))->reason);
        $this->assertTrue($this->decide($this->ada, null, $this->event(['starts_at' => '2026-10-05 07:00:00', 'ends_at' => '2026-10-05 09:01:00']))->granted);
        // The end's own minute is closed: the event has ended.
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $this->event(['starts_at' => '2026-10-05 07:00:00', 'ends_at' => '2026-10-05 09:00:00']))->reason);
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $this->event(['starts_at' => '2026-10-05 07:00:00', 'ends_at' => '2026-10-05 08:59:00']))->reason);

        $this->assertSame('event_not_open', $this->decide($this->ada, null, $this->event(['status' => LoyaltyEvent::DRAFT]))->reason);
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $this->event(['status' => LoyaltyEvent::CANCELLED]))->reason);
    }

    public function test_an_events_window_is_the_venues_wall_clock_never_converted(): void
    {
        // 09:00 UTC is 12:00 in Riga: an event written 14:00–16:00 opens at 12:00 there; read as UTC it would be shut.
        $this->onVenueClock('Europe/Riga');
        $event = $this->event(['starts_at' => '2026-10-05 14:00:00', 'ends_at' => '2026-10-05 16:00:00']);
        $this->assertTrue($this->decide($this->ada, null, $event)->granted);

        // Written 08:00–11:00 it ended an hour ago in Riga, though UTC's 09:00 falls inside it.
        $early = $this->event(['starts_at' => '2026-10-05 08:00:00', 'ends_at' => '2026-10-05 11:00:00']);
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $early)->reason);

        $this->assertTrue(AccessDecision::isOpen($event, '2026-10-05T12:00'));
        $this->assertFalse(AccessDecision::isOpen($event, '2026-10-05T11:59'));
        $this->assertTrue(AccessDecision::isOpen($event, '2026-10-05T15:59'));
        $this->assertFalse(AccessDecision::isOpen($event, '2026-10-05T16:00'));
        $this->assertFalse(AccessDecision::isOpen($event, '2026-10-05T16:01'));
    }

    public function test_the_door_shuts_when_every_screen_says_the_event_has_ended(): void
    {
        // An event ending at 21:00: at 20:59:59 it is on and lets a walk-in in; at 21:00:00 and 21:00:40 it has ended
        // (EventClock, to the second) and the door says so too.
        $event = $this->event(['starts_at' => '2026-10-05 19:00:00', 'ends_at' => '2026-10-05 21:00:00']);
        foreach (['20:59:00' => true, '20:59:59' => true, '21:00:00' => false, '21:00:40' => false] as $at => $open) {
            $this->travelTo(CarbonImmutable::parse("2026-10-05 {$at}"));
            $this->assertSame(!$open, EventClock::hasEnded($event->fresh()), $at);
            $verdict = $this->decide($this->grace, null, $event);
            $this->assertSame($open ? 'welcome' : 'event_not_open', $verdict->reason, $at);
        }
    }

    public function test_the_member_checks_come_before_the_events_and_an_events_tiers_are_checked(): void
    {
        $shut = $this->event(['status' => LoyaltyEvent::DRAFT], ['gold']);
        $this->grace->update(['is_active' => false]);
        $this->assertSame('member_off', $this->decide($this->grace, null, $shut)->reason);
        $this->grace->update(['is_active' => true]);
        $this->assertSame('tier_not_allowed', $this->decide($this->grace, null, $shut)->reason);
        $this->assertSame(['Gold'], $this->decide($this->grace, null, $shut)->allowedTiers);
        $this->assertSame('event_not_open', $this->decide($this->ada, null, $shut)->reason);

        $this->validUntil($this->ada, '2026-09-30');
        $this->assertSame('expired', $this->decide($this->ada, null, $this->event())->reason);
    }

    public function test_a_full_event_refuses_a_walk_in_but_never_a_member_who_signed_up_or_is_already_in(): void
    {
        $event = $this->event(['capacity' => 1, 'sign_up' => true, 'walk_ins' => true]);
        $alan = $this->makeMember('Alan Turing', 'alan@example.test');
        $this->attend($event, $alan);

        $this->assertSame('event_full', $this->decide($this->grace, null, $event)->reason);
        $this->signUp($event, $this->ada);
        $this->assertTrue($this->decide($this->ada, null, $event)->granted);
        $this->assertTrue($this->decide($alan, null, $event)->granted);

        $roomy = $this->event(['capacity' => 2]);
        $this->attend($roomy, $alan);
        $this->assertTrue($this->decide($this->grace, null, $roomy)->granted);
    }

    public function test_places_held_by_members_who_signed_up_are_not_given_to_walk_ins(): void
    {
        // Two places, both signed up for, nobody arrived yet: the door counts the places as a sign-up does.
        $event = $this->event(['capacity' => 2, 'sign_up' => true, 'walk_ins' => true]);
        $alan = $this->makeMember('Alan Turing', 'alan@example.test');
        $this->signUp($event, $this->ada);
        $this->signUp($event, $alan);

        $this->assertSame('event_full', $this->decide($this->grace, null, $event)->reason);
        $this->assertTrue($this->decide($this->ada, null, $event)->granted, 'a member who signed up keeps the place');

        // One cancels: the place is free for a walk-in.
        DB::table('loyalty_event_registrations')->where('member_id', $alan->id)->update(['status' => 'cancelled']);
        $this->assertTrue($this->decide($this->grace, null, $event)->granted);
    }

    public function test_sign_up_without_walk_ins_needs_a_standing_sign_up(): void
    {
        $event = $this->event(['sign_up' => true, 'walk_ins' => false]);

        $this->assertSame('not_signed_up', $this->decide($this->grace, null, $event)->reason);
        $this->signUp($event, $this->grace, 'cancelled');
        $this->assertSame('not_signed_up', $this->decide($this->grace, null, $event)->reason);
        $this->signUp($this->event(['sign_up' => true, 'walk_ins' => false, 'title' => 'Other']), $this->ada);
        $this->assertSame('not_signed_up', $this->decide($this->ada, null, $event)->reason);

        DB::table('loyalty_event_registrations')->where('member_id', $this->grace->id)->update(['status' => 'signed_up']);
        $this->assertTrue($this->decide($this->grace, null, $event)->granted);
        $this->assertTrue($this->decide($this->ada, null, $this->event(['sign_up' => true, 'walk_ins' => true]))->granted);
    }

    // ─── Reads only, and fast ────────────────────────────────────────────

    public function test_it_writes_nothing_and_an_event_costs_one_query_once_its_rows_are_read(): void
    {
        $place = $this->place('VIP lounge', ['gold']);
        $event = $this->event(['capacity' => 10, 'sign_up' => true], ['gold']);
        $member = $this->ada->fresh(['user', 'tier']);
        $place->load('tiers');
        $event->load('tiers');
        VenueClock::zone($this->org->id);

        DB::enableQueryLog();
        DB::flushQueryLog();
        app(AccessDecision::class)->decide($member, $place);
        $this->assertCount(0, DB::getQueryLog());
        app(AccessDecision::class)->decide($member, null, $event);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        $this->assertCount(1, $queries);
        $this->assertStringStartsWith('select', strtolower($queries[0]['query']));
    }

    public function test_whole_days_between_two_dates(): void
    {
        $this->assertSame(0, AccessDecision::daysBetween('2026-10-05', '2026-10-05'));
        $this->assertSame(14, AccessDecision::daysBetween('2026-10-05', '2026-10-19'));
        $this->assertSame(-1, AccessDecision::daysBetween('2026-10-05', '2026-10-04'));
        // A daylight-saving change in between is still one day a day.
        $this->assertSame(1, AccessDecision::daysBetween('2026-10-24', '2026-10-25'));
        $this->assertSame(366, AccessDecision::daysBetween('2027-10-05', '2028-10-05'));
    }

    private function attend(LoyaltyEvent $event, LoyaltyMember $member): void
    {
        DB::table('loyalty_event_attendances')->insert([
            'organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $member->id,
            'checked_in_at' => now(), 'walk_in' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function signUp(LoyaltyEvent $event, LoyaltyMember $member, string $status = 'signed_up'): void
    {
        DB::table('loyalty_event_registrations')->insert([
            'organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $member->id,
            'status' => $status, 'source' => 'staff', 'signed_up_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
