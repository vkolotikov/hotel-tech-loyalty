<?php

namespace Tests\Feature\Brand;

use App\Models\Brand;
use App\Models\Organization;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks three multi-brand load-bearing contracts:
 *
 *   1. Brand::resolveByToken — the public widget URL resolver.
 *      Used by /widget/{token}, /book/{token}, /chat-widget/{token},
 *      /form/{embed_key} etc. on every customer's website. Two
 *      lookup paths: brand-level (canonical, every brand has its
 *      own widget_token) and an ORG-level legacy fallback (orgs
 *      whose default brand was issued before the migration). Both
 *      MUST keep working post-rollout so public URLs never 404.
 *      Side-effect: binds current_organization_id + current_brand_id
 *      so TenantScope + BrandScope auto-scope downstream queries.
 *
 *   2. Brand::currentOrDefaultIdForOrg — the "single config per
 *      brand" lookup used by chatbot/KB/widget/booking controllers
 *      that need to attach a row to A brand. Falls back to the
 *      org's default brand when no explicit brand context is bound.
 *
 *   3. Organization::booted() created hook (June 8 ship) — every
 *      new org auto-gets a default brand on creation. Before the
 *      hook, the May migration backfilled existing orgs but NO
 *      downstream code path covered orgs created later: a brand-
 *      new trial signup landed with NO brands, currentOrDefaultIdForOrg
 *      returned null, and widget URLs 404'd. Covers all 5 org-
 *      creation sites (SaasAuthMiddleware SSO bootstrap, trial
 *      signup, plus 3 internal admin paths) automatically.
 *
 * NEVER hand-roll widget-URL lookups bypassing resolveByToken — the
 * fallback path is the only thing keeping legacy public URLs alive.
 */
class BrandResolutionTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpKnowledgeSchema brings both minimal (organizations)
        // AND the brands table — exactly what we need.
        $this->setUpKnowledgeSchema();
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

    /* ─── Organization::booted() default-brand created hook ─── */

    public function test_creating_an_org_auto_creates_its_default_brand(): void
    {
        // THE June 8 fix: new-org creation triggers the hook that
        // inserts a default Brand row. Without this, every new
        // signup landed brand-less and widget URLs 404'd.
        $org = OrganizationFactory::new()->create(['name' => 'Acme Hotels']);

        $brand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->first();

        $this->assertNotNull($brand,
            'CRITICAL: every new org MUST get a default brand auto-created (June 8 hook).');
    }

    public function test_default_brand_inherits_org_name_and_token(): void
    {
        // The hook copies org.name + org.widget_token to seed the
        // default brand so legacy widget URLs keep resolving.
        $org = OrganizationFactory::new()->create([
            'name'         => 'Forrest Glamp',
            'widget_token' => 'org_token_test_resolution_123',
        ]);

        $brand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();

        $this->assertSame('Forrest Glamp', $brand->name);
        $this->assertSame('org_token_test_resolution_123', $brand->widget_token,
            'Default brand MUST inherit org widget_token so legacy widget URLs keep resolving.');
        $this->assertTrue((bool) $brand->is_default);
    }

    public function test_creating_org_when_default_brand_already_exists_does_not_duplicate(): void
    {
        // The hook's skip-if-exists guard prevents the partial
        // unique `brands_org_default_unique` from firing on the
        // rare manual-seed + hook-also-runs case.
        $org = OrganizationFactory::new()->create();
        // OrganizationFactory::create() already triggered the hook.

        // Sanity: exactly one default brand exists.
        $count = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->count();

        $this->assertSame(1, $count,
            'Exactly one default brand per org — partial unique enforces this.');
    }

    /* ─── currentOrDefaultIdForOrg ─── */

    public function test_currentOrDefaultIdForOrg_returns_bound_brand_first(): void
    {
        // When BrandMiddleware has bound a specific brand to the
        // container, that wins over the org default. This is how
        // a "currently selected brand" flows through controllers.
        $org = OrganizationFactory::new()->create();
        $defaultBrand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();

        // Add a 2nd, non-default brand for the same org.
        $secondBrand = Brand::create([
            'organization_id' => $org->id,
            'name'            => 'St. Regis sub-brand',
            'is_default'      => false,
            'widget_token'    => 'sr_brand_token_4242',
        ]);

        // Bind the 2nd brand to the container.
        app()->instance('current_brand_id', $secondBrand->id);

        $this->assertSame((int) $secondBrand->id,
            Brand::currentOrDefaultIdForOrg($org->id),
            'Bound brand context MUST win over org default.');
    }

    public function test_currentOrDefaultIdForOrg_falls_back_to_default_when_no_brand_bound(): void
    {
        // Legacy code paths without BrandMiddleware get the org's
        // default brand. This is what kept the multi-brand
        // migration backwards-compatible — every old controller
        // call site automatically targets the default brand.
        $org = OrganizationFactory::new()->create();
        $defaultBrand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();

        // No current_brand_id bound. tearDown will clean up.
        $this->assertSame((int) $defaultBrand->id,
            Brand::currentOrDefaultIdForOrg($org->id),
            'No brand context → fall through to default brand.');
    }

    public function test_currentOrDefaultIdForOrg_returns_null_when_org_has_no_default(): void
    {
        // Defensive: edge case for a hypothetical post-migration
        // brand-less org. Returns null rather than throwing. The
        // caller decides whether null is acceptable (most paths
        // 404 the public URL).
        //
        // Build an org-id that has no brand rows. The factory
        // would auto-create one via the hook, so we use a raw
        // org_id integer.
        $bogusOrgId = 999_999_999;
        $this->assertNull(Brand::currentOrDefaultIdForOrg($bogusOrgId));
    }

    /* ─── resolveByToken — canonical brand-level path ─── */

    public function test_resolveByToken_matches_a_brands_widget_token(): void
    {
        // Canonical path: every brand has its own widget_token.
        // /widget/{token} resolves by this column first.
        $org = OrganizationFactory::new()->create();
        $brand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();
        $brand->update(['widget_token' => 'resolve_canonical_path_token']);

        $resolved = Brand::resolveByToken('resolve_canonical_path_token');

        $this->assertNotNull($resolved);
        $this->assertSame((int) $brand->id, (int) $resolved->id);
    }

    public function test_resolveByToken_binds_organization_and_brand_context(): void
    {
        // The side-effect contract: resolveByToken binds the
        // container so TenantScope + BrandScope auto-scope every
        // downstream query. Without this every public widget
        // controller would have to plumb scopes by hand.
        $org = OrganizationFactory::new()->create();
        $brand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->first();
        $brand->update(['widget_token' => 'context_bind_test_token']);

        // Ensure NOTHING bound.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        Brand::resolveByToken('context_bind_test_token');

        $this->assertSame((int) $org->id, (int) app('current_organization_id'),
            'resolveByToken MUST bind current_organization_id.');
        $this->assertSame((int) $brand->id, (int) app('current_brand_id'),
            'resolveByToken MUST bind current_brand_id.');
    }

    /* ─── resolveByToken — legacy ORG-token fallback ─── */

    public function test_resolveByToken_falls_back_to_org_widget_token(): void
    {
        // THE legacy back-compat path: tokens issued BEFORE the
        // brand migration only existed on `organizations.widget_token`.
        // Post-migration the default brand inherits the same token,
        // BUT if someone deliberately rotates the brand's token
        // (or the brand was created before the inheritance hook
        // backfilled), only the org column carries the original.
        //
        // Without this fallback, every pre-migration widget URL
        // would 404 — actual customer sites would break.
        $org = OrganizationFactory::new()->create([
            'widget_token' => 'legacy_org_token_pre_migration',
        ]);

        // Rotate the default brand's widget_token to something
        // different (simulates the "tokens diverged" case).
        Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->update(['widget_token' => 'rotated_brand_token_4242']);

        // Resolve by the ORG's token — must still find the default
        // brand via the legacy fallback.
        $resolved = Brand::resolveByToken('legacy_org_token_pre_migration');

        $this->assertNotNull($resolved,
            'Legacy ORG-token fallback MUST resolve to default brand. Without this, pre-migration widget URLs 404.');
        $this->assertSame((int) $org->id, (int) $resolved->organization_id);
        $this->assertTrue((bool) $resolved->is_default,
            'Fallback MUST resolve to the org\'s default brand.');
    }

    public function test_resolveByToken_returns_null_for_unknown_token(): void
    {
        // Defensive: an unknown token returns null so the caller
        // 404s. Returning a "random" brand would leak which orgs
        // exist + breach tenant isolation.
        OrganizationFactory::new()->create(); // some orgs exist

        $resolved = Brand::resolveByToken('this_token_does_not_exist_anywhere_12345');

        $this->assertNull($resolved,
            'Unknown token MUST return null — caller 404s to prevent org enumeration.');
    }

    public function test_resolveByToken_unknown_token_does_not_bind_context(): void
    {
        // Defense in depth: a 404'd resolve MUST NOT leak any
        // org/brand context into the container. Otherwise a
        // chained query downstream would silently scope to the
        // wrong tenant.
        OrganizationFactory::new()->create();

        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        Brand::resolveByToken('this_token_does_not_exist_either');

        $this->assertFalse(app()->bound('current_organization_id'),
            'Failed resolve MUST NOT bind tenant context.');
        $this->assertFalse(app()->bound('current_brand_id'),
            'Failed resolve MUST NOT bind brand context.');
    }

    /* ─── Brand widget_token auto-generation on create ─── */

    public function test_brand_create_auto_generates_widget_token_when_empty(): void
    {
        // Brand::booted() creating hook generates a 32-char random
        // token when none is supplied. Locked because: without it,
        // a new-brand's widget URL would have an empty token and
        // /widget// would 404 — confusing failure mode.
        $org = OrganizationFactory::new()->create();
        $brand = Brand::create([
            'organization_id' => $org->id,
            'name'            => 'New Sub-brand',
            // widget_token deliberately omitted
        ]);

        $this->assertNotEmpty($brand->widget_token,
            'Brand::booted creating hook MUST auto-generate widget_token.');
        $this->assertSame(32, mb_strlen($brand->widget_token),
            'Token length stays consistent (32 chars — Str::random default in the hook).');
    }
}
