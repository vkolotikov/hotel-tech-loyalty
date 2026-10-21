<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\LoyaltyMember;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** The benefit-request queue (spec 2026-10-21 §4.4). */
class RequestsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private BenefitDefinition $benefit;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->benefit = BenefitDefinition::create(['name' => 'Welcome drink', 'code' => 'drink', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
    }

    private function ask(LoyaltyMember $member, string $status = 'pending'): BenefitEntitlement
    {
        return BenefitEntitlement::create(['member_id' => $member->id, 'benefit_id' => $this->benefit->id, 'status' => $status, 'requested_at' => now()]);
    }

    public function test_the_tabs_hold_their_states_with_counts(): void
    {
        $pending = $this->ask($this->ada);
        $eligible = $this->ask($this->grace, 'eligible');
        $this->ask($this->ada, 'approved');
        $this->ask($this->ada, 'fulfilled');
        $this->ask($this->grace, 'declined');

        $waiting = $this->asStaffMember()->getJson($this->api('requests'))->assertOk();
        $this->assertEqualsCanonicalizing([$pending->id, $eligible->id], array_column($waiting->json('requests'), 'id'));
        $waiting->assertJsonPath('counts', ['waiting' => 2, 'approved' => 1, 'done' => 2])
            ->assertJsonPath('requests.0.benefit.name', 'Welcome drink');

        $this->asStaffMember()->getJson($this->api('requests?state=done'))->assertJsonPath('total', 2);
    }

    public function test_staff_approve_then_mark_done(): void
    {
        $request = $this->ask($this->ada);

        $this->asStaffMember()->postJson($this->api("requests/{$request->id}/approve"))->assertOk()->assertJsonPath('request.state', 'approved');
        $this->asStaffMember()->postJson($this->api("requests/{$request->id}/done"))->assertOk()->assertJsonPath('request.state', 'fulfilled');

        $this->assertSame($this->staffMember->id, (int) $request->fresh()->actioned_by);
        $this->assertNotNull($request->fresh()->fulfilled_at);
    }

    public function test_a_step_from_the_wrong_state_is_refused_so_two_presses_act_once(): void
    {
        $request = $this->ask($this->ada);

        $this->asStaffMember()->postJson($this->api("requests/{$request->id}/done"))->assertStatus(409)->assertJsonPath('error', 'wrong_state')->assertJsonPath('state', 'pending');
        $this->asStaffMember()->postJson($this->api("requests/{$request->id}/approve"))->assertOk();
        $this->asManager()->postJson($this->api("requests/{$request->id}/approve"))->assertStatus(409)->assertJsonPath('state', 'approved');
    }

    public function test_decline_needs_a_reason_and_works_from_waiting_or_approved(): void
    {
        $waiting = $this->ask($this->ada);
        $approved = $this->ask($this->grace, 'approved');

        $this->asStaffMember()->postJson($this->api("requests/{$waiting->id}/decline"), [])->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->asStaffMember()->postJson($this->api("requests/{$waiting->id}/decline"), ['reason' => 'Fully booked tonight'])
            ->assertOk()->assertJsonPath('request.state', 'declined')->assertJsonPath('request.decline_reason', 'Fully booked tonight');
        $this->asStaffMember()->postJson($this->api("requests/{$approved->id}/decline"), ['reason' => 'Changed plans'])->assertOk();
        $this->asStaffMember()->postJson($this->api("requests/{$approved->id}/decline"), ['reason' => 'Again'])->assertStatus(409);
    }

    public function test_another_organisations_request_is_not_found(): void
    {
        $other = $this->otherOrganization();
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = BenefitEntitlement::create(['member_id' => $other['member']->id, 'benefit_id' => $this->benefit->id, 'status' => 'pending']);
        app()->instance('current_organization_id', $this->org->id);

        $this->asManager()->postJson($this->api("requests/{$theirs->id}/approve"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asManager()->getJson($this->api('requests'))->assertJsonPath('total', 0);
    }
}
