<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Models\BenefitDefinition;
use App\Models\TierBenefit;
use App\Services\DiscountService;
use App\Services\Loyalty\Members\MembershipValidity;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class MembershipPeriodTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildValiditySchema();
        if (!Schema::hasColumn('loyalty_members', 'membership_valid_from')) {
            Schema::table('loyalty_members', fn (Blueprint $table) => $table->date('membership_valid_from')->nullable());
        }
    }

    public function test_a_manager_saves_a_future_membership_period_as_scheduled(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), [
            'valid_from' => '2026-11-01', 'valid_until' => '2027-01-31',
        ])->assertOk()->assertJsonPath('valid_from', '2026-11-01')->assertJsonPath('state', 'scheduled')
            ->assertJsonPath('member.valid_from', '2026-11-01')->assertJsonPath('member.membership_state', 'scheduled');
        $this->assertSame('2026-11-01', DB::table('loyalty_members')->where('id', $this->grace->id)->value('membership_valid_from'));
    }

    public function test_both_boundaries_are_inclusive_and_future_start_precedes_expiry_warning(): void
    {
        foreach ([['2026-10-06', '2026-10-07', 'scheduled'], ['2026-10-05', '2026-10-05', 'expiring'], ['2026-10-01', '2026-10-04', 'expired']] as [$from, $until, $state]) {
            DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => $from, 'membership_valid_until' => $until]);
            $this->assertSame($state, MembershipValidity::summaryFor($this->grace->fresh())['state']);
        }
    }

    public function test_reversed_interval_is_refused_without_changing_either_boundary(): void
    {
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), [
            'valid_from' => '2027-02-01', 'valid_until' => '2027-01-31',
        ])->assertUnprocessable()->assertJsonValidationErrors('valid_from');
        $row = DB::table('loyalty_members')->where('id', $this->grace->id)->first();
        $this->assertNull($row->membership_valid_from);
        $this->assertNull($row->membership_valid_until);
    }

    public function test_start_only_edits_preserve_end_and_explicit_null_removes_start(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2027-01-31']);
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), ['valid_from' => '2026-11-01'])
            ->assertOk()->assertJsonPath('valid_until', '2027-01-31')->assertJsonPath('state', 'scheduled');
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), ['valid_from' => null])
            ->assertOk()->assertJsonPath('valid_from', null)->assertJsonPath('valid_until', '2027-01-31')->assertJsonPath('state', 'active');
    }

    public function test_a_retry_key_cannot_silently_change_the_start_date(): void
    {
        $body = ['valid_from' => '2026-11-01', 'valid_until' => '2027-01-31', 'idempotency_key' => 'membership-period-retry'];
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), $body)->assertOk();
        $body['valid_from'] = '2026-12-01';
        $this->asManager()->putJson($this->api("members/{$this->grace->id}/validity"), $body)->assertConflict()->assertJsonPath('error', 'key_reused');
    }

    private function futureBenefit(): TierBenefit
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-06']);
        $benefit = BenefitDefinition::create(['name' => 'Package discount', 'code' => 'period-discount', 'is_active' => true, 'fulfillment_mode' => 'on_request']);

        return TierBenefit::create(['tier_id' => $this->grace->tier_id, 'benefit_id' => $benefit->id, 'is_active' => true, 'value_type' => 'percent_discount', 'value_amount' => 10]);
    }

    public function test_future_membership_discounts_do_not_apply_before_start(): void
    {
        $this->futureBenefit();
        $this->assertCount(0, app(DiscountService::class)->benefitsFor($this->grace->fresh()));
    }

    public function test_future_membership_cannot_create_a_benefit_request(): void
    {
        \Illuminate\Support\Facades\Http::fake();
        $benefit = $this->futureBenefit();
        $this->actingAs($this->grace->user, 'sanctum')->postJson("/api/v1/member/benefits/{$benefit->id}/request")
            ->assertForbidden()->assertJsonPath('error', 'membership_not_started');
        $this->assertSame(0, DB::table('benefit_entitlements')->where('member_id', $this->grace->id)->count());
    }

    public function test_enrolment_saves_both_dates_before_the_member_is_usable(): void
    {
        $member = app(\App\Services\Loyalty\Members\MemberEnrolment::class)->enrol([
            'name' => 'Scheduled member', 'email' => 'scheduled-period@example.test',
            'valid_from' => '2027-01-01', 'valid_until' => '2027-12-31',
        ], $this->manager, false)['member'];
        $this->assertSame('2027-01-01', MembershipValidity::summaryFor($member->fresh())['valid_from']);
        $this->assertSame('scheduled', MembershipValidity::summaryFor($member->fresh())['state']);
    }

    public function test_scheduled_directory_filter_does_not_treat_a_future_membership_as_expiring(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-06', 'membership_valid_until' => '2026-10-07']);
        $this->asManager()->getJson($this->api('members?state=scheduled'))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('members.0.id', $this->grace->id);
        $this->asManager()->getJson($this->api('members?state=expiring'))->assertOk()->assertJsonPath('total', 0);
    }

    public function test_merge_cannot_turn_separate_membership_periods_into_free_access_between_them(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-01', 'membership_valid_until' => '2026-10-31']);
        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['membership_valid_from' => '2026-12-01', 'membership_valid_until' => '2026-12-31']);
        try {
            MembershipValidity::keptOnMerge($this->grace->fresh(), $this->ada->fresh());
            $this->fail('Disjoint membership periods were merged.');
        } catch (\App\Services\Loyalty\LoyaltyRefused $refused) {
            $this->assertSame('membership_period_conflict', $refused->errorCode);
        }
    }

    public function test_merging_connected_periods_preserves_the_earliest_explicit_start(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-12-01', 'membership_valid_until' => '2027-12-01']);
        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['membership_valid_from' => '2026-11-01', 'membership_valid_until' => '2027-11-30']);
        $winner = $this->grace->fresh();
        MembershipValidity::keptOnMerge($winner, $this->ada->fresh());
        $this->assertSame('2026-11-01', MembershipValidity::startOf($winner));
        $this->assertSame('2027-12-01', MembershipValidity::endOf($winner));
    }

    public function test_a_queued_benefit_cannot_be_consumed_after_the_membership_term_ends(): void
    {
        $benefit = $this->futureBenefit();
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_from' => '2026-10-01', 'membership_valid_until' => '2026-10-04']);
        $request = \App\Models\BenefitEntitlement::create(['member_id' => $this->grace->id, 'benefit_id' => $benefit->benefit_id, 'status' => 'approved']);
        $this->asManager()->postJson($this->api("requests/{$request->id}/done"))->assertForbidden()->assertJsonPath('error', 'membership_expired');
        $this->assertSame('approved', $request->fresh()->status);
        $this->assertNull($request->fresh()->fulfilled_at);
    }

    public function test_a_shared_benefit_approval_refuses_a_replacement_term_that_has_not_started(): void
    {
        $benefit = $this->futureBenefit();
        $request = \App\Models\BenefitEntitlement::create(['member_id' => $this->grace->id, 'benefit_id' => $benefit->benefit_id, 'status' => 'pending']);
        try {
            $request->approve($this->manager);
            $this->fail('A future membership benefit was approved.');
        } catch (\App\Services\Loyalty\LoyaltyRefused $refused) {
            $this->assertSame('membership_not_started', $refused->errorCode);
        }
        $this->assertSame('pending', $request->fresh()->status);
    }
}
