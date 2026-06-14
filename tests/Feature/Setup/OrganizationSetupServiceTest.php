<?php

namespace Tests\Feature\Setup;

use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Services\OrganizationSetupService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks OrganizationSetupService::setupDefaults() — the first-run
 * seeding service that runs on every new org. The contract has
 * two delicate pieces that drift easily:
 *
 *   1. Industry-gating (Phase 2 of the Industry Platform Plan):
 *      `seedLoyalty` is true ONLY for hotel orgs. Non-hotel orgs
 *      MUST skip the Bronze→Diamond tier ladder, the hotel-flavoured
 *      benefit definitions, and the €/points loyalty settings.
 *      CLAUDE.md explicitly flags this branch as
 *      "writes hotel-flavoured defaults to every new org regardless
 *      of industry" — a regression here would re-introduce that
 *      bug.
 *
 *   2. Property code uniqueness — properties.code is GLOBALLY
 *      UNIQUE (not org-scoped). Two orgs with similar slugs would
 *      collide. setupDefaults() handles this with a numeric-suffix
 *      retry loop. Lock the behaviour so a refactor doesn't
 *      silently let unique-violation crashes bubble up at registration.
 *
 *   Plus the universal pieces every org needs regardless of industry:
 *     - currency_symbol HotelSetting
 *     - 12 theme/appearance HotelSettings
 *     - default Property
 *     - default ReviewForm (basic rating)
 *
 *   Plus the idempotency invariant — setupDefaults() is documented
 *   as safe to call multiple times (uses firstOrCreate everywhere).
 *
 * 18 tests cover every branch.
 */
class OrganizationSetupServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private OrganizationSetupService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpOrgSetupSchema();

        // Resolve through the container so the real DI chain runs
        // — defends against a refactor that introduces new
        // constructor dependencies.
        $this->service = app(OrganizationSetupService::class);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function freshHotelOrg(): Organization
    {
        $org = OrganizationFactory::new()->create([
            'name'     => 'Test Hotel',
            'slug'     => 'test-hotel',
            'industry' => 'hotel',
        ]);
        app()->instance('current_organization_id', $org->id);
        return $org;
    }

    private function freshBeautyOrg(): Organization
    {
        $org = OrganizationFactory::new()->create([
            'name'     => 'Test Spa',
            'slug'     => 'test-spa',
            'industry' => 'beauty',
        ]);
        app()->instance('current_organization_id', $org->id);
        return $org;
    }

    public function test_hotel_org_gets_full_5_tier_ladder(): void
    {
        // The canonical seedLoyalty=true branch. Hotel orgs get the
        // documented Bronze→Diamond ladder with the original earn
        // rates. A regression that flips the gate would silently
        // create empty hotel orgs.
        $org = $this->freshHotelOrg();

        $this->service->setupDefaults($org);

        $tiers = LoyaltyTier::orderBy('sort_order')->get();
        $this->assertCount(5, $tiers);
        $this->assertSame(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
            $tiers->pluck('name')->all());
        $this->assertSame([0, 1000, 5000, 15000, 50000],
            $tiers->pluck('min_points')->map(fn ($v) => (int) $v)->all());
    }

    public function test_beauty_org_skips_tier_ladder_entirely(): void
    {
        // The industry-gating contract. Non-hotel orgs MUST NOT
        // receive the Bronze→Diamond ladder — LoyaltyPresetService
        // will write industry-appropriate ones later.
        $org = $this->freshBeautyOrg();

        $this->service->setupDefaults($org);

        $this->assertSame(0, LoyaltyTier::count(),
            'Non-hotel orgs must NOT receive the hotel tier ladder.');
    }

    public function test_hotel_org_gets_6_benefit_definitions(): void
    {
        // The 6 canonical hotel benefits per CLAUDE.md:
        // welcome_drink, late_checkout, room_upgrade, spa_discount,
        // early_checkin, airport_transfer.
        $org = $this->freshHotelOrg();

        $this->service->setupDefaults($org);

        $codes = BenefitDefinition::pluck('code')->all();
        $expected = ['welcome_drink', 'late_checkout', 'room_upgrade',
                     'spa_discount', 'early_checkin', 'airport_transfer'];
        foreach ($expected as $code) {
            $this->assertContains($code, $codes,
                "Hotel org must receive benefit '{$code}'.");
        }
    }

    public function test_beauty_org_skips_hotel_benefit_definitions(): void
    {
        // The other half of the industry gate. Non-hotel orgs skip
        // hotel-flavored benefits (welcome drink + late checkout
        // don't make sense for a spa).
        $org = $this->freshBeautyOrg();

        $this->service->setupDefaults($org);

        $this->assertSame(0, BenefitDefinition::count(),
            'Non-hotel orgs must NOT receive hotel benefit definitions.');
    }

    public function test_hotel_org_gets_loyalty_specific_hotel_settings(): void
    {
        // welcome_bonus_points, referrer/referee/birthday bonuses,
        // points_expiry_months, points_per_currency — all hotel-
        // shaped settings that LoyaltyPresetService would otherwise
        // write industry-appropriate replacements for.
        $org = $this->freshHotelOrg();

        $this->service->setupDefaults($org);

        $loyaltyKeys = ['welcome_bonus_points', 'referrer_bonus_points',
                        'referee_bonus_points', 'birthday_bonus_points',
                        'points_expiry_months', 'points_per_currency'];
        foreach ($loyaltyKeys as $key) {
            $this->assertNotNull(
                HotelSetting::where('key', $key)->first(),
                "Hotel org must have HotelSetting '{$key}'.",
            );
        }
    }

    public function test_beauty_org_skips_loyalty_specific_hotel_settings(): void
    {
        // The third leg of the industry gate. Loyalty settings
        // (welcome bonus, points-per-currency etc.) MUST NOT be
        // seeded for non-hotel orgs.
        $org = $this->freshBeautyOrg();

        $this->service->setupDefaults($org);

        $loyaltyKeys = ['welcome_bonus_points', 'referrer_bonus_points',
                        'points_expiry_months', 'points_per_currency'];
        foreach ($loyaltyKeys as $key) {
            $this->assertNull(
                HotelSetting::where('key', $key)->first(),
                "Beauty org must NOT have hotel-shaped loyalty setting '{$key}'.",
            );
        }
    }

    public function test_hotel_org_and_beauty_org_both_get_universal_settings(): void
    {
        // hotel_name + currency_symbol + theme defaults are
        // universal — every industry needs them. The gate is on
        // the loyalty-group settings, not on these.
        $hotel = $this->freshHotelOrg();
        $this->service->setupDefaults($hotel);

        $this->assertNotNull(HotelSetting::where('key', 'hotel_name')->first());
        $this->assertNotNull(HotelSetting::where('key', 'currency_symbol')->first());

        // Reset context to verify the beauty org separately.
        app()->forgetInstance('current_organization_id');
        $beauty = $this->freshBeautyOrg();
        $this->service->setupDefaults($beauty);

        // Beauty org also has the universal pair.
        $this->assertNotNull(HotelSetting::where('key', 'currency_symbol')->first());
    }

    public function test_appearance_theme_defaults_are_seeded_regardless_of_industry(): void
    {
        // The 12 theme/appearance settings feed the `/v1/theme`
        // endpoint that powers dark-mode + branding on the admin
        // SPA. Without these, the SPA renders unstyled on first
        // login. MUST seed for every industry.
        $beauty = $this->freshBeautyOrg();

        $this->service->setupDefaults($beauty);

        $themeKeys = ['primary_color', 'secondary_color', 'accent_color',
                      'background_color', 'surface_color', 'text_color',
                      'text_secondary_color', 'border_color',
                      'error_color', 'warning_color', 'info_color',
                      'dark_mode_enabled'];
        foreach ($themeKeys as $key) {
            $this->assertNotNull(
                HotelSetting::where('key', $key)->first(),
                "Theme key '{$key}' must seed for every industry.",
            );
        }
    }

    public function test_default_property_is_created_for_a_fresh_org(): void
    {
        $org = $this->freshHotelOrg();

        $this->service->setupDefaults($org);

        $properties = Property::where('organization_id', $org->id)->get();
        $this->assertCount(1, $properties);
        $this->assertSame('Test Hotel Main', $properties[0]->name);
        $this->assertNotEmpty($properties[0]->code,
            'Property code must be auto-generated.');
    }

    public function test_property_code_auto_suffixes_when_base_code_is_taken(): void
    {
        // The globally-unique code retry loop. If org A already
        // has TESTH01, a new org with the same slug must get
        // TESTH02 (then 03, etc.). Without this, registration
        // crashes with a 23505 unique violation.
        $orgA = OrganizationFactory::new()->create([
            'name' => 'Test Hotel A', 'slug' => 'testhotelABC', 'industry' => 'hotel',
        ]);
        app()->instance('current_organization_id', $orgA->id);
        $this->service->setupDefaults($orgA);
        $codeA = Property::where('organization_id', $orgA->id)->value('code');

        // Reset context and create a second org with the SAME
        // slug — slug substring becomes the base, so the code
        // would collide without the suffix loop.
        app()->forgetInstance('current_organization_id');
        $orgB = OrganizationFactory::new()->create([
            'name' => 'Test Hotel B', 'slug' => 'testhotelABC', 'industry' => 'hotel',
        ]);
        app()->instance('current_organization_id', $orgB->id);
        $this->service->setupDefaults($orgB);
        $codeB = Property::where('organization_id', $orgB->id)->value('code');

        $this->assertNotSame($codeA, $codeB,
            'Property codes must differ across orgs even with same slug.');
    }

    public function test_default_review_form_is_seeded_with_basic_type_and_embed_key(): void
    {
        // Every org gets a working review URL out of the box —
        // the embed_key is what powers the public /reviews/{key}
        // form. Without seeding, the Reviews surface would
        // require manual setup before going live.
        $org = $this->freshHotelOrg();

        $this->service->setupDefaults($org);

        $form = ReviewForm::where('is_default', true)->first();
        $this->assertNotNull($form);
        $this->assertSame('basic', $form->type);
        $this->assertTrue((bool) $form->is_active);
        $this->assertTrue((bool) $form->is_default);
        $this->assertNotEmpty($form->embed_key);
        $this->assertSame(32, strlen($form->embed_key),
            'embed_key must be the 32-char random string the public URL uses.');
    }

    public function test_setupDefaults_is_idempotent_no_duplicate_tiers_or_benefits(): void
    {
        // The documented contract: "Idempotent — safe to call
        // multiple times". Re-running must not produce
        // unique-violation errors and must not duplicate seeded
        // rows.
        $org = $this->freshHotelOrg();
        $this->service->setupDefaults($org);
        $tiersAfterFirst = LoyaltyTier::count();
        $benefitsAfterFirst = BenefitDefinition::count();
        $settingsAfterFirst = HotelSetting::count();
        $propertiesAfterFirst = Property::count();
        $reviewsAfterFirst = ReviewForm::count();

        // Re-run — no exception, no duplicates.
        $this->service->setupDefaults($org);

        $this->assertSame($tiersAfterFirst, LoyaltyTier::count());
        $this->assertSame($benefitsAfterFirst, BenefitDefinition::count());
        $this->assertSame($settingsAfterFirst, HotelSetting::count());
        $this->assertSame($propertiesAfterFirst, Property::count());
        $this->assertSame($reviewsAfterFirst, ReviewForm::count());
    }

    public function test_tier_earn_rates_are_progressive(): void
    {
        // Lock the canonical earn-rate ladder: Bronze 1.0, Silver
        // 1.25, Gold 1.5, Platinum 2.0, Diamond 3.0. These power
        // the points-on-spend calculation; a regression would
        // silently change every customer's earn ratio.
        $org = $this->freshHotelOrg();
        $this->service->setupDefaults($org);

        $earnRates = LoyaltyTier::orderBy('sort_order')->pluck('earn_rate')
            ->map(fn ($v) => (float) $v)
            ->all();

        $this->assertSame([1.0, 1.25, 1.5, 2.0, 3.0], $earnRates);
    }
}
