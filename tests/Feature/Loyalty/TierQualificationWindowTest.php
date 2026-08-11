<?php

namespace Tests\Feature\Loyalty;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Windowed tier qualification, and the grace period before a downgrade.
 *
 * `qualification_window` was rendered in the UI, validated, stored — and
 * read exactly once, after the tier decision, purely to fill an audit
 * field. `grace_period_days` was read nowhere in `app/` at all. Both were
 * dropdowns that lied.
 *
 * The safety property matters as much as the feature: the schema defaults
 * `qualification_window` to `rolling_12`, so EVERY existing tier already
 * carries a value nobody chose. Making windows live unconditionally would
 * re-qualify every member against twelve months instead of their lifetime
 * and downgrade most of them overnight. So it is opt-in per org, and the
 * first test here is that nothing changes until someone asks for it.
 */
class TierQualificationWindowTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyService $service;
    private LoyaltyTier $bronze;
    private LoyaltyTier $gold;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        Schema::table('loyalty_tiers', function ($t) {
            if (!Schema::hasColumn('loyalty_tiers', 'grace_period_days')) {
                $t->integer('grace_period_days')->nullable();
            }
            if (!Schema::hasColumn('loyalty_tiers', 'qualification_window')) {
                $t->string('qualification_window', 32)->nullable();
            }
        });

        $this->service = app(LoyaltyService::class);

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->bronze = LoyaltyTierFactory::new()->bronze()->create();
        $this->bronze->forceFill(['min_points' => 0, 'sort_order' => 1])->save();

        $this->gold = LoyaltyTierFactory::new()->create();
        $this->gold->forceFill([
            'name' => 'Gold', 'min_points' => 1000, 'sort_order' => 2, 'is_active' => true,
        ])->save();

        LoyaltyTier::flushCacheFor($org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /**
     * Turn on windowed qualification for this org.
     *
     * `HotelSetting::setValue()` only UPDATES an existing row — it silently
     * no-ops for a key that has never been written. The admin settings
     * endpoint creates the row, so production is fine; a test has to create
     * it itself.
     */
    private function enableWindowedBasis(): void
    {
        HotelSetting::create([
            'key'   => 'tier_qualification_basis',
            'value' => LoyaltyService::BASIS_WINDOWED,
            'type'  => 'string',
            'group' => 'loyalty',
            'label' => 'Tier qualification basis',
        ]);
    }

    private function member(int $lifetime): LoyaltyMember
    {
        return LoyaltyMemberFactory::new()
            ->inTier($this->gold->id)
            ->create(['lifetime_points' => $lifetime, 'current_points' => $lifetime, 'joined_at' => now()->subYears(3)])
            ->refresh();
    }

    /**
     * An earn that happened `$monthsAgo` months back.
     *
     * `created_at` is backdated with forceFill + timestamps off: it isn't
     * fillable, so passing it to create() is silently replaced with "now"
     * — which would put every fixture inside the window and make this test
     * pass for the wrong reason.
     */
    private function earn(LoyaltyMember $member, int $points, int $monthsAgo): void
    {
        $when = now()->subMonths($monthsAgo);

        $tx = new PointsTransaction();
        $tx->timestamps = false;
        $tx->forceFill([
            'member_id'  => $member->id,
            'type'       => 'earn',
            'points'     => $points,
            'created_at' => $when,
            'updated_at' => $when,
        ])->save();
    }

    public function test_default_basis_is_lifetime_so_nothing_changes(): void
    {
        // The property that makes this safe to deploy: with no setting
        // written, qualification is exactly what it has always been.
        $member = $this->member(5000);
        $this->earn($member, 100, monthsAgo: 24); // long outside any window

        $this->assertSame(LoyaltyService::BASIS_LIFETIME, $this->service->qualificationBasis());
        $this->assertSame(5000, $this->service->qualifyingPointsFor($member));
    }

    public function test_windowed_basis_counts_only_points_inside_the_window(): void
    {
        $this->enableWindowedBasis();
        $this->gold->forceFill(['qualification_window' => 'rolling_12'])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        $member = $this->member(5000);
        $this->earn($member, 400, monthsAgo: 2);   // inside
        $this->earn($member, 200, monthsAgo: 6);   // inside
        $this->earn($member, 900, monthsAgo: 18);  // outside

        $this->assertSame(
            600,
            $this->service->qualifyingPointsFor($member->fresh()),
            'lifetime is 5000 but only 600 was earned in the last 12 months'
        );
    }

    public function test_redemptions_and_reversals_do_not_reduce_a_window(): void
    {
        $this->enableWindowedBasis();
        $member = $this->member(1000);

        $this->earn($member, 500, monthsAgo: 1);

        // Spending points does not un-earn them.
        PointsTransaction::create([
            'member_id' => $member->id, 'type' => 'redeem', 'points' => -300,
        ]);
        // A reversed row has its own offsetting entry; counting it twice
        // would understate the window.
        PointsTransaction::create([
            'member_id' => $member->id, 'type' => 'earn', 'points' => 250,
            'is_reversed' => true,
        ]);

        $this->assertSame(500, $this->service->qualifyingPointsFor($member->fresh()));
    }

    public function test_calendar_year_window_starts_in_january(): void
    {
        $this->enableWindowedBasis();
        $this->gold->forceFill(['qualification_window' => 'calendar_year'])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        $member = $this->member(9000);
        $start = $this->service->windowStartFor($member, 'calendar_year');

        $this->assertSame(now()->startOfYear()->toDateString(), $start->toDateString());
    }

    public function test_anniversary_window_uses_the_most_recent_anniversary(): void
    {
        $member = $this->member(9000);
        $start = $this->service->windowStartFor($member->fresh(), 'anniversary_year');

        $this->assertTrue($start->isPast(), 'the window must have already opened, not be scheduled');
        $this->assertTrue(
            $start->greaterThan(now()->subYear()->subDay()),
            'and it must be the most recent anniversary, not an older one'
        );
    }

    public function test_grace_period_defers_a_downgrade_instead_of_applying_it(): void
    {
        $this->gold->forceFill(['grace_period_days' => 30])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        // Gold member who no longer qualifies for Gold.
        $member = $this->member(1500);
        $member->forceFill(['lifetime_points' => 100, 'tier_effective_until' => null])->save();

        $moved = $this->service->assessTier($member->fresh());

        $this->assertFalse($moved, 'the downgrade must be deferred, not applied');
        $this->assertSame($this->gold->id, $member->fresh()->tier_id, 'member keeps their tier during grace');
        $this->assertNotNull($member->fresh()->tier_effective_until, 'the grace clock must be started');
    }

    public function test_downgrade_applies_once_the_grace_period_has_expired(): void
    {
        $this->gold->forceFill(['grace_period_days' => 30])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        $member = $this->member(1500);
        $member->forceFill([
            'lifetime_points'      => 100,
            // Clock started and already ran out.
            'tier_effective_until' => now()->subDay()->toDateString(),
        ])->save();

        $moved = $this->service->assessTier($member->fresh());

        $this->assertTrue($moved, 'once grace has lapsed the downgrade goes through');
        $this->assertSame($this->bronze->id, $member->fresh()->tier_id);
    }

    public function test_no_grace_configured_downgrades_immediately(): void
    {
        $this->gold->forceFill(['grace_period_days' => 0])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        $member = $this->member(1500);
        $member->forceFill(['lifetime_points' => 100, 'tier_effective_until' => null])->save();

        $this->assertTrue($this->service->assessTier($member->fresh()));
        $this->assertSame($this->bronze->id, $member->fresh()->tier_id);
    }

    public function test_grace_never_blocks_an_upgrade(): void
    {
        $this->bronze->forceFill(['grace_period_days' => 30])->save();
        LoyaltyTier::flushCacheFor(app('current_organization_id'));

        $member = LoyaltyMemberFactory::new()
            ->inTier($this->bronze->id)
            ->create(['lifetime_points' => 5000, 'current_points' => 5000])
            ->refresh();

        $this->assertTrue($this->service->assessTier($member), 'grace delays downgrades only');
        $this->assertSame($this->gold->id, $member->fresh()->tier_id);
    }
}
