<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\EarnRateEvent;
use App\Models\Guest;
use App\Models\LoyaltyTier;
use App\Models\MemberSegment;
use App\Models\SpecialOffer;
use App\Models\TierAssessment;
use App\Models\TierBenefit;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\CampaignsSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Release 11 (owner 2026-10-26: "an option for users to delete or rename tiers and benefits"): Program deletes a tier
 * (its members moved to the tier the manager chose, nothing left naming it in a way that widens who gets what) and a
 * benefit (members' requests keep its name), each read first; a tier's name stays the organisation's own.
 */
class ProgramRemovalTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, CampaignsSchema, MembershipSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->setUpCampaignsSchema();
        $this->buildMembershipSchema();
    }

    public function test_it_says_what_deleting_a_tier_would_do_before_anything_changes(): void
    {
        $world = $this->silverEverywhere();
        $this->makeMember('Former Member', 'former@example.test', ['is_active' => false]);

        $removal = $this->asStaffMember()->getJson($this->api("program/tiers/{$this->silver()}/removal"))->assertOk()->json('removal');

        $this->assertSame(['id' => $this->silver(), 'name' => 'Silver'], $removal['tier']);
        // Counted as the tier's card counts them; the one switched off moves too, counted apart.
        $this->assertSame([1, 1], [$removal['members'], $removal['members_off']]);
        $this->assertNull($removal['blocked']);
        // Silver is the bottom of the ladder: its members go up to the next tier members can earn.
        $this->assertSame($this->tiers['gold']->id, $removal['move_to']);
        $this->assertSame(['Gold', 'Platinum'], array_column($removal['move_options'], 'name'));
        $this->assertSame(1, $removal['benefits']);
        $this->assertSame([['id' => $world['lounge'], 'name' => 'Lounge', 'only' => false], ['id' => $world['spa'], 'name' => 'Spa', 'only' => true]], $removal['places']);
        $this->assertSame([['id' => $world['tasting']->id, 'name' => 'Silver tasting', 'only' => true]], $removal['events']);
        $this->assertSame([['id' => $world['silverBoost']->id, 'name' => 'Silver days', 'only' => true], ['id' => $world['bothBoost']->id, 'name' => 'Two tiers', 'only' => false]], $removal['boosts']);
        $this->assertSame([['id' => $world['offer']->id, 'name' => 'Silver spa', 'only' => true]], $removal['offers']);
        $this->assertSame([['id' => $world['only']->id, 'name' => 'Silver only', 'only' => true], ['id' => $world['both']->id, 'name' => 'Silver or Gold', 'only' => false]], $removal['segments']);

        // Reading changed nothing.
        $this->assertNull(LoyaltyTier::withTrashed()->find($this->silver())->deleted_at);
        $this->assertSame($this->silver(), $this->grace->fresh()->tier_id);
    }

    public function test_deleting_a_tier_moves_its_members_and_leaves_nothing_wider_than_it_was(): void
    {
        $world = $this->silverEverywhere();
        $guest = Guest::create(['first_name' => 'Grace', 'full_name' => 'Grace Hopper', 'email' => 'grace@example.test', 'member_id' => $this->grace->id, 'loyalty_tier' => 'Silver']);
        $gold = $this->tiers['gold']->id;
        $this->grace->forceFill(['tier_override_until' => now()->addMonth()])->save();

        $this->asManager()->deleteJson($this->api("program/tiers/{$this->silver()}"), ['move_to' => $gold])->assertOk()
            // Both events stop naming it, the one that is over too.
            ->assertJsonPath('removed', ['members' => 1, 'places' => 2, 'events' => 2, 'boosts_off' => 1, 'offers_off' => 1]);

        // Gone from every list, kept for the history that names it.
        $this->assertNull(LoyaltyTier::query()->find($this->silver()));
        $this->assertNotNull(LoyaltyTier::withTrashed()->find($this->silver())->deleted_at);
        $this->assertSame(['Gold', 'Platinum'], array_column($this->asManager()->getJson($this->api('program'))->json('tiers'), 'name'));

        // Its member moved, with the move in the history under Silver's name, and the guest record follows.
        $grace = $this->grace->fresh();
        $this->assertSame($gold, (int) $grace->tier_id);
        $this->assertNull($grace->tier_override_until);
        $this->assertSame('2026-10-05', (string) $grace->tier_effective_from?->toDateString());
        $move = TierAssessment::query()->where('member_id', $grace->id)->sole();
        $this->assertSame(['tier_deleted', 'Silver', 'Gold', $this->manager->id], [$move->reason, $move->oldTier->name, $move->newTier->name, (int) $move->assessed_by]);
        $this->assertSame('Gold', $guest->fresh()->loyalty_tier);
        $this->assertSame($gold, (int) $this->ada->fresh()->tier_id);

        // Its benefit is off it; places and events stop naming it (a place it alone could enter lets in no tier now).
        $this->assertFalse(TierBenefit::query()->where('tier_id', $this->silver())->sole()->is_active);
        $this->assertSame([], DB::table('access_place_tiers')->where('access_place_id', $world['spa'])->pluck('tier_id')->all());
        $this->assertSame([$gold], DB::table('access_place_tiers')->where('access_place_id', $world['lounge'])->pluck('tier_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(0, DB::table('loyalty_event_tiers')->where('loyalty_event_id', $world['tasting']->id)->count());

        // A boost or an offer for Silver alone is switched off (none named would be every tier); one for two keeps the other.
        $this->assertSame([false, null], [$world['silverBoost']->fresh()->is_active, $world['silverBoost']->fresh()->tier_ids]);
        $this->assertSame([true, [$gold]], [$world['bothBoost']->fresh()->is_active, $world['bothBoost']->fresh()->tier_ids]);
        $this->assertSame([false, null], [$world['offer']->fresh()->is_active, $world['offer']->fresh()->tier_ids]);

        // A segment rule keeps the other tiers it names; one naming only Silver is left as it was, never emptied into "everyone".
        $this->assertSame([$gold], $world['both']->fresh()->definition['filters'][0]['value']);
        $this->assertSame([$this->silver()], $world['only']->fresh()->definition['filters'][0]['value']);

        $audit = AuditLog::query()->where('action', 'tier_deleted')->sole();
        $this->assertSame($this->silver(), (int) $audit->subject_id);
        $this->assertStringContainsString("1 members moved to 'Gold'", (string) $audit->description);
    }

    public function test_a_deleted_tier_is_not_one_any_form_can_name(): void
    {
        $this->asManager()->deleteJson($this->api("program/tiers/{$this->tiers['platinum']->id}"))->assertOk()
            ->assertJsonPath('removed.members', 0);
        $platinum = $this->tiers['platinum']->id;

        $this->asManager()->postJson($this->api('program/boosts'), [
            'name' => 'Weekend', 'multiplier' => 2, 'starts_at' => '2026-10-04T00:00:00+00:00', 'ends_at' => '2026-10-11T00:00:00+00:00', 'tier_ids' => [$platinum],
        ])->assertStatus(422)->assertJsonValidationErrors(['tier_ids.0']);
        $this->asManager()->putJson($this->api("program/tiers/{$platinum}"), ['name' => 'Back'])->assertStatus(404);
        $this->asManager()->getJson($this->api("program/tiers/{$platinum}/removal"))->assertStatus(404);
        $this->asManager()->deleteJson($this->api("program/tiers/{$platinum}"))->assertStatus(404);
    }

    public function test_a_tier_with_members_needs_a_tier_to_move_them_to_and_the_last_one_stays(): void
    {
        $gold = $this->tiers['gold']->id;

        $this->asStaffMember()->deleteJson($this->api("program/tiers/{$gold}"), ['move_to' => $this->silver()])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asManager()->deleteJson($this->api("program/tiers/{$gold}"))
            ->assertStatus(422)->assertJsonPath('error', 'move_to_required');
        $this->asManager()->deleteJson($this->api("program/tiers/{$gold}"), ['move_to' => $gold])
            ->assertStatus(422)->assertJsonPath('error', 'move_to_unknown');
        // A tier switched off is no tier to move members to; another organisation's is not one at all.
        $this->tiers['platinum']->update(['is_active' => false]);
        $this->asManager()->deleteJson($this->api("program/tiers/{$gold}"), ['move_to' => $this->tiers['platinum']->id])
            ->assertStatus(422)->assertJsonPath('error', 'move_to_unknown');
        $other = $this->otherOrganization();
        $this->asManager()->deleteJson($this->api("program/tiers/{$gold}"), ['move_to' => $other['tier']->id])
            ->assertStatus(422)->assertJsonPath('error', 'move_to_unknown');
        $this->asManager()->deleteJson($this->api("program/tiers/{$other['tier']->id}"))->assertStatus(404);
        $this->assertNotNull(LoyaltyTier::query()->find($gold));

        // With Silver gone too, Gold is the last tier switched on: members need one.
        $this->asManager()->deleteJson($this->api("program/tiers/{$this->silver()}"), ['move_to' => $gold])->assertOk();
        $this->asManager()->getJson($this->api("program/tiers/{$gold}/removal"))->assertOk()
            ->assertJsonPath('removal.blocked', 'last_tier')->assertJsonPath('removal.move_to', null)->assertJsonPath('removal.move_options', []);
        $this->asManager()->deleteJson($this->api("program/tiers/{$gold}"), ['move_to' => $this->tiers['platinum']->id])
            ->assertStatus(409)->assertJsonPath('error', 'last_tier');
        $this->assertSame(2, LoyaltyTier::query()->where('id', $gold)->orWhere('id', $this->tiers['platinum']->id)->count());
    }

    public function test_the_nearest_tier_below_that_members_can_earn_is_suggested(): void
    {
        $this->tiers['gold']->update(['invitation_only' => true]);

        // Platinum's nearest below is Gold, but Gold is by invitation only: Silver.
        $this->asManager()->getJson($this->api("program/tiers/{$this->tiers['platinum']->id}/removal"))
            ->assertJsonPath('removal.move_to', $this->silver());
    }

    public function test_a_tiers_name_is_its_own_among_the_tiers_not_deleted_and_a_rename_follows_to_the_guest_record(): void
    {
        $guest = Guest::create(['first_name' => 'Ada', 'full_name' => 'Ada Lovelace', 'email' => 'ada@example.test', 'member_id' => $this->ada->id, 'loyalty_tier' => 'Gold']);
        $gold = $this->tiers['gold']->id;

        $this->asManager()->putJson($this->api("program/tiers/{$gold}"), ['name' => 'silver'])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
        $this->asManager()->postJson($this->api('program/tiers'), ['name' => 'PLATINUM', 'min_points' => 9000, 'earn_rate' => 2])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
        // Its own name, as it is, is no clash.
        $this->asManager()->putJson($this->api("program/tiers/{$gold}"), ['name' => 'Gold', 'earn_rate' => 1.3])->assertOk();
        $this->assertSame('Gold', $guest->fresh()->loyalty_tier);

        $this->asManager()->putJson($this->api("program/tiers/{$gold}"), ['name' => 'Golden circle of our most loyal guests'])
            ->assertOk()->assertJsonPath('tier.name', 'Golden circle of our most loyal guests');
        // The guest record holds 30 characters.
        $this->assertSame('Golden circle of our most loya', $guest->fresh()->loyalty_tier);

        // A deleted tier's name is free again.
        $this->asManager()->deleteJson($this->api("program/tiers/{$this->tiers['platinum']->id}"))->assertOk();
        $this->asManager()->postJson($this->api('program/tiers'), ['name' => 'Platinum', 'min_points' => 9000, 'earn_rate' => 2])->assertCreated();
    }

    public function test_the_database_keeps_a_name_and_a_code_once_among_the_rows_not_deleted(): void
    {
        // The partial unique indexes of the release 11 migration (the SQLite test schema has none of its own).
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS loyalty_tiers_org_name_live_unique ON loyalty_tiers (organization_id, name) WHERE deleted_at IS NULL');
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS benefit_definitions_org_code_live_unique ON benefit_definitions (organization_id, code) WHERE deleted_at IS NULL');
        }
        $this->tiers['platinum']->delete();
        $again = LoyaltyTier::create(['name' => 'Platinum', 'min_points' => 9000, 'earn_rate' => 2, 'color_hex' => '#e5e4e2', 'is_active' => true]);
        $this->assertNotSame($this->tiers['platinum']->id, $again->id);

        $spa = BenefitDefinition::create(['name' => 'Spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']);
        $spa->delete();
        BenefitDefinition::create(['name' => 'Spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']);

        $this->expectException(QueryException::class);
        DB::transaction(fn () => LoyaltyTier::create(['name' => 'Gold', 'min_points' => 1, 'earn_rate' => 1, 'color_hex' => '#d4a017', 'is_active' => true]));
    }

    public function test_deleting_a_benefit_takes_it_off_every_tier_and_members_requests_keep_its_name(): void
    {
        $spa = BenefitDefinition::create(['name' => 'Spa access', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']);
        foreach (['silver', 'gold'] as $tier) {
            TierBenefit::create(['tier_id' => $this->tiers[$tier]->id, 'benefit_id' => $spa->id, 'is_active' => true]);
        }
        $waiting = BenefitEntitlement::create(['member_id' => $this->ada->id, 'benefit_id' => $spa->id, 'status' => 'pending', 'requested_at' => now()]);
        BenefitEntitlement::create(['member_id' => $this->grace->id, 'benefit_id' => $spa->id, 'status' => 'fulfilled', 'requested_at' => now()->subWeek()]);

        $this->asStaffMember()->getJson($this->api("program/benefits/{$spa->id}/removal"))->assertOk()
            ->assertJsonPath('removal', ['benefit' => ['id' => $spa->id, 'name' => 'Spa access'], 'tiers' => ['Silver', 'Gold'], 'waiting' => 1, 'requests' => 2]);
        $this->asStaffMember()->deleteJson($this->api("program/benefits/{$spa->id}"))->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->asManager()->deleteJson($this->api("program/benefits/{$spa->id}"))->assertOk()->assertJsonPath('removed', ['tiers' => 2]);

        $this->assertNull(BenefitDefinition::query()->find($spa->id));
        $this->assertSame(0, TierBenefit::query()->where('benefit_id', $spa->id)->where('is_active', true)->count());
        $program = $this->asManager()->getJson($this->api('program'));
        $program->assertJsonPath('benefits', [])->assertJsonPath('tiers.0.benefits', []);
        // The waiting request stays for staff to decide, under the benefit's name.
        $this->assertSame('Spa access', $waiting->fresh()->benefit->name);
        $this->assertTrue(AuditLog::query()->where('action', 'benefit_deleted')->where('subject_id', $spa->id)->exists());

        // A deleted benefit is not one a tier can be given; its code is free for a new one.
        $this->asManager()->postJson($this->api("program/tiers/{$this->tiers['gold']->id}/benefits"), ['benefit_id' => $spa->id])
            ->assertStatus(422)->assertJsonValidationErrors(['benefit_id']);
        $this->asManager()->postJson($this->api('program/benefits'), ['name' => 'Spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request'])
            ->assertCreated();
        $this->asManager()->deleteJson($this->api("program/benefits/{$spa->id}"))->assertStatus(404);

        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = BenefitDefinition::create(['name' => 'Their spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']);
        app()->instance('current_organization_id', $prior);
        $this->asManager()->getJson($this->api("program/benefits/{$theirs->id}/removal"))->assertStatus(404);
        $this->asManager()->deleteJson($this->api("program/benefits/{$theirs->id}"))->assertStatus(404);
        $this->assertNotNull(BenefitDefinition::withoutGlobalScopes()->find($theirs->id)->name);
    }

    // ─── Fixtures ───────────────────────────────────────────────────────────

    private function silver(): int
    {
        return (int) $this->tiers['silver']->id;
    }

    /**
     * Silver named everywhere a tier can be: a benefit, a place it alone enters and one it shares, an event for it
     * alone, a boost for it alone and one for two tiers, an offer for it alone, a segment of two tiers and one of it.
     *
     * @return array<string, mixed>
     */
    private function silverEverywhere(): array
    {
        $silver = $this->silver();
        $gold = $this->tiers['gold']->id;
        $benefit = BenefitDefinition::create(['name' => 'Welcome tea', 'code' => 'tea', 'category' => 'dining', 'fulfillment_mode' => 'on_request']);
        TierBenefit::create(['tier_id' => $silver, 'benefit_id' => $benefit->id, 'is_active' => true]);

        $place = fn (string $name, array $tiers) => tap((int) DB::table('access_places')->insertGetId([
            'organization_id' => $this->org->id, 'name' => $name, 'admits' => 'tiers', 'sort_order' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]), fn (int $id) => DB::table('access_place_tiers')->insert(array_map(fn ($t) => ['access_place_id' => $id, 'tier_id' => $t], $tiers)));

        return [
            'spa'         => $place('Spa', [$silver]),
            'lounge'      => $place('Lounge', [$silver, $gold]),
            'tasting'     => $this->makeEvent(['title' => 'Silver tasting', 'starts_at' => '2026-10-12 18:00:00', 'ends_at' => '2026-10-12 21:00:00'], [$silver]),
            // One that is over is no longer listed.
            'past'        => $this->makeEvent(['title' => 'Last month', 'starts_at' => '2026-09-01 18:00:00', 'ends_at' => '2026-09-01 21:00:00'], [$silver]),
            'silverBoost' => EarnRateEvent::create(['name' => 'Silver days', 'multiplier' => 2, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'tier_ids' => [$silver], 'is_active' => true]),
            'bothBoost'   => EarnRateEvent::create(['name' => 'Two tiers', 'multiplier' => 2, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'tier_ids' => [$silver, $gold], 'is_active' => true]),
            'offer'       => SpecialOffer::create(['title' => 'Silver spa', 'description' => 'x', 'type' => 'discount', 'value' => 10, 'start_date' => '2026-10-01', 'end_date' => '2026-10-31', 'tier_ids' => [$silver], 'is_active' => true]),
            'both'        => $this->makeSegment('Silver or Gold', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [$silver, $gold]]]]),
            'only'        => $this->makeSegment('Silver only', ['operator' => 'AND', 'filters' => [['type' => 'tier', 'op' => 'in', 'value' => [$silver]]]]),
        ];
    }
}
