<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Stamp;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitEffects;
use App\Services\Loyalty\Visits\VisitRecorder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class VisitEffectsRecoveryTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, VisitsSchema, CreditSchema, TierCountsSchema, PushSchema, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildTierCountsSchema();
        $this->buildPushSchema();
        $this->buildMembershipSchema();
        $this->buildValiditySchema();
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 5, 'cashback_enabled' => true, 'cashback_percent' => 5], $this->manager);
    }

    private function visit(int $ref = 701): Visit
    {
        return new Visit(Visit::PURCHASE, 'scan_event', $ref, 100, '2026-10-05', $this->staffMember);
    }

    public function test_intent_rolls_back_with_the_producer_and_a_committed_intent_survives_no_inline_hook(): void
    {
        DB::beginTransaction();
        app(VisitEffects::class)->remember($this->grace, $this->visit());
        DB::rollBack();
        $this->assertSame(0, DB::table(VisitEffects::TABLE)->count());

        app(VisitEffects::class)->remember($this->grace, $this->visit());
        $this->artisan('loyalty:retry-visit-effects')->expectsOutput('1 recovered; 0 still pending')->assertSuccessful();
        $this->assertSame(1, Stamp::count());
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
        $this->artisan('loyalty:retry-visit-effects')->expectsOutput('0 recovered; 0 still pending')->assertSuccessful();
        $this->assertSame(1, DB::table('credit_transactions')->count());
    }

    public function test_a_failed_effect_is_recovered_without_repeating_successful_effects(): void
    {
        $stamps = app(StampCards::class);
        $this->mock(StampCards::class)->shouldReceive('stamp')->once()->andThrow(new \RuntimeException('Temporary stamp failure'));
        $outcome = app(VisitRecorder::class)->record($this->grace, $this->visit());
        $this->assertSame(['stamp'], $outcome->failed);
        $this->assertTrue((bool) DB::table(VisitEffects::TABLE)->value('pending'));
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
        $this->app->instance(StampCards::class, $stamps);

        $this->artisan('loyalty:retry-visit-effects')->expectsOutput('1 recovered; 0 still pending')->assertSuccessful();
        app(VisitRecorder::class)->record($this->grace, $this->visit());
        $this->assertFalse((bool) DB::table(VisitEffects::TABLE)->value('pending'));
        $this->assertSame(1, Stamp::count());
        $this->assertSame(1, DB::table('credit_transactions')->count());
        $this->assertSame(1, DB::table('tier_qualification_counts')->count());
    }

    public function test_refund_supersedes_pending_earn_and_late_original_hook_cannot_recredit(): void
    {
        app(VisitEffects::class)->remember($this->grace, $this->visit());
        app(VisitRecorder::class)->reversed($this->org->id, 'scan_event', 701, $this->manager);
        app(VisitRecorder::class)->record($this->grace, $this->visit());
        $this->artisan('loyalty:retry-visit-effects')->assertSuccessful();
        $this->assertSame('reverse', DB::table(VisitEffects::TABLE)->value('operation'));
        $this->assertSame(0, Stamp::count());
        $this->assertSame('0.00', $this->grace->fresh()->credit_balance);
        $this->assertSame(0, DB::table('tier_qualification_counts')->count());
    }

    public function test_a_refund_before_the_first_hook_also_leaves_a_durable_tombstone(): void
    {
        app(VisitRecorder::class)->reversed($this->org->id, 'scan_event', 701, $this->manager);
        app(VisitRecorder::class)->record($this->grace, $this->visit());
        $this->assertSame(0, Stamp::count());
        $this->assertSame('0.00', $this->grace->fresh()->credit_balance);
        $this->assertSame(1, DB::table(VisitEffects::TABLE)->count());
    }

    public function test_erased_members_get_no_pending_earn_and_the_payload_contains_no_contact_data(): void
    {
        app(VisitEffects::class)->remember($this->grace, $this->visit());
        $this->grace->user->forceFill(['email' => MemberErasure::stubEmail($this->grace->id)])->save();
        $this->artisan('loyalty:retry-visit-effects')->assertSuccessful();
        $this->assertSame(0, Stamp::count());
        $this->assertSame('0.00', $this->grace->fresh()->credit_balance);
        $this->assertFalse((bool) DB::table(VisitEffects::TABLE)->value('pending'));
        $this->assertEqualsCanonicalizing(['source', 'amount', 'venue_day', 'by', 'nights'], array_keys(json_decode(DB::table(VisitEffects::TABLE)->value('payload'), true)));
    }

    public function test_another_tenant_cannot_be_selected_by_the_recovery_filter(): void
    {
        app(VisitEffects::class)->remember($this->grace, $this->visit());
        $this->artisan('loyalty:retry-visit-effects', ['--org' => $this->org->id + 10000])
            ->expectsOutput('0 recovered; 0 still pending')->assertSuccessful();
        $this->assertTrue((bool) DB::table(VisitEffects::TABLE)->value('pending'));
        $this->assertSame(0, Stamp::count());
    }

    public function test_pending_work_follows_the_surviving_member_after_a_merge(): void
    {
        app(VisitEffects::class)->remember($this->grace, $this->visit());
        app(\App\Services\MemberMergeService::class)->merge($this->ada, $this->grace, $this->manager->id);
        $this->assertSame($this->ada->id, (int) DB::table(VisitEffects::TABLE)->value('member_id'));
        $this->artisan('loyalty:retry-visit-effects')->assertSuccessful();
        $this->assertSame($this->ada->id, (int) Stamp::firstOrFail()->member_id);
        $this->assertSame('5.00', $this->ada->fresh()->credit_balance);
    }

    public function test_ledger_reversal_intent_rolls_back_with_points_and_waits_for_the_producer_commit(): void
    {
        app(VisitRecorder::class)->record($this->grace, $this->visit());
        $line = app(\App\Services\LoyaltyService::class)->awardPoints($this->grace, 100, 'Desk purchase',
            referenceType: 'scan_event', referenceId: 701);
        DB::beginTransaction();
        try {
            app(\App\Services\Loyalty\MemberLedger::class)->reverse($this->grace, $line->id, 'Undo visit', $this->manager);
            $this->assertTrue($line->fresh()->is_reversed);
            $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'reverse', 'pending' => true]);
            $this->assertSame('5.00', $this->grace->fresh()->credit_balance, 'Effects must wait until the outer producer releases its locks.');
        } finally {
            DB::rollBack();
        }
        $this->assertFalse($line->fresh()->is_reversed);
        $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'record', 'pending' => false]);
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
    }

    public function test_ledger_reversal_recovers_after_a_stop_between_commit_and_inline_effects(): void
    {
        app(VisitRecorder::class)->record($this->grace, $this->visit());
        $line = app(\App\Services\LoyaltyService::class)->awardPoints($this->grace, 100, 'Desk purchase',
            referenceType: 'scan_event', referenceId: 701);
        DB::beginTransaction();
        // An earlier callback stopping the process models a committed producer with no inline effect runner.
        DB::afterCommit(fn () => throw new \RuntimeException('Simulated stop after commit'));
        app(\App\Services\Loyalty\MemberLedger::class)->reverse($this->grace, $line->id, 'Undo visit', $this->manager);
        try {
            DB::commit();
            $this->fail('The simulated stop must interrupt the inline runner.');
        } catch (\RuntimeException $error) {
            $this->assertSame('Simulated stop after commit', $error->getMessage());
        }
        $this->assertTrue($line->fresh()->is_reversed);
        $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'reverse', 'pending' => true]);
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
        try {
            app(\App\Services\Loyalty\MemberLedger::class)->reverse($this->grace, $line->id, 'Retry', $this->manager);
            $this->fail('The original line still has the existing already-reversed contract.');
        } catch (\App\Services\Loyalty\LoyaltyRefused $error) {
            $this->assertSame('already_reversed', $error->errorCode);
        }
        $this->artisan('loyalty:retry-visit-effects')->expectsOutput('1 recovered; 0 still pending')->assertSuccessful();
        $this->assertSame('0.00', $this->grace->fresh()->credit_balance);
        $this->assertFalse((bool) DB::table(VisitEffects::TABLE)->value('pending'));
        $this->assertSame(1, \App\Models\PointsTransaction::where('reversal_of_id', $line->id)->count());
    }

    public function test_committed_refund_intents_recover_booking_points_once_and_only_for_the_owning_tenant(): void
    {
        $other = $this->otherOrganization();
        $loyalty = app(\App\Services\LoyaltyService::class);
        foreach (['service_booking', 'booking_mirror'] as $type) {
            app()->instance('current_organization_id', $other['org']->id);
            $foreign = $loyalty->awardPoints($other['member'], 75, 'Other booking', referenceType: $type, referenceId: 801);
            app()->instance('current_organization_id', $this->org->id);
            $own = $loyalty->awardPoints($this->grace, 100, 'Booking award', referenceType: $type, referenceId: 801);
            // The refund producer commits this intent, then stops before any inline effects.
            app(VisitEffects::class)->reverse($this->org->id, $type, 801, $this->manager);
            $this->assertFalse($own->fresh()->is_reversed);
            $this->artisan('loyalty:retry-visit-effects')->expectsOutput('1 recovered; 0 still pending')->assertSuccessful();
            $this->assertTrue($own->fresh()->is_reversed);
            $this->assertFalse(\App\Models\PointsTransaction::withoutGlobalScopes()->findOrFail($foreign->id)->is_reversed);
            $this->assertSame(200, $this->grace->fresh()->current_points);
            $this->assertSame(200, $this->grace->fresh()->lifetime_points);
            app(VisitRecorder::class)->reversed($this->org->id, $type, 801, $this->manager);
            $this->assertSame(1, \App\Models\PointsTransaction::where('reversal_of_id', $own->id)->count());
        }
    }

    public function test_the_reversal_hook_waits_for_a_callers_transaction_and_rolls_back_with_it(): void
    {
        $recorder = app(VisitRecorder::class);
        $recorder->record($this->grace, $this->visit());
        DB::beginTransaction();
        $recorder->reversed($this->org->id, 'scan_event', 701, $this->manager);
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
        $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'reverse', 'pending' => true]);
        DB::rollBack();
        $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'record', 'pending' => false]);
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);

        DB::beginTransaction();
        $recorder->reversed($this->org->id, 'scan_event', 701, $this->manager);
        $this->assertSame('5.00', $this->grace->fresh()->credit_balance);
        DB::commit();
        $this->assertSame('0.00', $this->grace->fresh()->credit_balance);
        $this->assertDatabaseHas(VisitEffects::TABLE, ['reference_id' => 701, 'operation' => 'reverse', 'pending' => false]);
    }
}
