<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\Loyalty\Members\MemberErasure;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Likely duplicates and the merge in the workspace (spec 2026-10-21 release 2 §4.1, §4.2): a manager's; pairs with
 * every reason they match and the oldest to keep; the merge keeps the history (R2-3), is audited, refuses a deleted
 * member and reaches only this organisation's members.
 */
class DuplicatesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
    }

    /** A second account of Ada's: the same email in another case and the same phone, written another way. */
    private function adasTwin(): LoyaltyMember
    {
        $this->ada->user->update(['phone' => '+371 26 123 456']);
        $twin = $this->makeMember('Ada L.', 'twin@example.test', ['current_points' => 120, 'lifetime_points' => 120]);
        DB::table('users')->where('id', $twin->user_id)->update(['email' => strtoupper($this->ada->user->email), 'phone' => '(+371) 26-123-456']);
        $twin->forceFill(['created_at' => now()->addMinute()])->save();

        return $twin;
    }

    public function test_a_manager_sees_each_pair_once_with_every_reason_and_the_oldest_to_keep(): void
    {
        $twin = $this->adasTwin();
        $this->otherOrganization();

        $pairs = $this->asManager()->getJson($this->api('members/duplicates'))->assertOk()->json('pairs');

        $this->assertCount(1, $pairs);
        $this->assertSame(['same_email', 'same_phone'], $pairs[0]['reasons']);
        $this->assertSame($this->ada->id, $pairs[0]['keep']);
        $this->assertSame([$this->ada->id, $twin->id], [$pairs[0]['a']['id'], $pairs[0]['b']['id']]);
        $this->assertSame('Ada L.', $pairs[0]['b']['name']);
        $this->assertSame(120, $pairs[0]['b']['points']);
    }

    public function test_a_phone_alone_matches_from_seven_digits(): void
    {
        $this->ada->user->update(['phone' => '+44 20 7946 0000']);
        $this->grace->user->update(['phone' => '0044-20-7946-0000']);
        $this->asManager()->getJson($this->api('members/duplicates'))->assertJsonPath('pairs', []);

        $this->grace->user->update(['phone' => '(44) 20 7946 0000']);
        $this->asManager()->getJson($this->api('members/duplicates'))->assertJsonPath('pairs.0.reasons', ['same_phone']);
    }

    public function test_duplicates_and_merge_are_a_managers(): void
    {
        $twin = $this->adasTwin();

        $this->asStaffMember()->getJson($this->api('members/duplicates'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $twin->id, 'reason' => 'Same person'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertNotNull(LoyaltyMember::query()->find($twin->id));
    }

    public function test_the_merge_keeps_the_history_adds_the_points_and_answers_with_the_kept_member(): void
    {
        $twin = $this->adasTwin();
        $reward = Reward::create(['name' => 'Coffee', 'points_cost' => 50]);
        $redemption = RewardRedemption::create(['member_id' => $twin->id, 'reward_id' => $reward->id, 'points_spent' => 50, 'code' => 'RW-TWIN', 'status' => 'fulfilled']);
        DB::table('points_transactions')->insert(['organization_id' => $this->org->id, 'member_id' => $twin->id, 'points' => 120, 'type' => 'earn',
            'description' => 'Earn', 'balance_after' => 120, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $twin->id, 'reason' => ' One guest, two sign-ups '])
            ->assertOk()
            ->assertJsonPath('member.id', $this->ada->id)
            ->assertJsonPath('member.points', 1620)
            ->assertJsonPath('member.lifetime_points', 1620);

        $this->assertNull(LoyaltyMember::query()->find($twin->id));
        $this->assertSame($this->ada->id, (int) $redemption->fresh()->member_id);
        $this->assertSame(1, DB::table('points_transactions')->where('member_id', $this->ada->id)->count());
        $this->asManager()->getJson($this->api("members/{$this->ada->id}/history"))->assertJsonPath('total', 1);

        $audit = AuditLog::where('action', 'member_merged')->firstOrFail();
        $this->assertSame($this->manager->id, (int) $audit->causer_id);
        $this->assertSame('One guest, two sign-ups', $audit->new_values['reason']);
        $this->assertSame('One guest, two sign-ups', DB::table('member_merges')->value('reason'));
        $this->assertSame([], $this->asManager()->getJson($this->api('members/duplicates'))->json('pairs'));
    }

    public function test_the_kept_member_may_be_either_and_an_inactive_one_may_be_merged(): void
    {
        $twin = $this->adasTwin();
        $twin->update(['is_active' => false]);

        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $twin->id, 'merge_id' => $this->ada->id, 'reason' => 'The newer account is the real one'])
            ->assertOk()->assertJsonPath('member.id', $twin->id)->assertJsonPath('member.is_active', false);
        $this->assertNull(LoyaltyMember::query()->find($this->ada->id));
    }

    public function test_the_merge_refuses_a_deleted_member_the_same_member_and_a_missing_reason(): void
    {
        $twin = $this->adasTwin();

        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $this->ada->id, 'reason' => 'x y'])
            ->assertStatus(422)->assertJsonValidationErrors('merge_id');
        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $twin->id])
            ->assertStatus(422)->assertJsonValidationErrors('reason');

        app(MemberErasure::class)->erase($twin->fresh(), $this->manager);
        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $twin->id, 'reason' => 'Same person'])
            ->assertStatus(409)->assertJsonPath('error', 'already_erased');
        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $twin->id, 'merge_id' => $this->ada->id, 'reason' => 'Same person'])
            ->assertStatus(409)->assertJsonPath('error', 'already_erased');
        $this->assertNotNull(LoyaltyMember::query()->find($twin->id));
    }

    public function test_another_organisations_member_is_not_found_on_either_side(): void
    {
        $other = $this->otherOrganization()['member'];

        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->ada->id, 'merge_id' => $other->id, 'reason' => 'Same person'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $other->id, 'merge_id' => $this->ada->id, 'reason' => 'Same person'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->assertNotNull(LoyaltyMember::withoutGlobalScopes()->find($other->id));
        $this->assertNotNull(LoyaltyMember::query()->find($this->ada->id));
    }
}
