<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\TierAssessment;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\TierCounters;
use App\Services\Loyalty\Visits\Visit;
use App\Services\LoyaltyService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * How members move between tiers (release 8, spec 2026-10-25 §3, R8-4): the option `tier_progress_by` — points (the
 * default, as always), visits or spend — on its own card on Ways to earn; a visit of any kind counts once per member per
 * venue day (a second the same day adds its spend, no visit) and a reversal takes it back; assessTier() judges by the
 * programme's measure with the ladder's direction, grace, lock and "keep until" as for points; switching the measure
 * moves nobody until the next assessment; and progress reads in the measure's terms.
 *
 * The workspace's ladder: Silver (0 points), Gold (1,000), Platinum (5,000); here also by visits 0 / 3 / 6 and by
 * spend 0 / 200 / 800. Ada is on Gold with 1,500 points, Grace on Silver with 200.
 */
class TierProgressTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, TierCountsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildTierCountsSchema();
        $this->buildValiditySchema();
        // Ways to earn lists the presets (their stamp is in crm_settings); the member summary counts bookings.
        $this->setUpLoyaltyPresetSchema();
        if (!\Illuminate\Support\Facades\Schema::hasTable('bookings')) {
            \Illuminate\Support\Facades\Schema::create('bookings', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->timestamps();
            });
        }
        foreach (['silver' => [0, 0], 'gold' => [3, 200], 'platinum' => [6, 800]] as $name => [$visits, $spend]) {
            $this->tiers[$name]->forceFill(['min_visits' => $visits, 'min_spend' => $spend])->save();
        }
        LoyaltyTier::flushCacheFor($this->org->id);
    }

    private function by(string $measure): void
    {
        ProgrammeOptions::save($this->org->id, ['tier_progress_by' => $measure], $this->manager);
    }

    private function visit(LoyaltyMember $m, int $ref, string $day, ?float $amount = null, string $source = Visit::CHECK_IN): void
    {
        app(TierCounters::class)->count($m, new Visit($source, 'scan_event', $ref, $amount, $day));
    }

    private function visits(LoyaltyMember $m): int
    {
        return (int) DB::table('loyalty_members')->where('id', $m->id)->value('qualifying_visits');
    }

    private function tierOf(LoyaltyMember $m): string
    {
        return (string) LoyaltyTier::query()->find($m->fresh()->tier_id)?->name;
    }

    public function test_the_option_has_its_own_card_and_the_bootstrap_says_it(): void
    {
        $answer = $this->asStaffMember()->getJson($this->api('options'))->assertOk()
            ->assertJsonPath('options.tier_progress_by', 'points')
            ->assertJsonPath('fields.tier_progress_by', ['type' => 'enum', 'default' => 'points', 'min' => null, 'max' => null, 'choices' => ['points', 'visits', 'spend'], 'when' => null]);
        $this->assertContains(['key' => 'tier_progress', 'switch' => null, 'zero_off' => null, 'fields' => ['tier_progress_by']], $answer->json('ways'));
        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('programme.progress_by', 'points');

        $this->asManager()->putJson($this->api('options'), ['options' => ['tier_progress_by' => 'visits']])->assertOk()->assertJsonPath('options.tier_progress_by', 'visits');
        $this->asManager()->putJson($this->api('options'), ['options' => ['tier_progress_by' => 'nights']])->assertStatus(422)->assertJsonValidationErrors('tier_progress_by');
        $this->asStaffMember()->putJson($this->api('options'), ['options' => ['tier_progress_by' => 'spend']])->assertStatus(403);

        $this->asStaffMember()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('programme.progress_by', 'visits');
        $audit = AuditLog::query()->where('action', 'loyalty.options_changed')->latest('id')->firstOrFail();
        $this->assertSame(['tier_progress_by' => 'points'], $audit->old_values);
        $this->assertSame(['tier_progress_by' => 'visits'], $audit->new_values);
        $this->assertSame('visits', app(LoyaltyService::class)->progressBy((int) $this->org->id));
    }

    public function test_a_visit_of_any_kind_counts_once_per_member_per_venue_day(): void
    {
        $this->visit($this->grace, 1, '2026-10-01');                                  // a check-in
        $this->visit($this->grace, 2, '2026-10-01', 25.0, Visit::PURCHASE);           // the same day: its spend, no visit
        $this->visit($this->grace, 3, '2026-10-02', null, Visit::EVENT);              // an event the next day
        $this->visit($this->grace, 3, '2026-10-02', null, Visit::EVENT);              // the same reference again: nothing
        app(TierCounters::class)->count($this->grace, new Visit(Visit::STAY, 'booking_mirror', 9, 300.0, '2026-10-03', null, 2));
        app(TierCounters::class)->count($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 9, 40.0, '2026-10-04'));
        $this->visit($this->ada, 4, '2026-10-01');                                    // another member, the same day: theirs

        $this->assertSame(4, $this->visits($this->grace));
        $this->assertSame(1, $this->visits($this->ada));
        $this->assertSame('365.00', number_format((float) DB::table('loyalty_members')->where('id', $this->grace->id)->value('qualifying_spend'), 2, '.', ''));
        $rows = DB::table('tier_qualification_counts')->where('member_id', $this->grace->id)->orderBy('id')->get(['reference_id', 'visits', 'venue_day'])
            ->map(fn ($r) => [(int) $r->reference_id, (int) $r->visits, $r->venue_day])->all();
        $this->assertSame([[1, 1, '2026-10-01'], [2, 0, '2026-10-01'], [3, 1, '2026-10-02'], [9, 1, '2026-10-03'], [9, 1, '2026-10-04']], $rows);
    }

    public function test_a_plain_second_visit_keeps_the_day_when_the_first_is_taken_back(): void
    {
        // An appointment, then a check-in without an amount the same day: one visit; the check-in is kept as the day's.
        app(TierCounters::class)->count($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 41, 50.0, '2026-10-01'));
        $this->visit($this->grace, 42, '2026-10-01');
        $this->assertSame(1, $this->visits($this->grace));

        // The appointment is refunded: its spend goes, the day keeps its visit through the check-in.
        app(TierCounters::class)->uncount((int) $this->org->id, 'service_booking', 41);
        $this->assertSame(1, $this->visits($this->grace));
        $this->assertSame(1, (int) DB::table('tier_qualification_counts')->where('reference_id', 42)->value('visits'));
    }

    public function test_a_reversal_takes_the_visit_back_and_a_days_other_visit_keeps_the_day(): void
    {
        $this->visit($this->grace, 1, '2026-10-01');
        $this->visit($this->grace, 2, '2026-10-01', 25.0, Visit::PURCHASE);
        $this->visit($this->grace, 3, '2026-10-02');
        $this->assertSame(2, $this->visits($this->grace));

        // The 1st's counted visit is taken back, but the purchase that day still stands: the day keeps its visit.
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 1);
        $this->assertSame(2, $this->visits($this->grace));
        $this->assertSame(1, (int) DB::table('tier_qualification_counts')->where('reference_id', 2)->value('visits'));

        // Now the purchase goes too, and the 2nd: nothing is left of either day.
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 2);
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 3);
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 3);
        $this->assertSame(0, $this->visits($this->grace));
        $this->assertSame('0.00', number_format((float) DB::table('loyalty_members')->where('id', $this->grace->id)->value('qualifying_spend'), 2, '.', ''));

        // A day whose visits were all taken back counts again with the next one.
        $this->visit($this->grace, 5, '2026-10-01');
        $this->assertSame(1, $this->visits($this->grace));
    }

    public function test_by_visits_members_climb_on_their_visits_and_the_downgrade_rules_hold(): void
    {
        $this->by('visits');
        $this->tiers['gold']->forceFill(['grace_period_days' => 30, 'soft_landing' => false])->save();
        LoyaltyTier::flushCacheFor($this->org->id);

        $this->visit($this->grace, 1, '2026-10-01');
        $this->visit($this->grace, 2, '2026-10-02');
        $this->assertSame('Silver', $this->tierOf($this->grace));
        $this->visit($this->grace, 3, '2026-10-03');
        $this->assertSame('Gold', $this->tierOf($this->grace), '3 visits reach Gold');
        $this->assertSame(1, TierAssessment::where('member_id', $this->grace->id)->count());

        // A visit taken back: the grace period holds Gold (the direction is read on the visits ladder).
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 3);
        $this->assertSame(2, $this->visits($this->grace));
        $this->assertSame('Gold', $this->tierOf($this->grace));
        $this->assertNotNull($this->grace->fresh()->tier_effective_until);

        // A locked tier never drops; a manager's "keep until" holds until its day.
        $this->tiers['gold']->forceFill(['grace_period_days' => 0])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        $this->grace->forceFill(['tier_locked' => true, 'tier_effective_until' => null])->save();
        $this->visit($this->grace, 4, '2026-10-01', 10.0);
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 4);
        $this->assertSame('Gold', $this->tierOf($this->grace));
        $this->grace->forceFill(['tier_locked' => false, 'tier_override_until' => now()->addDays(10)])->save();
        $this->visit($this->grace, 6, '2026-10-01', 10.0);
        $this->assertSame('Gold', $this->tierOf($this->grace));

        // Points no longer move anyone at a venue by visits: 10,000 points leave Grace on Gold.
        app(LoyaltyService::class)->awardPoints($this->grace->fresh(), 10000, 'Big award');
        $this->assertSame('Gold', $this->tierOf($this->grace));
    }

    public function test_by_spend_members_climb_on_what_they_spend(): void
    {
        $this->by('spend');
        $this->visit($this->grace, 1, '2026-10-01', 150.0, Visit::PURCHASE);
        $this->assertSame('Silver', $this->tierOf($this->grace));
        $this->visit($this->grace, 2, '2026-10-01', 60.0, Visit::PURCHASE);
        $this->assertSame('Gold', $this->tierOf($this->grace));
        $this->visit($this->grace, 3, '2026-10-02', 600.0, Visit::PURCHASE);
        $this->assertSame('Platinum', $this->tierOf($this->grace));
    }

    public function test_switching_the_measure_moves_nobody_at_once_the_next_assessment_does(): void
    {
        // Ada sits on Gold by her 1,500 points, with no visit counted.
        $this->by('visits');
        $this->assertSame('Gold', $this->tierOf($this->ada), 'nobody moves when the option changes');

        // Her next assessment (a visit) reads visits: one visit is Silver's, and Gold drops (no grace on Gold here).
        $this->tiers['gold']->forceFill(['grace_period_days' => 0, 'soft_landing' => false])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        $this->visit($this->ada, 1, '2026-10-01');
        $this->assertSame('Silver', $this->tierOf($this->ada));

        // Back to points: her points put her on Gold again at the next points assessment.
        $this->by('points');
        app(LoyaltyService::class)->awardPoints($this->ada->fresh(), 10, 'A visit');
        $this->assertSame('Gold', $this->tierOf($this->ada));
    }

    public function test_a_tier_without_a_floor_on_the_measure_is_not_reached_by_it(): void
    {
        $this->by('visits');
        $this->tiers['platinum']->forceFill(['min_visits' => null])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        foreach (range(1, 9) as $day) {
            $this->visit($this->grace, $day, sprintf('2026-09-%02d', $day));
        }

        $this->assertSame('Gold', $this->tierOf($this->grace));
        $this->assertNull(app(LoyaltyService::class)->tierProgress($this->grace->fresh())['next_tier']);
    }

    public function test_progress_reads_in_the_measures_terms(): void
    {
        $service = app(LoyaltyService::class);

        // Points, as the member page has always read it.
        $this->assertSame(
            ['by' => 'points', 'qualifying' => 200, 'next_tier' => ['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'min_points' => 1000, 'floor' => 1000], 'needed' => 800, 'percent' => 20],
            $service->tierProgress($this->grace->fresh()),
        );

        $this->by('visits');
        $this->visit($this->grace, 1, '2026-10-01');
        $this->assertSame(
            ['by' => 'visits', 'qualifying' => 1, 'next_tier' => ['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'min_points' => 1000, 'floor' => 3], 'needed' => 2, 'percent' => 33],
            $service->tierProgress($this->grace->fresh()),
        );

        $this->by('spend');
        $this->visit($this->grace, 2, '2026-10-02', 80.0, Visit::PURCHASE);
        $this->assertSame(
            ['by' => 'spend', 'qualifying' => 80.0, 'next_tier' => ['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'min_points' => 1000, 'floor' => 200.0], 'needed' => 120.0, 'percent' => 40],
            $service->tierProgress($this->grace->fresh()),
        );

        // The top tier: nothing above.
        $this->grace->forceFill(['tier_id' => $this->tiers['platinum']->id])->save();
        $this->assertSame(['by' => 'spend', 'qualifying' => 80.0, 'next_tier' => null, 'needed' => 0, 'percent' => 100], $service->tierProgress($this->grace->fresh()));
    }

    public function test_the_member_summary_keeps_its_keys_and_follows_the_measure(): void
    {
        $service = app(LoyaltyService::class);
        $summary = fn () => $service->getMemberSummary(LoyaltyMember::query()->with(['tier', 'user'])->findOrFail($this->grace->id))['progress'];

        $points = $summary();
        $this->assertSame(['percentage', 'points_needed', 'next_tier', 'by', 'needed'], array_keys($points));
        $this->assertSame(['points', 800, 800, 'Gold'], [$points['by'], $points['points_needed'], $points['needed'], $points['next_tier']->name]);

        $this->by('visits');
        $this->visit($this->grace, 1, '2026-10-01');
        $visits = $summary();
        $this->assertSame(['visits', 2, 2, 33, 'Gold'], [$visits['by'], $visits['points_needed'], $visits['needed'], $visits['percentage'], $visits['next_tier']->name]);

        $this->by('spend');
        $this->visit($this->grace, 2, '2026-10-02', 80.5, Visit::PURCHASE);
        $spend = $summary();
        $this->assertSame(['spend', 120, 119.5, 'Gold'], [$spend['by'], $spend['points_needed'], $spend['needed'], $spend['next_tier']->name]);
    }

    public function test_the_tier_form_takes_a_visits_and_a_spend_floor(): void
    {
        $id = $this->asManager()->postJson($this->api('program/tiers'), ['name' => 'Club', 'min_points' => 0, 'min_visits' => 12, 'min_spend' => '150.5', 'earn_rate' => 1])
            ->assertCreated()->assertJsonPath('tier.min_visits', 12)->assertJsonPath('tier.min_spend', 150.5)->json('tier.id');
        $this->asManager()->putJson($this->api("program/tiers/{$id}"), ['min_visits' => null])->assertOk()->assertJsonPath('tier.min_visits', null)->assertJsonPath('tier.min_spend', 150.5);
        $this->asManager()->putJson($this->api("program/tiers/{$id}"), ['min_visits' => -1])->assertStatus(422)->assertJsonValidationErrors('min_visits');
        $this->asManager()->putJson($this->api("program/tiers/{$id}"), ['min_visits' => 2.5])->assertStatus(422)->assertJsonValidationErrors('min_visits');
        $this->asManager()->putJson($this->api("program/tiers/{$id}"), ['min_spend' => 'a lot'])->assertStatus(422)->assertJsonValidationErrors('min_spend');
        $this->asStaffMember()->putJson($this->api("program/tiers/{$id}"), ['min_visits' => 3])->assertStatus(403);

        $this->asStaffMember()->getJson($this->api('program'))->assertOk()->assertJsonPath('tiers.1.min_visits', 3);
    }

    public function test_the_venue_day_is_the_venues_own(): void
    {
        // 23:30 in Riga on the 4th is the 5th there. The desk's visits carry that day, so two check-ins either side of
        // midnight UTC that are one venue day count one visit.
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-04 21:30:00'));
        $day = \App\Services\Portal\PortalBootstrap::venueToday((int) $this->org->id)->toDateString();
        $this->assertSame('2026-10-05', $day);
        $this->visit($this->grace, 1, $day);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 08:00:00'));
        $this->visit($this->grace, 2, \App\Services\Portal\PortalBootstrap::venueToday((int) $this->org->id)->toDateString());

        $this->assertSame(1, $this->visits($this->grace));
        HotelSetting::flushCacheFor($this->org->id);
    }
}
