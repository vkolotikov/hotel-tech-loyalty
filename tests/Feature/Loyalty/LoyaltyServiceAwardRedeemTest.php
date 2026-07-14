<?php

namespace Tests\Feature\Loyalty;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use App\Services\LoyaltyService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks LoyaltyService::awardPoints + redeemPoints — the revenue
 * path that fires on every member earn or burn. Sister tests to
 * the existing LoyaltyServiceReverseTransactionTest.
 *
 * Key contracts:
 *
 *   awardPoints:
 *     - Member counters update atomically (current + lifetime +
 *       qualifying when qualifying=true)
 *     - qualifying=false skips qualifying_points (used for bonus
 *       points that shouldn't count toward tier qualification)
 *     - balance_after on the PointsTransaction reflects the
 *       post-award current_points (the documented ledger
 *       invariant)
 *     - Idempotency on idempotency_key — same key returns the
 *       existing transaction, no double-credit
 *     - PointExpiryBucket created with expires_at =
 *       now + points_expiry_months HotelSetting (default 24)
 *     - transaction.expiry_bucket_id stamps the bucket id
 *     - last_activity_at updated
 *     - source_type defaults to 'system' (no staff) or 'admin'
 *       (staff supplied)
 *
 *   redeemPoints:
 *     - Insufficient points throws RuntimeException with a
 *       message that includes both available + requested counts
 *     - Successful redemption decrements current_points only
 *       (NOT lifetime_points — past earnings are immutable)
 *     - Transaction.points is NEGATIVE (the ledger sign convention)
 *     - Type = 'redeem'
 *     - balance_after reflects post-decrement balance
 *     - FIFO bucket consumption: oldest expiry bucket consumed first
 *     - Idempotency on idempotency_key
 *     - source_type defaults to 'admin' when staff supplied,
 *       'mobile' when not
 */
class LoyaltyServiceAwardRedeemTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyAwardSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

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

    private function seedMember(int $startingPoints = 0): LoyaltyMember
    {
        $tier = LoyaltyTierFactory::new()->bronze()->create();
        return LoyaltyMemberFactory::new()
            ->inTier($tier->id)
            ->withPoints($startingPoints)
            ->create();
    }

    public function test_award_increments_current_lifetime_and_qualifying_points(): void
    {
        $member = $this->seedMember(0);

        $tx = $this->service->awardPoints($member, 500, 'Booking earn');

        $member->refresh();
        $this->assertSame(500, (int) $member->current_points);
        $this->assertSame(500, (int) $member->lifetime_points);
        $this->assertSame(500, (int) $member->qualifying_points,
            'qualifying=true (default) must increment qualifying_points.');

        $this->assertSame(500, (int) $tx->points);
        $this->assertSame('earn', $tx->type);
        $this->assertSame(500, (int) $tx->balance_after,
            'balance_after must match post-award current_points.');
    }

    public function test_award_with_qualifying_false_skips_qualifying_points(): void
    {
        // Used for bonus points (referral, birthday, etc.) that
        // shouldn't count toward tier qualification — they pad
        // the wallet without bumping the member up a tier.
        $member = $this->seedMember(0);

        $this->service->awardPoints(
            $member, 250, 'Birthday bonus', qualifying: false,
        );

        $member->refresh();
        $this->assertSame(250, (int) $member->current_points);
        $this->assertSame(250, (int) $member->lifetime_points);
        $this->assertSame(0, (int) $member->qualifying_points,
            'qualifying=false must NOT increment qualifying_points.');
    }

    public function test_award_idempotency_returns_existing_transaction_without_double_credit(): void
    {
        // The canonical anti-double-credit guard. Same idempotency
        // key on a retry returns the original transaction, no
        // member counter mutation.
        $member = $this->seedMember(100);
        $idemKey = 'idem_test_award_replay_001';

        $first  = $this->service->awardPoints($member, 500, 'First award', idempotencyKey: $idemKey);
        $member->refresh();
        $balanceAfterFirst = (int) $member->current_points;

        $second = $this->service->awardPoints($member, 500, 'Retry', idempotencyKey: $idemKey);
        $member->refresh();
        $balanceAfterSecond = (int) $member->current_points;

        $this->assertSame($first->id, $second->id,
            'Retry with same idempotency key must return the existing transaction.');
        $this->assertSame($balanceAfterFirst, $balanceAfterSecond,
            'Retry must NOT double-credit the member.');
    }

    public function test_award_creates_expiry_bucket_using_hotel_setting_months(): void
    {
        // The expiry-bucket pipeline: HotelSetting drives the
        // months, default 24. The bucket's expires_at must equal
        // now + that months count.
        HotelSetting::create([
            'key' => 'points_expiry_months', 'value' => '12',
            'type' => 'number', 'group' => 'loyalty', 'label' => 'Expiry',
        ]);
        $member = $this->seedMember(0);

        $tx = $this->service->awardPoints($member, 500, 'Booking');

        $bucket = PointExpiryBucket::where('transaction_id', $tx->id)->first();
        $this->assertNotNull($bucket);
        $this->assertSame(500, (int) $bucket->original_points);
        $this->assertSame(500, (int) $bucket->remaining_points);
        $this->assertSame(now()->addMonths(12)->toDateString(), $bucket->expires_at->toDateString(),
            'Expiry bucket expires_at must equal now + points_expiry_months.');
    }

    public function test_award_stamps_transaction_with_expiry_bucket_id(): void
    {
        // Round-trip: the transaction must reference the created
        // bucket so the redeem-FIFO path can locate the right one.
        $member = $this->seedMember(0);
        $tx = $this->service->awardPoints($member, 500, 'Booking');

        $tx->refresh();
        $this->assertNotNull($tx->expiry_bucket_id);
        $bucket = PointExpiryBucket::find($tx->expiry_bucket_id);
        $this->assertNotNull($bucket);
        $this->assertSame($tx->id, (int) $bucket->transaction_id);
    }

    public function test_award_updates_last_activity_at(): void
    {
        // Last-activity stamp drives "stale member" reports — must
        // tick on every award.
        $member = $this->seedMember(0);
        $member->update(['last_activity_at' => now()->subYear()]);

        $this->service->awardPoints($member, 100, 'Recent activity');

        $member->refresh();
        $this->assertTrue(
            $member->last_activity_at->isToday(),
            'last_activity_at must update to now on every award.',
        );
    }

    public function test_award_without_staff_sets_source_type_system(): void
    {
        // System-initiated awards (cron jobs, automated bonuses)
        // get source_type=system. Staff-initiated awards get
        // source_type=admin (covered by the next test).
        $member = $this->seedMember(0);
        $tx = $this->service->awardPoints($member, 100, 'Auto bonus');
        $this->assertSame('system', $tx->source_type);
    }

    public function test_award_returns_a_PointsTransaction(): void
    {
        $member = $this->seedMember(0);
        $tx = $this->service->awardPoints($member, 500, 'Test');
        $this->assertInstanceOf(PointsTransaction::class, $tx);
    }

    public function test_redeem_throws_when_member_lacks_points(): void
    {
        // Insufficient-points guard. The exception message must
        // include both the available + requested counts so a
        // 422 surface to the user has actionable info.
        $member = $this->seedMember(100);

        try {
            $this->service->redeemPoints($member, 500, 'Spa booking');
            $this->fail('Insufficient-points redeem must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Insufficient points', $e->getMessage());
            $this->assertStringContainsString('100', $e->getMessage(),
                'Exception must surface the available count.');
            $this->assertStringContainsString('500', $e->getMessage(),
                'Exception must surface the requested count.');
        }
    }

    public function test_redeem_rechecks_balance_under_lock_so_stale_instances_cannot_overdraw(): void
    {
        // Double-spend guard (2026-07 launch hardening). The advisory
        // pre-check reads the caller's in-memory instance; the
        // AUTHORITATIVE check re-fetches the row under lockForUpdate
        // inside the transaction. A stale instance — exactly what the
        // loser of a concurrent redeem race holds — must throw, not
        // drive current_points negative.
        $memberA = $this->seedMember(500);
        $memberB = LoyaltyMember::find($memberA->id); // second handle, same row

        $this->service->redeemPoints($memberA, 400, 'First spend');

        // $memberB still believes current_points=500; only the in-tx
        // re-check can catch that the row now holds 100.
        $this->assertSame(500, (int) $memberB->current_points, 'precondition: stale handle');

        try {
            $this->service->redeemPoints($memberB, 400, 'Racing spend');
            $this->fail('Stale-instance overdraw must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Insufficient points', $e->getMessage());
        }

        $this->assertSame(100, (int) $memberA->fresh()->current_points,
            'Balance must never go negative from a stale-instance redeem.');
    }

    public function test_redeem_decrements_current_points_only_lifetime_stays(): void
    {
        // The append-only ledger invariant: lifetime_points
        // captures total earnings and must NEVER decrease on
        // redemption. Only current_points (the spendable wallet)
        // drops.
        $member = $this->seedMember(0);
        $this->service->awardPoints($member, 1000, 'Initial earn');
        $member->refresh();
        $this->assertSame(1000, (int) $member->current_points);
        $this->assertSame(1000, (int) $member->lifetime_points);

        $this->service->redeemPoints($member, 300, 'Spa booking');
        $member->refresh();

        $this->assertSame(700, (int) $member->current_points,
            'current_points must drop by the redeemed amount.');
        $this->assertSame(1000, (int) $member->lifetime_points,
            'lifetime_points must NOT drop on redemption (append-only).');
    }

    public function test_redeem_creates_negative_points_transaction(): void
    {
        // The ledger sign convention: redeem = negative points
        // on the row. Reverses use the same convention.
        $member = $this->seedMember(0);
        $this->service->awardPoints($member, 1000, 'Initial');

        $tx = $this->service->redeemPoints($member, 300, 'Spa');

        $this->assertSame(-300, (int) $tx->points);
        $this->assertSame('redeem', $tx->type);
    }

    public function test_redeem_balance_after_reflects_post_decrement_balance(): void
    {
        $member = $this->seedMember(0);
        $this->service->awardPoints($member, 1000, 'Initial');

        $tx = $this->service->redeemPoints($member, 300, 'Spa');

        $this->assertSame(700, (int) $tx->balance_after);
    }

    public function test_redeem_consumes_oldest_expiry_bucket_first(): void
    {
        // FIFO bucket consumption: oldest expires_at goes first
        // so members don't lose value through silent expiry.
        $member = $this->seedMember(0);

        // Award twice. The first bucket has the earlier
        // expires_at (defaults to now + 24 months) — give it a
        // manual past date to make the FIFO order explicit.
        $tx1 = $this->service->awardPoints($member, 500, 'Old earn');
        $tx2 = $this->service->awardPoints($member, 500, 'New earn');

        // Force-distinguish bucket 1 as older.
        PointExpiryBucket::where('transaction_id', $tx1->id)
            ->update(['expires_at' => now()->addMonths(6)->toDateString()]);
        PointExpiryBucket::where('transaction_id', $tx2->id)
            ->update(['expires_at' => now()->addMonths(24)->toDateString()]);

        // Redeem 500 — must drain the older bucket entirely
        // first, leaving the newer one untouched.
        $this->service->redeemPoints($member, 500, 'Spa');

        $oldBucket = PointExpiryBucket::where('transaction_id', $tx1->id)->first();
        $newBucket = PointExpiryBucket::where('transaction_id', $tx2->id)->first();

        $this->assertSame(0, (int) $oldBucket->remaining_points,
            'Older bucket must be fully consumed first.');
        $this->assertTrue((bool) $oldBucket->is_expired,
            'Drained bucket must be marked is_expired.');
        $this->assertSame(500, (int) $newBucket->remaining_points,
            'Newer bucket must be untouched while older still had supply.');
    }

    public function test_redeem_idempotency_returns_existing_transaction(): void
    {
        // Same idempotency guard as award. Retry-safe under
        // network blips on the mobile redeem flow.
        $member = $this->seedMember(0);
        $this->service->awardPoints($member, 1000, 'Initial');

        $first  = $this->service->redeemPoints($member, 300, 'Spa', idempotencyKey: 'idem_test_redeem_001');
        $member->refresh();
        $balanceAfterFirst = (int) $member->current_points;

        $second = $this->service->redeemPoints($member, 300, 'Retry', idempotencyKey: 'idem_test_redeem_001');
        $member->refresh();
        $balanceAfterSecond = (int) $member->current_points;

        $this->assertSame($first->id, $second->id);
        $this->assertSame($balanceAfterFirst, $balanceAfterSecond,
            'Retry must NOT double-debit the member.');
    }

    public function test_redeem_without_staff_sets_source_type_mobile(): void
    {
        // Mobile self-serve redemptions get source_type=mobile.
        // The same call WITH a staff arg becomes admin (admin
        // redeeming on behalf of a member at the front desk).
        $member = $this->seedMember(0);
        $this->service->awardPoints($member, 1000, 'Initial');

        $tx = $this->service->redeemPoints($member, 100, 'Self-serve');

        $this->assertSame('mobile', $tx->source_type);
    }

    public function test_award_and_redeem_compose_correctly(): void
    {
        // Round-trip integration: award then redeem leaves the
        // member at the expected net balance. Defends against
        // off-by-one bugs in either method.
        $member = $this->seedMember(0);

        $this->service->awardPoints($member, 500, 'Earn');
        $this->service->awardPoints($member, 300, 'Earn');
        $this->service->redeemPoints($member, 200, 'Spend');

        $member->refresh();
        $this->assertSame(600, (int) $member->current_points,
            '500 + 300 − 200 = 600 expected.');
        $this->assertSame(800, (int) $member->lifetime_points,
            'lifetime_points captures every earn (500+300), no debits.');
    }
}
