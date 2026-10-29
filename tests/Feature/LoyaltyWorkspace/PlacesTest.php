<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AccessPlace;
use App\Models\AuditLog;
use App\Models\LoyaltyTier;
use App\Models\ScanEvent;
use App\Services\Loyalty\Access\PlaceScan;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Places (release 8, spec 2026-10-25 §1): the list every staff member reads, a manager's add, change and remove
 * through AccessPlaces (one name per organisation, the tiers this organisation's, a key that makes a retry write
 * nothing), and a place's entries on a venue day.
 */
class PlacesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildValiditySchema();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
    }

    /** @param array<string, mixed> $body */
    private function add(array $body, array $headers = []): TestResponse
    {
        return $this->asManager()->postJson($this->api('places'), $body, $headers);
    }

    private function list(): TestResponse
    {
        return $this->asStaffMember()->getJson($this->api('places'));
    }

    /** An entry at a place, written as PlaceScan writes one, at a moment. */
    private function entry(int $placeId, string $at, string $result = 'granted', string $reason = 'welcome', ?int $memberId = null): void
    {
        DB::table('scan_events')->insert([
            'organization_id' => $this->org->id, 'member_id' => $memberId, 'staff_id' => $this->staffMember->id,
            'scan_type' => PlaceScan::SCAN_TYPE, 'result' => $result, 'action_taken' => $reason, 'access_place_id' => $placeId,
            'created_at' => $at, 'updated_at' => $at,
        ]);
    }

    // ─── The list ────────────────────────────────────────────────────────

    public function test_every_staff_member_reads_the_places_with_their_tiers_and_todays_entries(): void
    {
        $spa = $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['platinum']->id, $this->tiers['gold']->id], 'description' => 'Pool and sauna'])->assertCreated()->json('place.id');
        $door = $this->add(['name' => 'Main entrance', 'admits' => 'all'])->assertCreated()->json('place.id');
        $this->entry($door, '2026-10-05 08:00:00');
        $this->entry($door, '2026-10-05 08:30:00', 'denied', 'member_off', $this->grace->id);
        $this->entry($door, '2026-10-04 20:00:00');
        $this->tiers['platinum']->update(['is_active' => false]);

        $response = $this->list()->assertOk()->assertJsonPath('can_change', false);
        $this->assertSame([
            [
                'id' => $spa, 'name' => 'Spa', 'description' => 'Pool and sauna', 'admits' => 'tiers',
                'tiers' => [['id' => $this->tiers['gold']->id, 'name' => 'Gold', 'color' => '#d4a017'], ['id' => $this->tiers['platinum']->id, 'name' => 'Platinum', 'color' => '#e5e4e2']],
                'is_active' => true, 'sort_order' => 1, 'today' => ['granted' => 0, 'denied' => 0],
            ],
            [
                'id' => $door, 'name' => 'Main entrance', 'description' => null, 'admits' => 'all', 'tiers' => [],
                'is_active' => true, 'sort_order' => 2, 'today' => ['granted' => 1, 'denied' => 1],
            ],
        ], $response->json('places'));
        // The dialog's tiers: the ones in use, in the ladder's order.
        $this->assertSame(['Silver', 'Gold'], array_column($response->json('tiers'), 'name'));
        $this->asManager()->getJson($this->api('places'))->assertJsonPath('can_change', true);
    }

    public function test_today_is_the_venues_day(): void
    {
        $door = $this->add(['name' => 'Main entrance', 'admits' => 'all'])->json('place.id');
        // 22:30 UTC on the 4th is already the 5th in Riga; 21:30 is still the 4th.
        $this->entry($door, '2026-10-04 22:30:00');
        $this->entry($door, '2026-10-04 20:30:00');
        $this->assertSame(['granted' => 0, 'denied' => 0], $this->list()->json('places.0.today'));

        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->assertSame(['granted' => 1, 'denied' => 0], $this->list()->json('places.0.today'));
    }

    public function test_another_organisations_places_are_never_listed_or_reached(): void
    {
        $other = $this->otherOrganization();
        // Written straight to the table: the model would put it in the bound organisation.
        $theirs = (object) ['id' => DB::table('access_places')->insertGetId(['organization_id' => $other['org']->id, 'name' => 'Their door', 'admits' => 'all', 'created_at' => now(), 'updated_at' => now()])];

        $this->assertSame([], $this->list()->json('places'));
        $this->asManager()->putJson($this->api("places/{$theirs->id}"), ['name' => 'Mine'])->assertNotFound()->assertJsonPath('error', 'not_found');
        $this->asManager()->deleteJson($this->api("places/{$theirs->id}"))->assertNotFound();
        $this->asStaffMember()->getJson($this->api("places/{$theirs->id}/entries"))->assertNotFound();
        // A name another organisation uses is free here.
        $this->add(['name' => 'Their door', 'admits' => 'all'])->assertCreated();
    }

    // ─── Add ─────────────────────────────────────────────────────────────

    public function test_a_manager_adds_a_place_at_the_end_of_the_list_and_it_is_audited(): void
    {
        $first = $this->add(['name' => '  Main entrance ', 'admits' => 'all', 'tier_ids' => [$this->tiers['gold']->id]])->assertCreated();
        $first->assertJsonPath('place.name', 'Main entrance')->assertJsonPath('place.tiers', [])->assertJsonPath('place.is_active', true)
            ->assertJsonPath('place.sort_order', 1)->assertJsonPath('place.today', ['granted' => 0, 'denied' => 0]);
        $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id], 'is_active' => false])
            ->assertCreated()->assertJsonPath('place.sort_order', 2)->assertJsonPath('place.is_active', false)
            ->assertJsonPath('place.tiers.0.name', 'Gold');
        $this->add(['name' => 'Lounge', 'admits' => 'all', 'sort_order' => 0])->assertJsonPath('place.sort_order', 0);

        $audit = AuditLog::where('action', 'loyalty.place_created')->where('subject_id', $first->json('place.id'))->first();
        $this->assertNotNull($audit);
        $this->assertSame($this->manager->id, (int) $audit->causer_id);
        $this->assertSame(['name' => 'Main entrance', 'description' => null, 'admits' => 'all', 'tier_ids' => [], 'is_active' => true, 'sort_order' => 1], $audit->new_values);
    }

    public function test_only_a_manager_changes_places(): void
    {
        $this->asStaffMember()->postJson($this->api('places'), ['name' => 'Spa', 'admits' => 'all'])->assertForbidden()->assertJsonPath('error', 'not_allowed');
        $id = $this->add(['name' => 'Spa', 'admits' => 'all'])->json('place.id');
        $this->asStaffMember()->putJson($this->api("places/{$id}"), ['name' => 'Pool'])->assertForbidden()->assertJsonPath('error', 'not_allowed');
        $this->asStaffMember()->deleteJson($this->api("places/{$id}"))->assertForbidden();
        $this->assertSame(1, AccessPlace::query()->count());
    }

    public function test_the_form_is_checked_and_the_tiers_must_be_this_organisations(): void
    {
        $this->add(['admits' => 'all'])->assertStatus(422)->assertJsonValidationErrors(['name']);
        $this->add(['name' => str_repeat('a', 81), 'admits' => 'all'])->assertStatus(422)->assertJsonValidationErrors(['name']);
        $this->add(['name' => 'Spa', 'admits' => 'some'])->assertStatus(422)->assertJsonValidationErrors(['admits']);
        $this->add(['name' => 'Spa', 'admits' => 'tiers'])->assertStatus(422)->assertJsonValidationErrors(['tier_ids']);
        $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => []])->assertStatus(422)->assertJsonValidationErrors(['tier_ids']);
        $this->add(['name' => 'Spa', 'admits' => 'all', 'description' => str_repeat('a', 301)])->assertStatus(422)->assertJsonValidationErrors(['description']);

        $other = $this->otherOrganization();
        $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$other['tier']->id]])->assertStatus(422)->assertJsonValidationErrors(['tier_ids.0']);
        $this->assertSame(0, AccessPlace::withoutGlobalScopes()->count());
        $this->assertSame(0, DB::table('access_place_tiers')->count());
    }

    public function test_a_name_is_one_place_whatever_its_case(): void
    {
        $this->add(['name' => 'Spa', 'admits' => 'all'])->assertCreated();
        $this->add(['name' => ' SPA ', 'admits' => 'all'])->assertStatus(422)->assertJsonPath('error', 'name_taken')->assertJsonPath('field', 'name');
        $this->add(['name' => 'Église', 'admits' => 'all'])->assertCreated();
        $this->add(['name' => 'église', 'admits' => 'all'])->assertStatus(422)->assertJsonPath('error', 'name_taken');
        $this->assertSame(2, AccessPlace::query()->count());
    }

    public function test_a_retry_with_its_key_writes_nothing_and_another_body_is_refused(): void
    {
        $body = ['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id, $this->tiers['silver']->id], 'idempotency_key' => 'add-spa-1'];
        $first = $this->add($body)->assertCreated()->json('place.id');
        $again = $this->add(['tier_ids' => [$this->tiers['silver']->id, $this->tiers['gold']->id]] + $body)->assertCreated()->json('place.id');
        $this->assertSame($first, $again);
        $this->assertSame(1, AccessPlace::query()->count());
        $this->assertSame(1, AuditLog::where('action', 'loyalty.place_created')->count());

        $this->add(['name' => 'Pool'] + $body)->assertStatus(409)->assertJsonPath('error', 'key_reused');
        // The header, when the body has none.
        $this->add(['name' => 'Lounge', 'admits' => 'all'], ['Idempotency-Key' => 'add-lounge'])->assertCreated();
        $this->add(['name' => 'Lounge', 'admits' => 'all'], ['Idempotency-Key' => 'add-lounge'])->assertCreated();
        $this->assertSame(2, AccessPlace::query()->count());
    }

    // ─── Change ──────────────────────────────────────────────────────────

    public function test_a_change_keeps_what_it_does_not_send_and_every_member_keeps_no_tiers(): void
    {
        $id = $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id], 'description' => 'Pool'])->json('place.id');

        $this->asManager()->putJson($this->api("places/{$id}"), ['is_active' => false])->assertOk()
            ->assertJsonPath('place.is_active', false)->assertJsonPath('place.description', 'Pool')->assertJsonPath('place.tiers.0.name', 'Gold');
        $this->asManager()->putJson($this->api("places/{$id}"), ['tier_ids' => [$this->tiers['platinum']->id, $this->tiers['gold']->id]])->assertOk()
            ->assertJsonPath('place.tiers.1.name', 'Platinum');
        $this->asManager()->putJson($this->api("places/{$id}"), ['admits' => 'all'])->assertOk()->assertJsonPath('place.tiers', []);
        $this->assertSame(0, DB::table('access_place_tiers')->where('access_place_id', $id)->count());
        $this->asManager()->putJson($this->api("places/{$id}"), ['admits' => 'tiers'])->assertStatus(422)->assertJsonValidationErrors(['tier_ids']);
        $this->asManager()->putJson($this->api("places/{$id}"), ['description' => ''])->assertOk()->assertJsonPath('place.description', null);

        $audit = AuditLog::where('action', 'loyalty.place_updated')->where('subject_id', $id)->orderBy('id')->first();
        $this->assertSame([true, false], [$audit->old_values['is_active'], $audit->new_values['is_active']]);
        $this->assertSame(4, AuditLog::where('action', 'loyalty.place_updated')->count());
        // Nothing changed: nothing audited.
        $this->asManager()->putJson($this->api("places/{$id}"), ['name' => 'Spa'])->assertOk();
        $this->assertSame(4, AuditLog::where('action', 'loyalty.place_updated')->count());
    }

    public function test_a_place_keeps_its_own_name_in_another_case_but_not_anothers(): void
    {
        $this->add(['name' => 'Spa', 'admits' => 'all']);
        $id = $this->add(['name' => 'Lounge', 'admits' => 'all'])->json('place.id');

        $this->asManager()->putJson($this->api("places/{$id}"), ['name' => 'spa'])->assertStatus(422)->assertJsonPath('error', 'name_taken');
        $this->asManager()->putJson($this->api("places/{$id}"), ['name' => 'LOUNGE'])->assertOk()->assertJsonPath('place.name', 'LOUNGE');
    }

    // ─── Remove ──────────────────────────────────────────────────────────

    public function test_a_place_nothing_names_is_deleted_one_with_entries_or_an_event_is_switched_off(): void
    {
        $bare = $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id]])->json('place.id');
        $this->asManager()->deleteJson($this->api("places/{$bare}"))->assertOk()->assertExactJson(['outcome' => 'deleted', 'place' => null]);
        $this->assertNull(AccessPlace::query()->find($bare));
        $this->assertSame(0, DB::table('access_place_tiers')->where('access_place_id', $bare)->count());
        $this->assertSame(1, AuditLog::where('action', 'loyalty.place_deleted')->where('subject_id', $bare)->count());

        $used = $this->add(['name' => 'Main entrance', 'admits' => 'all'])->json('place.id');
        $this->entry($used, '2026-10-01 10:00:00');
        $this->asManager()->deleteJson($this->api("places/{$used}"))->assertOk()
            ->assertJsonPath('outcome', 'switched_off')->assertJsonPath('place.is_active', false)->assertJsonPath('place.id', $used);
        $this->assertSame(1, ScanEvent::query()->where('access_place_id', $used)->count());
        $this->assertSame(1, AuditLog::where('action', 'loyalty.place_switched_off')->where('subject_id', $used)->count());

        $hall = $this->add(['name' => 'Hall', 'admits' => 'all'])->json('place.id');
        DB::table('loyalty_events')->insert(['organization_id' => $this->org->id, 'title' => 'Tasting', 'starts_at' => '2026-10-10 18:00:00', 'ends_at' => '2026-10-10 20:00:00', 'access_place_id' => $hall, 'created_at' => now(), 'updated_at' => now()]);
        $this->asManager()->deleteJson($this->api("places/{$hall}"))->assertOk()->assertJsonPath('outcome', 'switched_off');
        $this->assertNotNull(AccessPlace::query()->find($hall));
    }

    // ─── Entries ─────────────────────────────────────────────────────────

    public function test_a_places_entries_on_a_venue_day_newest_first_with_who_and_why(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $door = $this->add(['name' => 'Main entrance', 'admits' => 'all'])->json('place.id');
        $spa = $this->add(['name' => 'Spa', 'admits' => 'all'])->json('place.id');
        $this->entry($door, '2026-10-05 06:15:00', 'granted', 'welcome', $this->ada->id);
        $this->entry($door, '2026-10-05 07:40:00', 'denied', 'not_found');
        $this->entry($door, '2026-10-04 20:59:00', 'denied', 'expired', $this->grace->id);
        $this->entry($door, '2026-10-04 21:00:00', 'granted', 'welcome', $this->grace->id);
        $this->entry($spa, '2026-10-05 07:00:00');

        $response = $this->asStaffMember()->getJson($this->api("places/{$door}/entries"))->assertOk();
        $this->assertSame([
            ['id' => $response->json('entries.0.id'), 'at' => '2026-10-05T10:40', 'member' => null, 'granted' => false, 'reason' => 'not_found', 'by' => $this->staffMember->name],
            ['id' => $response->json('entries.1.id'), 'at' => '2026-10-05T09:15', 'member' => ['id' => $this->ada->id, 'name' => 'Ada Lovelace', 'member_number' => $this->ada->member_number], 'granted' => true, 'reason' => 'welcome', 'by' => $this->staffMember->name],
            ['id' => $response->json('entries.2.id'), 'at' => '2026-10-05T00:00', 'member' => ['id' => $this->grace->id, 'name' => 'Grace Hopper', 'member_number' => $this->grace->member_number], 'granted' => true, 'reason' => 'welcome', 'by' => $this->staffMember->name],
        ], $response->json('entries'));
        $response->assertJsonPath('page', 1)->assertJsonPath('pages', 1)->assertJsonPath('counts', ['granted' => 2, 'denied' => 1]);

        $this->asStaffMember()->getJson($this->api("places/{$door}/entries?day=2026-10-04"))->assertOk()
            ->assertJsonPath('entries.0.at', '2026-10-04T23:59')->assertJsonPath('entries.0.reason', 'expired')
            ->assertJsonPath('counts', ['granted' => 0, 'denied' => 1]);
        $this->asStaffMember()->getJson($this->api("places/{$door}/entries?day=5-10-2026"))->assertStatus(422);
    }

    public function test_entries_come_fifty_a_page(): void
    {
        $door = $this->add(['name' => 'Main entrance', 'admits' => 'all'])->json('place.id');
        $start = CarbonImmutable::parse('2026-10-05 01:00:00');
        for ($i = 0; $i < 53; $i++) {
            $this->entry($door, $start->addMinutes($i)->format('Y-m-d H:i:s'), $i % 10 === 0 ? 'denied' : 'granted', $i % 10 === 0 ? 'member_off' : 'welcome', $this->ada->id);
        }

        $first = $this->asStaffMember()->getJson($this->api("places/{$door}/entries"))->assertOk();
        $this->assertCount(50, $first->json('entries'));
        $first->assertJsonPath('pages', 2)->assertJsonPath('entries.0.at', '2026-10-05T01:52')->assertJsonPath('counts', ['granted' => 47, 'denied' => 6]);
        $second = $this->asStaffMember()->getJson($this->api("places/{$door}/entries?page=2"))->assertOk();
        $this->assertSame(['2026-10-05T01:02', '2026-10-05T01:01', '2026-10-05T01:00'], array_column($second->json('entries'), 'at'));
        $this->asStaffMember()->getJson($this->api("places/{$door}/entries?page=9"))->assertOk()->assertJsonPath('page', 2);
    }

    public function test_the_pair_index_holds_one_row_per_place_and_tier(): void
    {
        $id = $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id, $this->tiers['gold']->id]])->assertStatus(422);
        $id = $this->add(['name' => 'Spa', 'admits' => 'tiers', 'tier_ids' => [$this->tiers['gold']->id]])->json('place.id');
        $this->asManager()->putJson($this->api("places/{$id}"), ['tier_ids' => [$this->tiers['gold']->id, $this->tiers['silver']->id]])->assertOk();
        $this->assertSame(2, DB::table('access_place_tiers')->where('access_place_id', $id)->count());
        $this->assertInstanceOf(LoyaltyTier::class, AccessPlace::query()->find($id)->tiers->first());
    }
}
