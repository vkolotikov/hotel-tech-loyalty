<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use Illuminate\Support\Facades\DB;
use App\Models\PointsTransaction;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Database\Factories\PointsTransactionFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks in the LoyaltyService::reverseTransaction contract.
 *
 * BookingRefundService depends on this method to be idempotent — the
 * refund flow walks every PointsTransaction tied to the booking and
 * reverses each. If reverseTransaction double-credited under a
 * concurrent admin-refund + Stripe-webhook race, the member's balance
 * would go negative AND lifetime_points would skew. The append-only
 * points ledger invariant from CLAUDE.md ("Never delete a points
 * transaction. Use the 'reverse' type to undo.") depends on this
 * specific guard.
 *
 * What's tested (5 contract invariants):
 *
 *   1. is_reversed=true → throws "Transaction already reversed"
 *      (the canonical anti-double-credit guard)
 *
 *   2. Successful reversal stamps idempotency_key='rev_{id}' on the
 *      new transaction. BookingRefundService relies on this format
 *      so a re-run of the refund cron can detect "we already
 *      reversed this" via the unique key.
 *
 *   3. Successful reversal flips the ORIGINAL transaction's
 *      is_reversed flag to true. Combined with #1, this means a
 *      second call against the same original will hit the guard.
 *
 *   4. Successful reversal decrements the member's current_points by
 *      the original points (so reversing a +500 earn leaves the
 *      member 500 lighter than they were before the original).
 *
 *   5. Successful reversal stamps reversal_of_id pointing at the
 *      original — the audit-trail back-pointer.
 *
 * The wider tier-reassessment path (assessTier on the post-reversal
 * balance) is deliberately out of scope here; it's tested in its own
 * class against the tier ladder. This class focuses on the idempotency
 * + ledger-integrity invariants.
 */
class LoyaltyServiceReverseTransactionTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyService $service;

    protected function setUp(): void
    {
        parent::setUp();
        // Award-path superset: the bucket-realignment tests below drive
        // real awards and redemptions through the service rather than
        // seeding transaction rows, so they need domain_events and the
        // extra tier columns assessTier reads.
        $this->setUpLoyaltyAwardSchema();
        // Resolve through the container so any container-side wiring
        // (e.g. constructor injection) is exercised — matches how
        // BookingRefundService gets its LoyaltyService.
        $this->service = app(LoyaltyService::class);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /** Compose a full org+tier+member+booking-earn scenario.
     *  Returns [member, originalTransaction]. */
    private function seedEarnedTransaction(int $points = 500): array
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        /** @var LoyaltyTier $tier */
        $tier = LoyaltyTierFactory::new()->bronze()->create();
        /** @var LoyaltyMember $member */
        $member = LoyaltyMemberFactory::new()
            ->inTier($tier->id)
            ->withPoints($points)
            ->create();

        /** @var PointsTransaction $tx */
        $tx = PointsTransactionFactory::new()
            ->forMember($member->id)
            ->state(['points' => $points, 'qualifying_points' => $points])
            ->create();

        return [$member->refresh(), $tx->refresh()];
    }

    public function test_reversing_already_reversed_transaction_throws(): void
    {
        // Most important guard: a transaction that's already been
        // reversed must NEVER be reversed again. Without this,
        // BookingRefundService's reverseLoyaltyPoints loop could
        // double-credit when the admin-refund + Stripe webhook race
        // both pass the BookingRefundService freshness gate.
        [, $tx] = $this->seedEarnedTransaction(500);
        $tx->update(['is_reversed' => true]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Transaction already reversed');

        $this->service->reverseTransaction($tx, 'duplicate refund');
    }

    public function test_successful_reversal_stamps_idempotency_key_with_canonical_format(): void
    {
        // The `rev_{id}` format is the unique key BookingRefundService
        // uses to detect "I already reversed this one." If the format
        // changes silently, retry-cron paths would create duplicate
        // reversal rows.
        [, $tx] = $this->seedEarnedTransaction(500);

        $reversal = $this->service->reverseTransaction($tx, 'refund issued');

        $this->assertNotNull($reversal);
        $this->assertSame("rev_{$tx->id}", $reversal->idempotency_key,
            'Reversal idempotency_key must follow the documented rev_{id} format.');
    }

    public function test_successful_reversal_flips_original_transaction_is_reversed_flag(): void
    {
        // After a successful reverse, calling reverseTransaction on the
        // SAME original a second time must hit the is_reversed guard
        // (test #1). This proves the flag-flip happens inside the
        // DB::transaction body, not just in the in-memory model state.
        [, $tx] = $this->seedEarnedTransaction(500);

        $this->service->reverseTransaction($tx, 'first reverse');

        $tx->refresh();
        $this->assertTrue((bool) $tx->is_reversed,
            'Original transaction must be marked is_reversed=true after a successful reversal.');
    }

    public function test_successful_reversal_decrements_member_current_points(): void
    {
        // Member started with 500 points (the earn that's being
        // reversed). After reversal, current_points must drop by 500
        // — leaving the member at 0. This proves the append-only
        // ledger + balance math agrees.
        [$member, $tx] = $this->seedEarnedTransaction(500);
        $this->assertSame(500, (int) $member->current_points,
            'Sanity: member begins with the seeded points.');

        $this->service->reverseTransaction($tx, 'refund issued');

        $member->refresh();
        $this->assertSame(0, (int) $member->current_points,
            'Member current_points must drop by the original points after reversal.');
    }

    public function test_reversal_back_pointer_audit_trail_intact(): void
    {
        // reversal_of_id is the audit-trail back-pointer that ties the
        // reversal row to its originating transaction. Without it the
        // ledger becomes ambiguous — staff querying "why was this
        // member's balance dropped?" would have to guess.
        [, $tx] = $this->seedEarnedTransaction(500);

        $reversal = $this->service->reverseTransaction($tx, 'refund issued');

        $this->assertSame($tx->id, (int) $reversal->reversal_of_id,
            'Reversal must store the original transaction id in reversal_of_id.');
        $this->assertSame('reverse', $reversal->type,
            'Reversal rows must use the canonical type=reverse classification.');
        $this->assertSame(-500, (int) $reversal->points,
            'Reversal points must be the negative of the original points.');
    }

    public function test_double_reverse_through_the_public_api_is_blocked(): void
    {
        // End-to-end idempotency assertion combining #1 and #3 — proves
        // that even a concurrent BookingRefundService::reverseLoyaltyPoints
        // call that walks the ledger TWICE would only credit the reversal
        // once. This is the load-bearing invariant for the documented
        // "rev_{id}" idempotency that BookingRefundService relies on.
        [, $tx] = $this->seedEarnedTransaction(500);

        $this->service->reverseTransaction($tx, 'first reverse');

        $tx->refresh();
        $this->assertTrue((bool) $tx->is_reversed);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Transaction already reversed');

        $this->service->reverseTransaction($tx, 'second reverse (must throw)');
    }

    /**
     * Reversing an earn must take the points out of the expiry bucket too.
     *
     * Before this, reverseTransaction unwound the three counters and left
     * the bucket alone, so a reversed +500 award left a bucket still
     * claiming 500 points the member no longer had. The hourly expiry
     * sweep then debited that orphan and drove the balance to -500 —
     * reached through an ordinary booking refund, since
     * BookingRefundService reverses points for every refunded booking.
     */
    public function test_reversing_an_earn_releases_its_expiry_bucket(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints(0)->create();

        $tx = $this->service->awardPoints($member->refresh(), 500, 'earn under test');

        $this->assertSame(
            500,
            (int) PointExpiryBucket::where('member_id', $member->id)->sum('remaining_points'),
            'award should have opened a 500-point bucket'
        );

        $this->service->reverseTransaction($tx, 'refund');

        $this->assertSame(0, (int) $member->fresh()->current_points);
        $this->assertSame(
            0,
            (int) PointExpiryBucket::where('member_id', $member->id)
                ->where('is_expired', false)->sum('remaining_points'),
            'the bucket must not outlive the points it represented'
        );
    }

    /**
     * Reversing a redeem gives the points back, so they need somewhere to
     * live — otherwise the balance says 300 and the buckets say nothing,
     * and the next redemption walks an empty bucket list.
     */
    public function test_reversing_a_redeem_restores_a_spendable_bucket(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints(0)->create();

        $this->service->awardPoints($member->refresh(), 1000, 'seed');
        $debit = $this->service->redeemPoints($member->refresh(), 300, 'spend');

        $this->assertSame(700, (int) $member->fresh()->current_points);

        $this->service->reverseTransaction($debit, 'cancelled');

        $member = $member->fresh();
        $this->assertSame(1000, (int) $member->current_points);
        $this->assertSame(
            1000,
            (int) PointExpiryBucket::where('member_id', $member->id)
                ->where('is_expired', false)->sum('remaining_points'),
            'restored points must be backed by spendable buckets'
        );
    }

    /**
     * A refund is not new earnings.
     *
     * Cancelling a redemption used to credit the points back with
     * awardPoints(), which increments lifetime_points — a counter
     * redeemPoints() never decremented. Every cancel therefore pushed the
     * member permanently above their true earnings and could trigger a
     * tier upgrade nobody earned. Reversing the original debit is the
     * correct undo.
     */
    public function test_reversing_a_redeem_does_not_inflate_lifetime_points(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints(0)->create();

        $this->service->awardPoints($member->refresh(), 1000, 'seed');
        $lifetimeAfterEarning = (int) $member->fresh()->lifetime_points;

        $debit = $this->service->redeemPoints($member->refresh(), 300, 'spend');
        $this->service->reverseTransaction($debit, 'cancelled');

        $this->assertSame(
            $lifetimeAfterEarning,
            (int) $member->fresh()->lifetime_points,
            'refunding a redemption must not count as earning the points again'
        );
    }

    /**
     * The expiry sweep may never debit more than the member holds.
     *
     * remaining_points is a claim about the balance, not the balance
     * itself. Any drift between them used to land as a negative balance,
     * shown to the customer as "-350 points", on a signed column with no
     * CHECK constraint to stop it.
     */
    public function test_expiry_sweep_never_drives_the_balance_negative(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints(0)->create();

        $this->service->awardPoints($member->refresh(), 500, 'seed');

        // Force the drift this guard exists for: a bucket claiming more
        // than the member actually holds, now past its expiry date.
        DB::table('loyalty_members')->where('id', $member->id)->update(['current_points' => 100]);
        DB::table('point_expiry_buckets')->where('member_id', $member->id)
            ->update(['expires_at' => now()->subDay()->toDateString()]);

        $this->service->expirePoints($org);

        $this->assertSame(
            0,
            (int) $member->fresh()->current_points,
            'the sweep must clamp at zero, not subtract the full bucket'
        );
        $this->assertSame(
            0,
            (int) PointExpiryBucket::where('member_id', $member->id)
                ->where('is_expired', false)->count(),
            'the expired bucket must still be retired so it stops re-reporting'
        );
    }
}
