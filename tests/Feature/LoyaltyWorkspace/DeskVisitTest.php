<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Models\Stamp;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Check in and Add a purchase at the desk (release 7, spec 2026-10-25 §2): `POST members/{id}/check-in` through
 * DeskVisit — the options that allow it, once a day as a check-in, a purchase's points by the earn rate, one scan log
 * row per request handed to VisitRecorder as the visit, a key that makes a retry write nothing, the amount in the
 * venue's currency, and who may.
 */
class DeskVisitTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, VisitsSchema, CreditSchema, PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
    }

    /** @param array<string, mixed> $changes */
    private function setOptions(array $changes): void
    {
        ProgrammeOptions::save($this->org->id, $changes, $this->manager);
    }

    /** @param array<string, mixed> $body */
    private function checkIn(int $memberId, array $body = [], array $headers = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaffMember()->postJson($this->api("members/{$memberId}/check-in"), $body, $headers);
    }

    public function test_the_options_decide_what_the_desk_may_do(): void
    {
        $this->checkIn($this->grace->id)->assertStatus(409)->assertJsonPath('error', 'option_off');

        $this->setOptions(['checkin_enabled' => true]);
        $this->checkIn($this->grace->id, ['amount' => 20])->assertStatus(409)->assertJsonPath('error', 'desk_earn_off');

        $this->setOptions(['checkin_enabled' => false, 'desk_earn_enabled' => true]);
        $this->checkIn($this->grace->id)->assertStatus(422)->assertJsonPath('error', 'amount_required');

        $this->assertSame(0, ScanEvent::withoutGlobalScopes()->count());
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
    }

    public function test_a_check_in_gives_its_points_and_stamp_once_a_day_and_logs_every_request(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 10, 'stamps_enabled' => true, 'stamps_per_card' => 10]);

        $first = $this->checkIn($this->grace->id, ['idempotency_key' => 'press-1'])->assertOk();
        $first->assertJsonPath('already_today', false)
            ->assertJsonPath('points.checkin', 10)
            ->assertJsonPath('points.purchase', 0)
            ->assertJsonPath('points.balance', 210)
            ->assertJsonPath('stamp.added', true)
            ->assertJsonPath('stamp.card.stamps_count', 1)
            ->assertJsonPath('stamp.card.stamps_needed', 10)
            ->assertJsonPath('stamp.completed', null)
            ->assertJsonPath('credit', null)
            ->assertJsonPath('member.id', $this->grace->id)
            ->assertJsonPath('member.points', 210)
            ->assertJsonPath('member.referral_code', $this->grace->referral_code);

        $row = ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $line = PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->latest('id')->firstOrFail();
        $this->assertSame(['desk', 'check_in', 'success', (int) $line->id, $this->staffMember->id], [$row->scan_type, $row->action_taken, $row->result, (int) $row->transaction_id, (int) $row->staff_id]);
        $this->assertSame(['bonus', 10, 0, 'scan_event', (int) $row->id], [$line->type, (int) $line->points, (int) $line->qualifying_points, $line->reference_type, (int) $line->reference_id]);
        $stamp = Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame(['check_in', 'scan_event', (int) $row->id, '2026-10-05'], [$stamp->source, $stamp->reference_type, $stamp->reference_id, $stamp->day()]);

        // Later the same day: already checked in — no points, no stamp; the request is still logged.
        $this->travel(3)->hours();
        $this->checkIn($this->grace->id, ['idempotency_key' => 'press-2'])->assertOk()
            ->assertJsonPath('already_today', true)
            ->assertJsonPath('points.checkin', 0)
            ->assertJsonPath('points.balance', 210)
            ->assertJsonPath('stamp.added', false)
            ->assertJsonPath('stamp.reason', 'already_today')
            ->assertJsonPath('stamp.card.stamps_count', 1);
        $this->assertSame(2, ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(1, Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
    }

    public function test_the_venue_day_is_the_venues_own(): void
    {
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 5, 'stamps_enabled' => true]);

        // 20:30 UTC is 23:30 in Riga: still 5 October there.
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 20:30:00'));
        $this->checkIn($this->grace->id)->assertJsonPath('already_today', false);
        // 21:30 UTC is 00:30 on 6 October in Riga: a new day, a new check-in.
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 21:30:00'));
        $this->checkIn($this->grace->id)->assertJsonPath('already_today', false)->assertJsonPath('points.checkin', 5);

        $this->assertSame(['2026-10-05', '2026-10-06'], Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->orderBy('id')->get()->map->day()->all());
    }

    public function test_a_purchase_earns_by_the_venues_rate_qualifying_also_after_the_days_check_in(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 10, 'desk_earn_enabled' => true, 'stamps_enabled' => true]);
        $this->checkIn($this->ada->id)->assertJsonPath('points.checkin', 10);

        // Ada is Gold (1.25 a unit): 45.00 earns 56, qualifying, with the amount on the line.
        $this->checkIn($this->ada->id, ['amount' => 45, 'note' => 'Lunch for two'])->assertOk()
            ->assertJsonPath('already_today', true)
            ->assertJsonPath('points.checkin', 0)
            ->assertJsonPath('points.purchase', 56)
            ->assertJsonPath('points.balance', 1566)
            ->assertJsonPath('stamp.reason', 'already_today');

        $line = PointsTransaction::withoutGlobalScopes()->where('member_id', $this->ada->id)->where('type', 'earn')->firstOrFail();
        $this->assertSame([56, 56, '45.00', 'Purchase: Lunch for two'], [(int) $line->points, (int) $line->qualifying_points, (string) $line->amount_spent, $line->description]);
        $this->assertSame(1, Stamp::withoutGlobalScopes()->where('member_id', $this->ada->id)->count());
    }

    public function test_a_purchase_alone_is_the_days_visit_when_check_in_is_off(): void
    {
        $this->setOptions(['desk_earn_enabled' => true, 'stamps_enabled' => true, 'checkin_points' => 10]);

        $this->checkIn($this->grace->id, ['amount' => 12.5])->assertOk()
            ->assertJsonPath('already_today', false)
            ->assertJsonPath('points.checkin', 0)
            ->assertJsonPath('points.purchase', 12)
            ->assertJsonPath('stamp.added', true);
        $this->assertSame('purchase', Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->value('source'));
    }

    public function test_the_days_first_visit_is_its_check_in_even_when_it_is_a_purchase(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 10, 'desk_earn_enabled' => true]);

        $this->checkIn($this->grace->id, ['amount' => 20])->assertOk()
            ->assertJsonPath('already_today', false)
            ->assertJsonPath('points.checkin', 10)
            ->assertJsonPath('points.purchase', 20)
            ->assertJsonPath('stamp', null);
        $this->checkIn($this->grace->id)->assertOk()->assertJsonPath('already_today', true)->assertJsonPath('points.checkin', 0);
        $this->assertSame(230, (int) $this->grace->fresh()->current_points);
        $row = ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->orderBy('id')->firstOrFail();
        $this->assertSame((int) PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->where('type', 'earn')->value('id'), (int) $row->transaction_id, 'the purchase line, when both were written');
    }

    public function test_a_retry_with_its_key_writes_nothing_and_answers_the_same_and_the_key_never_reaches_another_member(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 10, 'desk_earn_enabled' => true, 'stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_points' => 100]);
        DB::table('stamp_cards')->insert(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'number' => 1, 'stamps_needed' => 2, 'stamps_count' => 0, 'created_at' => now(), 'updated_at' => now()]);
        $this->checkIn($this->grace->id, ['idempotency_key' => 'yesterday'])->assertOk();
        $this->travel(1)->days();

        $body = ['amount' => 30, 'idempotency_key' => 'press-9'];
        $first = $this->checkIn($this->grace->id, $body)->assertOk()->json();
        $again = $this->checkIn($this->grace->id, $body)->assertOk()->json();

        $this->assertSame(['kind' => 'points', 'points' => 100], $first['stamp']['completed']['reward']);
        $this->assertSame($first, $again);
        $this->assertSame(2, ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(4, PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count(), 'two check-ins, a purchase and a full card');

        // The header is the key when the body has none; the same key on another member is that member's own visit.
        $this->checkIn($this->grace->id, ['amount' => 30], ['Idempotency-Key' => 'press-9'])->assertOk()->assertJson($first);
        $this->checkIn($this->ada->id, $body)->assertOk()->assertJsonPath('already_today', false)->assertJsonPath('member.id', $this->ada->id);
        $this->assertSame(2, ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
    }

    public function test_a_purchase_earns_cashback_through_the_visit_once(): void
    {
        $this->setOptions(['desk_earn_enabled' => true, 'cashback_enabled' => true, 'cashback_percent' => 5]);
        $body = ['amount' => 45, 'idempotency_key' => 'till-1'];

        $first = $this->checkIn($this->grace->id, $body)->assertOk()
            ->assertJsonPath('credit.amount', 2.25)
            ->assertJsonPath('credit.balance', 2.25)
            ->json('credit');
        $this->checkIn($this->grace->id, $body)->assertOk()->assertJsonPath('credit', $first);

        $row = ScanEvent::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $line = DB::table('credit_transactions')->where('member_id', $this->grace->id)->get();
        $this->assertCount(1, $line);
        $this->assertSame(['scan_event', (int) $row->id], [$line[0]->reference_type, (int) $line[0]->reference_id]);
    }

    public function test_two_taps_with_different_keys_give_one_check_in_and_one_stamp(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'checkin_points' => 10, 'stamps_enabled' => true]);

        $this->checkIn($this->grace->id, ['idempotency_key' => 'tap-a'])->assertOk();
        $this->checkIn($this->grace->id, ['idempotency_key' => 'tap-b'])->assertOk()->assertJsonPath('already_today', true);

        $this->assertSame(1, Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(10, (int) PointsTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->sum('points'));
    }

    public function test_the_amount_is_money_in_the_venues_currency(): void
    {
        $this->setOptions(['desk_earn_enabled' => true]);
        foreach ([0, -5, 1000001, 12.345, 'ten'] as $bad) {
            $this->checkIn($this->grace->id, ['amount' => $bad])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        }
        $this->checkIn($this->grace->id, ['amount' => 12.34])->assertOk();

        DB::table('organizations')->where('id', $this->org->id)->update(['currency' => 'JPY']);
        $this->checkIn($this->grace->id, ['amount' => 1200.5])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->checkIn($this->grace->id, ['amount' => 1200])->assertOk()->assertJsonPath('points.purchase', 1200);

        $this->checkIn($this->grace->id, ['note' => str_repeat('x', 201), 'amount' => 5])->assertStatus(422)->assertJsonValidationErrors(['note']);
    }

    public function test_awarding_needs_its_flag_and_the_member_must_be_this_organisations_and_active(): void
    {
        $this->setOptions(['checkin_enabled' => true]);
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_award_points' => false]);
        $this->checkIn($this->grace->id)->assertStatus(403)->assertJsonPath('need', 'can_award_points');

        $other = $this->otherOrganization();
        $this->asManager()->postJson($this->api("members/{$other['member']->id}/check-in"))->assertStatus(404);

        $this->grace->forceFill(['is_active' => false])->save();
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/check-in"))->assertStatus(409)->assertJsonPath('error', 'inactive');
        $this->assertSame(0, ScanEvent::withoutGlobalScopes()->count());
    }

    public function test_staff_read_a_members_stamp_card(): void
    {
        $this->setOptions(['checkin_enabled' => true, 'stamps_enabled' => true, 'stamps_per_card' => 4]);
        $this->checkIn($this->grace->id);

        $this->asStaffMember()->getJson($this->api("members/{$this->grace->id}/stamps"))->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('card.stamps_count', 1)
            ->assertJsonPath('card.stamps_needed', 4)
            ->assertJsonPath('card.stamps.0.source', 'check_in')
            ->assertJsonPath('card.stamps.0.by', $this->staffMember->name)
            ->assertJsonPath('completed_cards', 0);
        $other = $this->otherOrganization();
        $this->asStaffMember()->getJson($this->api("members/{$other['member']->id}/stamps"))->assertStatus(404);
    }
}
