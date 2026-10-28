<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\PointsTransaction;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class EventsDesignTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema;

    private function url(string $path, array $query = []): string
    {
        return $this->api($path).($query ? '?'.http_build_query($query) : '');
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
    }

    public function test_event_filters_apply_before_pagination_and_keep_tenant_scope_and_literal_search(): void
    {
        for ($i = 0; $i < 22; $i++) $this->makeEvent(['title' => 'Earlier '.$i]);
        $target = $this->makeEvent(['title' => 'Yoga 100%_!', 'location' => 'Roof', 'starts_at' => '2026-11-01 10:00:00', 'ends_at' => '2026-11-01 12:00:00'], [$this->tiers['gold']->id]);
        $all = $this->makeEvent(['title' => 'Open yoga', 'location' => 'Roof', 'starts_at' => '2026-11-02 10:00:00', 'ends_at' => '2026-11-02 12:00:00']);
        $this->makeEvent(['title' => 'Silver yoga', 'location' => 'Roof'], [$this->tiers['silver']->id]);
        $foreign = $this->makeEvent(['title' => 'Yoga 100%_!', 'location' => 'Secret roof']);
        DB::table('loyalty_events')->where('id', $foreign->id)->update(['organization_id' => $this->otherOrganization()['org']->id]);
        $response = $this->asStaffMember()->getJson($this->url('events', ['q' => 'YOGA 100%_!', 'page' => 2]))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('page', 1)->assertJsonPath('events.0.id', $target->id);
        $this->assertNotContains('Secret roof', $response->json('options.locations'));
        $this->assertContains('Roof', $response->json('options.locations'));
        $this->asStaffMember()->getJson($this->url('events', ['location' => 'Roof', 'tier_id' => $this->tiers['gold']->id, 'sort' => 'latest']))
            ->assertOk()->assertJsonPath('total', 2)->assertJsonPath('events.0.id', $all->id)->assertJsonPath('events.1.id', $target->id);
        $this->asStaffMember()->getJson($this->url('events', ['place_id' => 999999]))->assertOk()->assertJsonPath('total', 0);
        $place = DB::table('access_places')->insertGetId(['organization_id' => $this->org->id, 'name' => 'Lounge', 'admits' => 'all', 'sort_order' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('loyalty_events')->where('id', $target->id)->update(['access_place_id' => $place, 'location' => null]);
        $this->asStaffMember()->getJson($this->url('events', ['place_id' => $place]))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('events.0.id', $target->id);
        $this->asStaffMember()->getJson($this->url('events', ['q' => str_repeat('x', 121)]))->assertUnprocessable();
    }

    public function test_people_filters_do_not_change_totals_and_walk_ins_do_not_reduce_members_still_to_arrive(): void
    {
        $event = $this->makeEvent(['sign_up' => true, 'capacity' => 10]);
        foreach ([$this->grace, $this->ada] as $member) EventRegistration::withoutGlobalScopes()->forceCreate(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $member->id, 'status' => 'signed_up', 'source' => 'staff', 'signed_up_at' => now()]);
        // This historical registration is cancelled, but its walk-in attendance still counts as attendance.
        EventRegistration::withoutGlobalScopes()->where('member_id', $this->ada->id)->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        EventAttendance::withoutGlobalScopes()->forceCreate(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->ada->id, 'checked_in_at' => now(), 'walk_in' => true]);
        $this->asStaffMember()->getJson($this->url("events/{$event->id}/people", ['attendance' => 'not_checked_in']))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('people.0.member.id', $this->grace->id)->assertJsonPath('counts.not_checked_in', 1)->assertJsonPath('counts.checked_in', 1)->assertJsonPath('counts.walk_ins', 1);
        $this->asStaffMember()->getJson($this->url("events/{$event->id}/people", ['q' => 'ADA', 'attendance' => 'checked_in']))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('people.0.member.id', $this->ada->id)->assertJsonPath('counts.not_checked_in', 1);
        $this->asStaffMember()->getJson($this->url("events/{$event->id}/people", ['q' => 'not found']))->assertOk()->assertJsonPath('total', 0)->assertJsonPath('counts.signed_up', 1);
        $this->asStaffMember()->getJson($this->url("events/{$event->id}/people", ['attendance' => 'invented']))->assertUnprocessable();
    }

    public function test_historical_points_use_only_the_attendances_own_ledger_entry_and_report_reversal(): void
    {
        $event = $this->makeEvent(['points' => 999]);
        $attendance = EventAttendance::withoutGlobalScopes()->forceCreate(['organization_id' => $this->org->id, 'loyalty_event_id' => $event->id, 'member_id' => $this->grace->id, 'checked_in_at' => now(), 'walk_in' => true]);
        $tx = PointsTransaction::withoutGlobalScopes()->forceCreate(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'type' => 'bonus', 'points' => 50, 'balance_after' => 50, 'description' => 'Event attendance', 'reference_type' => 'loyalty_event_attendance', 'reference_id' => $attendance->id, 'is_reversed' => false]);
        $attendance->forceFill(['points_transaction_id' => $tx->id])->save();
        $url = $this->url("events/{$event->id}/people");
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('people.0.points_awarded', 50)->assertJsonPath('people.0.points_reversed', false);
        $tx->update(['is_reversed' => true]);
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('people.0.points_reversed', true);
        $tx->update(['member_id' => $this->ada->id]);
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('people.0.points_awarded', null)->assertJsonPath('people.0.points_reversed', false);
        $attendance->forceFill(['points_transaction_id' => null])->save();
        $this->asStaffMember()->getJson($url)->assertOk()->assertJsonPath('people.0.points_awarded', 0);
    }
}
