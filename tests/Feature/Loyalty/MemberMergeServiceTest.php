<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Services\MemberMergeService;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\CampaignDeliveriesSchema;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\SmsSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
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
 *
 *   All history kept (owner decision R2-3, HexaTech Loyalty release 2):
 *     - every table and column in MEMBER_COLUMNS moves, one case each
 *     - a scan of the migrations fails on a member column the merge
 *       neither moves nor keeps on purpose
 *     - member_offers, referrals and campaign deliveries deduplicated
 *       (and recorded) where moving would collide; a referral between
 *       the pair dropped
 *     - the loser's QR tokens revoked, earlier merges into the loser
 *       re-pointed, the winner never its own referrer
 *     - an AuditLog row member_merged beside the snapshot
 */
class MemberMergeServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;
    use MembershipSchema;
    use CampaignDeliveriesSchema;
    use PushSchema;
    use SmsSchema;
    use VisitsSchema;
    use CreditSchema;
    use \Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
    use \Tests\Concerns\LoyaltyWorkspace\EventsSchema;

    private MemberMergeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMemberMergeSchema();
        $this->buildMembershipSchema();
        $this->buildCampaignDeliveriesSchema();
        $this->buildPushSchema();
        $this->buildSmsSchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildTierCountsSchema();
        $this->buildEventsSchema();

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
        // The venue's one Bronze tier (production's loyalty_tiers (organization_id, name) is unique).
        $tier = \App\Models\LoyaltyTier::query()->where('name', 'Bronze')->first() ?? LoyaltyTierFactory::new()->bronze()->create();
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
             'type' => 'earn', 'points' => 100, 'balance_after' => 100, 'description' => 'Earned', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => app('current_organization_id'), 'member_id' => $loser->id,
             'type' => 'earn', 'points' => 250, 'balance_after' => 350, 'description' => 'Earned', 'created_at' => now(), 'updated_at' => now()],
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
             'member_id' => $loser->id, 'full_name' => 'Guest A', 'email' => 'a@b.test',
             'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => app('current_organization_id'),
             'member_id' => $loser->id, 'full_name' => 'Guest C', 'email' => 'c@d.test',
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
            'balance_after'   => 100,
            'description'     => 'Earned',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $result = $this->service->merge($winner, $loser);

        $this->assertSame($winner->id, $result['winner_id']);
        $this->assertSame($loser->id, $result['loser_id']);
        $this->assertArrayHasKey('moved', $result);
        $this->assertIsArray($result['moved']);
    }

    // ─── All history kept (R2-3) ───────────────────────────────────────────

    /** @return array<string, array{0: string, 1: string}> one case per moved column */
    public static function memberColumns(): array
    {
        $cases = [];
        foreach (MemberMergeService::MEMBER_COLUMNS as $table => $columns) {
            foreach ($columns as $column) {
                if ($table !== 'loyalty_members') {
                    $cases["{$table}.{$column}"] = [$table, $column];
                }
            }
        }

        return $cases;
    }

    /** @dataProvider memberColumns */
    public function test_every_row_that_names_the_loser_moves_to_the_winner(string $table, string $column): void
    {
        $this->assertTrue(Schema::hasTable($table) && Schema::hasColumn($table, $column), "{$table}.{$column} is missing from the test schema");
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $other  = $this->makeMember();

        $id = $this->insertRow($table, [$column => $loser->id] + $this->otherColumns($table, $column, $other->id));

        $result = $this->service->merge($winner, $loser);

        $this->assertSame($winner->id, (int) DB::table($table)->where('id', $id)->value($column), "{$table}.{$column} must name the winner");
        $this->assertSame(0, DB::table($table)->where($column, $loser->id)->count());
        $this->assertGreaterThanOrEqual(1, $result['moved'][$table]);
    }

    public function test_every_member_column_the_migrations_define_is_moved_or_kept_on_purpose(): void
    {
        $handled = [];
        foreach (MemberMergeService::MEMBER_COLUMNS as $table => $columns) {
            foreach ($columns as $column) {
                $handled["{$table}.{$column}"] = true;
            }
        }
        foreach (array_keys(MemberMergeService::KEPT_COLUMNS) as $kept) {
            $handled[$kept] = true;
        }

        $found = [];
        foreach (glob(base_path('database/migrations/*.php')) as $file) {
            $text = file_get_contents($file);
            // The table each statement belongs to: the nearest Schema::create / Schema::table / addColumns before it.
            preg_match_all("/(?:Schema::(?:create|table)|addColumns)\\(\\s*['\"]([a-z0-9_]+)['\"]/", $text, $contexts, PREG_OFFSET_CAPTURE);
            preg_match_all("/->(?:foreignId|unsignedBigInteger|bigInteger|unsignedInteger|integer|foreignIdFor)\\(\\s*['\"]([a-z_]+)['\"]\\s*\\)([^;]*)/", $text, $defs, PREG_OFFSET_CAPTURE);
            foreach ($defs[1] as $i => [$column, $at]) {
                $rest = $defs[2][$i][0];
                $names = (bool) preg_match('/(^|_)member_id$|^referrer_id$|^referee_id$|^referred_by$/', $column);
                if (!$names && !str_contains($rest, "'loyalty_members'")) {
                    continue;
                }
                $table = null;
                foreach ($contexts[1] as [$name, $position]) {
                    if ($position < $at) {
                        $table = $name;
                    }
                }
                $found["{$table}.{$column}"] = basename($file);
            }
            $this->assertDoesNotMatchRegularExpression('/ADD\\s+COLUMN\\s+\\w*member\\w*/i', $text, basename($file) . ' adds a member column in raw SQL; teach this scan and the merge about it');
        }

        $this->assertGreaterThan(20, count($found), 'the scan found too few member columns to be reading the migrations');
        $missing = array_diff_key($found, $handled);
        $this->assertSame([], $missing, 'member columns the merge neither moves nor keeps (MemberMergeService::MEMBER_COLUMNS / KEPT_COLUMNS)');
    }

    public function test_a_shared_offer_keeps_the_row_that_went_furthest_and_records_the_other(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $this->parentRowsExist('special_offers', [7, 8, 9]); // the offers the claims name (a foreign key in production)
        DB::table('member_offers')->insert([
            ['member_id' => $winner->id, 'offer_id' => 7, 'status' => 'available', 'used_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['member_id' => $loser->id, 'offer_id' => 7, 'status' => 'used', 'used_at' => now()->subDay(), 'created_at' => now(), 'updated_at' => now()],
            ['member_id' => $winner->id, 'offer_id' => 8, 'status' => 'claimed', 'used_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['member_id' => $loser->id, 'offer_id' => 8, 'status' => 'available', 'used_at' => null, 'created_at' => now(), 'updated_at' => now()],
            ['member_id' => $loser->id, 'offer_id' => 9, 'status' => 'available', 'used_at' => null, 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('member_offers')->where('member_id', $winner->id)->where('offer_id', 8)->update(['claimed_at' => now()]);

        $this->service->merge($winner, $loser);

        $rows = DB::table('member_offers')->where('member_id', $winner->id)->orderBy('offer_id')->get();
        $this->assertSame([7, 8, 9], $rows->pluck('offer_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame(['used', 'claimed', 'available'], $rows->pluck('status')->all());
        $dropped = json_decode(DB::table('member_merges')->value('merged_data'), true)['dropped']['member_offers'];
        $this->assertSame(['available', 'available'], array_column($dropped, 'status'));
    }

    public function test_a_campaign_both_accounts_were_emailed_keeps_one_delivery_the_sent_one_first(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $this->parentRowsExist('email_campaigns', [1, 2, 3]); // the campaigns the deliveries belong to
        DB::table('email_campaign_deliveries')->insert([
            ['campaign_id' => 1, 'member_id' => $winner->id, 'status' => 'failed', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 1, 'member_id' => $loser->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 2, 'member_id' => $winner->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 2, 'member_id' => $loser->id, 'status' => 'sent', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 3, 'member_id' => $loser->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->merge($winner, $loser);

        $rows = DB::table('email_campaign_deliveries')->where('member_id', $winner->id)->orderBy('campaign_id')->get();
        $this->assertSame([[1, 'sent'], [2, 'sent'], [3, 'pending']], $rows->map(fn ($r) => [(int) $r->campaign_id, $r->status])->all());
        $this->assertSame(3, DB::table('email_campaign_deliveries')->count());
        $dropped = json_decode(DB::table('member_merges')->value('merged_data'), true)['dropped']['email_campaign_deliveries'];
        $this->assertSame([[1, $winner->id, 'failed'], [2, $loser->id, 'sent']], array_map(fn ($r) => [(int) $r['campaign_id'], (int) $r['member_id'], $r['status']], $dropped));
    }

    public function test_a_push_message_both_accounts_were_sent_keeps_the_winners_delivery_and_records_the_other(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $this->parentRowsExist('notification_campaigns', [1, 2]); // the campaigns the deliveries belong to
        DB::table('push_message_deliveries')->insert([
            ['campaign_id' => 1, 'member_id' => $winner->id, 'status' => 'inbox_only', 'reason' => 'no_device', 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 1, 'member_id' => $loser->id, 'status' => 'sent', 'reason' => null, 'created_at' => now(), 'updated_at' => now()],
            ['campaign_id' => 2, 'member_id' => $loser->id, 'status' => 'sent', 'reason' => null, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->merge($winner, $loser);

        $rows = DB::table('push_message_deliveries')->where('member_id', $winner->id)->orderBy('campaign_id')->get();
        $this->assertSame([[1, 'inbox_only'], [2, 'sent']], $rows->map(fn ($r) => [(int) $r->campaign_id, $r->status])->all());
        $dropped = json_decode(DB::table('member_merges')->value('merged_data'), true)['dropped']['push_message_deliveries'];
        $this->assertSame([[1, $loser->id, 'sent']], array_map(fn ($r) => [(int) $r['campaign_id'], (int) $r['member_id'], $r['status']], $dropped));
    }

    public function test_referrals_move_on_both_sides_and_a_referral_between_the_pair_is_dropped(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $friend = $this->makeMember();
        $sponsor = $this->makeMember();
        $both = $this->makeMember();
        $org = app('current_organization_id');
        DB::table('referrals')->insert([
            ['organization_id' => $org, 'referrer_id' => $loser->id, 'referee_id' => $friend->id, 'status' => 'rewarded', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $org, 'referrer_id' => $sponsor->id, 'referee_id' => $loser->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $org, 'referrer_id' => $loser->id, 'referee_id' => $winner->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $org, 'referrer_id' => $winner->id, 'referee_id' => $both->id, 'status' => 'rewarded', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $org, 'referrer_id' => $loser->id, 'referee_id' => $both->id, 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->service->merge($winner, $loser);

        $pairs = DB::table('referrals')->orderBy('id')->get()->map(fn ($r) => [(int) $r->referrer_id, (int) $r->referee_id, $r->status])->all();
        $this->assertSame([
            [$winner->id, $friend->id, 'rewarded'],
            [$sponsor->id, $winner->id, 'pending'],
            [$winner->id, $both->id, 'rewarded'],
        ], $pairs);
        $dropped = json_decode(DB::table('member_merges')->value('merged_data'), true)['dropped']['referrals'];
        $this->assertCount(2, $dropped);
    }

    public function test_the_losers_qr_tokens_are_revoked_earlier_merges_follow_and_the_winner_is_never_its_own_referrer(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember();
        $winner->update(['referred_by' => $loser->id]);
        $sponsor = $this->makeMember();
        $loser->update(['referred_by' => $sponsor->id]);
        // Production's NOT NULL columns, where the sqlite table has them.
        DB::table('qr_tokens')->insert($this->onlyColumnsOf('qr_tokens', ['member_id' => $loser->id, 'token' => 'tok-1', 'signature' => 'sig-1', 'issued_at' => now(), 'expires_at' => now()->addHour(), 'is_revoked' => false, 'created_at' => now(), 'updated_at' => now()]));
        DB::table('member_merges')->insert($this->onlyColumnsOf('member_merges', ['surviving_member_id' => $loser->id, 'merged_member_id' => 999999, 'merged_data' => '{}', 'created_at' => now(), 'updated_at' => now()]));

        $this->service->merge($winner->fresh(), $loser->fresh());

        $this->assertTrue((bool) DB::table('qr_tokens')->where('token', 'tok-1')->value('is_revoked'));
        $this->assertSame($winner->id, (int) DB::table('qr_tokens')->where('token', 'tok-1')->value('member_id'));
        $this->assertSame($winner->id, (int) DB::table('member_merges')->where('merged_member_id', 999999)->value('surviving_member_id'));
        $this->assertSame(999999, (int) DB::table('member_merges')->where('merged_member_id', 999999)->value('merged_member_id'));
        // Referred by the loser (now themselves): the loser's own referrer instead.
        $this->assertSame($sponsor->id, (int) $winner->fresh()->referred_by);
    }

    public function test_the_merge_is_audited_on_the_winner(): void
    {
        $winner = $this->makeMember();
        $loser  = $this->makeMember(300);
        DB::table('points_transactions')->insert(['organization_id' => app('current_organization_id'), 'member_id' => $loser->id, 'type' => 'earn', 'points' => 300, 'balance_after' => 300, 'description' => 'Earned', 'created_at' => now(), 'updated_at' => now()]);

        $this->service->merge($winner, $loser, null, 'Same guest, two sign-ups');

        $audit = \App\Models\AuditLog::where('action', 'member_merged')->firstOrFail();
        $this->assertSame($winner->id, (int) $audit->subject_id);
        $this->assertSame($loser->id, $audit->new_values['merged_member_id']);
        $this->assertSame('Same guest, two sign-ups', $audit->new_values['reason']);
        $this->assertSame(1, $audit->new_values['moved']['points_transactions']);
        $this->assertSame(300, $audit->old_values['points']);
        $this->assertSame("Member #{$loser->member_number} merged into #{$winner->member_number}", $audit->description);
    }

    /**
     * One row, its NOT NULL columns given plain values the column accepts, the named ones as asked. A NOT NULL
     * column with a foreign key (PostgreSQL built from the migrations has them; the sqlite tables do not) names a
     * row made the same way in the table it points at, so the row is one production could hold.
     *
     * @param array<string, mixed> $values
     */
    private function insertRow(string $table, array $values, int $depth = 0): int
    {
        $parents = [];
        foreach (Schema::getForeignKeys($table) as $fk) {
            if (count($fk['columns']) === 1) {
                $parents[$fk['columns'][0]] = $fk['foreign_table'];
            }
        }

        $row = [];
        foreach (Schema::getColumns($table) as $col) {
            if ($col['name'] === 'id' || $col['nullable'] || $col['default'] !== null || array_key_exists($col['name'], $values)) {
                continue;
            }
            $type = strtolower((string) $col['type_name']);
            $length = preg_match('/\((\d+)\)/', (string) $col['type'], $m) ? (int) $m[1] : null;
            $row[$col['name']] = match (true) {
                isset($parents[$col['name']]) && $col['name'] !== 'organization_id' && $depth < 4
                    => $this->insertRow($parents[$col['name']], [], $depth + 1),
                str_contains($type, 'int'), str_contains($type, 'numeric'), str_contains($type, 'decimal') => 1,
                str_contains($type, 'date'), str_contains($type, 'time') => now()->toDateTimeString(),
                str_contains($type, 'bool') => true,
                str_contains($type, 'json') => '{}',
                $type === 'uuid' => (string) \Illuminate\Support\Str::uuid(),
                default => substr('x-' . uniqid(), 0, $length ?? 64),
            };
        }
        if (Schema::hasColumn($table, 'organization_id')) {
            $row['organization_id'] = app('current_organization_id');
        }

        return (int) DB::table($table)->insertGetId(array_merge($row, $values));
    }

    /**
     * Rows with these ids in a table another row names, where the schema has the table (PostgreSQL built from the
     * migrations, whose foreign key asks for them); the sqlite schema of this test has none and no key to satisfy.
     *
     * @param list<int> $ids
     */
    private function parentRowsExist(string $table, array $ids): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }
        foreach ($ids as $id) {
            if (!DB::table($table)->where('id', $id)->exists()) {
                $this->insertRow($table, ['id' => $id]);
            }
        }
    }

    /** @param array<string, mixed> $row @return array<string, mixed> the row without the columns this schema lacks */
    private function onlyColumnsOf(string $table, array $row): array
    {
        return array_intersect_key($row, array_flip(Schema::getColumnListing($table)));
    }

    /** The other member column a row of `referrals` needs. @return array<string, int> */
    private function otherColumns(string $table, string $column, int $otherId): array
    {
        return $table === 'referrals' ? [$column === 'referrer_id' ? 'referee_id' : 'referrer_id' => $otherId] : [];
    }
}
