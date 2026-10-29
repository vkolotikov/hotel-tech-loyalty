<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\PointsTransaction;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Award, redeem and reverse through the real ledger (spec 2026-10-21 §4.3, §5). */
class PointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;
    use \Tests\Concerns\LoyaltyWorkspace\PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_award_credits_the_member_as_earned_points_by_the_person(): void
    {
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), ['points' => 300, 'reason' => 'Birthday visit'])
            ->assertOk()
            ->assertJsonPath('member.points', 500)
            ->assertJsonPath('member.lifetime_points', 500);

        $line = PointsTransaction::query()->where('member_id', $this->grace->id)->latest('id')->first();
        $this->assertSame('earn', $line->type);
        $this->assertSame(300, (int) $line->points);
        $this->assertSame('Birthday visit', $line->description);
        $this->assertSame($this->staffMember->id, (int) $line->staff_id);
    }

    public function test_a_retry_with_the_same_key_awards_once_and_the_key_never_reaches_another_member(): void
    {
        $body = ['points' => 100, 'reason' => 'Welcome', 'idempotency_key' => 'k-1'];
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), $body)->assertJsonPath('member.points', 300);
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), $body)->assertJsonPath('member.points', 300);

        // The same key on another member is that member's own award.
        $this->asStaffMember()->postJson($this->api('members/' . $this->ada->id . '/award'), $body)->assertJsonPath('member.points', 1600);
    }

    public function test_redeem_takes_points_and_refuses_more_than_the_balance(): void
    {
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/redeem'), ['points' => 201, 'reason' => 'Too many'])
            ->assertStatus(422)->assertJsonPath('error', 'not_enough_points')->assertJsonPath('balance', 200);

        $this->asStaffMember()->postJson($this->api('members/' . $this->ada->id . '/redeem'), ['points' => 500, 'reason' => 'Gift card'])
            ->assertOk()
            ->assertJsonPath('member.points', 1000)
            ->assertJsonPath('member.lifetime_points', 1500);
    }

    public function test_a_committed_deduction_can_be_retried_after_its_balance_has_been_spent(): void
    {
        $body = ['points' => 150, 'reason' => 'Desk adjustment', 'idempotency_key' => 'lost-response'];
        $first = $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/redeem"), $body)->assertOk();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/redeem"), $body)
            ->assertOk()->assertJsonPath('member.points', 50)->assertJsonPath('line', $first->json('line'));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->grace->id)->count());
    }

    public function test_a_retry_key_cannot_change_points_reason_or_operation(): void
    {
        $body = ['points' => 100, 'reason' => 'Welcome', 'idempotency_key' => 'same-key'];
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        foreach ([['points' => 101], ['reason' => 'A different award']] as $change) {
            $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $change + $body)
                ->assertStatus(409)->assertJsonPath('error', 'key_reused');
        }
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/redeem"), $body)
            ->assertStatus(409)->assertJsonPath('error', 'key_reused');
        $this->assertSame(300, $this->grace->fresh()->current_points);
        $this->assertSame(1, PointsTransaction::where('member_id', $this->grace->id)->count());
    }

    public function test_replaying_an_award_notifies_the_member_only_once(): void
    {
        $this->buildPushSchema();
        \Illuminate\Support\Facades\Http::fake();
        $this->grace->forceFill(['expo_push_token' => null])->save();
        $body = ['points' => 100, 'reason' => 'Desk award', 'idempotency_key' => 'award-retry'];
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        $this->assertSame(300, $this->grace->fresh()->current_points);
        $this->assertSame(1, DB::table('push_notifications')->where('member_id', $this->grace->id)->where('type', 'points_earned')->count());
    }

    public function test_an_organisation_ledger_line_can_be_retried_and_reversed_from_another_brand(): void
    {
        $body = ['points' => 100, 'reason' => 'Welcome', 'idempotency_key' => 'brand-retry'];
        $first = $this->asManager()->postJson($this->api("members/{$this->grace->id}/award"), $body)->assertOk();
        $brand = \App\Models\Brand::create(['name' => 'Second studio', 'slug' => 'second-'.uniqid(), 'is_default' => false]);
        DB::table('brand_user')->insert(['brand_id' => $brand->id, 'user_id' => $this->manager->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/award?brand_id=all"), $body)
            ->assertOk()->assertJsonPath('line', $first->json('line'))->assertJsonPath('member.points', 300);
        $this->asManager()->getJson($this->api("members/{$this->grace->id}/history?brand_id=all"))
            ->assertOk()->assertJsonPath('lines.0.can_reverse', true);
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/history/{$first->json('line')}/reverse?brand_id=all"), ['reason' => 'Wrong member'])
            ->assertOk()->assertJsonPath('member.points', 200)->assertJsonPath('member.lifetime_points', 200);
    }

    public function test_each_step_needs_its_flag(): void
    {
        DB::table('staff')->where('user_id', $this->staffMember->id)->update(['can_award_points' => false, 'can_redeem_points' => false]);

        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), ['points' => 1, 'reason' => 'No'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/redeem'), ['points' => 1, 'reason' => 'No'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
    }

    public function test_the_form_is_checked(): void
    {
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), ['points' => 0, 'reason' => ''])
            ->assertStatus(422)->assertJsonValidationErrors(['points', 'reason']);
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), ['points' => 100001, 'reason' => 'Big'])
            ->assertStatus(422)->assertJsonValidationErrors(['points']);
    }

    public function test_another_organisations_member_is_not_found(): void
    {
        $other = $this->otherOrganization();

        $this->asManager()->postJson($this->api('members/' . $other['member']->id . '/award'), ['points' => 10, 'reason' => 'No'])->assertStatus(404);
        $this->asManager()->postJson($this->api('members/' . $other['member']->id . '/redeem'), ['points' => 10, 'reason' => 'No'])->assertStatus(404);
        $this->assertSame(900, (int) $other['member']->fresh()->current_points);
    }

    public function test_a_manager_reverses_an_award_once_and_the_reversal_line_cannot_be_reversed(): void
    {
        $this->asStaffMember()->postJson($this->api('members/' . $this->grace->id . '/award'), ['points' => 300, 'reason' => 'By mistake']);
        $award = PointsTransaction::query()->where('member_id', $this->grace->id)->latest('id')->first();

        $this->asStaffMember()->postJson($this->api("members/{$this->grace->id}/history/{$award->id}/reverse"), ['reason' => 'Wrong member'])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $response = $this->asManager()->postJson($this->api("members/{$this->grace->id}/history/{$award->id}/reverse"), ['reason' => 'Wrong member'])
            ->assertOk()
            ->assertJsonPath('member.points', 200)
            ->assertJsonPath('member.lifetime_points', 200);

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/history/{$award->id}/reverse"), ['reason' => 'Again'])
            ->assertStatus(409)->assertJsonPath('error', 'already_reversed');
        $this->asManager()->postJson($this->api("members/{$this->grace->id}/history/{$response->json('line')}/reverse"), ['reason' => 'Undo the undo'])
            ->assertStatus(409)->assertJsonPath('error', 'cannot_reverse');

        $history = $this->asManager()->getJson($this->api("members/{$this->grace->id}/history"))->json('lines');
        $this->assertSame(['reverse', 'earn'], array_column($history, 'type'));
        $this->assertSame([false, false], array_column($history, 'can_reverse'));
        $this->assertSame($award->id, $history[0]['reversal_of_id']);
    }

    public function test_a_line_must_be_the_members_own(): void
    {
        $this->asStaffMember()->postJson($this->api('members/' . $this->ada->id . '/award'), ['points' => 10, 'reason' => 'Ada']);
        $adas = PointsTransaction::query()->where('member_id', $this->ada->id)->latest('id')->first();

        $this->asManager()->postJson($this->api("members/{$this->grace->id}/history/{$adas->id}/reverse"), ['reason' => 'Mixed up'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertFalse((bool) $adas->fresh()->is_reversed);
    }
}
