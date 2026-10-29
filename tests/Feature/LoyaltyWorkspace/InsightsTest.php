<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Brand;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\TierAssessment;
use App\Services\Loyalty\RedemptionActions;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Insights (spec 2026-10-21 release 2 §5): who may read them, the period and
 * its buckets on the venue's clock, and every figure's definition pinned with
 * hand-made rows. The clock is Monday 5 October 2026, 09:00 UTC; the venue is
 * on UTC unless a test names a zone. The 30-day period is 6 September to
 * 5 October.
 */
class InsightsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function insights(string $query = ''): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->getJson($this->api('insights' . ($query === '' ? '' : "?{$query}")))->assertOk();
    }

    /** A ledger line of Ada's (unless told otherwise), at a stored UTC time. */
    private function line(int $points, string $type, string $at, array $more = []): PointsTransaction
    {
        $memberId = $more['member_id'] ?? $this->ada->id;
        $line = PointsTransaction::withoutGlobalScopes()->create($more + [
            'member_id' => $memberId, 'type' => $type, 'points' => $points, 'description' => ucfirst($type),
            'idempotency_key' => uniqid('t', true),
            // NOT NULL in production: the member's balance as the line leaves it.
            'balance_after' => (int) DB::table('loyalty_members')->where('id', $memberId)->value('current_points'),
        ]);
        $line->forceFill(['created_at' => $at])->save();

        return $line;
    }

    /** One bucket of an answer's series, by its key. */
    private function bucket(array $series, string $key): array
    {
        foreach ($series as $row) {
            if ($row['key'] === $key) {
                return $row;
            }
        }
        $this->fail("No bucket {$key}");
    }

    private function inOrganization(int $orgId, callable $make): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $make();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }

    private function venueIn(string $zone): void
    {
        $this->org->forceFill(['timezone' => $zone])->save();
        app()->forgetScopedInstances();
    }

    // ── Who may read them ─────────────────────────────────────────────────

    public function test_staff_without_analytics_are_refused_and_with_it_or_as_a_manager_may_read(): void
    {
        foreach (['insights', 'insights/at-risk'] as $path) {
            $this->asStaffMember()->getJson($this->api($path))
                ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
            $this->asManager()->getJson($this->api($path . '?brand_id=all'))->assertOk();
        }

        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_view_analytics' => true]);
        foreach (['insights', 'insights/at-risk'] as $path) {
            $this->asStaffMember()->getJson($this->api($path))->assertOk();
        }
    }

    public function test_the_period_and_the_quiet_days_are_checked(): void
    {
        foreach (['7d', '30D', 'year', '1'] as $period) {
            $this->asManager()->getJson($this->api("insights?period={$period}"))->assertStatus(422)->assertJsonValidationErrors(['period']);
        }
        foreach (['6', '366', 'many'] as $days) {
            $this->asManager()->getJson($this->api("insights/at-risk?days={$days}"))->assertStatus(422)->assertJsonValidationErrors(['days']);
        }
        $this->insights()->assertJsonPath('period', '30d');
        $this->insights('period=')->assertJsonPath('period', '30d');
    }

    // ── The period and its buckets ────────────────────────────────────────

    public function test_thirty_days_are_today_and_the_29_before_by_day_every_bucket_filled(): void
    {
        $response = $this->insights('period=30d')
            ->assertJsonPath('bucket', 'day')
            ->assertJsonPath('from', '2026-09-06')
            ->assertJsonPath('to', '2026-10-05')
            ->assertJsonPath('timezone', 'UTC');

        foreach (['growth', 'points', 'redemptions'] as $series) {
            $keys = array_column($response->json($series), 'key');
            $this->assertCount(30, $keys, $series);
            $this->assertSame(['2026-09-06', '2026-09-07'], array_slice($keys, 0, 2));
            $this->assertSame('2026-10-05', end($keys));
        }
        // Nothing happened: every bucket is there, holding zeros.
        $this->assertSame(['key' => '2026-09-20', 'issued' => 0, 'redeemed' => 0, 'expired' => 0], $this->bucket($response->json('points'), '2026-09-20'));
        $this->assertSame(['key' => '2026-09-20', 'fulfilled' => 0, 'pending' => 0, 'cancelled' => 0], $this->bucket($response->json('redemptions'), '2026-09-20'));
    }

    public function test_ninety_days_are_thirteen_weeks_keyed_by_their_monday_and_twelve_months_by_month(): void
    {
        $weeks = $this->insights('period=90d')->assertJsonPath('bucket', 'week')->assertJsonPath('from', '2026-07-13')->assertJsonPath('to', '2026-10-05');
        $keys = array_column($weeks->json('points'), 'key');
        $this->assertCount(13, $keys);
        $this->assertSame(['2026-07-13', '2026-07-20'], array_slice($keys, 0, 2));
        $this->assertSame('2026-10-05', end($keys));

        $months = $this->insights('period=12m')->assertJsonPath('bucket', 'month')->assertJsonPath('from', '2025-11-01')->assertJsonPath('to', '2026-10-05');
        $keys = array_column($months->json('points'), 'key');
        $this->assertSame(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], $keys);
    }

    public function test_an_event_lands_on_the_venues_day_week_and_month(): void
    {
        // New York is four hours behind UTC in October: 09:00 UTC on the 5th is 05:00 there, still the 5th.
        $this->venueIn('America/New_York');
        $this->line(1, 'earn', '2026-09-06 03:59:59');   // 5 Sep, 23:59 in New York: before the period
        $this->line(2, 'earn', '2026-09-06 04:00:00');   // 6 Sep, 00:00: the period's first moment
        $this->line(4, 'earn', '2026-10-02 03:30:00');   // 1 Oct, 23:30, although UTC says the 2nd
        $this->line(8, 'earn', '2026-10-02 04:30:00');   // 2 Oct, 00:30
        $this->line(16, 'earn', '2026-10-05 03:30:00');  // Sunday 4 Oct, 23:30, although UTC says Monday the 5th

        $days = $this->insights('period=30d')->assertJsonPath('from', '2026-09-06')->assertJsonPath('timezone', 'America/New_York');
        $this->assertSame(2, $this->bucket($days->json('points'), '2026-09-06')['issued']);
        $this->assertSame(4, $this->bucket($days->json('points'), '2026-10-01')['issued']);
        $this->assertSame(8, $this->bucket($days->json('points'), '2026-10-02')['issued']);
        $this->assertSame(16, $this->bucket($days->json('points'), '2026-10-04')['issued']);
        $this->assertSame(0, $this->bucket($days->json('points'), '2026-10-05')['issued']);
        $days->assertJsonPath('tiles.issued', 30);

        $weeks = $this->insights('period=90d');
        $this->assertSame(4 + 8 + 16, $this->bucket($weeks->json('points'), '2026-09-28')['issued']);
        $this->assertSame(0, $this->bucket($weeks->json('points'), '2026-10-05')['issued']);

        $this->line(32, 'earn', '2026-10-01 03:30:00');  // 30 Sep, 23:30: September, not October
        $months = $this->insights('period=12m');
        $this->assertSame(1 + 2 + 32, $this->bucket($months->json('points'), '2026-09')['issued']);
        $this->assertSame(4 + 8 + 16, $this->bucket($months->json('points'), '2026-10')['issued']);
    }

    public function test_a_venue_ahead_of_utc_counts_its_own_midnight(): void
    {
        // Riga is three hours ahead: 21:30 UTC on 1 October is already 00:30 on the 2nd there.
        $this->venueIn('Europe/Riga');
        $this->line(5, 'earn', '2026-10-01 21:30:00');
        $this->line(7, 'earn', '2026-10-01 20:30:00');

        $days = $this->insights();
        $this->assertSame(7, $this->bucket($days->json('points'), '2026-10-01')['issued']);
        $this->assertSame(5, $this->bucket($days->json('points'), '2026-10-02')['issued']);
    }

    // ── Points: issued, redeemed, expired ─────────────────────────────────

    public function test_each_points_figure_keeps_its_definition(): void
    {
        $second = Brand::create(['name' => 'Second Studio', 'slug' => 'second-' . uniqid(), 'is_default' => false]);
        $other = $this->otherOrganization();

        $this->line(3, 'earn', '2026-09-06 00:00:00');                              // the period's first second
        $this->line(7, 'earn', '2026-09-05 23:59:59');                              // the second before: outside
        $this->line(1000, 'earn', '2026-10-01 10:00:00');
        $this->line(25, 'bonus', '2026-10-02 10:00:00', ['brand_id' => $second->id]); // another brand: the organisation's all the same
        // A reversed earn and its reversal count nowhere.
        $reversed = $this->line(50, 'earn', '2026-10-01 11:00:00', ['is_reversed' => true]);
        $this->line(-50, 'reverse', '2026-10-01 12:00:00', ['reversal_of_id' => $reversed->id]);
        $this->line(-300, 'redeem', '2026-10-03 10:00:00');
        $this->line(-40, 'expire', '2026-09-30 01:00:00');                          // expired, and nothing else
        $this->line(-10, 'adjust', '2026-09-29 10:00:00');                          // a deduction: no figure of its own
        $this->inOrganization($other['org']->id, fn () => $this->line(999, 'earn', '2026-10-01 10:00:00', ['member_id' => $other['member']->id]));

        // A pending redemption cancelled today: its debit is reversed (RedemptionActions), so it was never redeemed.
        $voucher = Reward::create(['name' => 'Spa voucher', 'points_cost' => 500]);
        $today = RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $voucher->id, 'points_spent' => 500, 'code' => 'REW-NEW1', 'status' => 'pending']);
        app(LoyaltyService::class)->redeemPoints($this->ada, 500, 'Reward: Spa voucher', null, null, 'catalog_redeem', 'reward_redemption_' . $today->id);
        app(RedemptionActions::class)->cancel($today->id, $this->manager);
        // One made before debits had a key: its debit stays, and the refund is an `adjust` credit — not issued, and
        // it takes the points back off Redeemed on the day it was given.
        $this->line(-500, 'redeem', '2026-10-04 10:00:00', ['idempotency_key' => null]);
        $old = RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $voucher->id, 'points_spent' => 500, 'code' => 'REW-OLD1', 'status' => 'pending']);
        app(RedemptionActions::class)->cancel($old->id, $this->manager);
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('type', 'adjust')->where('description', 'Refund: cancelled reward redemption REW-OLD1')->count());

        // Bound to one brand, as a staff member restricted to it would be: Insights still read the whole organisation.
        app()->instance('current_brand_id', $this->brandId);
        $response = $this->insights();
        $points = $response->json('points');

        $this->assertSame(['key' => '2026-09-06', 'issued' => 3, 'redeemed' => 0, 'expired' => 0], $this->bucket($points, '2026-09-06'));
        $this->assertSame(['key' => '2026-09-29', 'issued' => 0, 'redeemed' => 0, 'expired' => 0], $this->bucket($points, '2026-09-29'));
        $this->assertSame(['key' => '2026-09-30', 'issued' => 0, 'redeemed' => 0, 'expired' => 40], $this->bucket($points, '2026-09-30'));
        $this->assertSame(['key' => '2026-10-01', 'issued' => 1000, 'redeemed' => 0, 'expired' => 0], $this->bucket($points, '2026-10-01'));
        $this->assertSame(['key' => '2026-10-02', 'issued' => 25, 'redeemed' => 0, 'expired' => 0], $this->bucket($points, '2026-10-02'));
        $this->assertSame(['key' => '2026-10-03', 'issued' => 0, 'redeemed' => 300, 'expired' => 0], $this->bucket($points, '2026-10-03'));
        $this->assertSame(['key' => '2026-10-04', 'issued' => 0, 'redeemed' => 500, 'expired' => 0], $this->bucket($points, '2026-10-04'));
        $this->assertSame(['key' => '2026-10-05', 'issued' => 0, 'redeemed' => -500, 'expired' => 0], $this->bucket($points, '2026-10-05'));
        $response->assertJsonPath('tiles.issued', 1028)
            ->assertJsonPath('tiles.redeemed', 300)
            ->assertJsonPath('tiles.expired', 40)
            ->assertJsonPath('tiles.redemption_rate', 29.2);
    }

    public function test_nothing_issued_has_no_redemption_rate(): void
    {
        $this->line(-100, 'redeem', '2026-10-01 10:00:00');

        $this->insights()->assertJsonPath('tiles.issued', 0)->assertJsonPath('tiles.redeemed', 100)->assertJsonPath('tiles.redemption_rate', null);
    }

    // ── Members over time ─────────────────────────────────────────────────

    public function test_new_members_count_by_the_day_they_joined_with_a_running_total(): void
    {
        // Ada and Grace were written today but joined on 5 July; an import kept a member's join date of 2025.
        $this->makeMember('Imported Ivy', 'ivy@example.test', ['joined_at' => '2025-01-01 10:00:00']);
        $this->makeMember('Lin New', 'lin@example.test', ['joined_at' => '2026-10-01 12:00:00']);
        // Enrolled on 20 September: enrolment stamps the join date with the row (joined_at is NOT NULL in production).
        $max = $this->makeMember('Max Plain', 'max@example.test', ['joined_at' => '2026-09-20 08:00:00', 'is_active' => false]);
        $max->forceFill(['created_at' => '2026-09-20 08:00:00'])->save();
        $this->otherOrganization();

        $days = $this->insights();
        $growth = $days->json('growth');
        $this->assertSame(['key' => '2026-09-06', 'new' => 0, 'total' => 3], $growth[0]);
        $this->assertSame(['key' => '2026-09-20', 'new' => 1, 'total' => 4], $this->bucket($growth, '2026-09-20'));
        $this->assertSame(['key' => '2026-10-01', 'new' => 1, 'total' => 5], $this->bucket($growth, '2026-10-01'));
        $this->assertSame(['key' => '2026-10-05', 'new' => 0, 'total' => 5], end($growth));
        $days->assertJsonPath('tiles.members', 5)->assertJsonPath('tiles.new_members', 2);

        $months = $this->insights('period=12m')->json('growth');
        $this->assertSame(['key' => '2025-11', 'new' => 0, 'total' => 1], $months[0]);
        $this->assertSame(['key' => '2026-07', 'new' => 2, 'total' => 3], $this->bucket($months, '2026-07'));
        $this->assertSame(['key' => '2026-10', 'new' => 1, 'total' => 5], end($months));
    }

    // ── Reward redemptions ────────────────────────────────────────────────

    public function test_redemptions_count_by_the_day_they_were_made_and_where_they_stand(): void
    {
        $voucher = Reward::create(['name' => 'Spa voucher', 'points_cost' => 500]);
        $made = function (string $status, string $at, ?int $memberId = null) use ($voucher) {
            $row = RewardRedemption::withoutGlobalScopes()->create([
                'member_id' => $memberId ?? $this->ada->id, 'reward_id' => $voucher->id, 'points_spent' => 500,
                'code' => 'R-' . uniqid(), 'status' => $status,
            ]);
            $row->forceFill(['created_at' => $at])->save();
        };
        $made('fulfilled', '2026-10-01 10:00:00');
        $made('fulfilled', '2026-10-01 18:00:00');
        $made('pending', '2026-10-01 19:00:00');
        $made('cancelled', '2026-10-03 10:00:00');
        $made('pending', '2026-09-05 10:00:00');                            // before the period
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => $made('fulfilled', '2026-10-01 10:00:00', $other['member']->id));

        $series = $this->insights()->json('redemptions');
        $this->assertSame(['key' => '2026-10-01', 'fulfilled' => 2, 'pending' => 1, 'cancelled' => 0], $this->bucket($series, '2026-10-01'));
        $this->assertSame(['key' => '2026-10-03', 'fulfilled' => 0, 'pending' => 0, 'cancelled' => 1], $this->bucket($series, '2026-10-03'));
        $this->assertSame(4, array_sum(array_map(fn (array $r) => $r['fulfilled'] + $r['pending'] + $r['cancelled'], $series)));
    }

    // ── Tiers and their movement ──────────────────────────────────────────

    public function test_members_by_tier_follow_the_ladder_and_count_active_members(): void
    {
        $legacy = LoyaltyTier::create(['name' => 'Legacy', 'min_points' => 0, 'sort_order' => 0, 'is_active' => false]);
        LoyaltyTier::create(['name' => 'Retired', 'min_points' => 0, 'sort_order' => 9, 'is_active' => false]);
        $this->makeMember('On Legacy', 'legacy@example.test', ['tier_id' => $legacy->id]);
        // A valid FK outside this programme must count as no programme tier, without relaxing NOT NULL.
        $unavailable = $this->otherOrganization();
        $this->makeMember('No Programme Tier', 'none@example.test', ['tier_id' => $unavailable['tier']->id]);
        $this->makeMember('Gone Gold', 'gone@example.test', ['tier_id' => $this->tiers['gold']->id, 'is_active' => false]);

        $tiers = $this->insights()->json('tiers');

        $this->assertSame(['Legacy', 'Silver', 'Gold', 'Platinum'], array_column($tiers['rows'], 'name'));
        $this->assertSame([1, 1, 1, 0], array_column($tiers['rows'], 'members'));
        $this->assertSame(['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'color' => '#d4a017', 'sort_order' => 2, 'is_active' => true, 'members' => 1], $tiers['rows'][2]);
        $this->assertFalse($tiers['rows'][0]['is_active']);
        $this->assertSame(1, $tiers['none']);
    }

    public function test_tier_movement_counts_the_periods_changes_up_down_and_sideways_with_the_flows(): void
    {
        ['silver' => $silver, 'gold' => $gold] = $this->tiers;
        $goldPlus = LoyaltyTier::create(['name' => 'Gold Plus', 'min_points' => 1000, 'sort_order' => 2, 'is_active' => true]);
        $moved = function (?int $from, ?int $to, string $at, ?int $memberId = null) {
            // The assessment window is NOT NULL in production (LoyaltyService writes the year the move was judged on).
            $row = TierAssessment::withoutGlobalScopes()->create(['member_id' => $memberId ?? $this->grace->id, 'old_tier_id' => $from, 'new_tier_id' => $to, 'reason' => 'points',
                'assessment_window_start' => '2025-10-01', 'assessment_window_end' => '2026-10-01']);
            $row->forceFill(['created_at' => $at])->save();
        };
        $moved($silver->id, $gold->id, '2026-10-01 10:00:00');
        $moved($silver->id, $gold->id, '2026-09-10 10:00:00', $this->ada->id);
        $moved($gold->id, $silver->id, '2026-10-02 10:00:00');
        $moved($gold->id, $goldPlus->id, '2026-10-03 10:00:00');
        $other = $this->otherOrganization();
        $moved($other['tier']->id, $silver->id, '2026-10-03 10:00:00');     // a tier outside the programme is not movement
        $moved($silver->id, $gold->id, '2026-09-05 10:00:00');               // before the period
        $this->inOrganization($other['org']->id, fn () => $moved($silver->id, $gold->id, '2026-10-01 10:00:00', $other['member']->id));

        $this->insights()->assertJsonPath('movement', [
            'up' => 2, 'down' => 1, 'lateral' => 1,
            'flows' => [
                ['from' => $silver->id, 'to' => $gold->id, 'count' => 2, 'direction' => 'up'],
                ['from' => $gold->id, 'to' => $silver->id, 'count' => 1, 'direction' => 'down'],
                ['from' => $gold->id, 'to' => $goldPlus->id, 'count' => 1, 'direction' => 'lateral'],
            ],
        ]);
        $this->insights('period=12m')->assertJsonPath('movement.up', 3);
    }

    // ── Expiry ────────────────────────────────────────────────────────────

    public function test_points_due_to_expire_by_month_and_those_overdue(): void
    {
        $bucket = function (int $memberId, int $points, string $expires, array $more = []) {
            // A bucket is the earn line's (transaction_id is NOT NULL in production).
            $earn = PointsTransaction::withoutGlobalScopes()->create([
                'member_id' => $memberId, 'type' => 'earn', 'points' => $points, 'description' => 'Earn',
                'idempotency_key' => uniqid('e', true), 'balance_after' => $points,
            ]);
            $earn->forceFill(['created_at' => '2025-01-01 10:00:00'])->save();

            return PointExpiryBucket::withoutGlobalScopes()->create($more + [
                'member_id' => $memberId, 'transaction_id' => $earn->id, 'original_points' => $points, 'remaining_points' => $points,
                'earned_at' => '2025-01-01', 'expires_at' => $expires,
            ]);
        };
        $bucket($this->ada->id, 100, '2026-10-05');                          // its date has come: the sweep takes it next
        $bucket($this->ada->id, 50, '2026-10-01');
        $bucket($this->grace->id, 10, '2026-09-30');
        $bucket($this->ada->id, 30, '2026-10-06');
        $bucket($this->ada->id, 70, '2026-11-15');
        $bucket($this->ada->id, 20, '2027-03-31');
        $bucket($this->ada->id, 99, '2027-04-01');                           // after the six months
        $bucket($this->ada->id, 40, '2026-10-20', ['is_expired' => true]);
        $bucket($this->ada->id, 0, '2026-10-20');
        // Written by a job with no tenant bound: the member says whose it is.
        DB::table('point_expiry_buckets')->where('id', $bucket($this->ada->id, 5, '2026-12-01')->id)->update(['organization_id' => null]);
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => $bucket($other['member']->id, 900, '2026-11-15'));

        $this->insights()->assertJsonPath('expiry', [
            'overdue' => ['points' => 160, 'members' => 2],
            'months'  => [
                ['key' => '2026-10', 'points' => 30],
                ['key' => '2026-11', 'points' => 70],
                ['key' => '2026-12', 'points' => 5],
                ['key' => '2027-01', 'points' => 0],
                ['key' => '2027-02', 'points' => 0],
                ['key' => '2027-03', 'points' => 20],
            ],
        ]);
    }

    // ── Engagement, active members, balances ──────────────────────────────

    public function test_engagement_splits_active_members_into_four_groups_and_balances_fall_in_bands(): void
    {
        $this->ada->forceFill(['last_activity_at' => '2026-10-01 10:00:00'])->save();          // active, 1,500 points
        // Grace (200 points) was never active: dormant.
        $this->makeMember('New Nell', 'nell@example.test', ['joined_at' => '2026-09-20 10:00:00']);
        $this->makeMember('Edge Active', 'edge1@example.test', ['joined_at' => '2026-01-01', 'last_activity_at' => '2026-09-06 00:00:00', 'current_points' => -20]);
        $this->makeMember('Edge Risk', 'edge2@example.test', ['joined_at' => '2026-01-01', 'last_activity_at' => '2026-09-05 23:59:59', 'current_points' => 10001]);
        $this->makeMember('Risky Rae', 'rae@example.test', ['joined_at' => '2026-01-01', 'last_activity_at' => '2026-07-08 00:00:00', 'current_points' => 501]);
        $this->makeMember('Sleepy Sam', 'sam@example.test', ['joined_at' => '2026-01-01', 'last_activity_at' => '2026-07-07 23:59:59', 'current_points' => 5000]);
        $this->makeMember('Off Olga', 'olga@example.test', ['is_active' => false, 'last_activity_at' => '2026-10-04 10:00:00', 'current_points' => 9999]);
        $this->otherOrganization();

        $response = $this->insights();

        $response->assertJsonPath('engagement', ['new' => 1, 'active' => 2, 'at_risk' => 2, 'dormant' => 2])
            ->assertJsonPath('tiles.members', 8)
            ->assertJsonPath('tiles.active_members', 4)
            ->assertJsonPath('tiles.outstanding', 1500 + 200 + 0 - 20 + 10001 + 501 + 5000);
        $this->assertSame([
            ['min' => null, 'max' => -1, 'members' => 1],
            ['min' => 0, 'max' => 0, 'members' => 1],
            ['min' => 1, 'max' => 500, 'members' => 1],
            ['min' => 501, 'max' => 2000, 'members' => 2],
            ['min' => 2001, 'max' => 5000, 'members' => 1],
            ['min' => 5001, 'max' => 10000, 'members' => 0],
            ['min' => 10001, 'max' => null, 'members' => 1],
        ], $response->json('balances'));
    }

    public function test_an_empty_programme_answers_zeros_everywhere(): void
    {
        LoyaltyMember::query()->delete();

        $response = $this->insights('period=90d');

        $response->assertJsonPath('tiles', [
            'members' => 0, 'new_members' => 0, 'active_members' => 0, 'issued' => 0, 'redeemed' => 0, 'expired' => 0,
            'outstanding' => 0, 'redemption_rate' => null,
        ])
            ->assertJsonPath('engagement', ['new' => 0, 'active' => 0, 'at_risk' => 0, 'dormant' => 0])
            ->assertJsonPath('movement', ['up' => 0, 'down' => 0, 'lateral' => 0, 'flows' => []])
            ->assertJsonPath('expiry.overdue', ['points' => 0, 'members' => 0])
            ->assertJsonPath('tiers.none', 0);
        $this->assertSame([0], array_values(array_unique(array_column($response->json('growth'), 'total'))));
        $this->assertSame([0, 0, 0], array_column($response->json('tiers.rows'), 'members'));
        $this->assertSame(0, array_sum(array_column($response->json('balances'), 'members')));
        $this->assertSame(0, array_sum(array_column($response->json('expiry.months'), 'points')));
    }
}
