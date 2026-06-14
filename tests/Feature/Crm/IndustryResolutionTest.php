<?php

namespace Tests\Feature\Crm;

use App\Models\CrmSetting;
use App\Models\Organization;
use App\Services\CrmAiService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the industry resolution chain — the foundational signal
 * every Phase 7 industry-aware AI prompt builder reads from.
 *
 * Two surfaces tested together:
 *
 *   1. Organization::getResolvedIndustryAttribute() — the actual
 *      resolver. Tier 1 = canonical `industry` column. Tier 2 =
 *      legacy `crm_settings.industry_preset`. Tier 3 = 'hotel'
 *      default.
 *
 *   2. CrmAiService::resolveIndustry() — the thin wrapper that
 *      finds the current org (Auth user → bound context → null)
 *      and delegates to the model accessor.
 *
 * Invariants (per Organization.php docstring):
 *
 *   - resolved_industry NEVER returns null — DEFAULT_INDUSTRY
 *     ('hotel') is the always-safe fallback
 *   - Tier 1 (`industry` column) wins over Tier 2 (crm_settings)
 *   - Industry aliases ('hospitality') normalise to canonical
 *     ('restaurant')
 *   - Invalid / unknown industry strings fall through to null →
 *     DEFAULT_INDUSTRY
 *   - hasExplicitIndustry distinguishes 'real choice' from
 *     'defaulting to hotel' — for the Phase 4 mismatch banner
 *
 * resolveIndustry uses ReflectionMethod (private). Pure-function
 * tests on normaliseIndustry + INDUSTRIES const.
 */
class IndustryResolutionTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private CrmAiService $service;
    private ReflectionMethod $resolveIndustryRef;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // industry column + crm_settings table for legacy fallback.
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', function ($t) {
                $t->string('industry', 32)->nullable();
            });
        }
        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'key']);
            });
        }
        // Brands for Organization::created hook.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        $this->service = new CrmAiService();
        $this->resolveIndustryRef = new ReflectionMethod($this->service, 'resolveIndustry');
        $this->resolveIndustryRef->setAccessible(true);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── Organization::DEFAULT_INDUSTRY constant ─── */

    public function test_default_industry_is_hotel(): void
    {
        // CRITICAL: hotel is the safe fallback for unseeded orgs.
        // Pre-Phase-1 every code path assumed hotel; changing the
        // default would silently break back-compat for existing
        // hotel tenants.
        $this->assertSame('hotel', Organization::DEFAULT_INDUSTRY);
    }

    public function test_canonical_industries_list_matches_documented_set(): void
    {
        // Lock the 8 supported industries. New industry added →
        // this test catches it and forces the contributor to
        // confirm all downstream code paths.
        $this->assertSame(
            ['hotel', 'beauty', 'medical', 'restaurant',
             'legal', 'real_estate', 'education', 'fitness'],
            Organization::INDUSTRIES,
        );
    }

    public function test_gtm_industries_are_the_four_with_polished_kpis(): void
    {
        // GTM_INDUSTRIES drives Phase 6 KPIs, Phase 8 email
        // partials, Phase 9 mobile theming. Lock the four.
        $this->assertSame(
            ['hotel', 'beauty', 'medical', 'restaurant'],
            Organization::GTM_INDUSTRIES,
        );
    }

    /* ─── normaliseIndustry — alias map ─── */

    public function test_hospitality_alias_normalises_to_restaurant(): void
    {
        // The documented alias: 'hospitality' is the SaaS-side
        // "natural" id that historically appeared in some signup
        // forms. MUST map to 'restaurant' (the canonical id).
        $this->assertSame('restaurant',
            Organization::normaliseIndustry('hospitality'));
    }

    public function test_normaliseIndustry_passes_through_canonical_ids(): void
    {
        foreach (Organization::INDUSTRIES as $id) {
            $this->assertSame($id, Organization::normaliseIndustry($id),
                "Canonical industry '{$id}' MUST pass through unchanged.");
        }
    }

    public function test_normaliseIndustry_returns_null_for_unknown(): void
    {
        // Unknown / typo IDs MUST return null so the resolver
        // falls through to the next tier (NOT silently accept).
        $this->assertNull(Organization::normaliseIndustry('extraterrestrial_lodging'));
        $this->assertNull(Organization::normaliseIndustry('HOTEL')); // case-sensitive
    }

    public function test_normaliseIndustry_returns_null_for_empty_or_null(): void
    {
        $this->assertNull(Organization::normaliseIndustry(null));
        $this->assertNull(Organization::normaliseIndustry(''));
    }

    /* ─── Tier 1: industry column ─── */

    public function test_org_with_industry_column_set_returns_that_industry(): void
    {
        // The canonical resolution path.
        $org = OrganizationFactory::new()->create(['industry' => 'beauty']);

        $this->assertSame('beauty', $org->resolved_industry,
            'industry column MUST drive resolution (Tier 1).');
    }

    public function test_industry_column_alias_normalises_at_read_time(): void
    {
        // Even if a SaaS tool wrote 'hospitality' directly to the
        // column (bypassing the Phase 2 normaliser), the accessor
        // MUST still normalise on read so the prompt builder sees
        // 'restaurant'.
        $org = OrganizationFactory::new()->create();
        // Write directly to bypass any normalisation in fillable.
        \DB::table('organizations')->where('id', $org->id)
            ->update(['industry' => 'hospitality']);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertSame('restaurant', $fresh->resolved_industry,
            'Aliased industry value MUST normalise to canonical on read.');
    }

    /* ─── Tier 2: legacy crm_settings.industry_preset ─── */

    public function test_legacy_crm_setting_drives_resolution_when_industry_null(): void
    {
        // The Phase 2 backwards-compat path. Orgs that pre-date the
        // `industry` column carry their industry in
        // crm_settings.industry_preset. The accessor falls through
        // when the column is null and surfaces the legacy value.
        $org = OrganizationFactory::new()->create(['industry' => null]);
        app()->instance('current_organization_id', $org->id);

        CrmSetting::create([
            'organization_id' => $org->id,
            'key'             => 'industry_preset',
            'value'           => 'medical',
        ]);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertSame('medical', $fresh->resolved_industry,
            'Tier 2 (crm_settings.industry_preset) MUST drive resolution when industry column is null.');
    }

    public function test_tier_1_industry_column_wins_over_tier_2_crm_setting(): void
    {
        // Precedence: column always wins. A column write replaces
        // the legacy crm_setting; the resolver MUST NOT fall back
        // to the older value.
        $org = OrganizationFactory::new()->create(['industry' => 'beauty']);
        app()->instance('current_organization_id', $org->id);

        CrmSetting::create([
            'organization_id' => $org->id,
            'key'             => 'industry_preset',
            'value'           => 'medical',  // conflicting legacy
        ]);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertSame('beauty', $fresh->resolved_industry,
            'CRITICAL: industry column MUST win over crm_settings.');
    }

    /* ─── Tier 3: 'hotel' default ─── */

    public function test_org_with_no_industry_and_no_crm_setting_returns_hotel_default(): void
    {
        // The safe fallback. Unseeded org MUST get 'hotel'.
        $org = OrganizationFactory::new()->create(['industry' => null]);
        app()->instance('current_organization_id', $org->id);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertSame('hotel', $fresh->resolved_industry,
            'Unseeded org MUST default to hotel.');
    }

    public function test_invalid_industry_column_falls_through_to_hotel(): void
    {
        // A column carrying an invalid id (data corruption, prod
        // outage during migration) MUST NOT crash — fall through
        // to the safe default.
        $org = OrganizationFactory::new()->create();
        \DB::table('organizations')->where('id', $org->id)
            ->update(['industry' => 'invalid_garbage_id']);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertSame('hotel', $fresh->resolved_industry,
            'Unknown industry id MUST fall through to default (no crash).');
    }

    /* ─── hasExplicitIndustry — Phase 4 mismatch banner ─── */

    public function test_hasExplicitIndustry_true_when_column_set(): void
    {
        $org = OrganizationFactory::new()->create(['industry' => 'beauty']);

        $this->assertTrue($org->hasExplicitIndustry());
    }

    public function test_hasExplicitIndustry_true_for_alias_value(): void
    {
        // 'hospitality' is an explicit choice even though it
        // normalises to 'restaurant'.
        $org = OrganizationFactory::new()->create();
        \DB::table('organizations')->where('id', $org->id)
            ->update(['industry' => 'hospitality']);

        $fresh = Organization::withoutGlobalScopes()->find($org->id);
        $this->assertTrue($fresh->hasExplicitIndustry(),
            'Alias value counts as explicit choice.');
    }

    public function test_hasExplicitIndustry_false_when_column_null(): void
    {
        // CRITICAL: distinguishes 'real choice' from 'defaulting'.
        // Phase 4 banner should NOT prompt an org that hasn't
        // picked yet — it should silently apply the sub-domain-
        // detected industry.
        $org = OrganizationFactory::new()->create(['industry' => null]);

        $this->assertFalse($org->hasExplicitIndustry(),
            'Null industry MUST NOT count as explicit (no banner prompt).');
    }

    /* ─── CrmAiService::resolveIndustry private method ─── */

    public function test_crm_ai_resolveIndustry_returns_hotel_default_when_no_org_bound(): void
    {
        // No Auth user + no bound context → DEFAULT_INDUSTRY.
        // Cron / queue / public surface paths hit this.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }

        $industry = $this->resolveIndustryRef->invoke($this->service);

        $this->assertSame('hotel', $industry,
            'No org context MUST yield DEFAULT_INDUSTRY (hotel).');
    }

    public function test_crm_ai_resolveIndustry_reads_bound_container_orgId(): void
    {
        // The standard server path — TenantMiddleware bound the
        // org. resolveIndustry MUST find it.
        $org = OrganizationFactory::new()->create(['industry' => 'beauty']);
        app()->instance('current_organization_id', $org->id);

        $industry = $this->resolveIndustryRef->invoke($this->service);

        $this->assertSame('beauty', $industry);
    }

    public function test_crm_ai_resolveIndustry_falls_to_hotel_for_unknown_orgId(): void
    {
        // Defensive: orgId bound but the row doesn't exist (rare
        // — torn-down org, stale binding). MUST fall through to
        // hotel rather than crash.
        app()->instance('current_organization_id', 999999999);

        $industry = $this->resolveIndustryRef->invoke($this->service);

        $this->assertSame('hotel', $industry,
            'Unknown orgId MUST fall through to hotel.');
    }
}
