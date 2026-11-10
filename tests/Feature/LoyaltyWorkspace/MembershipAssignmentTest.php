<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Services\LoyaltyService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class MembershipAssignmentTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildValiditySchema();
        if (!Schema::hasColumn('loyalty_members', 'membership_mode')) {
            Schema::table('loyalty_members', fn (Blueprint $table) => $table->string('membership_mode', 16)->default('earned'));
        }
    }

    private function assignment(array $changes = []): array
    {
        return $changes + ['membership_mode' => 'assigned', 'tier_id' => $this->tiers['gold']->id,
            'valid_from' => '2026-10-05', 'valid_until' => '2027-10-04', 'idempotency_key' => 'manual-package-01'];
    }

    public function test_manager_assigns_level_and_period_together_without_changing_points(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())
            ->assertOk()->assertJsonPath('member.membership_mode', 'assigned')
            ->assertJsonPath('member.tier_id', $this->tiers['gold']->id)->assertJsonPath('member.valid_from', '2026-10-05')
            ->assertJsonPath('member.valid_until', '2027-10-04');
        $this->assertSame(200, (int) $this->grace->fresh()->current_points);
    }

    public function test_only_managers_can_assign_a_package(): void
    {
        $this->asStaffMember()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())->assertForbidden();
        $this->assertSame($this->tiers['silver']->id, $this->grace->fresh()->tier_id);
    }

    public function test_invalid_period_does_not_partially_change_the_level_or_mode(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment(['valid_from' => '2028-01-01']))
            ->assertUnprocessable()->assertJsonValidationErrors('valid_from');
        $member = $this->grace->fresh();
        $this->assertSame($this->tiers['silver']->id, $member->tier_id);
        $this->assertSame('earned', $member->membership_mode);
        $this->assertNull($member->membership_valid_until);
    }

    public function test_assigned_level_is_not_replaced_by_automatic_qualification_even_with_a_stale_member(): void
    {
        $stale = $this->ada->fresh();
        $this->asManager()->putJson($this->api("members/{$this->ada->id}/membership"), $this->assignment(['tier_id' => $this->tiers['silver']->id]))->assertOk();
        app(LoyaltyService::class)->assessTier($stale);
        $this->assertSame($this->tiers['silver']->id, $this->ada->fresh()->tier_id);
        $this->assertNull(app(LoyaltyService::class)->tierProgress($this->ada->fresh())['next_tier']);
    }

    public function test_returning_to_earned_progression_reassesses_the_level(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->ada->id}/membership"), $this->assignment(['tier_id' => $this->tiers['silver']->id]))->assertOk();
        $this->asManager()->putJson($this->api("members/{$this->ada->id}/membership"), ['membership_mode' => 'earned', 'idempotency_key' => 'earned-again'])
            ->assertOk()->assertJsonPath('member.membership_mode', 'earned')->assertJsonPath('member.tier_id', $this->tiers['gold']->id);
    }

    public function test_retry_keeps_one_assignment_and_reusing_its_key_for_another_level_is_refused(): void
    {
        foreach ([1, 2] as $attempt) {
            $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())->assertOk();
        }
        $this->assertSame(1, AuditLog::where('action', 'member.membership_assigned')->count());
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment(['tier_id' => $this->tiers['platinum']->id]))
            ->assertConflict()->assertJsonPath('error', 'key_reused');
    }

    public function test_replacing_active_access_with_a_future_start_requires_explicit_confirmation(): void
    {
        $body = $this->assignment(['valid_from' => '2026-11-01']);
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $body)->assertUnprocessable()->assertJsonValidationErrors('confirm_replace');
        $this->assertNull($this->grace->fresh()->membership_valid_from);
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $body + ['confirm_replace' => true])
            ->assertOk()->assertJsonPath('member.membership_state', 'scheduled');
    }

    public function test_new_member_can_start_on_an_assigned_package_in_one_enrolment(): void
    {
        $this->asManager()->postJson($this->api('members'), $this->assignment() + ['name' => 'Package member', 'email' => 'manual-package@example.test', 'send_welcome' => false])
            ->assertCreated()->assertJsonPath('member.membership_mode', 'assigned')->assertJsonPath('member.tier_id', $this->tiers['gold']->id)
            ->assertJsonPath('member.valid_from', '2026-10-05')->assertJsonPath('member.valid_until', '2027-10-04');
    }

    public function test_foreign_and_inactive_levels_are_refused(): void
    {
        $other = \App\Models\Organization::create(['name' => 'Another business', 'slug' => 'other-membership-' . uniqid(), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $other->id);
        $foreign = \App\Models\LoyaltyTier::withoutGlobalScope(\App\Scopes\TenantScope::class)->create([
            'organization_id' => $other->id, 'name' => 'Private package', 'min_points' => 0, 'is_active' => true,
        ]);
        app()->instance('current_organization_id', $this->org->id);
        $this->assertSame((int) $other->id, (int) $foreign->organization_id);
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment(['tier_id' => $foreign->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('tier_id');
        $this->tiers['gold']->update(['is_active' => false]);
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())
            ->assertUnprocessable()->assertJsonValidationErrors('tier_id');
        $this->assertSame('earned', $this->grace->fresh()->membership_mode);
    }

    public function test_staff_cannot_create_an_assigned_membership_through_enrolment(): void
    {
        $this->asStaffMember()->postJson($this->api('members'), $this->assignment() + ['name' => 'Not allowed', 'email' => 'staff-assignment@example.test', 'send_welcome' => false])
            ->assertForbidden();
        $this->assertSame(0, DB::table('users')->where('email', 'staff-assignment@example.test')->count());
    }

    public function test_an_expired_assigned_package_does_not_supply_tier_discounts(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())->assertOk();
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => null, 'membership_valid_until' => '2026-10-04']);
        $this->assertFalse(\App\Services\Loyalty\Members\MembershipValidity::benefitsAvailable($this->grace->fresh()));
    }

    public function test_merging_different_assignment_modes_requires_an_explicit_membership_choice_first(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment())->assertOk();
        $this->asManager()->postJson($this->api('members/merge'), ['keep_id' => $this->grace->id, 'merge_id' => $this->ada->id, 'reason' => 'Verified duplicate identity'])
            ->assertConflict()->assertJsonPath('error', 'membership_assignment_conflict');
        $this->assertSame('assigned', $this->grace->fresh()->membership_mode);
        $this->assertTrue((bool) $this->ada->fresh()->is_active);
    }

    public function test_releasing_an_expired_assignment_without_a_start_does_not_renew_its_benefits(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/membership"), $this->assignment(['valid_from' => null]))->assertOk();
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-04']);
        $this->putJson($this->api("members/{$this->grace->id}/membership"), ['membership_mode' => 'earned', 'idempotency_key' => 'release-expired'])
            ->assertOk()->assertJsonPath('member.valid_until', '2026-10-04')->assertJsonPath('member.membership_mode', 'earned');
        $this->assertFalse(\App\Services\Loyalty\Members\MembershipValidity::benefitsAvailable($this->grace->fresh()));
    }
}
