<?php

namespace Tests\Feature\Member;

use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\Visit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The member's own cashback credit (release 7, spec 2026-10-25 §3), read only: `GET member/portal/credit` (portal Home)
 * and `GET member/credit` (the app's next build) answer whether cashback is on, the balance, the venue's currency and
 * the last 20 lines — never who on the staff wrote one, never another member's.
 */
class CreditEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CreditSchema;

    private const PORTAL = '/api/v1/member/portal/credit';
    private const APP = '/api/v1/member/credit';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildCreditSchema();
        $this->org->forceFill(['currency' => 'EUR'])->save();
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => true, 'cashback_percent' => 5], $this->manager);
        $ledger = app(CreditLedger::class);
        $ledger->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 41, 248.0, '2026-10-05'));
        $ledger->spend($this->grace, 2.4, $this->staffMember, 'Coffee', 'k-1');
        $ledger->earnCashback($this->ada, new Visit(Visit::APPOINTMENT, 'service_booking', 42, 100.0, '2026-10-05'));
    }

    public function test_the_portal_answers_the_members_own_credit_without_staff_names(): void
    {
        $response = $this->actingAs($this->grace->user, 'sanctum')->getJson(self::PORTAL)
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('balance', 10)
            ->assertJsonPath('currency', 'EUR')
            ->assertJsonCount(2, 'lines')
            ->assertJsonPath('lines.0.type', 'spend')
            ->assertJsonPath('lines.0.amount', -2.4)
            ->assertJsonPath('lines.0.balance_after', 10)
            ->assertJsonPath('lines.0.note', 'Coffee')
            ->assertJsonPath('lines.1.type', 'earn');

        $this->assertSame(['id', 'type', 'amount', 'balance_after', 'currency', 'note', 'reference_type', 'created_at'], array_keys($response->json('lines.0')));
        $this->assertArrayNotHasKey('pagination', $response->json());
    }

    public function test_the_app_endpoint_answers_the_same(): void
    {
        $portal = $this->actingAs($this->grace->user, 'sanctum')->getJson(self::PORTAL)->assertOk()->json();
        $this->actingAs($this->grace->user, 'sanctum')->getJson(self::APP)->assertOk()->assertExactJson($portal);
        $this->actingAs($this->ada->user, 'sanctum')->getJson(self::APP)->assertOk()->assertJsonPath('balance', 5)->assertJsonCount(1, 'lines');
    }

    public function test_at_most_twenty_lines_newest_first(): void
    {
        foreach (range(1, 25) as $n) {
            app(CreditLedger::class)->spend($this->grace, 0.1, $this->staffMember, null, "s-{$n}");
        }

        $lines = $this->actingAs($this->grace->user, 'sanctum')->getJson(self::PORTAL)->assertOk()->assertJsonPath('balance', 7.5)->json('lines');
        $this->assertCount(CreditLedger::MEMBER_LINES, $lines);
        $this->assertSame(7.5, $lines[0]['balance_after']);
    }

    public function test_cashback_off_still_shows_a_balance_already_earned(): void
    {
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => false], $this->manager);

        $this->actingAs($this->grace->user, 'sanctum')->getJson(self::PORTAL)->assertOk()->assertJsonPath('enabled', false)->assertJsonPath('balance', 10);
    }

    public function test_a_staff_account_is_refused_at_the_portal_door_and_has_no_credit_in_the_app(): void
    {
        $this->actingAs($this->staffMember, 'sanctum')->getJson(self::PORTAL)->assertStatus(403)->assertJsonPath('error', 'member_only');
        $this->actingAs($this->staffMember, 'sanctum')->getJson(self::APP)->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
