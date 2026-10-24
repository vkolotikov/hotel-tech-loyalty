<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\PointsTransaction;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Cohort retention (release 4 part E, InsightsCohorts): members by the venue month they joined — joined_at, else
 * created_at — over the last twelve months, and how many were active (earned or spent points) in that month and each
 * month after. The clock is Monday 5 October 2026, 09:00 UTC: the months are November 2025 to October 2026. Ada and
 * Grace joined on 5 July 2026.
 */
class InsightsCohortsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function cohorts(): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->getJson($this->api('insights/cohorts?brand_id=all'))->assertOk();
    }

    private function line(int $memberId, int $points, string $type, string $at, array $more = []): PointsTransaction
    {
        $line = PointsTransaction::withoutGlobalScopes()->create($more + [
            'member_id' => $memberId, 'type' => $type, 'points' => $points, 'description' => ucfirst($type), 'idempotency_key' => uniqid('c', true),
            // NOT NULL in production: the member's balance as the line leaves it.
            'balance_after' => (int) DB::table('loyalty_members')->where('id', $memberId)->value('current_points'),
        ]);
        $line->forceFill(['created_at' => $at])->save();

        return $line;
    }

    /** @return array{key: string, members: int, active: list<int>} */
    private function row(array $rows, string $key): array
    {
        foreach ($rows as $row) {
            if ($row['key'] === $key) {
                return $row;
            }
        }
        $this->fail("No cohort {$key}");
    }

    public function test_only_who_may_read_insights_reads_them(): void
    {
        $this->asStaffMember()->getJson($this->api('insights/cohorts'))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed')->assertJsonPath('need', 'can_view_analytics');
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_view_analytics' => true]);
        $this->asStaffMember()->getJson($this->api('insights/cohorts'))->assertOk();
    }

    public function test_twelve_months_each_with_its_members_and_one_figure_per_month_since(): void
    {
        $response = $this->cohorts()->assertJsonPath('timezone', 'UTC');

        $this->assertSame(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], $response->json('months'));
        $rows = $response->json('rows');
        $this->assertCount(12, $rows);
        $this->assertSame(['key' => '2025-11', 'members' => 0, 'active' => array_fill(0, 12, 0)], $rows[0]);
        $this->assertSame(['key' => '2026-07', 'members' => 2, 'active' => [0, 0, 0, 0]], $this->row($rows, '2026-07'));
        $this->assertSame(['key' => '2026-10', 'members' => 0, 'active' => [0]], $rows[11]);
    }

    public function test_active_means_earned_or_spent_that_month_once_a_member_and_never_a_reversal_an_expiry_a_deduction_or_a_refund(): void
    {
        $ada = $this->ada->id;
        $grace = $this->grace->id;
        $this->line($ada, 100, 'earn', '2026-07-10 10:00:00');                     // July: month 0
        $this->line($ada, 50, 'bonus', '2026-07-20 10:00:00');                     // the same month again: once
        $this->line($ada, -40, 'expire', '2026-08-01 10:00:00');                   // an expiry is not the member's doing
        $this->line($ada, -300, 'redeem', '2026-09-15 10:00:00');                  // September: month 2
        $reversed = $this->line($ada, 80, 'earn', '2026-10-02 10:00:00', ['is_reversed' => true]);
        $this->line($ada, -80, 'reverse', '2026-10-02 11:00:00', ['reversal_of_id' => $reversed->id]);
        $this->line($grace, -10, 'adjust', '2026-08-03 10:00:00');                 // a deduction
        $this->line($grace, 500, 'adjust', '2026-09-03 10:00:00', ['description' => 'Refund: cancelled reward redemption REW-1']);
        $this->line($grace, 20, 'earn', '2026-10-01 10:00:00');                    // October: month 3
        // Off today and still a member of July's cohort.
        $this->makeMember('Off Olga', 'olga@example.test', ['is_active' => false, 'joined_at' => '2026-07-30 10:00:00']);

        $ivy = $this->makeMember('Imported Ivy', 'ivy@example.test', ['joined_at' => '2025-11-15 10:00:00']);
        $this->line($ivy->id, 10, 'earn', '2025-10-20 10:00:00');                  // before the months, and before she joined
        $this->line($ivy->id, 10, 'earn', '2025-12-01 10:00:00');                  // December: month 1
        // Enrolment stamps the join date with the row (joined_at is NOT NULL in production).
        $lin = $this->makeMember('Lin New', 'lin@example.test', ['joined_at' => '2026-10-02 08:00:00']);
        $lin->forceFill(['created_at' => '2026-10-02 08:00:00'])->save();          // joined: the row's own date
        $this->line($lin->id, 5, 'earn', '2026-10-03 10:00:00');
        $old = $this->makeMember('Old Otto', 'otto@example.test', ['joined_at' => '2024-03-01 10:00:00']);
        $this->line($old->id, 10, 'earn', '2026-09-01 10:00:00');                  // a cohort before the twelve months
        $late = $this->makeMember('Late Lee', 'lee@example.test', ['joined_at' => '2026-09-10 10:00:00']);
        $this->line($late->id, 10, 'earn', '2026-08-20 10:00:00');                 // a line before joining counts nowhere
        $other = $this->otherOrganization();
        DB::table('loyalty_members')->where('id', $other['member']->id)->update(['joined_at' => '2026-07-05 10:00:00']);
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $this->line($other['member']->id, 10, 'earn', '2026-07-10 10:00:00');
        app()->instance('current_organization_id', $prior);

        $rows = $this->cohorts()->json('rows');

        $this->assertSame(['key' => '2025-11', 'members' => 1, 'active' => [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], $rows[0]);
        $this->assertSame(['key' => '2026-07', 'members' => 3, 'active' => [1, 0, 1, 1]], $this->row($rows, '2026-07'));
        $this->assertSame(['key' => '2026-09', 'members' => 1, 'active' => [0, 0]], $this->row($rows, '2026-09'));
        $this->assertSame(['key' => '2026-10', 'members' => 1, 'active' => [1]], $this->row($rows, '2026-10'));
        $this->assertSame(6, array_sum(array_column($rows, 'members')));
    }

    public function test_months_are_the_venues(): void
    {
        // New York is four hours behind UTC in summer: 02:00 UTC on 1 August is still 31 July there.
        $this->org->forceFill(['timezone' => 'America/New_York'])->save();
        app()->forgetScopedInstances();
        $edge = $this->makeMember('Edge Eve', 'eve@example.test', ['joined_at' => '2026-08-01 02:00:00']);
        $this->line($edge->id, 10, 'earn', '2026-09-01 03:30:00');                 // 31 August, 23:30 in New York

        $response = $this->cohorts()->assertJsonPath('timezone', 'America/New_York');
        $july = $this->row($response->json('rows'), '2026-07');

        $this->assertSame(3, $july['members']);
        $this->assertSame([0, 1, 0, 0], $july['active']);
        $this->assertSame(0, $this->row($response->json('rows'), '2026-08')['members']);
    }
}
