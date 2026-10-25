<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Services\Loyalty\Insights\LoyaltyInsights;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Insights' at-risk list (spec 2026-10-21 release 2 §5): active members with
 * no activity for N days (60 unless asked), the longest quiet first, capped.
 * The clock is Monday 5 October 2026, 09:00 UTC: "no activity in the last 60
 * days" means none since 7 August began.
 */
class InsightsAtRiskTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function atRisk(string $query = ''): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->getJson($this->api('insights/at-risk' . ($query === '' ? '' : "?{$query}")))->assertOk();
    }

    public function test_it_lists_members_quiet_for_sixty_days_the_longest_quiet_first_as_the_members_list_shows_them(): void
    {
        $this->ada->forceFill(['last_activity_at' => '2026-08-06 23:00:00'])->save();             // 60 days quiet
        $this->grace->forceFill(['last_activity_at' => '2026-08-07 00:00:00'])->save();           // 59 days: not yet
        $longest = $this->makeMember('Long Gone', 'long@example.test', ['last_activity_at' => '2026-03-01 10:00:00', 'tier_id' => $this->tiers['gold']->id, 'current_points' => 640]);
        $this->makeMember('Never Seen', 'never@example.test');                                    // never active: dormant, not at risk
        $this->makeMember('Switched Off', 'off@example.test', ['is_active' => false, 'last_activity_at' => '2026-01-01 10:00:00']);
        $other = $this->otherOrganization();
        $other['member']->forceFill(['last_activity_at' => '2026-01-01 10:00:00'])->save();

        $response = $this->atRisk()->assertJsonPath('days', 60)->assertJsonPath('total', 2)->assertJsonPath('limit', LoyaltyInsights::AT_RISK_LIMIT);

        $this->assertSame([$longest->id, $this->ada->id], array_column($response->json('members'), 'id'));
        $response->assertJsonPath('members.0', [
            'id' => $longest->id, 'name' => 'Long Gone', 'email' => $longest->user->email, 'phone' => null,
            'member_number' => $longest->member_number, 'tier_id' => $this->tiers['gold']->id, 'points' => 640, 'lifetime_points' => 0,
            'is_active' => true, 'joined_at' => '2026-07-05T09:00:00+00:00', 'last_activity_at' => '2026-03-01T10:00:00+00:00',
            'credit_balance' => 0, 'days_quiet' => 218,
        ])->assertJsonPath('members.1.days_quiet', 60);
    }

    public function test_the_number_of_days_is_the_callers_from_7_to_365(): void
    {
        $this->ada->forceFill(['last_activity_at' => '2026-09-27 12:00:00'])->save();             // 8 days quiet
        $this->grace->forceFill(['last_activity_at' => '2025-10-06 12:00:00'])->save();           // 364 days quiet

        $this->assertSame([$this->grace->id, $this->ada->id], array_column($this->atRisk('days=7')->json('members'), 'id'));
        $this->atRisk('days=365')->assertJsonPath('total', 0)->assertJsonPath('days', 365);
        $this->atRisk('days=364')->assertJsonPath('total', 1);
    }

    public function test_quiet_days_are_counted_on_the_venues_clock(): void
    {
        // 02:00 UTC on 7 August is still 6 August in New York: 60 venue days before today, the 5th.
        $this->org->forceFill(['timezone' => 'America/New_York'])->save();
        app()->forgetScopedInstances();
        $this->ada->forceFill(['last_activity_at' => '2026-08-07 02:00:00'])->save();

        $this->atRisk()->assertJsonPath('total', 1)->assertJsonPath('members.0.days_quiet', 60);
    }

    public function test_the_list_holds_a_hundred_at_most_and_says_how_many_there_are(): void
    {
        foreach (range(1, 101) as $i) {
            $this->makeMember("Quiet {$i}", "quiet{$i}@example.test", ['last_activity_at' => now()->subDays(100 + $i)]);
        }

        $response = $this->atRisk()->assertJsonPath('total', 101)->assertJsonCount(100, 'members');
        $this->assertSame('Quiet 101', $response->json('members.0.name'));
        $this->assertSame('Quiet 2', $response->json('members.99.name'));
    }
}
