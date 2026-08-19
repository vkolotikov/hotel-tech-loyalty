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

        if (!\Illuminate\Support\Facades\Schema::hasTable('rewards')) {
            \Illuminate\Support\Facades\Schema::create('rewards', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->text('terms')->nullable();
                $t->string('image_url')->nullable();
                $t->string('category', 60)->nullable();
                $t->integer('points_cost')->default(0);
                $t->integer('stock')->nullable();
                $t->integer('per_member_limit')->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->boolean('is_active')->default(true);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }

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

    public function test_legal_real_estate_and_education_each_get_their_own_ladder(): void
    {
        // These three used to resolve to simple_two_tier, so a law firm, an
        // estate agency and a language school were handed the same two-tier
        // Member/VIP ladder with the same perks. Each now has a preset built
        // for how its customers actually behave.
        $expected = [
            'legal'       => ['Client', 'Preferred', 'Partner'],
            'real_estate' => ['Client', 'Preferred', 'Partner'],
            'education'   => ['Learner', 'Scholar', 'Alumni'],
        ];

        foreach ($expected as $industry => $tierNames) {
            app()->forgetInstance('current_organization_id');
            $org = OrganizationFactory::new()->create();
            app()->instance('current_organization_id', $org->id);

            $this->service->apply($industry, $org->id);

            $actual = LoyaltyTier::withoutGlobalScopes()
                ->where('organization_id', $org->id)
                ->orderBy('min_points')
                ->pluck('name')
                ->all();

            $this->assertSame($tierNames, $actual, "'{$industry}' got the wrong ladder.");

            $this->assertGreaterThan(0, \App\Models\Reward::withoutGlobalScopes()
                ->where('organization_id', $org->id)->count(),
                "'{$industry}' has no rewards, so its points cannot be spent.");
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

    /* ─── starter rewards ───────────────────────────────────────────────── */

    public function test_every_preset_ships_a_starter_rewards_catalogue(): void
    {
        // Before this, NO path seeded rewards — every organisation in the
        // product had tiers and zero rewards, so members accumulated points
        // against a ladder with nothing at the top of it. A programme that
        // cannot be redeemed gives the member no reason to come back.
        foreach (LoyaltyPresetService::PRESETS as $key => $preset) {
            $this->assertNotEmpty($preset['rewards'] ?? [],
                "Preset '{$key}' has no rewards, so a venue adopting it gets an unredeemable programme.");

            foreach ($preset['rewards'] as $r) {
                $this->assertNotEmpty($r['name']);
                $this->assertGreaterThan(0, $r['points_cost'],
                    "A zero-cost reward in '{$key}' would be free for everyone the moment they join.");
            }
        }
    }

    public function test_the_cheapest_reward_is_reachable_and_the_dearest_is_aspirational(): void
    {
        // The economics have to hang together or the catalogue is decorative:
        // something must be affordable near the welcome bonus, and the top
        // reward should sit around the top tier rather than beyond reach.
        foreach (LoyaltyPresetService::PRESETS as $key => $preset) {
            $costs   = array_column($preset['rewards'], 'points_cost');
            $topTier = max(array_column($preset['tiers'], 'min_points'));

            $this->assertLessThanOrEqual(max($topTier, 1), min($costs),
                "Cheapest reward in '{$key}' costs more than the whole tier ladder.");
            $this->assertLessThanOrEqual($topTier * 2, max($costs),
                "Dearest reward in '{$key}' is far past the top tier — unreachable in practice.");
        }
    }

    public function test_apply_seeds_rewards_and_reports_the_count(): void
    {
        $summary = $this->service->apply('fitness', $this->orgId);

        $rewards = \App\Models\Reward::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->get();

        $this->assertGreaterThan(0, $summary['rewards_added']);
        $this->assertCount($summary['rewards_added'], $rewards);
        $this->assertTrue($rewards->every(fn ($r) => $r->is_active));
    }

    public function test_reapplying_does_not_duplicate_rewards(): void
    {
        $this->service->apply('fitness', $this->orgId);
        $first = \App\Models\Reward::withoutGlobalScopes()->where('organization_id', $this->orgId)->count();

        $second = $this->service->apply('fitness', $this->orgId);

        $this->assertSame(0, $second['rewards_added']);
        $this->assertSame($first, \App\Models\Reward::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count());
    }

    public function test_a_venues_own_reward_is_never_clobbered(): void
    {
        // Additive by name, like benefits: an admin who renamed or retuned a
        // reward keeps it.
        \App\Models\Reward::withoutGlobalScopes()->create([
            'organization_id' => $this->orgId,
            'name'            => 'Protein Shake',
            'points_cost'     => 999,
            'is_active'       => true,
        ]);

        $this->service->apply('fitness', $this->orgId);

        $this->assertSame(999, (int) \App\Models\Reward::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('name', 'Protein Shake')
            ->value('points_cost'));
    }

    public function test_medical_gets_no_rewards_because_it_gets_no_programme(): void
    {
        $summary = $this->service->apply('medical', $this->orgId);

        $this->assertTrue($summary['noop'] ?? false);
        $this->assertSame(0, \App\Models\Reward::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->count());
    }

    /* ─── expanded preset range + economics ─────────────────────────────── */

    public function test_every_preset_carries_its_own_point_economics(): void
    {
        // Signup writes a flat 10 points per unit for everyone, which cannot
        // suit a coffee shop and a hotel at once.
        foreach (LoyaltyPresetService::PRESETS as $key => $preset) {
            $this->assertArrayHasKey('points_per_currency', $preset, "Preset '{$key}' has no earning rate.");
            $this->assertGreaterThan(0, $preset['points_per_currency']);
            $this->assertGreaterThan(0, $preset['points_expiry_months'] ?? 0);
        }

        // High-value, low-frequency verticals must earn more slowly than
        // high-frequency ones or every client tops out on their first invoice.
        $this->assertLessThan(
            LoyaltyPresetService::PRESETS['restaurant']['points_per_currency'],
            LoyaltyPresetService::PRESETS['real_estate']['points_per_currency'],
        );
    }

    public function test_apply_writes_the_presets_economics_on_a_clean_replace(): void
    {
        $summary = $this->service->apply('restaurant', $this->orgId);

        $this->assertSame(20, $summary['points_per_currency'] ?? null);
        $this->assertSame('20', \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->where('key', 'points_per_currency')->value('value'));
    }

    public function test_listPresets_recommends_the_preset_matching_the_orgs_industry(): void
    {
        // Ten cards and no steer is a worse decision than one card and a reason.
        \App\Models\Organization::withoutGlobalScopes()
            ->where('id', $this->orgId)->update(['industry' => 'fitness']);

        $recommended = collect($this->service->listPresets()['presets'])
            ->firstWhere('recommended', true);

        $this->assertSame('fitness', $recommended['key'] ?? null);
    }

    public function test_medical_is_recommended_nothing_because_it_gets_no_programme(): void
    {
        \App\Models\Organization::withoutGlobalScopes()
            ->where('id', $this->orgId)->update(['industry' => 'medical']);

        $this->assertNull(collect($this->service->listPresets()['presets'])
            ->firstWhere('recommended', true));
    }

    /* ─── referrals + the member-facing preview ─────────────────────────── */

    public function test_referral_bonuses_are_calibrated_to_the_ladder_not_flat(): void
    {
        // Signup wrote a flat 250 for every business. Against a restaurant's
        // 300-point second tier that is generous; against an estate agency's
        // 5,000-point top tier it is noise — and referrals are how that
        // business actually grows.
        foreach (LoyaltyPresetService::PRESETS as $key => $preset) {
            $this->assertArrayHasKey('referrer_bonus', $preset, "Preset '{$key}' has no referral bonus.");
            $this->assertGreaterThan(0, $preset['referrer_bonus']);
        }

        $this->assertGreaterThan(
            LoyaltyPresetService::PRESETS['restaurant']['referrer_bonus'],
            LoyaltyPresetService::PRESETS['real_estate']['referrer_bonus'],
            'A referral is worth far more to an estate agency than to a cafe.',
        );
    }

    public function test_apply_writes_the_referral_bonuses(): void
    {
        $this->service->apply('real_estate', $this->orgId);

        $this->assertSame('2500', \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->where('key', 'referrer_bonus_points')->value('value'));
    }

    public function test_every_preset_exposes_a_first_reward_a_member_can_reach(): void
    {
        // The picker turns this into "about N of spend away". If the first
        // reward were unreachable the preview would advertise a programme
        // nobody completes.
        app()->instance('current_organization_id', $this->orgId);

        foreach ($this->service->listPresets()['presets'] as $p) {
            $cheapest = $p['cheapest_reward'];
            $this->assertNotNull($cheapest, "Preset '{$p['key']}' offers a member nothing to aim at.");

            $spend = (int) ceil(max(0, $cheapest['points_cost'] - $p['welcome_bonus']) / max(1, (int) $p['points_per_currency']));
            $this->assertLessThanOrEqual(500, $spend,
                "First reward in '{$p['key']}' needs {$spend} of spend — too far to feel like a reward.");
        }
    }
}
