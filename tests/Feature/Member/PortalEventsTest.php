<?php

namespace Tests\Feature\Member;

use App\Models\EventRegistration;
use App\Models\LoyaltyTier;
use App\Models\User;
use App\Services\Loyalty\Events\EventSignUp;
use App\Services\Loyalty\Events\PortalEvents;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The member portal's events (release 8, spec 2026-10-25 §4): `GET member/portal/events` lists the published events
 * that have not ended and admit the member's tier, with what the member can do; signing up and cancelling go through
 * EventSignUp; the events the member attended, with their points; the bootstrap's `capabilities.events`.
 */
class PortalEventsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema, PushSchema;

    private const URL = '/api/v1/member/portal/events';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->buildValiditySchema();
        $this->buildPushSchema();
    }

    private function asGrace(): static
    {
        return $this->actingAs(User::query()->findOrFail($this->grace->user_id), 'sanctum');
    }

    public function test_the_member_sees_the_events_open_to_their_tier_with_what_they_can_do(): void
    {
        $place = (int) DB::table('access_places')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Main hall', 'admits' => 'all', 'sort_order' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $tasting = $this->makeEvent(['title' => 'Wine tasting', 'description' => 'Six wines.', 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true, 'capacity' => 12, 'access_place_id' => $place]);
        $this->makeEvent(['title' => 'Open evening', 'starts_at' => '2026-10-07 18:00:00', 'ends_at' => '2026-10-07 20:00:00', 'location' => 'The garden']);
        $this->makeEvent(['title' => 'Gold dinner', 'starts_at' => '2026-10-08 19:00:00', 'ends_at' => '2026-10-08 22:00:00'], [$this->tiers['gold']->id]);
        $this->makeEvent(['title' => 'Idea', 'status' => 'draft']);
        $this->makeEvent(['title' => 'Called off', 'status' => 'cancelled', 'starts_at' => '2026-10-08 18:00:00', 'ends_at' => '2026-10-08 19:00:00']);
        $this->makeEvent(['title' => 'Last week', 'starts_at' => '2026-09-28 18:00:00', 'ends_at' => '2026-09-28 21:00:00']);

        $json = $this->asGrace()->getJson(self::URL)->assertOk()->json();
        $this->assertSame(['Open evening', 'Wine tasting'], array_column($json['upcoming'], 'title'));
        $this->assertSame([
            'id' => $tasting->id, 'title' => 'Wine tasting', 'description' => 'Six wines.', 'starts_at' => '2026-10-09T18:00', 'ends_at' => '2026-10-09T21:00',
            'where' => 'Main hall', 'points' => 50, 'sign_up' => true, 'walk_ins' => true, 'capacity' => 12, 'room_left' => 12, 'my' => 'none',
            'checked_in' => false, 'can_sign_up' => true, 'why_not' => null, 'can_cancel' => false,
        ], $json['upcoming'][1]);
        $this->assertSame(['The garden', false, null, false], [$json['upcoming'][0]['where'], $json['upcoming'][0]['can_sign_up'], $json['upcoming'][0]['why_not'], $json['upcoming'][0]['sign_up']]);
        $this->assertSame([], $json['attended']);

        // Gold sees the Gold dinner.
        $this->actingAs(User::query()->findOrFail($this->ada->user_id), 'sanctum')->getJson(self::URL)->assertOk()->assertJsonCount(3, 'upcoming');
    }

    public function test_signing_up_and_cancelling_from_the_portal(): void
    {
        $event = $this->makeEvent(['starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true, 'capacity' => 12]);

        $this->asGrace()->postJson(self::URL . "/{$event->id}/sign-up")->assertOk()
            ->assertJsonPath('event.my', 'signed_up')->assertJsonPath('event.room_left', 11)->assertJsonPath('event.can_sign_up', false)
            ->assertJsonPath('event.why_not', null)->assertJsonPath('event.can_cancel', true);
        // A second tap answers the same.
        $this->asGrace()->postJson(self::URL . "/{$event->id}/sign-up")->assertOk()->assertJsonPath('event.my', 'signed_up');
        $this->assertSame('portal', EventRegistration::query()->value('source'));

        $this->asGrace()->deleteJson(self::URL . "/{$event->id}/sign-up")->assertOk()->assertJsonPath('event.my', 'none')->assertJsonPath('event.can_sign_up', true)->assertJsonPath('event.room_left', 12);
        $this->asGrace()->postJson(self::URL . "/{$event->id}/sign-up")->assertOk()->assertJsonPath('event.my', 'signed_up');
        $this->assertSame(1, EventRegistration::query()->count());

        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-09 18:05:00'));
        $this->asGrace()->deleteJson(self::URL . "/{$event->id}/sign-up")->assertStatus(409)->assertJsonPath('error', 'cancel_closed');
    }

    public function test_why_not_and_the_refusals_are_the_sign_ups_own(): void
    {
        $full = $this->makeEvent(['title' => 'Full', 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true, 'capacity' => 1]);
        app(EventSignUp::class)->signUp($full, $this->ada, EventSignUp::PORTAL);
        $gold = $this->makeEvent(['title' => 'Gold', 'sign_up' => true, 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00'], [$this->tiers['gold']->id]);

        $this->asGrace()->getJson(self::URL)->assertOk()
            ->assertJsonPath('upcoming.0.title', 'Full')->assertJsonPath('upcoming.0.can_sign_up', false)->assertJsonPath('upcoming.0.why_not', 'event_full')->assertJsonPath('upcoming.0.room_left', 0);
        $this->asGrace()->postJson(self::URL . "/{$full->id}/sign-up")->assertStatus(409)->assertJsonPath('error', 'event_full');
        $this->asGrace()->postJson(self::URL . "/{$gold->id}/sign-up")->assertStatus(409)->assertJsonPath('error', 'tier_not_allowed')->assertJsonPath('allowed_tiers', ['Gold']);

        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-01']);
        $open = $this->makeEvent(['title' => 'Open', 'sign_up' => true, 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00']);
        $this->asGrace()->getJson(self::URL)->assertJsonPath('upcoming.1.title', 'Open')->assertJsonPath('upcoming.1.why_not', 'membership_expired');
        $this->asGrace()->postJson(self::URL . "/{$open->id}/sign-up")->assertStatus(409)->assertJsonPath('error', 'membership_expired')->assertJsonPath('valid_until', '2026-10-01');
    }

    public function test_a_draft_or_another_venues_event_is_not_found_and_a_cancelled_one_is_closed(): void
    {
        $draft = $this->makeEvent(['status' => 'draft', 'sign_up' => true]);
        $cancelled = $this->makeEvent(['status' => 'cancelled', 'sign_up' => true]);
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = $this->makeEvent(['organization_id' => $other['org']->id, 'sign_up' => true]);
        app()->instance('current_organization_id', $prior);

        $this->asGrace()->postJson(self::URL . "/{$draft->id}/sign-up")->assertNotFound();
        $this->asGrace()->postJson(self::URL . "/{$theirs->id}/sign-up")->assertNotFound();
        $this->asGrace()->postJson(self::URL . "/{$cancelled->id}/sign-up")->assertStatus(409)->assertJsonPath('error', 'sign_up_closed');
        $this->assertSame(0, EventRegistration::withoutGlobalScopes()->count());
    }

    public function test_the_events_attended_come_with_the_points_they_gave(): void
    {
        $event = $this->makeEvent(['title' => 'Yoga', 'starts_at' => '2026-10-03 08:00:00', 'ends_at' => '2026-10-03 09:00:00']);
        $line = (int) DB::table('points_transactions')->insertGetId(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'type' => 'bonus', 'points' => 50, 'balance_after' => 250, 'description' => 'Event: Yoga', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->grace->id, 'checked_in_at' => '2026-10-03 08:01:00', 'walk_in' => true, 'points_transaction_id' => $line, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->ada->id, 'checked_in_at' => '2026-10-03 08:01:00', 'walk_in' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asGrace()->getJson(self::URL)->assertOk()->assertJsonPath('attended', [['id' => $event->id, 'title' => 'Yoga', 'starts_at' => '2026-10-03T08:00', 'points' => 50]]);
    }

    public function test_the_menu_offers_events_while_one_is_coming_and_a_venue_without_a_programme_shows_none(): void
    {
        $events = app(PortalEvents::class);
        $this->assertFalse($events->offered($this->org->id));
        $this->makeEvent(['status' => 'draft']);
        $this->makeEvent(['starts_at' => '2026-10-01 18:00:00', 'ends_at' => '2026-10-01 21:00:00']);
        $this->assertFalse($events->offered($this->org->id));
        $this->makeEvent(['starts_at' => '2026-10-05 08:00:00', 'ends_at' => '2026-10-05 10:00:00']);
        $this->assertTrue($events->offered($this->org->id));

        LoyaltyTier::query()->update(['is_active' => false]);
        $this->asGrace()->getJson(self::URL)->assertOk()->assertExactJson(['upcoming' => [], 'attended' => []]);
    }

    public function test_staff_cannot_use_the_portals_door(): void
    {
        $this->asStaffMember()->getJson(self::URL)->assertStatus(403)->assertJsonPath('error', 'member_only');
    }
}
