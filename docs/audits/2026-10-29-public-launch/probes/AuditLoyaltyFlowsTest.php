<?php

namespace Tests\Audit;

use App\Models\PointsTransaction;
use App\Scopes\BrandScope;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\LoyaltyWorkspace\RedemptionsTest;

// Audit-only regression probes outside the repository. These assert the desired invariants.
class AuditLoyaltyFlowsTest extends RedemptionsTest
{
    use \Tests\Concerns\LoyaltyWorkspace\PushSchema;
    public function test_audit_cancel_after_manual_debit_reversal_does_not_refund_twice(): void
    {
        $row = $this->redeemed($this->ada);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)
            ->where('idempotency_key', 'reward_redemption_'.$row->id)->firstOrFail();
        $this->asManager()->postJson($this->api("members/{$this->ada->id}/history/{$debit->id}/reverse"), ['reason' => 'Cancelled at desk'])->assertOk();
        $this->assertSame(1500, $this->ada->fresh()->current_points);
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))->assertOk();
        $this->assertSame(1500, $this->ada->fresh()->current_points, 'Cancellation must not refund a debit already reversed through member history.');
    }

    public function test_audit_successful_deduction_retry_returns_original_success_when_remaining_balance_is_low(): void
    {
        $body = ['points' => 150, 'reason' => 'Desk adjustment', 'idempotency_key' => 'audit-lost-response'];
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/redeem"), $body)->assertOk()->assertJsonPath('member.points', 50);
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/redeem"), $body)->assertOk()->assertJsonPath('member.points', 50);
    }

    public function test_audit_award_retry_creates_only_one_member_notification(): void
    {
        $this->buildPushSchema();
        Http::fake();
        $this->grace->forceFill(['expo_push_token' => null])->save();
        $body = ['points' => 100, 'reason' => 'Desk award', 'idempotency_key' => 'audit-award-retry'];
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        $this->assertSame(300, $this->grace->fresh()->current_points);
        $this->assertSame(1, DB::table('push_notifications')->where('member_id', $this->grace->id)->where('type', 'points_earned')->count());
    }

    public function test_audit_cancel_after_manual_reversal_keeps_lifetime_and_qualification_totals(): void
    {
        $row = $this->redeemed($this->ada);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)->where('idempotency_key', 'reward_redemption_'.$row->id)->firstOrFail();
        $this->asManager()->postJson($this->api("members/{$this->ada->id}/history/{$debit->id}/reverse"), ['reason' => 'Cancelled at desk'])->assertOk();
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel"))->assertOk();
        $this->assertSame([1500, 1500], [(int) $this->ada->fresh()->lifetime_points, (int) $this->ada->fresh()->qualifying_points]);
    }

    public function test_audit_visible_other_brand_history_line_can_be_reversed(): void
    {
        $row = $this->redeemed($this->ada);
        $debit = PointsTransaction::withoutGlobalScope(BrandScope::class)->where('idempotency_key', 'reward_redemption_'.$row->id)->firstOrFail();
        $second = \App\Models\Brand::create(['name' => 'Second audit studio', 'slug' => 'audit-second-'.uniqid(), 'is_default' => false]);
        DB::table('brand_user')->insert(['brand_id' => $second->id, 'user_id' => $this->manager->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->asManager()->getJson($this->api("members/{$this->ada->id}/history?brand_id=all"))->assertOk()->assertJsonPath('lines.0.can_reverse', true);
        $this->asManager()->postJson($this->api("members/{$this->ada->id}/history/{$debit->id}/reverse?brand_id=all"), ['reason' => 'Cancelled at desk'])->assertOk();
    }

    public function test_audit_cancelling_from_another_brand_restores_stock_and_does_not_award_lifetime(): void
    {
        $row = $this->redeemed($this->ada);
        $second = \App\Models\Brand::create(['name' => 'Second audit studio', 'slug' => 'audit-second-'.uniqid(), 'is_default' => false]);
        DB::table('brand_user')->insert(['brand_id' => $second->id, 'user_id' => $this->staffMember->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->asStaffMember()->postJson($this->api("redemptions/{$row->id}/cancel?brand_id=all"))->assertOk();
        $this->assertSame([1500, 1500, 1500, 4], [
            (int) $this->ada->fresh()->current_points,
            (int) $this->ada->fresh()->lifetime_points,
            (int) $this->ada->fresh()->qualifying_points,
            (int) \App\Models\Reward::withoutGlobalScope(BrandScope::class)->findOrFail($row->reward_id)->stock,
        ]);
    }
}
