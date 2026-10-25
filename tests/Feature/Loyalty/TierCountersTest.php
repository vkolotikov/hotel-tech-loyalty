<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\TierAssessment;
use App\Services\Loyalty\Visits\TierCounters;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitRecorder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The tier qualification counters (release 7, spec 2026-10-25 §4.3): a finished stay adds its nights, one stay and its
 * spend; a completed appointment and a desk purchase their spend; a check-in without an amount nothing. Once per
 * reference (the nightly stay sweep calls again), a reversal takes back exactly what was added and never below zero,
 * and the tier is assessed after — for a member judged on the counters, through assessTier()'s own rules.
 */
class TierCountersTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, VisitsSchema, CreditSchema, TierCountsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildTierCountsSchema();
    }

    private function counters(): TierCounters
    {
        return app(TierCounters::class);
    }

    private function stay(int $id, int $nights, float $amount): Visit
    {
        return new Visit(Visit::STAY, 'booking_mirror', $id, $amount, '2026-10-04', null, $nights);
    }

    /** @return array{0: int, 1: int, 2: string} nights, stays, spend as stored */
    private function read(LoyaltyMember $m): array
    {
        $row = DB::table('loyalty_members')->where('id', $m->id)->first(['qualifying_nights', 'qualifying_stays', 'qualifying_spend']);

        return [(int) $row->qualifying_nights, (int) $row->qualifying_stays, number_format((float) $row->qualifying_spend, 2, '.', '')];
    }

    public function test_a_finished_stay_adds_its_nights_one_stay_and_its_spend_once(): void
    {
        $this->counters()->count($this->grace, $this->stay(501, 3, 420.50));
        $this->counters()->count($this->grace, $this->stay(501, 3, 420.50)); // the nightly sweep again

        $this->assertSame([3, 1, '420.50'], $this->read($this->grace));
        $this->assertSame(1, DB::table('tier_qualification_counts')->where('member_id', $this->grace->id)->count());
        $row = DB::table('tier_qualification_counts')->first();
        $this->assertSame(['booking_mirror', 501, 3, 1], [$row->reference_type, (int) $row->reference_id, (int) $row->nights, (int) $row->stays]);
    }

    public function test_an_appointment_and_a_desk_purchase_add_their_spend_and_a_plain_check_in_nothing(): void
    {
        $this->counters()->count($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 77, 54.0, '2026-10-04'));
        $this->counters()->count($this->grace, new Visit(Visit::PURCHASE, 'scan_event', 8, 12.30, '2026-10-05'));
        $this->counters()->count($this->grace, new Visit(Visit::CHECK_IN, 'scan_event', 9, null, '2026-10-05'));
        $this->counters()->count($this->grace, new Visit(Visit::PURCHASE, null, null, 99.0, '2026-10-05')); // no reference: never counted

        $this->assertSame([0, 0, '66.30'], $this->read($this->grace));
        $this->assertSame(2, DB::table('tier_qualification_counts')->count());
    }

    public function test_a_reversal_takes_back_exactly_what_was_added_never_below_zero_and_once(): void
    {
        $this->counters()->count($this->grace, $this->stay(600, 4, 300));
        $this->counters()->count($this->grace, $this->stay(601, 2, 100));
        // Something else lowered the counters meanwhile (a correction): the reversal stops at zero.
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['qualifying_nights' => 5, 'qualifying_stays' => 1, 'qualifying_spend' => 250]);

        $this->counters()->uncount($this->org->id, 'booking_mirror', 600);
        $this->assertSame([1, 0, '0.00'], $this->read($this->grace));

        $this->counters()->uncount($this->org->id, 'booking_mirror', 600); // twice: nothing more
        $this->counters()->uncount($this->org->id, 'booking_mirror', 999); // never counted: nothing
        $this->assertSame([1, 0, '0.00'], $this->read($this->grace));
        $this->assertNotNull(DB::table('tier_qualification_counts')->where('reference_id', 600)->value('reversed_at'));
        $this->assertNull(DB::table('tier_qualification_counts')->where('reference_id', 601)->value('reversed_at'));

        // A reference taken back is not counted again by a later repeat.
        $this->counters()->count($this->grace, $this->stay(600, 4, 300));
        $this->assertSame([1, 0, '0.00'], $this->read($this->grace));
    }

    public function test_another_organisations_reference_is_not_reversed(): void
    {
        $this->counters()->count($this->grace, $this->stay(700, 2, 80));
        ['org' => $other] = $this->otherOrganization();

        $this->counters()->uncount($other->id, 'booking_mirror', 700);

        $this->assertSame([2, 1, '80.00'], $this->read($this->grace));
    }

    public function test_a_member_judged_on_nights_climbs_when_the_nights_are_counted(): void
    {
        $this->nightsLadder();
        $this->grace->forceFill(['tier_qualification_model' => 'nights'])->save();

        $this->counters()->count($this->grace, $this->stay(800, 6, 500));
        $this->assertSame($this->tiers['silver']->id, (int) $this->grace->fresh()->tier_id);

        $this->counters()->count($this->grace, $this->stay(801, 4, 300));
        $this->assertSame($this->tiers['gold']->id, (int) $this->grace->fresh()->tier_id);
        $this->assertSame(1, TierAssessment::where('member_id', $this->grace->id)->count());
        $this->assertSame(10, (int) TierAssessment::where('member_id', $this->grace->id)->value('qualifying_nights_at_assessment'));
    }

    public function test_a_member_judged_on_points_is_not_reassessed_by_a_visit(): void
    {
        // Ada sits on Gold with 1,500 points; a member put on Platinum by hand with those points would drop on the next
        // points assessment — a visit, which changes nothing they are judged on, must not be that assessment.
        $this->ada->forceFill(['tier_id' => $this->tiers['platinum']->id])->save();

        $this->counters()->count($this->ada, $this->stay(900, 2, 200));

        $this->assertSame($this->tiers['platinum']->id, (int) $this->ada->fresh()->tier_id);
        $this->assertSame(0, TierAssessment::where('member_id', $this->ada->id)->count());
    }

    public function test_a_demotion_by_nights_keeps_the_downgrade_rules_even_on_one_points_floor(): void
    {
        // Two tiers on the same points floor, apart only in nights: the move's direction is read on the nights ladder,
        // so the grace period holds the tier (before, "no direction" skipped every downgrade rule and dropped at once).
        $this->nightsLadder(sharedPointsFloor: true);
        $this->grace->forceFill(['tier_qualification_model' => 'nights'])->save();
        $this->counters()->count($this->grace, $this->stay(1000, 12, 900));
        $this->assertSame($this->tiers['gold']->id, (int) $this->grace->fresh()->tier_id);

        $this->counters()->uncount($this->org->id, 'booking_mirror', 1000);

        $this->assertSame($this->tiers['gold']->id, (int) $this->grace->fresh()->tier_id, 'the grace period holds the tier');
        $this->assertSame(1, TierAssessment::where('member_id', $this->grace->id)->count(), 'the climb only; no drop recorded');

        // A locked tier does not drop either, grace or not.
        $this->tiers['gold']->forceFill(['grace_period_days' => 0])->save();
        $this->grace->forceFill(['tier_locked' => true, 'tier_effective_until' => null])->save();
        $this->counters()->count($this->grace, $this->stay(1001, 12, 900));
        $this->counters()->uncount($this->org->id, 'booking_mirror', 1001);
        $this->assertSame($this->tiers['gold']->id, (int) $this->grace->fresh()->tier_id);
    }

    public function test_the_visit_recorder_counts_a_finished_stay(): void
    {
        $outcome = app(VisitRecorder::class)->record($this->grace, $this->stay(1100, 2, 160));

        $this->assertNotContains('tier_counters', $outcome->failed);
        $this->assertSame([2, 1, '160.00'], $this->read($this->grace));

        app(VisitRecorder::class)->reversed($this->org->id, 'booking_mirror', 1100);
        $this->assertSame([0, 0, '0.00'], $this->read($this->grace));
    }

    /**
     * A counter or referral statement that fails — here a real one, its table gone — inside a caller's transaction (a
     * refund's points reversal, a desk visit) rolls back only that effect: each runs in its own savepoint, so on
     * PostgreSQL the caller's transaction is not aborted, VisitRecorder records the failure and the caller carries on.
     */
    public function test_a_failing_counter_or_referral_write_leaves_the_callers_transaction_usable(): void
    {
        $this->counters()->count($this->grace, $this->stay(1200, 2, 160));
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['referred_by' => $this->ada->id]);
        \Illuminate\Support\Facades\Schema::drop('tier_qualification_counts');
        \Illuminate\Support\Facades\Schema::drop('referrals');

        $carriedOn = DB::transaction(function () {
            app(VisitRecorder::class)->reversed($this->org->id, 'booking_mirror', 1200);
            $outcome = app(VisitRecorder::class)->record($this->grace->fresh(), $this->stay(1201, 3, 90));
            $this->assertContains('tier_counters', $outcome->failed);
            $this->assertContains('referral', $outcome->failed);

            // The caller's own next write still goes through.
            return DB::table('loyalty_members')->where('id', $this->grace->id)->update(['last_activity_at' => now()]);
        });

        $this->assertSame(1, $carriedOn);
        $this->assertSame(3, \App\Models\AuditLog::withoutGlobalScopes()->where('action', 'loyalty.visit_effect_failed')->count());
        $this->assertSame([2, 1, '160.00'], $this->read($this->grace), 'the failed reversal changed nothing');
    }

    /** Silver from 0 nights, Gold from 10, Platinum from 30 (on their own points floors, or all on 0). */
    private function nightsLadder(bool $sharedPointsFloor = false): void
    {
        foreach (['silver' => 0, 'gold' => 10, 'platinum' => 30] as $name => $nights) {
            $this->tiers[$name]->forceFill(['min_nights' => $nights, 'grace_period_days' => 30, 'soft_landing' => false]
                + ($sharedPointsFloor ? ['min_points' => 0] : []))->save();
        }
        LoyaltyTier::flushCacheFor($this->org->id);
    }
}
