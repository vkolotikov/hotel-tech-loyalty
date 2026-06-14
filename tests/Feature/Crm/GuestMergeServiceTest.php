<?php

namespace Tests\Feature\Crm;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Services\GuestMergeService;
use Database\Factories\GuestFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks GuestMergeService::merge — the CRM duplicate-cleanup
 * service that walks every guest_id FK in ~13 tables and
 * consolidates two records.
 *
 * Critical contracts:
 *
 *   Validation (pre-merge guards):
 *     1. Same guest into itself → InvalidArgumentException
 *     2. Cross-tenant merge → InvalidArgumentException
 *     3. Both linked to DIFFERENT loyalty members →
 *        InvalidArgumentException with "merge the members first"
 *        guidance. The points ledger reconciliation has to flow
 *        through Member merge, not Guest merge.
 *
 *   Profile merge rule (winner-wins, loser-fills-blanks):
 *     - Winner's non-empty fields stay verbatim
 *     - Empty winner fields get filled from loser
 *     - Notes concatenate (NOT overwrite) — never lose context
 *     - custom_data is unioned with winner keys winning
 *
 *   FK re-pointing:
 *     - Plain-table FKs (inquiries.guest_id etc.) re-point from
 *       loser to winner via raw DB::table update (Schema::hasTable
 *       gate handles tables missing in some installs)
 *     - Loser row deleted at the end (after all re-pointing)
 *
 *   Aggregate counters:
 *     - total_stays, total_nights sum
 *     - total_revenue sums (decimal)
 *     - first_stay_date pulls EARLIER value forward
 *     - last_activity_at pulls LATER value forward
 *
 *   Member adoption:
 *     - Winner without member adopts loser's member_id
 *     - Winner WITH member keeps its own
 *
 *   Audit log:
 *     - One audit_log row created with action=guest.merged,
 *       carrying the loser snapshot under new_values.snapshot
 *       so a future complaint can be forensically inspected
 */
class GuestMergeServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private GuestMergeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpGuestMergeSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new GuestMergeService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_merge_same_guest_into_itself_throws(): void
    {
        $guest = GuestFactory::new()->create();

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Cannot merge a guest into itself/');

        $this->service->merge($guest, $guest);
    }

    public function test_merge_across_orgs_throws(): void
    {
        // Critical multi-tenant invariant. Guests live in their
        // org — a cross-org merge would silently fold one tenant's
        // data into another's.
        //
        // Note: BelongsToOrganization force-fills organization_id
        // from bound context, ignoring explicit overrides. To
        // create guests in two different orgs we re-bind the
        // context per create.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);
        $guestA = GuestFactory::new()->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        $guestB = GuestFactory::new()->create();

        $this->assertNotSame($guestA->organization_id, $guestB->organization_id,
            'Sanity: guests must end up in different orgs.');

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/different organizations/');

        $this->service->merge($guestA, $guestB);
    }

    public function test_merge_throws_when_both_linked_to_different_members(): void
    {
        // The members-first guardrail. If both guests are linked
        // to DIFFERENT loyalty members, the points ledger
        // reconciliation has to flow through Member merge first
        // (where the points reverse-transaction path lives).
        $winner = GuestFactory::new()->create(['member_id' => 101]);
        $loser  = GuestFactory::new()->create(['member_id' => 202]);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/Merge the members first/');

        $this->service->merge($winner, $loser);
    }

    public function test_merge_succeeds_when_both_linked_to_SAME_member(): void
    {
        // The exception is "different members". Same member_id
        // is fine — both guests already pointed at the same
        // loyalty record.
        $winner = GuestFactory::new()->create(['member_id' => 555]);
        $loser  = GuestFactory::new()->create(['member_id' => 555]);

        // Should not throw.
        $result = $this->service->merge($winner, $loser);

        $this->assertSame($winner->id, $result['winner_id']);
        $this->assertSame($loser->id, $result['loser_id']);
    }

    public function test_winner_profile_fields_are_not_clobbered_by_loser(): void
    {
        // The load-bearing "winner wins" rule. A non-empty winner
        // field MUST survive the merge unchanged.
        $winner = GuestFactory::new()->create([
            'email' => 'winner@example.test',
            'phone' => '+44 7000 000000',
        ]);
        $loser = GuestFactory::new()->create([
            'email' => 'loser@example.test',
            'phone' => '+44 7000 999999',
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame('winner@example.test', $winner->email,
            'Non-empty winner email must NOT be clobbered.');
        $this->assertSame('+44 7000 000000', $winner->phone);
    }

    public function test_winner_blank_fields_are_filled_from_loser(): void
    {
        // The complementary rule: winner's BLANK fields get
        // backfilled from loser. This is the whole point of
        // merging — recover the data the loser had.
        $winner = GuestFactory::new()->create([
            'email' => 'winner@example.test',
            'phone' => null,  // blank
        ]);
        $loser = GuestFactory::new()->create([
            'email' => 'loser@example.test',
            'phone' => '+44 7000 999999',
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame('+44 7000 999999', $winner->phone,
            'Blank winner phone must be backfilled from loser.');
        // And email still wins:
        $this->assertSame('winner@example.test', $winner->email);
    }

    public function test_notes_are_concatenated_not_overwritten(): void
    {
        // CLAUDE.md: notes concatenated — never lose context.
        // A merge that overwrote notes would silently drop the
        // admin's annotation history.
        $winner = GuestFactory::new()->create(['notes' => 'Winner notes here']);
        $loser  = GuestFactory::new()->create(['notes' => 'Loser had different notes']);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertStringContainsString('Winner notes here', $winner->notes);
        $this->assertStringContainsString('Loser had different notes', $winner->notes);
        $this->assertStringContainsString("Merged from #{$loser->id}", $winner->notes,
            'Concatenation must surface the loser id for forensic traceability.');
    }

    public function test_custom_data_is_unioned_winner_keys_win(): void
    {
        // jsonb union with winner-wins on key collisions.
        $winner = GuestFactory::new()->create([
            'custom_data' => ['allergies' => 'shellfish', 'wing' => 'east'],
        ]);
        $loser = GuestFactory::new()->create([
            'custom_data' => ['allergies' => 'nuts', 'newsletter' => 'opted-in'],
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $decoded = is_array($winner->custom_data) ? $winner->custom_data : json_decode($winner->custom_data, true);

        $this->assertSame('shellfish', $decoded['allergies'],
            'Winner key wins on collision.');
        $this->assertSame('east', $decoded['wing'],
            'Winner-only key preserved.');
        $this->assertSame('opted-in', $decoded['newsletter'],
            'Loser-only key adopted into winner.');
    }

    public function test_total_stays_total_nights_total_revenue_sum(): void
    {
        // Aggregate counters add. A guest with 5 stays merged
        // with a guest with 3 stays ends up at 8.
        $winner = GuestFactory::new()->create([
            'total_stays'   => 5,
            'total_nights'  => 14,
            'total_revenue' => 1200.50,
        ]);
        $loser = GuestFactory::new()->create([
            'total_stays'   => 3,
            'total_nights'  => 9,
            'total_revenue' => 800.50,
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame(8, (int) $winner->total_stays);
        $this->assertSame(23, (int) $winner->total_nights);
        $this->assertSame(2001.00, (float) $winner->total_revenue);
    }

    public function test_first_stay_date_pulls_earlier_value_forward(): void
    {
        // The "older history" rule: first_stay_date adopts the
        // EARLIER of the two so the merged record reflects the
        // guest's true first interaction.
        $winner = GuestFactory::new()->create([
            'first_stay_date' => '2024-06-01',
        ]);
        $loser = GuestFactory::new()->create([
            'first_stay_date' => '2021-03-15', // earlier
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame('2021-03-15', $winner->first_stay_date->toDateString(),
            'Earlier first_stay_date must win.');
    }

    public function test_last_activity_at_pulls_later_value_forward(): void
    {
        // Symmetric to first_stay_date: last_activity_at adopts
        // the LATER of the two so engagement reports reflect
        // the freshest contact.
        $winnerActivity = now()->subYear()->startOfMinute();
        $loserActivity = now()->subDay()->startOfMinute();
        $winner = GuestFactory::new()->create([
            'last_activity_at' => $winnerActivity,
        ]);
        $loser = GuestFactory::new()->create([
            'last_activity_at' => $loserActivity,
        ]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        // Compare via format to sidestep sub-second precision
        // differences after the DB round-trip.
        $this->assertSame(
            $loserActivity->format('Y-m-d H:i:s'),
            $winner->last_activity_at->format('Y-m-d H:i:s'),
            'Later last_activity_at must win.',
        );
    }

    public function test_winner_without_member_adopts_losers_member_id(): void
    {
        // Member adoption: if only the loser has a loyalty link,
        // the winner takes it over so the points relationship
        // doesn't get orphaned by the loser's delete.
        $winner = GuestFactory::new()->create(['member_id' => null]);
        $loser  = GuestFactory::new()->create(['member_id' => 777]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame(777, (int) $winner->member_id);
    }

    public function test_winner_with_member_keeps_own_when_loser_has_none(): void
    {
        // Reverse case: loser has no member, winner keeps its own.
        $winner = GuestFactory::new()->create(['member_id' => 888]);
        $loser  = GuestFactory::new()->create(['member_id' => null]);

        $this->service->merge($winner, $loser);
        $winner->refresh();

        $this->assertSame(888, (int) $winner->member_id);
    }

    public function test_inquiries_with_loser_guest_id_repoint_to_winner(): void
    {
        // The PLAIN_TABLES re-point exercise — picks inquiries
        // as the canonical example since it's the most common
        // guest-attached entity. Other tables share the same code
        // path (Schema::hasColumn gate + DB::table update).
        $winner = GuestFactory::new()->create();
        $loser  = GuestFactory::new()->create();

        // Two inquiries attached to the loser.
        DB::table('inquiries')->insert([
            ['organization_id' => app('current_organization_id'), 'guest_id' => $loser->id, 'status' => 'New', 'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => app('current_organization_id'), 'guest_id' => $loser->id, 'status' => 'New', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $result = $this->service->merge($winner, $loser);

        $winnerInqCount = DB::table('inquiries')->where('guest_id', $winner->id)->count();
        $loserInqCount = DB::table('inquiries')->where('guest_id', $loser->id)->count();

        $this->assertSame(2, $winnerInqCount,
            'Loser inquiries must re-point to winner.');
        $this->assertSame(0, $loserInqCount,
            'No inquiries should remain pointed at the loser.');
        $this->assertArrayHasKey('inquiries', $result['moved']);
        $this->assertSame(2, $result['moved']['inquiries']);
    }

    public function test_loser_is_deleted_after_merge(): void
    {
        $winner = GuestFactory::new()->create();
        $loser  = GuestFactory::new()->create();

        $this->service->merge($winner, $loser);

        $this->assertNull(Guest::find($loser->id),
            'Loser must be deleted after merge.');
        $this->assertNotNull(Guest::find($winner->id),
            'Winner must survive.');
    }

    public function test_audit_log_row_is_created_with_loser_snapshot(): void
    {
        // The forensic trail. A complaint two months later about
        // "where did this guest go?" reads this audit row to
        // reconstruct the merge.
        $winner = GuestFactory::new()->create();
        $loser  = GuestFactory::new()->create([
            'email' => 'lost-but-not-forgotten@example.test',
        ]);

        $this->service->merge($winner, $loser, performedByUserId: null, reason: 'duplicate import');

        $log = AuditLog::where('action', 'guest.merged')->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('duplicate import', $log->description);

        $new = is_array($log->new_values) ? $log->new_values : json_decode($log->new_values, true);
        $this->assertSame($loser->id, (int) $new['loser_id']);
        $this->assertSame('duplicate import', $new['reason']);
        $this->assertSame('lost-but-not-forgotten@example.test', $new['snapshot']['email'],
            'Loser snapshot must capture the loser\'s pre-merge state.');
    }

    public function test_returns_summary_with_winner_id_loser_id_and_moved_counts(): void
    {
        $winner = GuestFactory::new()->create();
        $loser  = GuestFactory::new()->create();
        DB::table('inquiries')->insert([
            'organization_id' => app('current_organization_id'),
            'guest_id'        => $loser->id,
            'status'          => 'New',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $result = $this->service->merge($winner, $loser);

        $this->assertArrayHasKey('winner_id', $result);
        $this->assertArrayHasKey('loser_id', $result);
        $this->assertArrayHasKey('moved', $result);
        $this->assertSame($winner->id, $result['winner_id']);
        $this->assertSame($loser->id, $result['loser_id']);
        $this->assertIsArray($result['moved']);
    }
}
