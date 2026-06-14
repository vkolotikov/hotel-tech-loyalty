<?php

namespace Tests\Feature\Loyalty;

use App\Models\PointExpiryBucket;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks PointExpiryBucket::consume — the FIFO redeem primitive
 * that LoyaltyService::redeemPoints calls inside its bucket
 * consumption loop. Currently exercised indirectly via the
 * LoyaltyServiceAwardRedeemTest's FIFO test; this file locks
 * the consume() contract directly so a refactor of the loop
 * (or a new caller) can rely on the documented semantics.
 *
 * Contract (from the docblock + production behaviour):
 *
 *   1. Returns min(requested, remaining) — the actual amount
 *      consumed. Caller subtracts this from their remaining
 *      need to drive the loop.
 *
 *   2. Decrements remaining_points by the consumed amount.
 *
 *   3. Flips is_expired = true when remaining_points hits 0
 *      (or below). This is what stops the bucket from being
 *      considered by activeExpiryBuckets in future redeems.
 *
 *   4. Does NOT touch original_points (audit trail —
 *      always shows the original earn amount).
 *
 *   5. consume(0) is a no-op — no side effects.
 */
class PointExpiryBucketConsumeTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function bucket(int $original, int $remaining): PointExpiryBucket
    {
        return PointExpiryBucket::create([
            'member_id'        => 1, // arbitrary; not gated by tenant scope
            'original_points'  => $original,
            'remaining_points' => $remaining,
            'earned_at'        => now()->toDateString(),
            'expires_at'       => now()->addMonths(24)->toDateString(),
        ]);
    }

    public function test_consume_returns_actual_amount_consumed_when_bucket_has_enough(): void
    {
        // Happy path: bucket has 500 remaining, caller wants 200 →
        // consume returns 200 (the requested amount) AND
        // remaining drops to 300.
        $bucket = $this->bucket(500, 500);

        $consumed = $bucket->consume(200);

        $this->assertSame(200, $consumed);
        $bucket->refresh();
        $this->assertSame(300, (int) $bucket->remaining_points);
    }

    public function test_consume_caps_at_remaining_when_caller_requests_more(): void
    {
        // The min(remaining, requested) semantics. Bucket has 100
        // left, caller wants 500 → consume returns 100 (NOT 500),
        // and the bucket fully drains.
        $bucket = $this->bucket(500, 100);

        $consumed = $bucket->consume(500);

        $this->assertSame(100, $consumed,
            'consume must cap at remaining_points (FIFO loop driver).');
        $bucket->refresh();
        $this->assertSame(0, (int) $bucket->remaining_points);
    }

    public function test_consuming_to_exactly_zero_marks_bucket_expired(): void
    {
        // The auto-expiry contract: remaining_points reaches 0
        // → is_expired flips to true. This is what removes the
        // bucket from future activeExpiryBuckets queries.
        $bucket = $this->bucket(500, 500);

        $bucket->consume(500);
        $bucket->refresh();

        $this->assertSame(0, (int) $bucket->remaining_points);
        $this->assertTrue((bool) $bucket->is_expired,
            'Bucket draining to 0 must mark is_expired=true.');
    }

    public function test_partial_consume_does_NOT_mark_bucket_expired(): void
    {
        // The boundary condition: any positive remaining keeps
        // the bucket active. is_expired stays false.
        $bucket = $this->bucket(500, 500);

        $bucket->consume(499);
        $bucket->refresh();

        $this->assertSame(1, (int) $bucket->remaining_points);
        $this->assertFalse((bool) $bucket->is_expired,
            'Bucket with remaining > 0 must stay active.');
    }

    public function test_original_points_is_never_touched_by_consume(): void
    {
        // The audit-trail invariant: original_points captures the
        // earn-time amount and MUST stay frozen. Without this,
        // historical reports that read original_points (e.g.
        // "what was the original earn before partial expiry?")
        // would lie.
        $bucket = $this->bucket(500, 500);

        $bucket->consume(300);
        $bucket->refresh();

        $this->assertSame(500, (int) $bucket->original_points,
            'original_points must NEVER change on consume — audit trail.');
        $this->assertSame(200, (int) $bucket->remaining_points);
    }

    public function test_consume_zero_is_a_noop(): void
    {
        // Defensive: consume(0) returns 0 and changes nothing.
        // The redeem loop's `if ($remaining <= 0) break;` guard
        // already prevents this in practice, but the bucket
        // method should still behave sanely.
        $bucket = $this->bucket(500, 500);

        $consumed = $bucket->consume(0);

        $this->assertSame(0, $consumed);
        $bucket->refresh();
        $this->assertSame(500, (int) $bucket->remaining_points);
        $this->assertFalse((bool) $bucket->is_expired);
    }

    public function test_consume_more_than_remaining_does_not_negative_balance(): void
    {
        // Even when over-consumed, remaining_points must NOT go
        // negative. Defends against a redeem loop that incorrectly
        // tracks its remaining-need budget.
        $bucket = $this->bucket(500, 50);

        $bucket->consume(1000);
        $bucket->refresh();

        $this->assertSame(0, (int) $bucket->remaining_points,
            'remaining_points must NEVER go negative.');
        $this->assertTrue((bool) $bucket->is_expired);
    }

    public function test_consecutive_consumes_drain_correctly(): void
    {
        // Round-trip: multiple consumes against the same bucket
        // must subtract cleanly. Mirrors what the redeem loop
        // does when a single bucket fills multiple iterations.
        $bucket = $this->bucket(1000, 1000);

        $first  = $bucket->consume(300);
        $second = $bucket->consume(400);
        $third  = $bucket->consume(500); // caps at remaining (300)
        $bucket->refresh();

        $this->assertSame(300, $first);
        $this->assertSame(400, $second);
        $this->assertSame(300, $third,
            'Third consume must cap at the remaining 300, not the requested 500.');
        $this->assertSame(0, (int) $bucket->remaining_points);
        $this->assertTrue((bool) $bucket->is_expired);
    }

    public function test_already_drained_bucket_consume_returns_zero(): void
    {
        // Edge case: an already-drained bucket (somehow re-touched)
        // consumes 0 since remaining is 0. Mirrors the
        // already-zero-remaining branch of the redeem loop's
        // `min($points, $this->remaining_points)`.
        $bucket = $this->bucket(500, 0);
        $bucket->forceFill(['is_expired' => true])->save();

        $consumed = $bucket->consume(100);

        $this->assertSame(0, $consumed);
    }
}
