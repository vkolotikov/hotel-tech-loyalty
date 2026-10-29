<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\Referral;
use App\Models\Reward;
use App\Models\RewardRedemption;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class RequestsInboxTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private BenefitDefinition $benefit;
    private Reward $reward;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->benefit = BenefitDefinition::create(['name' => 'Drink 10%_off!', 'code' => 'drink', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
        $this->reward = Reward::create(['name' => 'Coffee', 'points_cost' => 999]);
    }

    private function benefit(string $state = 'pending', int $minutes = 0): BenefitEntitlement
    {
        return BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $this->benefit->id, 'status' => $state, 'requested_at' => now()->subMinutes($minutes)]);
    }

    private function redemption(string $state = 'pending'): RewardRedemption
    {
        return RewardRedemption::create(['member_id' => $this->grace->id, 'reward_id' => $this->reward->id, 'status' => $state, 'points_spent' => 500, 'code' => 'REW-'.strtoupper(bin2hex(random_bytes(4)))]);
    }

    public function test_combined_pagination_filters_and_stable_order_keep_native_states(): void
    {
        $newest = $this->benefit('pending');
        $approved = $this->benefit('approved', 1);
        foreach (range(2, 7) as $minute) $this->benefit('eligible', $minute);
        $done = $this->benefit('fulfilled', 8);
        $reward = $this->redemption();
        $this->redemption('cancelled');
        $referral = Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $this->grace->id, 'status' => 'qualified']);

        $response = $this->asStaffMember()->getJson($this->api('requests/inbox'))->assertOk()
            ->assertJsonPath('total', 10)->assertJsonCount(5, 'records')->assertJsonPath('pages', 2);
        $this->assertSame(['benefit:'.$newest->id, 'redemption:'.$reward->id, 'referral:'.$referral->id], array_slice(array_column($response->json('records'), 'key'), 0, 3));
        $this->getJson($this->api('requests/inbox?page=2'))->assertOk()->assertJsonCount(5, 'records');
        $this->getJson($this->api('requests/inbox?view=closed'))->assertJsonPath('total', 2);
        $this->getJson($this->api('requests/inbox?view=all&sort=oldest'))->assertJsonPath('records.0.key', 'benefit:'.$done->id)->assertJsonPath('total', 12);
        $this->getJson($this->api('requests/inbox?type=benefit&view=waiting'))->assertJsonPath('total', 7);
        $this->getJson($this->api('requests/inbox?type=benefit&view=approved'))->assertJsonPath('records.0.id', $approved->id)->assertJsonPath('total', 1);
        $this->getJson($this->api('requests/inbox?type=redemption'))->assertJsonPath('total', 1)->assertJsonPath('records.0.points', 500);
    }

    public function test_search_precedes_pagination_and_preserves_literal_wildcards_and_source_ids(): void
    {
        foreach (range(1, 8) as $i) $this->benefit('pending', $i);
        $reward = $this->redemption();
        $referral = Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $this->grace->id, 'status' => 'pending']);
        $this->asStaffMember()->getJson($this->api('requests/inbox?q=coffee'))->assertOk()->assertJsonPath('total', 1)->assertJsonPath('records.0.key', 'redemption:'.$reward->id);
        $this->getJson($this->api('requests/inbox?q='.urlencode($reward->code)))->assertJsonPath('total', 1);
        $this->getJson($this->api('requests/inbox?q='.urlencode('#RF-'.$referral->id)))->assertJsonPath('total', 1)->assertJsonPath('records.0.kind', 'referral');
        $this->getJson($this->api('requests/inbox?q='.urlencode('10%_off!')))->assertJsonPath('total', 8);
        $this->getJson($this->api('requests/inbox?q='.urlencode('10X_off!')))->assertJsonPath('total', 0);
        $this->getJson($this->api('requests/inbox?q=grace'))->assertJsonPath('total', 2);
        $this->getJson($this->api('requests/inbox?type=redemption&q='.urlencode($this->grace->member_number)))->assertJsonPath('total', 1);
    }

    public function test_selected_record_survives_list_filters_and_returns_current_level_and_historical_facts(): void
    {
        $done = $this->benefit('fulfilled');
        $done->update(['fulfilled_at' => now()->subMinute()]);
        $this->asStaffMember()->getJson($this->api('requests/inbox?selected_kind=benefit&selected_id='.$done->id))
            ->assertOk()->assertJsonPath('records', [])->assertJsonPath('selected.state', 'fulfilled')
            ->assertJsonPath('selected.member.tier', $this->ada->tier->name)->assertJsonPath('selected.fulfilled_at', '2026-10-05T08:59:00+00:00');
        $referral = Referral::create(['referrer_id' => $this->ada->id, 'referee_id' => $this->grace->id, 'status' => 'rewarded', 'referrer_points_awarded' => 250, 'referee_points_awarded' => 100, 'rewarded_at' => now()]);
        $this->getJson($this->api('requests/inbox?selected_kind=referral&selected_id='.$referral->id))
            ->assertJsonPath('selected.points', ['referrer' => 250, 'referee' => 100])->assertJsonPath('selected.referee.name', 'Grace Hopper');
        $this->assertSame('rewarded', $referral->fresh()->status);
    }

    public function test_every_source_and_selected_record_is_tenant_scoped_and_related_foreign_members_are_not_disclosed(): void
    {
        $other = $this->otherOrganization();
        app()->instance('current_organization_id', $other['org']->id);
        $foreignBenefit = $this->benefit();
        $foreignReward = $this->redemption();
        $foreignReferral = Referral::create(['referrer_id' => $other['member']->id, 'referee_id' => $other['member']->id, 'status' => 'pending']);
        app()->instance('current_organization_id', $this->org->id);
        $this->asStaffMember()->getJson($this->api('requests/inbox'))->assertOk()->assertJsonPath('total', 0);
        foreach (['benefit' => $foreignBenefit->id, 'redemption' => $foreignReward->id, 'referral' => $foreignReferral->id] as $kind => $id) {
            $this->getJson($this->api("requests/inbox?selected_kind={$kind}&selected_id={$id}"))->assertNotFound();
        }
        $own = $this->benefit();
        $own->update(['member_id' => $other['member']->id]);
        $this->getJson($this->api('requests/inbox'))->assertJsonPath('records.0.member', null);
        $this->getJson($this->api('requests/inbox?q=Someone'))->assertJsonPath('total', 0);
    }

    public function test_validation_bounds_selection_and_filters_and_legacy_queue_is_unchanged(): void
    {
        $this->benefit();
        $this->asStaffMember()->getJson($this->api('requests/inbox?per_page=1000&type=unknown&sort=random&selected_kind=benefit'))
            ->assertUnprocessable()->assertJsonValidationErrors(['per_page', 'type', 'sort', 'selected_id']);
        $this->getJson($this->api('requests/inbox?q='.str_repeat('a', 121)))->assertUnprocessable();
        $this->getJson($this->api('requests?state=waiting'))->assertOk()->assertJsonPath('counts.waiting', 1)->assertJsonCount(1, 'requests');
    }
}
