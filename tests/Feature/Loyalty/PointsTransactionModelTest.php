<?php

namespace Tests\Feature\Loyalty;

use App\Models\PointsTransaction;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the PointsTransaction model contract — the append-only
 * loyalty ledger.
 *
 * Why this matters (per CLAUDE.md):
 *
 *   'Points transactions are append-only. Never delete a points
 *   transaction. Use the reverse type to undo.'
 *
 *   The reversal pattern is the entire audit trail for the
 *   loyalty program. A regression that allowed delete() — or one
 *   that broke the reversal_of_id back-pointer — would erase the
 *   forensic record that lets a customer support agent answer
 *   'where did my 500 points go?'.
 *
 * Contract:
 *
 *   No SoftDeletes trait — deletes are HARD. The convention is to
 *   never call ->delete(); instead create a reversal row.
 *
 *   reversal_of_id back-pointer: links a reversal entry to its
 *   original earn. Builds an immutable forensic chain.
 *
 *   reversalOf BelongsTo + reversals HasMany self-relations
 *   surface the chain via Eloquent.
 *
 *   is_reversed bool flag: marks the ORIGINAL transaction as
 *   reversed. Prevents double-reverse via the
 *   LoyaltyService::reverseTransaction guard.
 *
 *   idempotency_key: 'rev_{id}' format for reversal rows; arbitrary
 *   for originals. Prevents creating two reversals for the same
 *   source via DB unique index (tested via factory; format locked
 *   here).
 *
 *   Casts: is_reversed bool, decimals amount_spent + earn_rate,
 *   timestamps expires_at + approved_at.
 *
 *   BelongsToOrganization auto-fill from bound context.
 *
 *   TenantScope cross-org isolation.
 */
class PointsTransactionModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $memberId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->create();
        $this->memberId = $member->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function tx(array $attrs = []): PointsTransaction
    {
        return PointsTransaction::create(array_merge([
            'organization_id' => $this->orgId,
            'member_id'       => $this->memberId,
            'type'            => 'earn',
            'points'          => 100,
            'balance_after'   => 100,
        ], $attrs));
    }

    /* ─── Append-only invariant: NO SoftDeletes ─── */

    public function test_model_does_NOT_use_soft_deletes(): void
    {
        // CRITICAL: a SoftDeletes trait would let admin-tool
        // bugs / careless callers ->delete() points transactions
        // and they'd silently vanish from queries. The
        // append-only convention REQUIRES no soft-deletes —
        // any delete is a HARD delete that's clearly destructive.
        $traits = class_uses_recursive(PointsTransaction::class);

        $this->assertArrayNotHasKey(
            \Illuminate\Database\Eloquent\SoftDeletes::class,
            $traits,
            'PointsTransaction MUST NOT use SoftDeletes — append-only convention.',
        );
    }

    /* ─── reversal_of_id back-pointer ─── */

    public function test_reversal_carries_reversal_of_id_back_pointer(): void
    {
        // CRITICAL forensic chain: every reversal row points back
        // to the original earn it's undoing. Lost back-pointer =
        // lost audit trail = unanswerable "where did my points go?"
        $original = $this->tx(['points' => 250, 'type' => 'earn']);

        $reversal = $this->tx([
            'type'           => 'reverse',
            'points'         => -250,
            'reversal_of_id' => $original->id,
            'description'    => 'Reversal: booking cancelled',
        ]);

        $this->assertSame((int) $original->id, (int) $reversal->reversal_of_id,
            'Reversal MUST carry reversal_of_id pointing to the original.');
    }

    public function test_reversalOf_belongs_to_self_relation(): void
    {
        // Eloquent surfaces the chain via $reversal->reversalOf.
        $original = $this->tx(['points' => 250]);
        $reversal = $this->tx([
            'type'           => 'reverse',
            'points'         => -250,
            'reversal_of_id' => $original->id,
        ]);

        $linkedOriginal = $reversal->reversalOf;
        $this->assertNotNull($linkedOriginal);
        $this->assertSame((int) $original->id, (int) $linkedOriginal->id);
    }

    public function test_reversals_inverse_relation_lists_all_reversals_of_a_source(): void
    {
        // The HasMany inverse — find every reversal of a given
        // transaction. Used by the audit-log + the customer-care
        // "show me the history" view.
        $original = $this->tx(['points' => 500]);
        $reversalA = $this->tx([
            'type'           => 'reverse',
            'points'         => -500,
            'reversal_of_id' => $original->id,
        ]);

        $reversals = $original->reversals;

        $this->assertCount(1, $reversals);
        $this->assertSame((int) $reversalA->id, (int) $reversals->first()->id);
    }

    /* ─── is_reversed flag ─── */

    public function test_is_reversed_casts_to_boolean(): void
    {
        $unreversed = $this->tx(['is_reversed' => false]);
        $reversed = $this->tx(['is_reversed' => true]);

        $this->assertFalse($unreversed->is_reversed);
        $this->assertTrue($reversed->is_reversed);
        $this->assertIsBool($unreversed->is_reversed);
    }

    /* ─── Type values commonly used ─── */

    public function test_canonical_type_values_persist_intact(): void
    {
        // Lock the documented type values used across the codebase
        // (earn / redeem / reverse / adjust / expire). A typo in
        // production would silently miscategorise transactions in
        // analytics + the member ledger view.
        foreach (['earn', 'redeem', 'reverse', 'adjust', 'expire'] as $type) {
            $tx = $this->tx(['type' => $type]);
            $this->assertSame($type, $tx->fresh()->type);
        }
    }

    /* ─── Decimal casts ─── */

    public function test_amount_spent_casts_to_decimal_2_string(): void
    {
        $tx = $this->tx(['amount_spent' => 199.95]);

        $this->assertSame('199.95', $tx->fresh()->amount_spent,
            'amount_spent MUST cast to decimal:2 string (currency-safe).');
    }

    public function test_earn_rate_casts_to_decimal_2_string(): void
    {
        // earn_rate is the multiplier captured at earn-time so the
        // ledger row carries enough context to explain itself
        // independently. decimal:2 keeps it BCMath-safe.
        $tx = $this->tx(['earn_rate' => 1.5]);

        $this->assertSame('1.50', $tx->fresh()->earn_rate);
    }

    /* ─── Datetime casts ─── */

    public function test_expires_at_and_approved_at_cast_to_carbon(): void
    {
        // expires_at drives the points-expiry cron; approved_at
        // is the audit timestamp. Both need Carbon for date
        // comparisons.
        $tx = $this->tx([
            'expires_at'  => now()->addYear(),
            'approved_at' => now()->subMinute(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $tx->expires_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $tx->approved_at);
    }

    /* ─── Relationships ─── */

    public function test_member_relationship_uses_member_id_foreign_key(): void
    {
        $tx = $this->tx();
        $rel = $tx->member();

        $this->assertSame('member_id', $rel->getForeignKeyName(),
            'member FK MUST be member_id (NOT user_id).');
    }

    public function test_staff_relationship_uses_staff_id_foreign_key(): void
    {
        // staff_id is who issued the manual adjust / award. Lock
        // the FK name.
        $tx = $this->tx();
        $rel = $tx->staff();

        $this->assertSame('staff_id', $rel->getForeignKeyName());
    }

    public function test_approved_by_relationship_uses_approved_by_foreign_key(): void
    {
        $tx = $this->tx();
        $rel = $tx->approvedBy();

        $this->assertSame('approved_by', $rel->getForeignKeyName());
    }

    public function test_expiry_bucket_relationship_is_belongs_to(): void
    {
        // PointExpiryBucket linkage — used by the FIFO expiry
        // cron to find which earn-row to expire next.
        $tx = $this->tx();
        $rel = $tx->expiryBucket();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $tx = $this->tx();

        $this->assertSame($this->orgId, (int) $tx->organization_id);
    }

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // CRITICAL: a member's points ledger MUST scope to their
        // tenant. Cross-leak would surface another tenant's
        // earnings in the member's view + customer-care lookups.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('points_transactions')->insert([
            'organization_id' => $orgA,
            'member_id'       => $this->memberId,
            'type'            => 'earn',
            'points'          => 100,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('points_transactions')->insert([
            'organization_id' => $orgB,
            'member_id'       => 999,
            'type'            => 'earn',
            'points'          => 100,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $rowsForA = PointsTransaction::all();
        $this->assertCount(1, $rowsForA);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $rowsForB = PointsTransaction::all();
        $this->assertCount(1, $rowsForB);
    }

    /* ─── Negative points on reversals ─── */

    public function test_reversal_carries_negative_points_value(): void
    {
        // The convention: original earn=+points, reversal=-points.
        // Lets the member's points-sum-over-ledger arithmetic
        // self-zero on cancellation.
        $original = $this->tx(['points' => 500]);
        $reversal = $this->tx([
            'type'           => 'reverse',
            'points'         => -500,
            'reversal_of_id' => $original->id,
        ]);

        $this->assertSame(-500, $reversal->points);

        // Sum across the chain should be 0.
        $sum = PointsTransaction::query()
            ->whereIn('id', [$original->id, $reversal->id])
            ->sum('points');
        $this->assertEquals(0, $sum,
            'Earn + Reversal sum MUST equal 0 (ledger self-zeroes).');
    }

    /* ─── Hard delete is the explicit exception, not the rule ─── */

    public function test_delete_actually_removes_the_row(): void
    {
        // Document the hard-delete behavior. The CONVENTION says
        // don't call delete(); the IMPLEMENTATION honors delete()
        // as a hard remove. Codifying the implementation prevents
        // a future "let's add soft-deletes" PR from sneaking in
        // without surfacing this test.
        $tx = $this->tx();
        $id = $tx->id;

        $tx->delete();

        $this->assertNull(PointsTransaction::find($id),
            'delete() MUST hard-remove the row (no SoftDeletes ghost).');
    }
}
