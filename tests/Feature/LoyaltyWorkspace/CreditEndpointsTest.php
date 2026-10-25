<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\CreditTransaction;
use App\Services\Loyalty\Credit\CreditLedger;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\Visit;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A member's cashback credit in the workspace (release 7, spec 2026-10-25 §3, R7-2): the lines for every staff member,
 * spending it at the desk for whoever may redeem (`can_redeem_points`, as Redeem), a manager's correction — only ever
 * this organisation's member, every write idempotent by a key kept per member — and the member row's `credit_balance`.
 */
class CreditEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, CreditSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildCreditSchema();
        $this->org->forceFill(['currency' => 'EUR'])->save();
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => true, 'cashback_percent' => 5], $this->manager);
        // 12.40 of credit: 5 % of 248.00.
        app(CreditLedger::class)->earnCashback($this->grace, new Visit(Visit::APPOINTMENT, 'service_booking', 41, 248.0, '2026-10-05'));
    }

    private function spend(array $body, ?int $memberId = null)
    {
        return $this->asStaffMember()->postJson($this->api('members/' . ($memberId ?? $this->grace->id) . '/credit/spend'), $body);
    }

    public function test_the_routes_follow_the_access_map_redeem_for_spending_a_manager_for_a_correction(): void
    {
        $expect = [
            'GET api/v1/admin/loyalty/members/5/credit'         => ['admin/loyalty/members/{id}/credit', 'staff', 'can_redeem_points', 'loyalty'],
            'POST api/v1/admin/loyalty/members/5/credit/spend'  => ['admin/loyalty/members/{id}/credit', 'staff', 'can_redeem_points', 'loyalty'],
            'POST api/v1/admin/loyalty/members/5/credit/adjust' => ['admin/loyalty/members/{id}/credit/adjust', 'manager', 'manager', 'loyalty'],
        ];
        foreach ($expect as $call => $rule) {
            [$method, $uri] = explode(' ', $call);
            $found = AccessMap::ruleFor(Route::getRoutes()->match(Request::create('/' . $uri, $method)));
            $this->assertSame($rule, [$found->key, $found->read, $found->change, $found->product], $call);
        }
    }

    public function test_the_member_row_carries_the_credit_balance(): void
    {
        $this->asStaffMember()->getJson($this->api('members/' . $this->grace->id))->assertOk()->assertJsonPath('member.credit_balance', 12.4);
        $rows = collect($this->asStaffMember()->getJson($this->api('members'))->assertOk()->json('members'))->keyBy('id');
        $this->assertSame([12.4, 0], [$rows[$this->grace->id]['credit_balance'], $rows[$this->ada->id]['credit_balance']]);
    }

    public function test_every_staff_member_reads_the_lines(): void
    {
        $this->asStaffMember()->getJson($this->api('members/' . $this->grace->id . '/credit'))
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('balance', 12.4)
            ->assertJsonPath('currency', 'EUR')
            ->assertJsonPath('lines.0.type', 'earn')
            ->assertJsonPath('lines.0.amount', 12.4)
            ->assertJsonPath('lines.0.reference_type', 'service_booking')
            ->assertJsonPath('lines.0.by', null)
            ->assertJsonPath('pagination', ['page' => 1, 'pages' => 1, 'total' => 1, 'per_page' => 25]);
    }

    public function test_spending_answers_the_line_the_balance_and_the_member_row(): void
    {
        $this->spend(['amount' => 4.9, 'note' => '  Two coffees ', 'idempotency_key' => 'press-1'])
            ->assertOk()
            ->assertJsonPath('balance', 7.5)
            ->assertJsonPath('currency', 'EUR')
            ->assertJsonPath('replayed', false)
            ->assertJsonPath('line.type', 'spend')
            ->assertJsonPath('line.amount', -4.9)
            ->assertJsonPath('line.balance_after', 7.5)
            ->assertJsonPath('line.note', 'Two coffees')
            ->assertJsonPath('line.by', $this->staffMember->name)
            ->assertJsonPath('member.id', $this->grace->id)
            ->assertJsonPath('member.credit_balance', 7.5);

        $line = CreditTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->where('type', 'spend')->sole();
        $this->assertSame(["credit-ws:{$this->org->id}:{$this->grace->id}:spend:press-1", $this->staffMember->id], [$line->idempotency_key, $line->created_by]);
    }

    public function test_a_retry_with_the_same_key_spends_once_from_the_body_or_the_header_and_never_reaches_another_member(): void
    {
        $this->spend(['amount' => 2, 'idempotency_key' => 'k-1'])->assertJsonPath('balance', 10.4);
        $this->spend(['amount' => 2, 'idempotency_key' => 'k-1'])->assertJsonPath('balance', 10.4)->assertJsonPath('replayed', true);

        $this->asStaffMember()->withHeaders(['Idempotency-Key' => 'k-2'])->postJson($this->api("members/{$this->grace->id}/credit/spend"), ['amount' => 1])->assertJsonPath('balance', 9.4);
        $this->asStaffMember()->withHeaders(['Idempotency-Key' => 'k-2'])->postJson($this->api("members/{$this->grace->id}/credit/spend"), ['amount' => 1])->assertJsonPath('balance', 9.4);
        $this->assertSame(3, CreditTransaction::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());

        // The same key on another member is that member's own spend (Ada has no credit: refused, nothing found).
        $this->spend(['amount' => 1, 'idempotency_key' => 'k-1'], $this->ada->id)->assertStatus(422)->assertJsonPath('error', 'credit_short')->assertJsonPath('balance', 0);
    }

    public function test_spending_more_than_the_balance_is_refused_with_the_balance(): void
    {
        $this->spend(['amount' => 12.41])->assertStatus(422)->assertJsonPath('error', 'credit_short')->assertJsonPath('balance', 12.4)->assertJsonPath('currency', 'EUR');
        $this->spend(['amount' => 1.005])->assertStatus(422)->assertJsonPath('error', 'bad_amount')->assertJsonPath('decimals', 2);
        $this->spend(['amount' => 0])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->spend(['amount' => 'lots'])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->spend(['amount' => 12.4])->assertOk()->assertJsonPath('balance', 0);
    }

    public function test_spending_needs_the_redeem_flag_and_works_with_cashback_switched_off(): void
    {
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_redeem_points' => false]);
        $this->spend(['amount' => 1])->assertStatus(403)->assertJsonPath('need', 'can_redeem_points');
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_redeem_points' => true]);

        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => false], $this->manager);
        $this->asStaffMember()->getJson($this->api("members/{$this->grace->id}/credit"))->assertJsonPath('enabled', false)->assertJsonPath('balance', 12.4);
        $this->spend(['amount' => 1])->assertOk()->assertJsonPath('balance', 11.4);
    }

    public function test_a_correction_is_a_managers_with_a_reason_and_never_below_zero(): void
    {
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/credit/adjust"), ['amount' => 5, 'reason' => 'Goodwill'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/credit/adjust"), ['amount' => 5])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/credit/adjust"), ['amount' => -12.41, 'reason' => 'Too far'])
            ->assertStatus(422)->assertJsonPath('error', 'credit_short');

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/credit/adjust"), ['amount' => -2.4, 'reason' => 'Typed too much', 'idempotency_key' => 'a-1'])
            ->assertOk()->assertJsonPath('balance', 10)->assertJsonPath('line.type', 'adjust')->assertJsonPath('line.note', 'Typed too much')->assertJsonPath('member.credit_balance', 10);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/credit/adjust"), ['amount' => -2.4, 'reason' => 'Typed too much', 'idempotency_key' => 'a-1'])
            ->assertOk()->assertJsonPath('balance', 10)->assertJsonPath('replayed', true);
    }

    public function test_another_organisations_member_is_not_found(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->getJson($this->api("members/{$other['member']->id}/credit"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->postJson($this->api("members/{$other['member']->id}/credit/spend"), ['amount' => 1])->assertStatus(404);
        $this->asManager()->postJson($this->api("members/{$other['member']->id}/credit/adjust"), ['amount' => 5, 'reason' => 'No'])->assertStatus(404);
        $this->assertSame(0, CreditTransaction::withoutGlobalScopes()->where('member_id', $other['member']->id)->count());
    }
}
