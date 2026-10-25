<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\EventRegistration;
use App\Services\Loyalty\Events\EventSignUp;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Sign-ups (release 8, spec 2026-10-25 §4) through EventSignUp — by staff on the event's page (`POST/DELETE
 * events/{id}/sign-ups`) and the service's own rules: a published event that takes sign-ups and has not ended, a member
 * who is on, whose membership stands on the day and whose tier is admitted, a place left (sign-ups and walk-ins below
 * the capacity), one row per member per event, a cancel until the start (the portal) or the end (staff), the people
 * list.
 */
class EventSignUpTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema, PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->buildValiditySchema();
        $this->buildPushSchema();
    }

    private function refusal(callable $run): string
    {
        try {
            $run();
        } catch (LoyaltyRefused $e) {
            return $e->errorCode;
        }
        $this->fail('Not refused.');
    }

    public function test_staff_sign_a_member_up_and_the_people_list_shows_them(): void
    {
        $event = $this->makeEvent(['sign_up' => true, 'capacity' => 20, 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00']);

        $json = $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), ['member_id' => $this->grace->id])->assertOk()->json();
        $this->assertSame(['signed_up' => 1, 'checked_in' => 0, 'walk_ins' => 0, 'room_left' => 19], $json['event']['counts']);
        $this->assertSame(['id' => $this->grace->id, 'name' => 'Grace Hopper', 'member_number' => $this->grace->member_number, 'tier' => ['id' => $this->tiers['silver']->id, 'name' => 'Silver', 'color' => '#9ca3af']], $json['person']['member']);
        $this->assertSame(['2026-10-05T09:00:00+00:00', null, null, false, 'staff'], [$json['person']['signed_up_at'], $json['person']['cancelled_at'], $json['person']['checked_in_at'], $json['person']['walk_in'], $json['person']['source']]);

        $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), ['member_id' => $this->grace->id])->assertStatus(409)->assertJsonPath('error', 'already_signed_up');

        $people = $this->asStaffMember()->getJson($this->api("events/{$event->id}/people"))->assertOk();
        $people->assertJsonPath('counts.signed_up', 1)->assertJsonPath('event.id', $event->id)->assertJsonPath('total', 1)->assertJsonPath('people.0.member.name', 'Grace Hopper');
        $audit = AuditLog::withoutGlobalScopes()->where('action', 'loyalty.event_signed_up')->firstOrFail();
        $this->assertSame([$this->staffMember->id, ['event_id' => $event->id, 'source' => 'staff']], [(int) $audit->causer_id, $audit->new_values]);
    }

    public function test_a_press_sent_again_with_its_key_answers_the_sign_up_it_made(): void
    {
        $event = $this->makeEvent(['sign_up' => true]);
        $body = ['member_id' => $this->grace->id, 'idempotency_key' => 'tap-1'];
        $first = $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), $body)->assertOk()->json();
        $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), $body)->assertOk()->assertJson($first);
        $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), ['member_id' => $this->grace->id], ['Idempotency-Key' => 'tap-1'])->assertOk();
        $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), ['member_id' => $this->grace->id, 'idempotency_key' => 'tap-2'])->assertStatus(409);

        $this->assertSame(1, EventRegistration::query()->count());
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'loyalty.event_signed_up')->count());
    }

    public function test_the_event_must_take_sign_ups_now(): void
    {
        $service = app(EventSignUp::class);
        $closed = [
            'no sign-up' => $this->makeEvent(['sign_up' => false]),
            'a draft'    => $this->makeEvent(['sign_up' => true, 'status' => 'draft']),
            'cancelled'  => $this->makeEvent(['sign_up' => true, 'status' => 'cancelled']),
            'ended'      => $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-04 18:00:00', 'ends_at' => '2026-10-04 21:00:00']),
        ];
        foreach ($closed as $why => $event) {
            $this->assertSame('sign_up_closed', $this->refusal(fn () => $service->signUp($event, $this->grace, EventSignUp::PORTAL)), $why);
        }
        // Started but not ended: still open.
        $running = $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-05 08:00:00', 'ends_at' => '2026-10-05 12:00:00']);
        $this->assertSame(EventRegistration::SIGNED_UP, $service->signUp($running, $this->grace, EventSignUp::PORTAL)->status);
    }

    public function test_the_member_must_be_on_admitted_and_still_a_member_on_the_day(): void
    {
        $service = app(EventSignUp::class);
        $gold = $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-20 18:00:00', 'ends_at' => '2026-10-20 21:00:00'], [$this->tiers['gold']->id, $this->tiers['platinum']->id]);

        try {
            $service->signUp($gold, $this->grace, EventSignUp::PORTAL);
            $this->fail('Not refused.');
        } catch (LoyaltyRefused $e) {
            $this->assertSame(['tier_not_allowed', ['allowed_tiers' => ['Gold', 'Platinum']]], [$e->errorCode, $e->extra]);
        }
        $this->assertSame(EventRegistration::SIGNED_UP, $service->signUp($gold, $this->ada, EventSignUp::PORTAL)->status);

        // A membership that ends before the event's day would be refused at the door: refused now.
        $open = $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-20 18:00:00', 'ends_at' => '2026-10-20 21:00:00']);
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-19']);
        try {
            $service->signUp($open, $this->grace->fresh(), EventSignUp::PORTAL);
            $this->fail('Not refused.');
        } catch (LoyaltyRefused $e) {
            $this->assertSame(['membership_expired', ['valid_until' => '2026-10-19']], [$e->errorCode, $e->extra]);
        }
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-20']);
        $this->assertSame(EventRegistration::SIGNED_UP, $service->signUp($open, $this->grace->fresh(), EventSignUp::PORTAL)->status);

        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['is_active' => false]);
        $this->assertSame('inactive', $this->refusal(fn () => $service->signUp($open, $this->ada->fresh(), EventSignUp::STAFF, $this->staffMember)));
    }

    public function test_room_left_counts_sign_ups_and_walk_ins_against_the_capacity(): void
    {
        $service = app(EventSignUp::class);
        $event = $this->makeEvent(['sign_up' => true, 'capacity' => 2]);
        $service->signUp($event, $this->grace, EventSignUp::PORTAL);
        $walkIn = $this->makeMember('Alan Turing', 'alan@example.test');
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $walkIn->id, 'checked_in_at' => now(), 'walk_in' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->assertSame('event_full', $this->refusal(fn () => $service->signUp($event, $this->ada, EventSignUp::PORTAL)));
        $this->assertSame('already_in', $this->refusal(fn () => $service->signUp($event, $walkIn, EventSignUp::STAFF, $this->staffMember)));

        // A cancel frees the place; signing up again reuses the member's own row.
        $service->cancel($event, $this->grace, EventSignUp::PORTAL);
        $row = $service->signUp($event, $this->ada, EventSignUp::PORTAL);
        $this->assertSame('signed_up', $row->status);
        $this->assertSame('event_full', $this->refusal(fn () => $service->signUp($event, $this->grace, EventSignUp::PORTAL)));
        $service->cancel($event, $this->ada, EventSignUp::PORTAL);
        $again = $service->signUp($event, $this->grace, EventSignUp::PORTAL);
        $this->assertSame([EventRegistration::SIGNED_UP, null], [$again->status, $again->cancelled_at]);
        $this->assertSame(2, EventRegistration::query()->count(), 'one row per member per event');
    }

    public function test_a_cancel_is_until_the_start_from_the_portal_and_until_the_end_by_staff(): void
    {
        $service = app(EventSignUp::class);
        $event = $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-05 10:00:00', 'ends_at' => '2026-10-05 12:00:00']);
        $service->signUp($event, $this->grace, EventSignUp::PORTAL);
        $service->signUp($event, $this->ada, EventSignUp::PORTAL);

        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 10:30:00'));
        $this->assertSame('cancel_closed', $this->refusal(fn () => $service->cancel($event, $this->grace, EventSignUp::PORTAL)));
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$this->grace->id}"))->assertOk()
            ->assertJsonPath('person.cancelled_at', '2026-10-05T10:30:00+00:00')
            ->assertJsonPath('event.counts.signed_up', 1);
        // Cancelled again: as it is.
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$this->grace->id}"))->assertOk();

        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->ada->id, 'checked_in_at' => now(), 'walk_in' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$this->ada->id}"))->assertStatus(409)->assertJsonPath('error', 'already_in');
        $nobody = $this->makeMember('Alan Turing', 'alan@example.test');
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$nobody->id}"))->assertStatus(409)->assertJsonPath('error', 'not_signed_up');

        // After the end, staff cannot either.
        DB::table('loyalty_event_attendances')->where('member_id', $this->ada->id)->delete();
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 12:30:00'));
        $this->assertSame('cancel_closed', $this->refusal(fn () => $service->cancel($event, $this->ada, EventSignUp::STAFF, $this->staffMember)));
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'loyalty.event_sign_up_cancelled')->count());
    }

    public function test_the_people_come_signed_up_first_then_walk_ins_then_cancelled(): void
    {
        $service = app(EventSignUp::class);
        $event = $this->makeEvent(['sign_up' => true]);
        $alan = $this->makeMember('Alan Turing', 'alan@example.test');
        $edsger = $this->makeMember('Edsger Dijkstra', 'edsger@example.test');
        $service->signUp($event, $alan, EventSignUp::PORTAL);
        $this->travel(5)->minutes();
        $service->signUp($event, $this->grace, EventSignUp::STAFF, $this->staffMember);
        $service->signUp($event, $edsger, EventSignUp::PORTAL);
        $service->cancel($event, $edsger, EventSignUp::PORTAL);
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->ada->id, 'checked_in_at' => '2026-10-05 16:02:00', 'walk_in' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();

        $people = $this->asStaffMember()->getJson($this->api("events/{$event->id}/people"))->assertOk()->json('people');
        $this->assertSame(['Alan Turing', 'Grace Hopper', 'Ada Lovelace', 'Edsger Dijkstra'], array_column(array_column($people, 'member'), 'name'));
        $this->assertSame(['19:02', true, null], [$people[2]['checked_in_at'], $people[2]['walk_in'], $people[2]['source']], 'the check-in on the venue’s clock');
        $this->assertNotNull($people[3]['cancelled_at']);
    }

    public function test_a_member_of_another_organisation_is_a_field_error(): void
    {
        $event = $this->makeEvent(['sign_up' => true]);
        $other = $this->otherOrganization();
        $this->asStaffMember()->postJson($this->api("events/{$event->id}/sign-ups"), ['member_id' => $other['member']->id])->assertStatus(422)->assertJsonValidationErrors(['member_id']);
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$other['member']->id}"))->assertNotFound();
    }

    public function test_the_unique_index_is_the_last_line(): void
    {
        $event = $this->makeEvent(['sign_up' => true]);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);

        $this->expectException(UniqueConstraintViolationException::class);
        DB::table('loyalty_event_registrations')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->grace->id, 'status' => 'signed_up', 'source' => 'portal']);
    }
}
