<?php

namespace Tests\Feature\Admin;

use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's fulfil and cancel, now RedemptionActions' (HexaTech Loyalty spec 2026-10-21 §6.5): the same answers
 * as before the move — the redemption with its reward and member, 422 with the sentence for a step from the wrong state,
 * the points back through a reversal of the debit on a pending cancel, the stock back, nothing back on a fulfilled one.
 */
class RewardRedemptionActionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private Reward $reward;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->reward = Reward::create(['name' => 'Free facial', 'points_cost' => 400, 'stock' => 3, 'is_active' => true]);
    }

    private function redeemed(): RewardRedemption
    {
        $row = RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $this->reward->id, 'points_spent' => 400, 'code' => 'RW-' . strtoupper(substr(uniqid(), -6)), 'status' => 'pending']);
        app(LoyaltyService::class)->redeemPoints(member: $this->ada->fresh(), points: 400, description: 'Free facial', idempotencyKey: 'reward_redemption_' . $row->id);
        $this->reward->decrement('stock');

        return $row;
    }

    private function admin(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/rewards/redemptions/' . $path;
    }

    public function test_fulfil_marks_it_once_and_says_why_not_the_second_time(): void
    {
        $row = $this->redeemed();

        $this->asManager()->postJson($this->admin("{$row->id}/fulfill"))
            ->assertOk()
            ->assertJsonPath('redemption.status', 'fulfilled')
            ->assertJsonPath('redemption.reward.name', 'Free facial')
            ->assertJsonPath('redemption.member.user.name', 'Ada Lovelace');
        $this->assertSame($this->manager->id, (int) $row->fresh()->fulfilled_by_user_id);

        $this->asManager()->postJson($this->admin("{$row->id}/fulfill"))->assertStatus(422)->assertJsonPath('message', 'Redemption is already fulfilled.');
    }

    public function test_a_pending_cancel_gives_the_points_and_the_stock_back_through_a_reversal(): void
    {
        $row = $this->redeemed();
        $this->assertSame(1100, (int) $this->ada->fresh()->current_points);

        $this->asManager()->postJson($this->admin("{$row->id}/cancel"), ['notes' => 'Changed her mind'])
            ->assertOk()
            ->assertJsonPath('redemption.status', 'cancelled')
            ->assertJsonPath('redemption.notes', 'Changed her mind');

        $this->assertSame(1500, (int) $this->ada->fresh()->current_points);
        $this->assertSame(1500, (int) $this->ada->fresh()->lifetime_points);
        $this->assertSame(3, (int) $this->reward->fresh()->stock);

        $this->asManager()->postJson($this->admin("{$row->id}/cancel"))->assertStatus(422)->assertJsonPath('message', 'Redemption is already cancelled.');
    }

    public function test_cancelling_a_fulfilled_one_gives_nothing_back_and_keeps_its_notes(): void
    {
        $row = $this->redeemed();
        $row->update(['notes' => 'At the desk']);
        $this->asManager()->postJson($this->admin("{$row->id}/fulfill"))->assertOk();

        $this->asManager()->postJson($this->admin("{$row->id}/cancel"))->assertOk()->assertJsonPath('redemption.notes', 'At the desk');

        $this->assertSame(1100, (int) $this->ada->fresh()->current_points);
        $this->assertSame(2, (int) $this->reward->fresh()->stock);
    }

    public function test_it_still_needs_can_redeem_points(): void
    {
        $row = $this->redeemed();
        \Illuminate\Support\Facades\DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_redeem_points' => false]);

        $this->asStaffMember()->postJson($this->admin("{$row->id}/fulfill"))->assertStatus(403);
        $this->assertSame('pending', $row->fresh()->status);
    }
}
