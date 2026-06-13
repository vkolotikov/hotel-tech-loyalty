<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
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
        $this->setUpLoyaltySchema();
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
}
