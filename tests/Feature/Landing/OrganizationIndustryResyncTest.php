<?php
namespace Tests\Feature\Landing;

use App\Models\Brand;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\Property;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * landing_pages.industry is a creation-time snapshot (see
 * LandingOnboardingService::newPageIndustry() and PageContent::for(),
 * which reads $page->industry rather than the org's live value) — nothing
 * re-derives it. An org that corrects its industry (a live production case:
 * "Hexa Academy", an education business whose unset industry resolved to
 * the platform default 'hotel') otherwise keeps every page speaking the
 * old industry's vocabulary, wrong schema.org subtype and, since the
 * booking-gate round, a hotel booking widget on a non-hotel page — with no
 * in-product way to fix it short of deleting the page.
 *
 * Organization::booted()'s `updated` hook is the fix: it re-syncs every
 * landing page under an org whenever `industry` changes, without touching
 * any of the three writers of `org->industry` (AuthController's
 * apply-industry + signup-backfill paths, SaasAuthMiddleware's JWT sync).
 */
class OrganizationIndustryResyncTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function org(array $attrs = []): Organization
    {
        return OrganizationFactory::new()->create($attrs);
    }

    /**
     * Organization::booted()'s OWN `created` hook already bootstraps a
     * default brand for every new org — see that hook's docblock and the
     * environment note against hand-inserting a second `is_default` row.
     * Fetch it rather than creating one.
     *
     * withoutGlobalScopes(): Brand carries BelongsToOrganization's
     * TenantScope, which fails CLOSED (`1 = 0`) with no tenant context
     * bound — and nothing in this test binds one, same as the fixtures in
     * RuledPageSectionsTest / RuledPageRenderTest. A plain where() here
     * would silently match zero rows rather than the row the `created`
     * hook just wrote.
     */
    private function defaultBrand(Organization $org): Brand
    {
        return Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)->where('is_default', true)->firstOrFail();
    }

    private function extraBrand(Organization $org, string $name): Brand
    {
        return Brand::create([
            'organization_id' => $org->id, 'name' => $name, 'is_default' => false, 'sort_order' => 1,
        ]);
    }

    private function page(Organization $org, Brand $brand, string $slug, string $industry): LandingPage
    {
        return LandingPage::create([
            'organization_id' => $org->id, 'brand_id' => $brand->id, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => $industry, 'status' => 'draft',
        ]);
    }

    // ── 1. every brand's page follows the org ───────────────────────────

    public function test_changing_org_industry_resyncs_every_brands_landing_page(): void
    {
        $org = $this->org(['industry' => 'hotel']);
        $brandA = $this->defaultBrand($org);
        $brandB = $this->extraBrand($org, 'Second Brand');

        $pageA = $this->page($org, $brandA, 'brand-a-page', 'hotel');
        $pageB = $this->page($org, $brandB, 'brand-b-page', 'hotel');

        $org->update(['industry' => 'education']);

        $this->assertSame('education', $pageA->fresh()->industry);
        $this->assertSame('education', $pageB->fresh()->industry);
    }

    // ── 2. no write when industry itself is untouched ───────────────────

    /**
     * plan_features is rewritten on effectively every request by the
     * entitlement sync (SaasAuthMiddleware) — a hot path. Asserted via
     * DB::listen rather than "the stored value didn't change", because an
     * unguarded hook could re-run the identical UPDATE on every save and
     * a value-equality assertion would never catch that.
     */
    public function test_an_update_that_does_not_touch_industry_writes_nothing_to_landing_pages(): void
    {
        $org = $this->org(['industry' => 'hotel']);
        $brand = $this->defaultBrand($org);
        $page = $this->page($org, $brand, 'brand-a-page', 'hotel');

        $touchedLandingPages = false;
        DB::listen(function ($query) use (&$touchedLandingPages) {
            if (str_contains($query->sql, 'landing_pages')) {
                $touchedLandingPages = true;
            }
        });

        $org->update(['plan_features' => ['ai_monthly_cost_cents' => 500]]);

        $this->assertFalse($touchedLandingPages,
            'An org update that never touched industry issued a query against landing_pages.');
        $this->assertSame('hotel', $page->fresh()->industry);
    }

    // ── 3. the stored value is resolved, not raw ─────────────────────────

    /**
     * Organization has no mutator on the raw `industry` column — the alias
     * table only normalises on READ, via resolved_industry (see
     * IndustryResolutionTest for the same claim against the column itself).
     * The synced snapshot must therefore come from resolved_industry, not
     * $org->industry, or a page would start advertising "hospitality" —
     * an id no IndustryProfile entry or schema.org type is keyed on.
     */
    public function test_the_synced_value_is_resolved_industry_so_an_alias_normalises(): void
    {
        $org = $this->org(['industry' => 'hotel']);
        $brand = $this->defaultBrand($org);
        $page = $this->page($org, $brand, 'brand-a-page', 'hotel');

        $org->industry = 'hospitality';
        $org->save();

        $this->assertSame('restaurant', $page->fresh()->industry);
    }

    // ── 4. tenant isolation ──────────────────────────────────────────────

    public function test_another_orgs_landing_pages_are_untouched(): void
    {
        $orgA = $this->org(['industry' => 'hotel']);
        $orgB = $this->org(['industry' => 'hotel']);
        $pageA = $this->page($orgA, $this->defaultBrand($orgA), 'org-a-page', 'hotel');
        $pageB = $this->page($orgB, $this->defaultBrand($orgB), 'org-b-page', 'hotel');

        $orgA->update(['industry' => 'education']);

        $this->assertSame('education', $pageA->fresh()->industry);
        $this->assertSame('hotel', $pageB->fresh()->industry);
    }

    // ── 5. end-to-end: real response bytes before and after ─────────────

    /**
     * The user-facing point of the whole fix. A page published under a
     * hotel-industry org carries the hotel booking band and "Book your
     * stay"; correcting the ORG's industry to 'education' must change the
     * SAME published URL's response on the very next request — vocabulary,
     * schema.org subtype, the booking band gone entirely (PageContent::
     * count('booking') gates it to 'hotel' — see that method), and the
     * hero CTA re-pointed at #contact, the honest target hero.blade.php
     * falls back to once #booking no longer exists (see that partial's own
     * comment on the two-part booking/contact check).
     */
    public function test_correcting_org_industry_changes_the_same_published_pages_response(): void
    {
        $org = $this->org(['industry' => 'hotel']);
        $brand = $this->defaultBrand($org);

        $page = LandingPage::create([
            'organization_id' => $org->id, 'brand_id' => $brand->id, 'slug' => 'the-academy',
            'template_key' => 'ruled_page', 'industry' => $org->resolved_industry, 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'Hexa Academy']],
        ]);
        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }
        Property::create([
            'organization_id' => $org->id, 'brand_id' => $brand->id, 'name' => 'Hexa Academy',
            'phone' => '+371 20000000', 'address' => '1 Main St', 'city' => 'Riga',
            'country' => 'Latvia', 'is_active' => true,
        ]);
        \App\Models\Service::create(['organization_id' => $org->id, 'name' => 'Algebra 101', 'is_active' => true]);

        $url = 'http://' . config('landing.host') . '/the-academy';

        $before = $this->get($url)->getContent();
        $this->assertStringContainsString('data-section="booking"', $before);
        $this->assertStringContainsString('Book your stay', $before);
        $this->assertStringContainsString('"@type":"Hotel"', $before);
        $this->assertStringContainsString('Rooms &amp; Suites', $before);

        $org->update(['industry' => 'education']);

        $after = $this->get($url)->getContent();

        // Vocabulary: education's servicesLabel ("Courses"), never hotel's
        // ("Rooms & Suites").
        $this->assertStringContainsString('Courses', $after);
        $this->assertStringNotContainsString('Rooms &amp; Suites', $after);

        // schema.org subtype.
        $this->assertStringContainsString('"@type":"EducationalOrganization"', $after);
        $this->assertStringNotContainsString('"@type":"Hotel"', $after);

        // The booking band is gone entirely — not merely re-labelled —
        // education is not in IndustryProfile's booking-eligible set.
        $this->assertStringNotContainsString('data-section="booking"', $after);
        $this->assertStringNotContainsString('id="booking"', $after);
        $this->assertStringNotContainsString('Book your stay', $after);

        // The hero CTA falls back to the contact band, the one target that
        // still exists on this page.
        $this->assertStringContainsString('<a class="rp-cta" href="#contact">', $after);
    }
}
