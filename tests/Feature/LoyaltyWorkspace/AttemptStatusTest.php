<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\PointsTransaction;
use App\Models\ScanEvent;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\VisitEffects;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class AttemptStatusTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, VisitsSchema, CreditSchema, PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
    }

    private function readAttempt(array $changes = [], ?int $member = null)
    {
        return $this->asStaffMember()->postJson($this->api('members/' . ($member ?? $this->ada->id) . '/attempt-status'),
            array_replace(['action' => 'award', 'idempotency_key' => 'recovery-fixture', 'amount' => 7, 'note' => 'Test visit'], $changes));
    }

    public function test_a_committed_award_can_be_confirmed_without_writing_again_after_rights_are_removed(): void
    {
        $response = $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/award"),
            ['points' => 7, 'reason' => 'Test visit', 'idempotency_key' => 'recovery-fixture'])->assertOk();
        $count = PointsTransaction::count();
        $balance = $this->ada->fresh()->current_points;
        $this->staffMember->staff->update(['can_award_points' => false, 'can_redeem_points' => false]);
        $this->readAttempt()->assertOk()->assertJsonPath('state', 'recorded')->assertJsonPath('reference', $response->json('line'))
            ->assertJsonPath('reversed', false)->assertJsonPath('effects_pending', false);
        $this->assertSame($count, PointsTransaction::count());
        $this->assertSame($balance, $this->ada->fresh()->current_points);
    }

    public function test_an_unknown_or_mismatched_attempt_never_claims_success(): void
    {
        $this->readAttempt()->assertExactJson(['state' => 'unknown']);
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/award"),
            ['points' => 7, 'reason' => 'Test visit', 'idempotency_key' => 'recovery-fixture'])->assertOk();
        foreach ([['amount' => 8], ['note' => 'Different'], ['action' => 'redeem'], ['idempotency_key' => 'another']] as $changed) {
            $this->readAttempt($changed)->assertExactJson(['state' => 'unknown']);
        }
        $this->readAttempt([], $this->grace->id)->assertExactJson(['state' => 'unknown']);
        PointsTransaction::query()->where('idempotency_key', "loyalty-ws:{$this->org->id}:{$this->ada->id}:recovery-fixture")
            ->update(['staff_id' => $this->manager->id]);
        $this->readAttempt()->assertExactJson(['state' => 'unknown']);
        $other = $this->otherOrganization();
        $this->readAttempt([], $other['member']->id)->assertNotFound();
    }

    public function test_redeemed_and_later_reversed_points_are_reported_as_history(): void
    {
        $response = $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/redeem"),
            ['points' => 7, 'reason' => 'Test visit', 'idempotency_key' => 'recovery-fixture'])->assertOk();
        $this->readAttempt(['action' => 'redeem'])->assertJsonPath('state', 'recorded')->assertJsonPath('reversed', false);
        PointsTransaction::query()->whereKey($response->json('line'))->update(['is_reversed' => true]);
        $this->readAttempt(['action' => 'redeem'])->assertJsonPath('state', 'recorded')->assertJsonPath('reversed', true);
    }

    public function test_a_zero_point_visit_is_found_after_programme_changes_and_pending_effects_stay_visible(): void
    {
        ProgrammeOptions::save($this->org->id, ['checkin_enabled' => true, 'checkin_points' => 0], $this->manager);
        $this->asStaffMember()->postJson($this->api("members/{$this->ada->id}/check-in"),
            ['note' => 'Test visit', 'idempotency_key' => 'recovery-fixture'])->assertOk();
        ProgrammeOptions::save($this->org->id, ['checkin_enabled' => false], $this->manager);
        $changes = ['action' => 'checkin', 'amount' => null];
        $row = ScanEvent::where('scan_type', 'desk')->firstOrFail();
        DB::table(VisitEffects::TABLE)->where('reference_type', 'scan_event')->where('reference_id', $row->id)->update(['pending' => true]);
        $this->readAttempt($changes)->assertOk()->assertJsonPath('state', 'recorded')->assertJsonPath('reference', $row->id)
            ->assertJsonPath('effects_pending', true);
        $this->readAttempt(array_replace($changes, ['note' => 'Changed']))->assertExactJson(['state' => 'unknown']);
        $this->readAttempt(array_replace($changes, ['amount' => 20]))->assertExactJson(['state' => 'unknown']);
        DB::table(VisitEffects::TABLE)->where('reference_type', 'scan_event')->where('reference_id', $row->id)->update(['operation' => 'reverse']);
        $this->readAttempt($changes)->assertJsonPath('reversed', true);
        $this->assertSame(1, ScanEvent::where('scan_type', 'desk')->count());
    }
}
