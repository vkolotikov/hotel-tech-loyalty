<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\EventRegistration;
use App\Models\LoyaltyEvent;
use App\Services\Loyalty\Events\EventSignUp;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Events in the workspace (release 8, spec 2026-10-25 §4) through EventEditor: one dialog's fields checked on the
 * server, times kept as the venue's wall clock, the life of an event (draft → published → cancelled; a draft deleted),
 * the members told when a published event moves or is cancelled, the tabs of the list, and who may change events.
 */
class EventsTest extends TestCase
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

    /** @return array<string, mixed> */
    private function form(array $more = []): array
    {
        return $more + [
            'title'           => 'Members’ night',
            'description'     => 'Drinks and music on the terrace.',
            'starts_at'       => '2026-10-09T18:00',
            'ends_at'         => '2026-10-09T21:00',
            'location'        => 'The terrace',
            'admits'          => 'all',
            'points'          => 50,
            'counts_as_visit' => true,
            'sign_up'         => true,
            'walk_ins'        => true,
            'capacity'        => 40,
        ];
    }

    private function place(string $name = 'Main hall', ?int $orgId = null): int
    {
        return (int) DB::table('access_places')->insertGetId(['organization_id' => $orgId ?? $this->org->id, 'name' => $name, 'admits' => 'all', 'sort_order' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_new_event_is_a_draft_with_its_times_stored_as_written_and_answered_whole(): void
    {
        $json = $this->asManager()->postJson($this->api('events'), $this->form())->assertCreated()->json('event');

        $this->assertSame([
            'title' => 'Members’ night', 'description' => 'Drinks and music on the terrace.', 'starts_at' => '2026-10-09T18:00', 'ends_at' => '2026-10-09T21:00',
            'place' => null, 'location' => 'The terrace', 'admits' => 'all', 'tiers' => [], 'points' => 50, 'counts_as_visit' => true, 'sign_up' => true,
            'walk_ins' => true, 'capacity' => 40, 'status' => 'draft', 'phase' => 'draft',
            'counts' => ['signed_up' => 0, 'checked_in' => 0, 'walk_ins' => 0, 'room_left' => 40],
        ], array_diff_key($json, ['id' => 0]));
        $row = DB::table('loyalty_events')->where('id', $json['id'])->first();
        $this->assertSame(['2026-10-09 18:00:00', '2026-10-09 21:00:00', $this->manager->id], [(string) $row->starts_at, (string) $row->ends_at, (int) $row->created_by]);
        $this->assertSame('loyalty.event_created', AuditLog::withoutGlobalScopes()->where('subject_type', 'loyalty_event')->where('subject_id', $json['id'])->value('action'));
    }

    public function test_the_times_are_the_venues_wall_clock_never_converted(): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'America/New_York']);
        app()->forgetScopedInstances();

        $id = $this->asManager()->postJson($this->api('events'), $this->form())->assertCreated()->json('event.id');

        $this->assertSame('2026-10-09 18:00:00', (string) DB::table('loyalty_events')->where('id', $id)->value('starts_at'));
        $this->asStaffMember()->getJson($this->api("events/{$id}"))->assertOk()->assertJsonPath('event.starts_at', '2026-10-09T18:00');
    }

    public function test_publish_with_the_create_and_choose_a_place_and_tiers(): void
    {
        $place = $this->place();
        $json = $this->asManager()->postJson($this->api('events'), $this->form([
            'place_id' => $place, 'location' => 'ignored when a place is named', 'admits' => 'tiers',
            'tier_ids' => [$this->tiers['platinum']->id, $this->tiers['gold']->id], 'publish' => true,
        ]))->assertCreated()->json('event');

        $this->assertSame('published', $json['status']);
        $this->assertSame('upcoming', $json['phase']);
        // The dialog's places come with the list and the event: this organisation's, a switched-off one marked.
        DB::table('access_places')->insert(['organization_id' => $this->org->id, 'name' => 'Old wing', 'admits' => 'all', 'sort_order' => 1, 'is_active' => false, 'created_at' => now(), 'updated_at' => now()]);
        $this->place('Their hall', $this->otherOrganization()['org']->id);
        $places = [['id' => $place, 'name' => 'Main hall', 'is_active' => true], ['id' => (int) DB::table('access_places')->where('name', 'Old wing')->value('id'), 'name' => 'Old wing', 'is_active' => false]];
        $this->asStaffMember()->getJson($this->api('events'))->assertJsonPath('options.places', $places);
        $this->asStaffMember()->getJson($this->api("events/{$json['id']}"))->assertJsonPath('options.places', $places)->assertJsonPath('can_change', false);
        $this->assertSame(['id' => $place, 'name' => 'Main hall'], $json['place']);
        $this->assertNull($json['location']);
        $this->assertSame(['Gold', 'Platinum'], array_column($json['tiers'], 'name'));
        $this->assertSame('#d4a017', $json['tiers'][0]['color']);
    }

    public function test_the_fields_are_checked_on_the_server(): void
    {
        $other = $this->otherOrganization();
        $theirPlace = $this->place('Their hall', $other['org']->id);
        $cases = [
            'title'     => ['title' => ''],
            'starts_at' => ['starts_at' => '2026-10-09 18:00'],
            'ends_at'   => ['ends_at' => '2026-10-09T17:00'],
            'tier_ids'  => ['admits' => 'tiers', 'tier_ids' => []],
            'tier_ids.0' => ['admits' => 'tiers', 'tier_ids' => [$other['tier']->id]],
            'place_id'  => ['place_id' => $theirPlace],
            'points'    => ['points' => 100001],
            'capacity'  => ['capacity' => 0],
            'walk_ins'  => ['sign_up' => false, 'walk_ins' => false],
            'location'  => ['location' => str_repeat('x', 201)],
            'description' => ['description' => str_repeat('x', 2001)],
        ];
        foreach ($cases as $field => $change) {
            $this->asManager()->postJson($this->api('events'), $this->form($change))->assertStatus(422)->assertJsonValidationErrors([$field]);
        }
        // At most 14 days long.
        $this->asManager()->postJson($this->api('events'), $this->form(['ends_at' => '2026-10-23T18:01']))->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $this->asManager()->postJson($this->api('events'), $this->form(['ends_at' => '2026-10-23T18:00']))->assertCreated();
        // 31 September does not exist.
        $this->asManager()->postJson($this->api('events'), $this->form(['starts_at' => '2026-09-31T18:00']))->assertStatus(422)->assertJsonValidationErrors(['starts_at']);

        $this->assertSame(1, LoyaltyEvent::query()->count());
    }

    public function test_a_change_names_only_what_changes_and_the_event_is_checked_whole(): void
    {
        $id = $this->asManager()->postJson($this->api('events'), $this->form())->json('event.id');

        $this->asManager()->putJson($this->api("events/{$id}"), ['title' => 'Autumn members’ night'])->assertOk()
            ->assertJsonPath('event.title', 'Autumn members’ night')
            ->assertJsonPath('event.capacity', 40)
            ->assertJsonPath('event.starts_at', '2026-10-09T18:00');
        $this->asManager()->putJson($this->api("events/{$id}"), ['ends_at' => '2026-10-09T17:00'])->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $this->asManager()->putJson($this->api("events/{$id}"), ['capacity' => null])->assertOk()->assertJsonPath('event.capacity', null)->assertJsonPath('event.counts.room_left', null);

        $audit = AuditLog::withoutGlobalScopes()->where('action', 'loyalty.event_changed')->orderBy('id')->first();
        $this->assertSame(['title' => 'Members’ night'], $audit->old_values);
        $this->assertSame(['title' => 'Autumn members’ night'], $audit->new_values);
    }

    public function test_a_change_is_merged_into_the_event_as_it_stands_not_as_the_caller_last_read_it(): void
    {
        $event = $this->makeEvent(['title' => 'Wine tasting', 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'capacity' => 40]);
        $stale = \App\Models\LoyaltyEvent::query()->findOrFail($event->id);

        // Another manager renames it meanwhile; this one changes only the places, from the copy read before.
        $this->asManager()->putJson($this->api("events/{$event->id}"), ['title' => 'Autumn wine tasting'])->assertOk();
        app(\App\Services\Loyalty\Events\EventEditor::class)->change($stale, ['capacity' => 30], $this->manager);

        $this->assertSame(['Autumn wine tasting', 30], [(string) $event->fresh()->title, (int) $event->fresh()->capacity]);
    }

    public function test_a_published_event_cannot_leave_out_members_signed_up_until_their_sign_ups_are_cancelled(): void
    {
        $event = $this->makeEvent(['starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true, 'walk_ins' => false, 'capacity' => 2]);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);
        app(EventSignUp::class)->signUp($event, $this->ada, EventSignUp::PORTAL);
        $goldOnly = ['admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id, $this->tiers['platinum']->id]];

        $this->asManager()->putJson($this->api("events/{$event->id}"), $goldOnly + ['title' => 'Gold evening'])->assertStatus(409)
            ->assertJsonPath('error', 'signed_up_outside')
            ->assertJsonPath('count', 1)
            ->assertJsonPath('members', ['Grace Hopper']);
        $this->assertSame(['all', 'Wine tasting'], [(string) $event->fresh()->admits, (string) $event->fresh()->title], 'nothing changed');
        $this->assertSame(0, DB::table('loyalty_event_tiers')->where('loyalty_event_id', $event->id)->count());

        // Grace's sign-up cancelled from the people list: the change goes through, and Ada keeps her place.
        $this->asStaffMember()->deleteJson($this->api("events/{$event->id}/sign-ups/{$this->grace->id}"))->assertOk();
        $this->asManager()->putJson($this->api("events/{$event->id}"), $goldOnly)->assertOk()->assertJsonPath('event.admits', 'tiers')->assertJsonPath('event.counts.signed_up', 1);

        // Narrowing further to Platinum would leave out Ada (Gold).
        $this->asManager()->putJson($this->api("events/{$event->id}"), ['tier_ids' => [$this->tiers['platinum']->id]])->assertStatus(409)->assertJsonPath('members', ['Ada Lovelace']);
    }

    public function test_only_what_the_change_leaves_out_counts_and_members_already_inside_never_block_it(): void
    {
        $event = $this->makeEvent(['sign_up' => true, 'starts_at' => '2026-10-05 08:00:00', 'ends_at' => '2026-10-05 12:00:00'], [$this->tiers['silver']->id, $this->tiers['gold']->id]);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);
        app(EventSignUp::class)->signUp($event, $this->ada, EventSignUp::PORTAL);
        // Grace has come in already; Ada has since moved to Platinum, which the event never let in.
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->grace->id, 'checked_in_at' => now(), 'walk_in' => false, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['tier_id' => $this->tiers['platinum']->id]);

        $this->asManager()->putJson($this->api("events/{$event->id}"), ['title' => 'Renamed'])->assertOk();
        $this->asManager()->putJson($this->api("events/{$event->id}"), ['tier_ids' => [$this->tiers['gold']->id]])->assertOk();

        // A draft has nobody signed up: it changes freely.
        $draft = $this->makeEvent(['status' => 'draft']);
        $this->asManager()->putJson($this->api("events/{$draft->id}"), ['admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id]])->assertOk();
    }

    public function test_publish_cancel_and_delete_follow_the_events_life(): void
    {
        $draft = $this->asManager()->postJson($this->api('events'), $this->form())->json('event.id');
        $this->asManager()->postJson($this->api("events/{$draft}/cancel"))->assertStatus(409)->assertJsonPath('error', 'wrong_state')->assertJsonPath('state', 'draft');

        $this->asManager()->postJson($this->api("events/{$draft}/publish"))->assertOk()->assertJsonPath('event.status', 'published');
        $this->asManager()->postJson($this->api("events/{$draft}/publish"))->assertOk()->assertJsonPath('event.status', 'published');
        $this->asManager()->deleteJson($this->api("events/{$draft}"))->assertStatus(409)->assertJsonPath('error', 'not_a_draft');

        $this->asManager()->postJson($this->api("events/{$draft}/cancel"), ['reason' => 'The band is ill.'])->assertOk()->assertJsonPath('event.status', 'cancelled')->assertJsonPath('event.phase', 'cancelled');
        $this->asManager()->postJson($this->api("events/{$draft}/cancel"))->assertOk()->assertJsonPath('event.status', 'cancelled');
        $this->asManager()->putJson($this->api("events/{$draft}"), ['title' => 'Again'])->assertStatus(409)->assertJsonPath('error', 'wrong_state');
        $this->asManager()->postJson($this->api("events/{$draft}/publish"))->assertStatus(409)->assertJsonPath('error', 'wrong_state');

        $other = $this->asManager()->postJson($this->api('events'), $this->form(['admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id]]))->json('event.id');
        $this->asManager()->deleteJson($this->api("events/{$other}"))->assertOk()->assertJsonPath('deleted', true);
        $this->assertNull(LoyaltyEvent::query()->find($other));
        $this->assertSame(0, DB::table('loyalty_event_tiers')->where('loyalty_event_id', $other)->count());

        $actions = AuditLog::withoutGlobalScopes()->where('subject_type', 'loyalty_event')->orderBy('id')->pluck('action')->all();
        $this->assertSame(['loyalty.event_created', 'loyalty.event_published', 'loyalty.event_cancelled', 'loyalty.event_created', 'loyalty.event_deleted'], $actions);
    }

    public function test_an_event_that_has_ended_is_neither_published_nor_cancelled(): void
    {
        $past = $this->asManager()->postJson($this->api('events'), $this->form(['starts_at' => '2026-10-01T18:00', 'ends_at' => '2026-10-01T21:00']))->json('event.id');
        $this->asManager()->postJson($this->api("events/{$past}/publish"))->assertStatus(422)->assertJsonPath('error', 'event_ended');
        $this->asManager()->postJson($this->api('events'), $this->form(['starts_at' => '2026-10-01T18:00', 'ends_at' => '2026-10-01T21:00', 'publish' => true]))
            ->assertStatus(422)->assertJsonPath('error', 'event_ended');

        $held = $this->makeEvent(['starts_at' => '2026-10-01 18:00:00', 'ends_at' => '2026-10-01 21:00:00']);
        $this->asManager()->postJson($this->api("events/{$held->id}/cancel"))->assertStatus(422)->assertJsonPath('error', 'event_ended');
    }

    public function test_members_signed_up_are_told_when_the_times_or_place_change_and_when_it_is_cancelled(): void
    {
        $event = $this->makeEvent(['starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true, 'location' => 'The terrace']);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);
        app(EventSignUp::class)->signUp($event, $this->ada, EventSignUp::STAFF, $this->staffMember);
        app(EventSignUp::class)->cancel($event, $this->ada, EventSignUp::STAFF, $this->staffMember);
        $inbox = fn (string $type) => DB::table('push_notifications')->where('type', $type)->get();

        // A new title moves nothing: nobody is told.
        $this->asManager()->putJson($this->api("events/{$event->id}"), ['title' => 'Wine evening'])->assertOk();
        $this->assertCount(0, $inbox('event_changed'));

        $this->asManager()->putJson($this->api("events/{$event->id}"), ['starts_at' => '2026-10-10T19:00', 'ends_at' => '2026-10-10T22:00'])->assertOk();
        $told = $inbox('event_changed');
        $this->assertCount(1, $told, 'Grace only: Ada cancelled');
        $this->assertSame((int) $this->grace->id, (int) $told[0]->member_id);
        $this->assertSame('Change to Wine evening', $told[0]->title);
        $this->assertSame('Now Sat 10 Oct, 19:00–22:00, The terrace. You are still signed up.', $told[0]->body);
        $this->assertSame(['event_id' => $event->id, 'starts_at' => '2026-10-10T19:00'], json_decode($told[0]->data, true));

        $this->asManager()->putJson($this->api("events/{$event->id}"), ['location' => 'The garden'])->assertOk();
        $this->assertCount(2, $inbox('event_changed'));

        $this->asManager()->postJson($this->api("events/{$event->id}/cancel"), ['reason' => 'The forecast is storms.'])->assertOk();
        $this->asManager()->postJson($this->api("events/{$event->id}/cancel"))->assertOk();
        $cancelled = $inbox('event_cancelled');
        $this->assertCount(1, $cancelled);
        $this->assertSame('Wine evening is cancelled', $cancelled[0]->title);
        $this->assertSame('Sat 10 Oct, 19:00–22:00 will not take place. The forecast is storms. Sorry for the change of plans.', $cancelled[0]->body);
        $this->assertSame(EventRegistration::SIGNED_UP, EventRegistration::query()->where('member_id', $this->grace->id)->value('status'), 'the sign-up stays as history');
    }

    public function test_the_pushes_go_to_expo_together_and_a_member_without_the_app_still_has_the_message(): void
    {
        \Illuminate\Support\Facades\Http::fake(['exp.host/*' => \Illuminate\Support\Facades\Http::response(['data' => [['status' => 'ok', 'id' => 't1'], ['status' => 'ok', 'id' => 't2']]])]);
        $event = $this->makeEvent(['starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00', 'sign_up' => true]);
        $alan = $this->makeMember('Alan Turing', 'alan@example.test');
        foreach ([$this->grace, $this->ada, $alan] as $member) {
            app(EventSignUp::class)->signUp($event, $member, EventSignUp::PORTAL);
        }
        DB::table('loyalty_members')->whereIn('id', [$this->grace->id, $this->ada->id])->update(['expo_push_token' => 'ExponentPushToken[test-device]', 'push_notifications' => true]);

        $this->asManager()->postJson($this->api("events/{$event->id}/cancel"))->assertOk();

        \Illuminate\Support\Facades\Http::assertSentCount(1);
        \Illuminate\Support\Facades\Http::assertSent(fn ($request) => count($request->data()) === 2 && $request->data()[0]['title'] === 'Wine tasting is cancelled');
        $this->assertSame(3, DB::table('push_notifications')->where('type', 'event_cancelled')->count());
    }

    public function test_a_draft_moves_without_telling_anyone(): void
    {
        $event = $this->makeEvent(['status' => 'draft', 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00']);
        $this->asManager()->putJson($this->api("events/{$event->id}"), ['starts_at' => '2026-10-10T18:00', 'ends_at' => '2026-10-10T21:00'])->assertOk();
        $this->assertSame(0, DB::table('push_notifications')->count());
    }

    public function test_the_tabs_list_upcoming_today_past_and_drafts_in_their_order_with_the_numbers(): void
    {
        $tonight = $this->makeEvent(['title' => 'Tonight', 'starts_at' => '2026-10-05 18:00:00', 'ends_at' => '2026-10-05 21:00:00', 'sign_up' => true, 'capacity' => 10]);
        $now = $this->makeEvent(['title' => 'Running', 'starts_at' => '2026-10-05 08:00:00', 'ends_at' => '2026-10-05 12:00:00']);
        $later = $this->makeEvent(['title' => 'Friday', 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-09 21:00:00']);
        $off = $this->makeEvent(['title' => 'Called off', 'starts_at' => '2026-10-07 18:00:00', 'ends_at' => '2026-10-07 21:00:00', 'status' => 'cancelled']);
        $past = $this->makeEvent(['title' => 'Last week', 'starts_at' => '2026-09-28 18:00:00', 'ends_at' => '2026-09-28 21:00:00']);
        $morning = $this->makeEvent(['title' => 'This morning', 'starts_at' => '2026-10-05 06:00:00', 'ends_at' => '2026-10-05 08:00:00']);
        $draft = $this->makeEvent(['title' => 'Idea', 'status' => 'draft']);
        app(EventSignUp::class)->signUp($tonight, $this->grace, EventSignUp::PORTAL);
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $tonight->id, 'member_id' => $this->ada->id, 'checked_in_at' => now(), 'walk_in' => true, 'created_at' => now(), 'updated_at' => now()]);

        $titles = fn (string $when) => array_column($this->asStaffMember()->getJson($this->api("events?when={$when}"))->assertOk()->json('events'), 'title');
        $this->assertSame(['Running', 'Tonight', 'Called off', 'Friday'], $titles('upcoming'));
        $this->assertSame(['Running', 'Tonight'], $titles('today'));
        $this->assertSame(['This morning', 'Last week'], $titles('past'));
        $this->assertSame(['Idea'], $titles('drafts'));

        $list = $this->asStaffMember()->getJson($this->api('events'))->assertOk();
        $list->assertJsonPath('can_change', false)->assertJsonPath('page', 1)->assertJsonPath('pages', 1)->assertJsonPath('total', 4)
            ->assertJsonPath('totals', ['upcoming' => 4, 'past' => 2, 'drafts' => 1])
            ->assertJsonPath('events.0.phase', 'on_now')
            ->assertJsonPath('events.1.phase', 'upcoming')
            ->assertJsonPath('events.1.counts', ['signed_up' => 1, 'checked_in' => 1, 'walk_ins' => 1, 'room_left' => 8]);
        $this->asManager()->getJson($this->api('events'))->assertJsonPath('can_change', true);
        $this->asStaffMember()->getJson($this->api('events?when=past'))->assertJsonPath('events.0.phase', 'ended');
        $this->asStaffMember()->getJson($this->api('events?when=soon'))->assertStatus(422);
        $this->assertNotNull($now->id + $later->id + $off->id + $past->id + $morning->id + $draft->id);
    }

    public function test_today_lists_an_event_starting_after_midnight_once_its_doors_are_open(): void
    {
        // The venue's clock (Riga, UTC+3) reads 23:00 on the 5th at 20:00 UTC; an event at 00:30 on the 6th opens at 22:30.
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->makeEvent(['title' => 'Midnight', 'starts_at' => '2026-10-06 00:30:00', 'ends_at' => '2026-10-06 03:00:00']);
        $titles = fn () => array_column($this->asStaffMember()->getJson($this->api('events?when=today'))->assertOk()->json('events'), 'title');

        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 19:00:00'));
        $this->assertNotContains('Midnight', $titles(), '22:00: its doors are not open yet');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 20:00:00'));
        $this->assertContains('Midnight', $titles(), '23:00: its doors are open');
    }

    public function test_the_people_answer_names_the_latest_check_ins_by_their_real_time_across_midnight(): void
    {
        $event = $this->makeEvent(['title' => 'Late night', 'starts_at' => '2026-10-05 22:00:00', 'ends_at' => '2026-10-06 02:00:00', 'sign_up' => true]);
        app(EventSignUp::class)->signUp($event, $this->grace, EventSignUp::PORTAL);
        // Grace came in before midnight, Ada (a walk-in) after it: 'HH:mm' alone would sort Ada last.
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->grace->id, 'checked_in_at' => '2026-10-05 20:50:00', 'walk_in' => false, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->ada->id, 'checked_in_at' => '2026-10-05 21:10:00', 'walk_in' => true, 'created_at' => now(), 'updated_at' => now()]);

        $json = $this->asStaffMember()->getJson($this->api("events/{$event->id}/people"))->assertOk()->json();
        $this->assertSame([$this->ada->id, $this->grace->id], array_column(array_column($json['latest'], 'member'), 'id'));
        $this->assertSame([true, false], array_column($json['latest'], 'walk_in'));
        // The paged list keeps its own order: sign-ups first.
        $this->assertSame($this->grace->id, $json['people'][0]['member']['id']);
    }

    public function test_only_managers_and_staff_who_manage_offers_change_events_and_every_staff_member_reads_them(): void
    {
        $event = $this->makeEvent(['status' => 'draft']);
        $no = fn ($response) => $response->assertStatus(403)->assertJsonPath('error', 'not_allowed')->assertJsonPath('need', 'can_manage_offers');

        $no($this->asStaffMember()->postJson($this->api('events'), $this->form()));
        $no($this->asStaffMember()->putJson($this->api("events/{$event->id}"), ['title' => 'Mine']));
        $no($this->asStaffMember()->postJson($this->api("events/{$event->id}/publish")));
        $no($this->asStaffMember()->postJson($this->api("events/{$event->id}/cancel")));
        $no($this->asStaffMember()->deleteJson($this->api("events/{$event->id}")));
        $this->asStaffMember()->getJson($this->api("events/{$event->id}"))->assertOk();
        $this->asStaffMember()->getJson($this->api("events/{$event->id}/people"))->assertOk();

        // The flag alone is enough; a manager needs no flag.
        $offers = $this->staffUser($this->org, ['role' => 'staff', 'can_manage_offers' => true]);
        $this->actingAs($offers, 'sanctum')->postJson($this->api('events'), $this->form())->assertCreated();
        $bare = $this->staffUser($this->org, ['role' => 'manager']);
        $this->actingAs($bare, 'sanctum')->postJson($this->api('events'), $this->form())->assertCreated();
    }

    public function test_another_organisations_event_is_not_found(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = $this->makeEvent(['organization_id' => $other['org']->id]);
        app()->instance('current_organization_id', $prior);

        foreach ([['get', "events/{$theirs->id}"], ['put', "events/{$theirs->id}"], ['delete', "events/{$theirs->id}"], ['post', "events/{$theirs->id}/publish"], ['get', "events/{$theirs->id}/people"]] as [$verb, $path]) {
            $this->asManager()->json($verb, $this->api($path), ['title' => 'Mine'])->assertNotFound()->assertJsonPath('error', 'not_found');
        }
        $this->assertSame([], $this->asManager()->getJson($this->api('events'))->json('events'));
    }

    public function test_a_create_sent_again_with_its_key_makes_one_event_and_another_body_is_refused(): void
    {
        $body = $this->form(['idempotency_key' => 'press-1']);
        $first = $this->asManager()->postJson($this->api('events'), $body)->assertCreated()->json('event.id');
        $this->asManager()->postJson($this->api('events'), $body)->assertCreated()->assertJsonPath('event.id', $first);
        $this->asManager()->postJson($this->api('events'), $this->form(['title' => 'Other']), ['Idempotency-Key' => 'press-1'])->assertStatus(409)->assertJsonPath('error', 'key_reused');

        $this->assertSame(1, LoyaltyEvent::query()->count());
    }
}
