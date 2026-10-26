<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\TierCounters;
use App\Services\Loyalty\Visits\Visit;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * How a member's tier moves (release 9 review): two tiers level on every floor are placed by sort_order and level there
 * too is no move; soft landing steps one tier down the measure's own ladder, not the list's order; the grace period runs
 * from the first assessment that would drop the member (a move no longer holds the tier a year), and qualifying again
 * stops it; progress never points at an invitation-only tier, and the points summary agrees with tierProgress().
 *
 * The workspace's ladder: Silver (0 points), Gold (1,000), Platinum (5,000); here also by visits 0 / 3 / 6. Ada is on
 * Gold with 1,500 points, Grace on Silver with 200.
 */
class TierMovesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, TierCountsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildTierCountsSchema();
        $this->buildValiditySchema();
        foreach (['silver' => 0, 'gold' => 3, 'platinum' => 6] as $name => $visits) {
            $this->tiers[$name]->forceFill(['min_visits' => $visits, 'grace_period_days' => 0, 'soft_landing' => false])->save();
        }
        LoyaltyTier::flushCacheFor($this->org->id);
    }

    private function by(string $measure): void
    {
        ProgrammeOptions::save($this->org->id, ['tier_progress_by' => $measure], $this->manager);
    }

    private function visit(LoyaltyMember $m, int $ref, string $day): void
    {
        app(TierCounters::class)->count($m, new Visit(Visit::CHECK_IN, 'scan_event', $ref, null, $day));
    }

    private function tierOf(LoyaltyMember $m): string
    {
        return (string) LoyaltyTier::query()->find($m->fresh()->tier_id)?->name;
    }

    private function tier(array $attributes): LoyaltyTier
    {
        $tier = LoyaltyTier::create($attributes + ['earn_rate' => 1, 'is_active' => true, 'grace_period_days' => 0, 'soft_landing' => false]);
        LoyaltyTier::flushCacheFor($this->org->id);

        return $tier;
    }

    public function test_a_staff_only_tier_level_on_every_floor_with_the_bottom_one_keeps_its_rules(): void
    {
        // A venue on visits: VIP has no visits floor (staff put members on it) and, like every tier, points floor 0.
        $this->by('visits');
        $this->tiers['silver']->forceFill(['min_points' => 0])->save();
        $vip = $this->tier(['name' => 'VIP', 'min_points' => 0, 'min_visits' => null, 'sort_order' => 9]);
        $this->grace->forceFill(['tier_id' => $vip->id, 'tier_override_until' => now()->addMonths(2), 'tier_effective_until' => null])->save();

        // One visit qualifies Grace for Silver only: VIP stands above it (sort_order), so "keep until" holds her there.
        $this->visit($this->grace, 1, '2026-10-01');
        $this->assertSame('VIP', $this->tierOf($this->grace));

        // Without "keep until" she drops, as a downgrade (logged and told as one).
        $this->grace->forceFill(['tier_override_until' => null])->save();
        $this->visit($this->grace, 2, '2026-10-02');
        $this->assertSame('Silver', $this->tierOf($this->grace));
        $this->assertSame(1, AuditLog::query()->where('action', 'tier_downgraded')->where('subject_id', $this->grace->id)->count());
    }

    public function test_two_tiers_level_on_every_floor_and_in_the_list_never_move_a_member(): void
    {
        $this->by('visits');
        $twin = $this->tier(['name' => 'Silver twin', 'min_points' => 0, 'min_visits' => null, 'sort_order' => (int) $this->tiers['silver']->sort_order]);
        $this->grace->forceFill(['tier_id' => $twin->id])->save();

        $this->assertFalse(app(LoyaltyService::class)->assessTier($this->grace->fresh()));
        $this->assertSame('Silver twin', $this->tierOf($this->grace));
    }

    public function test_soft_landing_steps_one_tier_down_the_measures_ladder_not_the_lists_order(): void
    {
        $this->by('visits');
        // Added last, so last in the list (sort_order 4), though its floor is between Gold and Platinum.
        $goldPlus = $this->tier(['name' => 'Gold Plus', 'min_points' => 2000, 'min_visits' => 4, 'sort_order' => 4, 'soft_landing' => true]);
        $this->grace->forceFill(['tier_id' => $goldPlus->id, 'tier_effective_until' => null])->save();

        // One visit is Silver's: soft landing takes her one step down — Gold, never Platinum (the tier before it in the list).
        $this->visit($this->grace, 1, '2026-10-01');
        $this->assertSame('Gold', $this->tierOf($this->grace));
    }

    public function test_grace_runs_from_the_first_dip_and_qualifying_again_stops_it(): void
    {
        $this->tiers['gold']->forceFill(['grace_period_days' => 30])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        $service = app(LoyaltyService::class);

        // Grace climbs to Gold: a move sets no grace deadline (it used to be a year ahead, holding the tier a year).
        $this->grace->forceFill(['lifetime_points' => 1200])->save();
        $this->assertTrue($service->assessTier($this->grace->fresh()));
        $this->assertSame('Gold', $this->tierOf($this->grace));
        $this->assertNull($this->grace->fresh()->tier_effective_until);

        // She dips: the clock starts, 30 days.
        $this->grace->forceFill(['lifetime_points' => 300])->save();
        $this->assertFalse($service->assessTier($this->grace->fresh()));
        $this->assertSame(now()->addDays(30)->toDateString(), $this->grace->fresh()->tier_effective_until->toDateString());

        // She qualifies again: the clock stops, so the next dip has its full grace.
        $this->grace->forceFill(['lifetime_points' => 1100])->save();
        $this->assertFalse($service->assessTier($this->grace->fresh()));
        $this->assertNull($this->grace->fresh()->tier_effective_until);

        // A dip, then the 30 days pass: she drops.
        $this->grace->forceFill(['lifetime_points' => 300])->save();
        $service->assessTier($this->grace->fresh());
        $this->travel(31)->days();
        $this->assertTrue($service->assessTier($this->grace->fresh()));
        $this->assertSame('Silver', $this->tierOf($this->grace));
        $this->assertNull($this->grace->fresh()->tier_effective_until);
    }

    // ─── The nightly check (loyalty:assess-tiers, owner 2026-10-26) ────────────

    public function test_the_nightly_check_drops_a_tier_whose_grace_or_keep_until_has_ended_and_moves_nobody_twice(): void
    {
        // Ada (Gold, 1,500 points) dipped to 300 and her 30 days of grace ended yesterday; nothing has happened to her since.
        $this->tiers['gold']->forceFill(['grace_period_days' => 30])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        $this->ada->forceFill(['lifetime_points' => 300, 'tier_effective_until' => now()->subDay()->toDateString()])->save();
        // Grace (Silver) was put on Platinum with "keep until" yesterday; her 200 points are Silver's.
        $this->grace->forceFill(['tier_id' => $this->tiers['platinum']->id, 'tier_override_until' => now()->subDay(), 'tier_effective_until' => null])->save();
        // Another Gold member, still holding by her grace: untouched.
        $held = $this->makeMember('Held Gold', 'held@example.test', ['current_points' => 300, 'lifetime_points' => 300, 'tier_id' => $this->tiers['gold']->id, 'tier_effective_until' => now()->addDays(5)->toDateString()]);

        $this->artisan('loyalty:assess-tiers')->expectsOutput('2 moved of 2 checked')->assertSuccessful();
        $this->assertSame('Silver', $this->tierOf($this->ada));
        $this->assertSame('Silver', $this->tierOf($this->grace));
        $this->assertSame('Gold', $this->tierOf($held));
        $this->assertSame(2, AuditLog::query()->where('action', 'tier_downgraded')->count());
        $this->assertSame(2, \App\Models\TierAssessment::query()->where('reason', 'scheduled')->count());

        // A second run the same night moves nobody.
        $this->artisan('loyalty:assess-tiers')->expectsOutput('0 moved of 1 checked')->assertSuccessful();
        $this->artisan('loyalty:assess-tiers', ['--org' => $this->org->id + 1000])->expectsOutput('0 moved of 0 checked')->assertSuccessful();
    }

    public function test_on_a_windowed_programme_the_nightly_check_reads_every_member_with_a_tier(): void
    {
        \App\Models\HotelSetting::create(['key' => 'tier_qualification_basis', 'value' => LoyaltyService::BASIS_WINDOWED, 'type' => 'string', 'group' => 'loyalty', 'label' => 'Tier qualification basis']);
        // Ada's 1,500 points were all earned more than a year ago: her window holds none, and nothing has happened since.
        \Illuminate\Support\Facades\DB::table('points_transactions')->insert(['organization_id' => $this->org->id, 'member_id' => $this->ada->id, 'type' => 'earn', 'points' => 1500, 'balance_after' => 1500, 'description' => 'A stay', 'created_at' => now()->subMonths(14), 'updated_at' => now()->subMonths(14)]);
        $this->ada->forceFill(['tier_effective_until' => null])->save();

        $this->artisan('loyalty:assess-tiers')->assertSuccessful();
        $this->assertSame('Silver', $this->tierOf($this->ada));
    }

    public function test_the_nightly_check_is_scheduled_once_a_night_without_overlapping(): void
    {
        $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'loyalty:assess-tiers'));
        $this->assertNotNull($event);
        $this->assertSame('47 2 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    public function test_progress_never_points_at_an_invitation_only_tier_and_the_points_summary_agrees(): void
    {
        $this->tiers['platinum']->forceFill(['invitation_only' => true])->save();
        LoyaltyTier::flushCacheFor($this->org->id);
        $service = app(LoyaltyService::class);

        // Ada on Gold: Platinum is by invitation, so nothing is next.
        $this->assertNull($service->tierProgress($this->ada->fresh())['next_tier']);
        $this->assertSame(['percentage' => 100, 'points_needed' => 0, 'next_tier' => null], $this->ada->fresh()->getProgressToNextTier());

        // Grace on Silver with 200 points: Gold is next, 800 to go, on both readings.
        $progress = $this->grace->fresh()->getProgressToNextTier();
        $this->assertSame(800, $progress['points_needed']);
        $this->assertSame('Gold', $progress['next_tier']->name);
        $this->assertSame(20, $progress['percentage']);
        $this->assertSame(800, $service->tierProgress($this->grace->fresh())['needed']);
    }
}
