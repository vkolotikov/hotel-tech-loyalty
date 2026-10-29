<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Scopes\BrandScope;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Reward redemptions: the list, fulfil and cancel through the shared writer (spec 2026-10-21 §4.6, §5, §6.5). */
class RedemptionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private Reward $voucher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->voucher = Reward::create(['name' => 'Spa voucher', 'points_cost' => 500, 'stock' => 4]);
    }

    public function test_the_list_holds_the_pending_tab_newest_first_and_the_waiting_count(): void
    {
        $older = $this->redemption($this->ada, ['created_at' => now()->subDay()]);
        $newer = $this->redemption($this->grace, ['code' => 'REW-NEWER']);
        $done = $this->redemption($this->ada, ['status' => 'fulfilled', 'fulfilled_at' => now()->subHour()]);
        $cancelled = $this->redemption($this->ada, ['status' => 'cancelled', 'cancelled_at' => now()->subHour()]);

        $response = $this->asStaffMember()->getJson($this->api('redemptions'))->assertOk();

        $this->assertSame([$newer->id, $older->id], array_column($response->json('redemptions'), 'id'));
        $response->assertJsonPath('redemptions.0', [
            'id' => $newer->id, 'code' => 'REW-NEWER', 'state' => 'pending', 'points' => 500,
            'reward' => ['id' => $this->voucher->id, 'name' => 'Spa voucher'],
            'member' => ['id' => $this->grace->id, 'name' => 'Grace Hopper', 'member_number' => $this->grace->member_number],
            'at' => '2026-10-05T09:00:00+00:00', 'fulfilled_at' => null, 'cancelled_at' => null,
        ])
            ->assertJsonPath('page', 1)->assertJsonPath('pages', 1)->assertJsonPath('total', 2)
            ->assertJsonPath('counts', ['pending' => 2]);

        $this->assertEqualsCanonicalizing([$done->id, $cancelled->id], array_column($this->asStaffMember()->getJson($this->api('redemptions?state=done'))->json('redemptions'), 'id'));
        $this->asStaffMember()->getJson($this->api('redemptions?state=done'))->assertJsonPath('counts.pending', 2);
        $this->asStaffMember()->getJson($this->api('redemptions?state=all'))->assertJsonPath('total', 4);
        $this->asStaffMember()->getJson($this->api('redemptions?state=nonsense'))->assertJsonPath('total', 2);
    }

    public function test_the_list_comes_25_a_page(): void
    {
        foreach (range(1, 26) as $i) {
            $this->redemption($this->ada, ['created_at' => now()->subMinutes($i)]);
        }

        $this->asStaffMember()->getJson($this->api('redemptions'))->assertJsonCount(25, 'redemptions')->assertJsonPath('pages', 2)->assertJsonPath('total', 26);
        $this->asStaffMember()->getJson($this->api('redemptions?page=2'))->assertJsonCount(1, 'redemptions')->assertJsonPath('page', 2);
        $this->asStaffMember()->getJson($this->api('redemptions?page=9'))->assertJsonPath('page', 2);
    }

    public function test_fulfilling_keeps_the_points_spent_and_a_second_step_hears_wrong_state(): void
    {
        $row = $this->redeemed($this->ada);

        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/fulfil"))
            ->assertOk()
            ->assertJsonPath('redemption.id', $row->id)
            ->assertJsonPath('redemption.state', 'fulfilled')
            ->assertJsonPath('redemption.fulfilled_at', '2026-10-05T09:00:00+00:00')
            ->assertJsonPath('redemption.member.name', 'Ada Lovelace');
        $this->assertSame(1000, $this->ada->fresh()->current_points);
        $this->assertSame($this->staffMember->id, (int) $row->fresh()->fulfilled_by_user_id);

        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/fulfil"))
            ->assertStatus(409)->assertJsonPath('error', 'wrong_state')->assertJsonPath('state', 'fulfilled');

        // A fulfilled redemption may still be cancelled, as in the full admin: bookkeeping only, its value is gone.
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))
            ->assertOk()->assertJsonPath('redemption.state', 'cancelled');
        $this->assertSame(1000, $this->ada->fresh()->current_points);
        $this->assertSame(3, $this->voucher->fresh()->stock);

        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))
            ->assertStatus(409)->assertJsonPath('error', 'wrong_state')->assertJsonPath('state', 'cancelled');
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/fulfil"))
            ->assertStatus(409)->assertJsonPath('error', 'wrong_state');
    }

    public function test_a_pending_cancel_gives_the_points_back_through_the_ledger_and_the_stock_back(): void
    {
        $row = $this->redeemed($this->ada);
        $this->assertSame(3, $this->voucher->fresh()->stock);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)->where('idempotency_key', 'reward_redemption_' . $row->id)->firstOrFail();
        $this->assertSame(1000, $this->ada->fresh()->current_points);

        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))
            ->assertOk()
            ->assertJsonPath('redemption.state', 'cancelled')
            ->assertJsonPath('redemption.cancelled_at', '2026-10-05T09:00:00+00:00');

        $ada = $this->ada->fresh();
        $this->assertSame(1500, $ada->current_points);
        // A reversal, not an award: lifetime points nobody earned are not added.
        $this->assertSame(1500, $ada->lifetime_points);
        $this->assertTrue($debit->fresh()->is_reversed);
        $this->assertTrue(PointsTransaction::withoutGlobalScope(BrandScope::class)->where('reversal_of_id', $debit->id)->where('points', 500)->exists());
        $this->assertSame(4, $this->voucher->fresh()->stock);
        $this->assertSame($this->staffMember->id, (int) $row->fresh()->cancelled_by_user_id);
    }

    public function test_the_full_admins_address_and_this_one_agree(): void
    {
        $row = $this->redeemed($this->ada);

        $this->asManager()->postJson(rtrim((string) config('app.url'), '/') . "/api/v1/admin/rewards/redemptions/{$row->id}/fulfill")->assertOk();

        $this->asStaffMember()->getJson($this->api('redemptions?state=done'))->assertJsonPath('redemptions.0.state', 'fulfilled');
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/fulfil"))->assertStatus(409)->assertJsonPath('error', 'wrong_state');
    }

    public function test_catalog_debits_must_be_refunded_through_cancellation(): void
    {
        $row = $this->redeemed($this->ada);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)->where('idempotency_key', 'reward_redemption_'.$row->id)->firstOrFail();
        $this->asManager()->getJson($this->api("members/{$this->ada->id}/history"))->assertJsonPath('lines.0.can_reverse', false);
        $this->asManager()->postJson($this->api("members/{$this->ada->id}/history/{$debit->id}/reverse"), ['reason' => 'Cancel reward'])
            ->assertStatus(409)->assertJsonPath('error', 'cannot_reverse');
        $this->assertSame(1000, $this->ada->fresh()->current_points);
        $this->assertSame('pending', $row->fresh()->status);
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))->assertOk();
        $this->assertSame(1500, $this->ada->fresh()->current_points);
        $this->assertSame(4, $this->voucher->fresh()->stock);
    }

    public function test_a_historically_reversed_debit_cannot_be_fulfilled_or_refunded_twice(): void
    {
        $row = $this->redeemed($this->ada);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)->where('idempotency_key', 'reward_redemption_'.$row->id)->firstOrFail();
        app(LoyaltyService::class)->reverseTransaction($debit, 'Prior manual reversal', $this->manager);
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/fulfil"))->assertStatus(409)->assertJsonPath('error', 'wrong_state');
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))->assertOk();
        $ada = $this->ada->fresh();
        $this->assertSame([1500, 1500, 1500, 4], [$ada->current_points, $ada->lifetime_points, $ada->qualifying_points, $this->voucher->fresh()->stock]);
        $this->assertSame(1, PointsTransaction::where('reversal_of_id', $debit->id)->count());
    }

    public function test_organisation_wide_cancellation_restores_the_owning_brands_stock_and_ledger(): void
    {
        $row = $this->redeemed($this->ada);
        $brand = \App\Models\Brand::create(['name' => 'Second studio', 'slug' => 'second-'.uniqid(), 'is_default' => false]);
        DB::table('brand_user')->insert(['brand_id' => $brand->id, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel?brand_id=all"))->assertOk();
        $ada = $this->ada->fresh();
        $this->assertSame([1500, 1500, 1500, 4], [$ada->current_points, $ada->lifetime_points, $ada->qualifying_points,
            Reward::withoutGlobalScope(BrandScope::class)->findOrFail($row->reward_id)->stock]);
        $this->assertSame(1, PointsTransaction::withoutGlobalScope(BrandScope::class)->where('type', 'reverse')->count());
    }

    public function test_legacy_refunds_restore_spendable_points_without_awarding_earned_points(): void
    {
        $row = $this->redemption($this->ada);
        $this->ada->forceFill(['current_points' => 1000])->save();
        $this->voucher->decrement('stock');
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))->assertOk();
        $ada = $this->ada->fresh();
        $this->assertSame([1500, 1500, 1500, 4], [$ada->current_points, $ada->lifetime_points, $ada->qualifying_points, $this->voucher->fresh()->stock]);
        $refund = PointsTransaction::where('idempotency_key', 'reward_refund_'.$row->id)->firstOrFail();
        app(LoyaltyService::class)->reverseTransaction($refund, 'Correction', $this->manager);
        $this->assertSame(1000, $this->ada->fresh()->current_points);
        $this->assertSame(1500, $this->ada->fresh()->lifetime_points);
        $this->assertSame(1500, $this->ada->fresh()->qualifying_points);
    }

    public function test_staff_without_redeem_are_refused_and_nothing_moves(): void
    {
        $row = $this->redeemed($this->ada);
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_redeem_points' => false]);

        foreach (['fulfil', 'cancel'] as $step) {
            $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/{$step}"))
                ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        }

        $this->assertSame('pending', $row->fresh()->status);
        $this->assertSame(1000, $this->ada->fresh()->current_points);
        // Reading is everyone's.
        $this->asStaffMember()->getJson($this->api('redemptions'))->assertOk()->assertJsonPath('total', 1);
    }

    public function test_another_organisations_redemption_is_not_found_and_not_listed(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirReward = Reward::create(['name' => 'Their reward', 'points_cost' => 100]);
        $theirs = RewardRedemption::create(['member_id' => $other['member']->id, 'reward_id' => $theirReward->id, 'points_spent' => 100, 'code' => 'REW-THEIRS', 'status' => 'pending']);
        app()->instance('current_organization_id', $prior);

        foreach (['fulfil', 'cancel'] as $step) {
            $this->asManager()->postJson($this->api("redemptions/{$theirs->id}/{$step}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        }

        $this->assertSame('pending', RewardRedemption::withoutGlobalScopes()->find($theirs->id)->status);
        $this->asManager()->getJson($this->api('redemptions?state=all'))->assertJsonPath('total', 0)->assertJsonPath('counts.pending', 0);
    }

    /** A redemption row only, with no ledger line behind it. */
    protected function redemption(LoyaltyMember $member, array $attributes = []): RewardRedemption
    {
        $row = RewardRedemption::create($attributes + [
            'member_id' => $member->id, 'reward_id' => $this->voucher->id, 'points_spent' => 500,
            'code' => 'REW-' . strtoupper(substr(uniqid('', false), -8)), 'status' => 'pending',
        ]);
        if (isset($attributes['created_at'])) {
            $row->forceFill(['created_at' => $attributes['created_at']])->save();
        }

        return $row;
    }

    /** A pending redemption as the member's app makes one: the stock taken, the points debited under its key. */
    protected function redeemed(LoyaltyMember $member): RewardRedemption
    {
        $this->voucher->decrement('stock');
        $row = $this->redemption($member);
        app(LoyaltyService::class)->redeemPoints($member, 500, 'Reward: Spa voucher', null, null, 'catalog_redeem', 'reward_redemption_' . $row->id);

        return $row;
    }
}
