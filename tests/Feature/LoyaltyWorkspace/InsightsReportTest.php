<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class InsightsReportTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, SetsUpServiceBookingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpServiceBookingSchema();
        foreach (['guest_id', 'source_created_at'] as $column) {
            if (!Schema::hasColumn('booking_mirror', $column)) Schema::table('booking_mirror', fn (Blueprint $t) => $column === 'guest_id' ? $t->unsignedBigInteger($column)->nullable() : $t->timestamp($column)->nullable());
        }
    }

    private function report(string $query = '')
    {
        return $this->asManager()->getJson($this->api('insights/report?brand_id=all&' . $query))->assertOk();
    }

    private function line(int $points, string $type, string $at, array $more = []): void
    {
        $line = PointsTransaction::withoutGlobalScopes()->create($more + ['organization_id' => $this->org->id,
            'member_id' => $this->ada->id, 'points' => $points, 'type' => $type, 'balance_after' => 100,
            'description' => $type, 'idempotency_key' => uniqid('report', true)]);
        $line->forceFill(['created_at' => $at])->save();
    }

    public function test_completed_days_unique_activity_reversals_and_comparison(): void
    {
        $this->line(100, 'earn', '2026-09-08 12:00:00');
        $this->line(150, 'earn', '2026-09-16 12:00:00');
        $this->line(90, 'earn', '2026-10-05 00:00:00'); // today excluded
        $this->line(500, 'earn', '2026-09-20 12:00:00', ['is_reversed' => true]);
        $this->line(-50, 'redeem', '2026-09-21 12:00:00');
        $this->line(-5, 'expire', '2026-09-22 12:00:00');
        $this->line(10, 'adjust', '2026-09-23 12:00:00', ['description' => 'Refund: cancelled reward redemption old']);
        $r = $this->report()->assertJsonPath('from', '2026-09-07')->assertJsonPath('to', '2026-10-04')
            ->assertJsonPath('comparison.from', '2026-08-10')->assertJsonPath('comparison.to', '2026-09-06')
            ->assertJsonPath('current.active', 1)->assertJsonPath('current.issued', 250)->assertJsonPath('current.redeemed', 40)
            ->assertJsonPath('current.expired', 5)->assertJsonPath('current.participation', 50)->assertJsonPath('previous.active', 0);
        $this->assertGreaterThan(1, array_sum(array_column($r->json('series'), 'active')));
        $this->report('compare=none')->assertJsonPath('previous', null)->assertJsonPath('previous_series', []);
    }

    public function test_cohorts_have_distinct_returns_and_unobserved_weeks_are_null(): void
    {
        $this->ada->forceFill(['joined_at' => '2026-09-08 00:00:00'])->save();
        $this->line(10, 'earn', '2026-09-15 12:00:00');
        $this->line(20, 'earn', '2026-09-16 12:00:00');
        $this->report()->assertJsonPath('cohorts.0.members', 1)->assertJsonPath('cohorts.0.returns', [1, 0, 0])
            ->assertJsonPath('cohorts.1.returns', [0, 0, null])->assertJsonPath('cohorts.3.returns', [null, null, null]);
    }

    public function test_tenant_tier_and_sales_scopes_and_current_claim_status(): void
    {
        $other = $this->otherOrganization();
        $this->line(100, 'earn', '2026-10-01 12:00:00');
        $this->line(200, 'earn', '2026-10-01 12:00:00', ['member_id' => $this->grace->id]);
        $this->line(900, 'earn', '2026-10-01 12:00:00', ['organization_id' => $other['org']->id, 'member_id' => $other['member']->id]);
        $this->line(800, 'earn', '2026-10-01 12:00:00', ['member_id' => $other['member']->id]); // malformed foreign relation
        foreach ([[$this->ada->id, 120], [$this->grace->id, 80], [$other['member']->id, 999]] as [$member, $paid]) {
            DB::table('booking_mirror')->insert(['organization_id' => $this->org->id, 'reservation_id' => uniqid('R'), 'member_id' => $member,
                'price_total' => $paid, 'price_paid' => $paid, 'created_at' => '2026-10-01 12:00:00', 'updated_at' => now()]);
        }
        $reward = Reward::create(['name' => 'Coffee', 'points_cost' => 50, 'is_active' => true]);
        foreach (['fulfilled', 'pending', 'cancelled'] as $state) {
            $r = RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $reward->id, 'points_spent' => 50, 'status' => $state, 'code' => uniqid('R')]);
            $r->forceFill(['created_at' => '2026-10-01 12:00:00'])->save();
        }
        $this->report()->assertJsonPath('current.issued', 300)->assertJsonPath('current.money.members.total', 200)
            ->assertJsonPath('current.claims', 3)->assertJsonPath('current.fulfilment', 33.3)->assertJsonPath('current.cancelled', 1)->assertJsonPath('rewards.0.claims', 3);
        $this->report('tier_id=' . $this->tiers['gold']->id)->assertJsonPath('current.issued', 100)->assertJsonPath('current.money.members.total', 120)
            ->assertJsonPath('tiers.total', 1)->assertJsonPath('outstanding', 1500);
        $this->asManager()->getJson($this->api('insights/report?tier_id=' . $other['tier']->id))->assertUnprocessable();
    }

    public function test_permissions_date_validation_and_dst_boundaries(): void
    {
        $this->asStaffMember()->getJson($this->api('insights/report'))->assertForbidden();
        foreach (['from=2026-10-01', 'from=2026-10-04&to=2026-10-03', 'from=2026-02-30&to=2026-03-03', 'from=2024-01-01&to=2026-01-01', 'from=2026-10-01&to=2026-10-05', 'compare=invalid'] as $q) {
            $this->asManager()->getJson($this->api('insights/report?' . $q))->assertUnprocessable();
        }
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-28 09:00:00'));
        $this->line(1, 'earn', '2026-10-24 20:59:59'); // before Oct 25 in Riga
        $this->line(2, 'earn', '2026-10-24 21:00:00');
        $this->line(4, 'earn', '2026-10-25 21:59:59'); // 25-hour day
        $this->line(8, 'earn', '2026-10-25 22:00:00'); // next day
        $this->report('from=2026-10-25&to=2026-10-25')->assertJsonPath('days', 1)->assertJsonPath('current.issued', 6);
    }
}
