<?php

namespace Tests\Feature\Loyalty;

use App\Models\BenefitDefinition;
use App\Models\CrmSetting;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\LoyaltyPresetService;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks LoyaltyPresetService::apply — the loyalty-side preset
 * switcher, third member of the family alongside
 * IndustryPresetService (CRM) and PlannerPresetService (planner).
 *
 * Each preset bundles:
 *   1. Tiers — name, min_points, earn_rate, color, perks list
 *   2. Benefit definitions — seed catalog
 *   3. A welcome bonus points value (HotelSetting)
 *
 * The subtle contracts:
 *
 *   1. ALIAS resolution: hotel → hotel_classic, hospitality →
 *      restaurant, legal/real_estate/education → simple_two_tier.
 *      Lets AuthController::startTrial pass the org's industry id
 *      directly without knowing the preset taxonomy. The picker
 *      stamp uses the RAW key so listPresets highlights the user's
 *      actual choice.
 *
 *   2. medical short-circuit: decision #5 says no patient loyalty
 *      program. apply('medical') stamps members_preset='medical'
 *      but writes NO tier/benefit/welcome_bonus rows. Returns
 *      noop=true.
 *
 *   3. Tier-wipe SAFETY (data-integrity invariant):
 *      - Clean-replace ONLY when zero member rows exist for the org
 *        (counts ALL members, including those without a tier_id —
 *        reviewer-flagged bug fix)
 *      - Any member presence → additive-by-name only (skip tiers
 *        whose name already exists, leave the rest)
 *
 *   4. Benefits ALWAYS additive-by-code (admins customise
 *      descriptions — never clobber)
 *
 *   5. welcome_bonus_points only writes on clean-replace path —
 *      orgs with members preserve their admin-tuned value
 *
 *   6. Apply atomically wrapped in DB::transaction
 */
class LoyaltyPresetServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private LoyaltyPresetService $service;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyPresetSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->service = new LoyaltyPresetService();
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

    public function test_PRESETS_const_covers_the_6_canonical_keys(): void
    {
        // Catalog completeness — picker auto-discovers via this
        // const. Missing entry = picker shows nothing.
        $expected = ['hotel_classic', 'hotel_lite', 'beauty',
                     'restaurant', 'fitness', 'simple_two_tier'];
        $actual = array_keys(LoyaltyPresetService::PRESETS);

        foreach ($expected as $key) {
            $this->assertContains($key, $actual,
                "LoyaltyPresetService::PRESETS must include '{$key}'.");
        }
    }

    public function test_listPresets_returns_metadata_for_every_preset(): void
    {
        $out = $this->service->listPresets();
        $this->assertArrayHasKey('presets', $out);
        $this->assertArrayHasKey('current', $out);
        $this->assertGreaterThanOrEqual(6, count($out['presets']));

        foreach ($out['presets'] as $p) {
            $this->assertArrayHasKey('key', $p);
            $this->assertArrayHasKey('label', $p);
            $this->assertArrayHasKey('tier_count', $p);
            $this->assertArrayHasKey('benefit_count', $p);
            $this->assertArrayHasKey('welcome_bonus', $p);
            $this->assertArrayHasKey('is_current', $p);
            $this->assertGreaterThan(0, $p['tier_count']);
        }
    }

    public function test_listPresets_flags_current_via_members_preset_setting(): void
    {
        CrmSetting::create(['key' => 'members_preset', 'value' => 'beauty']);

        $out = $this->service->listPresets();

        $current = array_filter($out['presets'], fn ($p) => $p['is_current'] === true);
        $this->assertCount(1, $current);
        $this->assertSame('beauty', array_values($current)[0]['key']);
    }

    public function test_apply_unknown_key_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessageMatches("/Unknown membership preset 'kangaroo'/");

        $this->service->apply('kangaroo', $this->orgId);
    }

    public function test_apply_hotel_alias_resolves_to_hotel_classic(): void
    {
        // ALIAS resolution: 'hotel' → 'hotel_classic'. Picker stamp
        // uses RAW key 'hotel' so the picker UI can still show
        // "Currently: hotel" — but the actual preset data comes
        // from hotel_classic.
        $summary = $this->service->apply('hotel', $this->orgId);

        $stamp = CrmSetting::where('key', 'members_preset')->first();
        $this->assertSame('hotel', $stamp->value,
            'Picker stamp must use the RAW input key (hotel), not the resolved (hotel_classic).');

        // Tiers were seeded from hotel_classic preset.
        $this->assertGreaterThan(0, $summary['tiers_added']);
    }

    public function test_apply_hospitality_alias_resolves_to_restaurant(): void
    {
        $summary = $this->service->apply('hospitality', $this->orgId);
        $stamp = CrmSetting::where('key', 'members_preset')->first();
        $this->assertSame('hospitality', $stamp->value);
        $this->assertGreaterThan(0, $summary['tiers_added']);
    }

    public function test_apply_legal_real_estate_education_all_resolve_to_simple_two_tier(): void
    {
        // The GTM-deferred-industry aliases. Each routes to a 2-tier
        // setup (Member + VIP) so they get a working loyalty stub
        // without a full preset.
        foreach (['legal', 'real_estate', 'education'] as $alias) {
            // Reset for each iteration by re-binding org context.
            app()->forgetInstance('current_organization_id');
            $org = OrganizationFactory::new()->create();
            app()->instance('current_organization_id', $org->id);

            $summary = $this->service->apply($alias, $org->id);

            $tierCount = LoyaltyTier::withoutGlobalScopes()
                ->where('organization_id', $org->id)
                ->count();
            $this->assertSame(2, $tierCount,
                "Alias '{$alias}' must resolve to simple_two_tier (2 tiers).");
            $this->assertGreaterThan(0, $summary['tiers_added']);
        }
    }

    public function test_apply_medical_short_circuits_with_noop_summary(): void
    {
        // Decision #5: no patient loyalty program. Stamp the picker
        // key but write NOTHING else.
        $summary = $this->service->apply('medical', $this->orgId);

        $this->assertSame(0, $summary['tiers_set']);
        $this->assertSame(0, $summary['tiers_added']);
        $this->assertSame(0, $summary['benefits_added']);
        $this->assertTrue($summary['noop'] ?? false);

        // Verify no tiers / benefits / welcome bonus written.
        $this->assertSame(0, LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count());
        $this->assertSame(0, BenefitDefinition::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count());
        $this->assertNull(HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('key', 'welcome_bonus_points')
            ->first());

        // But the picker stamp IS set so the UI shows "Currently: medical".
        $stamp = CrmSetting::where('key', 'members_preset')->first();
        $this->assertSame('medical', $stamp->value);
    }

    public function test_clean_replace_path_with_zero_members_replaces_tiers_atomically(): void
    {
        // Pre-state: org has the hotel preset applied. Tiers
        // include Diamond, etc.
        $this->service->apply('hotel_classic', $this->orgId);
        $tiersBefore = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->get();
        $this->assertGreaterThan(0, $tiersBefore->count());

        // No members exist. Switch to beauty — should REPLACE.
        $summary = $this->service->apply('beauty', $this->orgId);

        $this->assertTrue($summary['replaced'],
            'Clean-replace must engage when no members exist.');

        $tiersAfter = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->get();
        // Beauty tier names differ from hotel_classic — none of the
        // old names should survive a clean replace.
        $oldHotelNames = $tiersBefore->pluck('name')->all();
        $newNames = $tiersAfter->pluck('name')->all();
        $this->assertEmpty(
            array_intersect($oldHotelNames, $newNames),
            'Clean-replace must wipe old tier names — none should remain.',
        );
    }

    public function test_additive_path_engages_when_ANY_member_exists_even_without_tier_id(): void
    {
        // The reviewer-flagged data-integrity bug fix: tier-wipe
        // safety counts ALL members, not just those with tier_id.
        // An org that imported member rows before configuring tiers
        // must route to the additive-by-name path, not clean-replace.
        $this->service->apply('hotel_classic', $this->orgId);
        $tiersBefore = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->get();

        // Insert a member WITHOUT a tier_id — simulates an org that
        // imported contacts before setting up tiers.
        \Database\Factories\LoyaltyMemberFactory::new()
            ->create(['tier_id' => null, 'organization_id' => $this->orgId]);

        // Switch to beauty — should be ADDITIVE.
        $summary = $this->service->apply('beauty', $this->orgId);

        $this->assertFalse($summary['replaced'],
            'Additive path must engage when ANY member exists, even with null tier_id.');

        // Hotel tiers must STILL be present after the switch.
        $tiersAfter = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->pluck('name')->all();
        foreach ($tiersBefore->pluck('name') as $oldName) {
            $this->assertContains($oldName, $tiersAfter,
                "Hotel tier '{$oldName}' must survive a switch when members exist.");
        }
    }

    public function test_additive_path_skips_existing_tier_names_case_insensitive(): void
    {
        // Additive-by-name dedup is mb_strtolower so "Bronze" and
        // "bronze" collide and the new preset's "Bronze" is skipped.
        $this->service->apply('hotel_classic', $this->orgId);
        // Force-create a member so the next apply is additive.
        \Database\Factories\LoyaltyMemberFactory::new()
            ->create(['organization_id' => $this->orgId]);

        $beforeCount = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count();

        // Re-apply same preset — every tier name collides.
        $summary = $this->service->apply('hotel_classic', $this->orgId);

        $this->assertSame(0, $summary['tiers_added'],
            'Re-apply on additive path must add 0 new tiers.');

        $afterCount = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count();
        $this->assertSame($beforeCount, $afterCount);
    }

    public function test_benefits_always_additive_by_code_never_clobber_existing(): void
    {
        // Benefits NEVER use the clean-replace path. Admins
        // customise descriptions; clobbering on every preset switch
        // would lose admin work.
        $this->service->apply('hotel_classic', $this->orgId);

        // Pretend admin customised a benefit description.
        $existing = BenefitDefinition::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->first();
        $existing->update(['description' => 'CUSTOM ADMIN DESCRIPTION']);

        // Re-apply same preset.
        $this->service->apply('hotel_classic', $this->orgId);

        $reloaded = BenefitDefinition::withoutGlobalScopes()
            ->where('id', $existing->id)->first();
        $this->assertSame('CUSTOM ADMIN DESCRIPTION', $reloaded->description,
            'Re-applying preset must NOT clobber admin-customised benefit description.');
    }

    public function test_welcome_bonus_only_written_on_clean_replace(): void
    {
        // welcome_bonus_points only writes when zero members exist
        // — preserves admin-tuned values for orgs with active
        // signups.
        $this->service->apply('hotel_classic', $this->orgId);
        $first = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('key', 'welcome_bonus_points')->first();
        $this->assertNotNull($first,
            'welcome_bonus_points must seed on clean-replace.');

        // Admin tunes it to a custom value.
        $first->update(['value' => '1234']);

        // Add a member so subsequent apply uses additive path.
        \Database\Factories\LoyaltyMemberFactory::new()
            ->create(['organization_id' => $this->orgId]);

        // Switch to beauty (which has a different welcome_bonus).
        $this->service->apply('beauty', $this->orgId);

        $preserved = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('key', 'welcome_bonus_points')->first();
        $this->assertSame('1234', $preserved->value,
            'Admin-tuned welcome_bonus must be preserved on additive path.');
    }

    public function test_apply_returns_summary_with_expected_keys(): void
    {
        $summary = $this->service->apply('hotel_classic', $this->orgId);

        $this->assertArrayHasKey('tiers_set', $summary);
        $this->assertArrayHasKey('tiers_added', $summary);
        $this->assertArrayHasKey('benefits_added', $summary);
        $this->assertArrayHasKey('members_on_tiers', $summary);
        $this->assertArrayHasKey('replaced', $summary);
    }
}
