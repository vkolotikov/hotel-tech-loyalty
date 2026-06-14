<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Services\MemberMergeService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks MemberMergeService::merge — the loyalty-side duplicate
 * cleanup that consolidates two loyalty_members records. Sister
 * to GuestMergeService (which is already covered).
 *
 * The two services are NOT interchangeable:
 *   - GuestMerge walks CRM-side FKs (inquiries, reservations,
 *     guest_activities, etc.) and assumes the points ledger has
 *     already been reconciled.
 *   - MemberMerge walks loyalty-side FKs (points_transactions,
 *     nfc_cards, benefit_entitlements, point_expiry_buckets,
 *     tier_assessments) AND aggregates the points counters into
 *     the winner. The points ledger reconciliation FLOWS THROUGH
 *     THIS service — GuestMerge's "merge members first" guardrail
 *     points right here.
 *
 * Coverage:
 *
 *   Pre-merge guards:
 *     - Same member into itself → InvalidArgumentException
 *     - Cross-org merge → InvalidArgumentException (multi-tenant
 *       safety)
 *
 *   Plain-table FK re-pointing:
 *     - points_transactions re-points loser→winner (canonical
 *       example — the ledger)
 *
 *   Point counter aggregation (the ledger-cache invariant):
 *     - lifetime_points sum
 *     - current_points sum
 *     - qualifying_points + qualifying_nights + qualifying_stays +
 *       qualifying_spend all sum
 *
 *   Adoption rules:
 *     - nfc_uid + nfc_card_issued_at adopted when winner has none
 *     - referral_code adopted when winner has none
 *     - last_activity_at picks the MAX (freshest activity)
 *
 *   Cross-table identity:
 *     - Self-referential referred_by repoints across loyalty_members
 *       (loser → winner)
 *     - guests.member_id repoints loser→winner
 *
 *   Audit + deletion:
 *     - member_merges row created with loser snapshot
 *     - Loser hard-deleted at the end
 */
class MemberMergeServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private MemberMergeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMemberMergeSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new MemberMergeService();
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

    private function makeMember(int $points = 0): LoyaltyMember
    {
        $tier = LoyaltyTierFactory::new()->bronze()->create();
        return LoyaltyMemberFactory::new()
            ->inTier($tier->id)
            ->withPoints($points)
            ->create();
    }

    public function test_merge_member_into_itself_throws(): void
    {
        $m = $this->makeMember();

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Cannot merge a member into itself/');

        $this->service->merge($m, $m);
    }

    public function test_cross_org_merge_throws(): void
    {
        // Multi-tenant safety. Same as GuestMerge — but here the
        // collision would also corrupt the points ledger across
        // tenants, which would be very hard to unwind.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        $memberA = $this->makeMember();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        $memberB = $this->makeMember();

        $this->assertNotSame($memberA->organization_id, $memberB->organization_id);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/different organizations/');

        $this->service->merge($memberA, $memberB);
    }

    public function test_points_transactions_repoint_from_loser_to_winner(): void
    {
        // The canonical FK re-point — the ledger itself. Pre-merge:
        // two transactions on the loser. Post-merge: both rows
        // reference the winner.
        $winner = $this->makeMember();
        $loser  = $this->makeMember();

        DB::table('points_transactions')->insert([
            ['organization_id' => app('current_organization_id'), 'member_id' => $loser->id,
             'type' => 'earn', 'points' => 100, 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => app('current_organization_id'), 'member_id' => $loser->id,
             'type' => 'earn', 'points' => 250, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $result = $this->service->merge($winner, $loser);

        $winnerTxCount = DB::table('points_transactions')->where('member_id', $winner->id)->count();
        $loserTxCount  = DB::table('points_transactions')->where('member_id', $loser->id)->count();

        $this->assertSame(2, $winnerTxCount,
            'Loser transactions must re-point to winner.');
        $this->assertSame(0, $loserTxCount);
        $this->assertSame(2, $result['moved']['points_transactions']);
    }

    public function test_aggregate_point_counters_sum_into_winner(): void
    {
        // The ledger-cache invariant: lifetime_points + current_points
        // + qualifying_points/nights/stays/spend all sum. Without this,
        // a member's wallet would silently lose value at merge time.
        $winner = $this->makeMember();
        $winner->update([
            'lifetime_points'   => 1000,
            'current_points'    => 600,
            'qualifying_points' => 800,
            'qualifying_nights' => 5,
            'qualifying_stays'  => 2,
            'qualifying_spend'  => 1500.00,
        ]);
        $loser = $this->makeMember();
        $loser->update([
            'lifetime_points'   => 500,
            'current_points'    => 200,
            'qualifying_points' => 400,
            'qualifying_nights' => 3,
            'qualifying_stays'  => 1,
            'qualifying_spend'  => 800.00,
        ]);

        $this->service->merge($winner->fresh(), $loser->fresh());
        $winner->refresh();

        $this->assertSame(1500, (int) $winner->lifetime_points);
        $this->assertSame(800,  (int) $winner->current_points);
        $this->assertSame(1200, (int) $winner->qualifying_points);
        $this->assertSame(8,    (int) $winner->qualifying_nights);
        $this->assertSame(3,    (int) $winner->qualifying_stays);
        $this->assertSame(2300.00, (float) $winner->qualifying_spend);
    }

    public function test_nfc_uid_adopted_when_winner_has_none(): void
    {
        // NFC card adoption: if only the loser had a card, the winner
        // adopts it so the physical card keeps working.
        $winner = $this->makeMember();
        $winner->update(['nfc_uid' => null]);
        $loser = $this->makeMember();
        $loser->update([
            'nfc_uid' => '04:5a:b2:cd:ef',
            'nfc_card_issued_at' => now()->subMonths(6),
        ]);

        $this->service->merge($winner->fresh(), $loser->fresh());
        $winner->refresh();

        $this->assertSame('04:5a:b2:cd:ef', $winner->nfc_uid);
        $this->assertNotNull($winner->nfc_card_issued_at,
            'nfc_card_issued_at must also be adopted alongside the uid.');
    }

    public function test_winner_keeps_own_nfc_uid_when_loser_has_one_too(): void
    {
        // Symmetric guard: when winner already has NFC, the loser's
        // card data does NOT clobber it.
        $winner = $this->makeMember();
        $winner->update(['nfc_uid' => '04:winner:winner']);
        $loser = $this->makeMember();
        $loser->update(['nfc_uid' => '04:loser:loser']);

        $this->service->merge($winner->fresh(), $loser->fresh());
        $winner->refresh();

        $this->assertSame('04:winner:winner', $winner->nfc_uid,
            'Winner NFC uid must NOT be clobbered.');
    }

    public function test_referral_code_adopted_when_winner_has_none(): void
    {
        // The referral_code adoption — same fill-blank pattern as
        // nfc_uid. A code the loser owns survives the merge.
        $winner = $this->makeMember();
        $winner->update(['referral_code' => null]);
        $loser = $this->makeMember();
        $loser->update(['referral_code' => 'LOSER123']);

        $this->service->merge($winner->fresh(), $loser->fresh());
        $winner->refresh();

        $this->assertSame('LOSER123', $winner->referral_code);
    }

    public function test_last_activity_at_picks_the_more_recent_value(): void
    {
        // Freshest activity wins so engagement reports reflect the
        // most recent contact across the merged identity.
        $winner = $this->makeMember();
        $winner->update(['last_activity_at' => now()->subYear()]);
        $loserActivity = now()->subDay()->startOfMinute();
        $loser = $this->makeMember();
        $loser->update(['last_activity_at' => $loserActivity]);

        $this->service->merge($winner->fresh(), $loser->fresh());
        $winner->refresh();

        $this->assertSame(
            $loserActivity->format('Y-m-d H:i:s'),
            $winner->last_activity_at->format('Y-m-d H:i:s'),
        );
    }

    public function test_referred_by_repoints_when_loser_was_a_referrer(): void
    {
        // Self-referential cleanup: anyone the loser referred is
        // now referred by the winner. Without this, the merge would
        // orphan the referral chain.
        $winner = $this->makeMember();
        $loser  = $this->makeMember();

        // A third member who was referred BY the loser.
        $referredMember = $this->makeMember();
        $referredMember->update(['referred_by' => $loser->id]);

        $this->service->merge($winner, $loser);
        $referredMember->refresh();

        $this->assertSame($winner->id, (int) $referredMember->referred_by,
            'Members referred by the loser must now point at the winner.');
    }

    public function test_guests_with_loser_member_id_repoint_to_winner(): void
    {
        // Cross-table identity: a Guest CRM record linking to the
        // loser member must point at the winner post-merge. The
        // GuestMerge "merge members first" gate exists exactly so
        // this path runs cleanly.
        $winner = $this->makeMember();
        $loser  = $this->makeMember();

        DB::table('guests')->insert([
            ['organization_id' => app('current_organization_id'),
             'member_id' => $loser->id, 'email' => 'a@b.test',
             'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => app('current_organization_id'),
             'member_id' => $loser->id, 'email' => 'c@d.test',
             'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->merge($winner, $loser);

        $winnerGuests = DB::table('guests')->where('member_id', $winner->id)->count();
        $loserGuests  = DB::table('guests')->where('member_id', $loser->id)->count();
        $this->assertSame(2, $winnerGuests,
            'Guests linked to loser must re-point to winner.');
        $this->assertSame(0, $loserGuests);
    }

    public function test_member_merges_audit_row_carries_loser_snapshot(): void
    {
        // The forensic trail. A complaint two months later about a
        // merged member reads this audit row to reconstruct the
        // pre-merge state.
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $loserId = $loser->id;
        $loserPoints = (int) $loser->current_points;

        $this->service->merge($winner, $loser, performedByUserId: null, reason: 'phone collision');

        $audit = DB::table('member_merges')->where('merged_member_id', $loserId)->first();
        $this->assertNotNull($audit);
        $this->assertSame($winner->id, (int) $audit->surviving_member_id);
        $this->assertSame('phone collision', $audit->reason);

        $snapshot = json_decode($audit->merged_data, true);
        $this->assertIsArray($snapshot);
        $this->assertSame($loserId, (int) $snapshot['id']);
        $this->assertSame($loserPoints, (int) $snapshot['current_points']);
    }

    public function test_loser_member_is_hard_deleted_at_the_end(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $loserId = $loser->id;

        $this->service->merge($winner, $loser);

        $this->assertNull(LoyaltyMember::find($loserId),
            'Loser member must be hard-deleted after merge.');
        $this->assertNotNull(LoyaltyMember::find($winner->id),
            'Winner must survive.');
    }

    public function test_returns_summary_with_winner_loser_and_moved_counts(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();

        DB::table('points_transactions')->insert([
            'organization_id' => app('current_organization_id'),
            'member_id'       => $loser->id,
            'type'            => 'earn',
            'points'          => 100,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $result = $this->service->merge($winner, $loser);

        $this->assertSame($winner->id, $result['winner_id']);
        $this->assertSame($loser->id, $result['loser_id']);
        $this->assertArrayHasKey('moved', $result);
        $this->assertIsArray($result['moved']);
    }
}
