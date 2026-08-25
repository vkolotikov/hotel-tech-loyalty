<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingPageController;
use App\Http\Controllers\Api\V1\Admin\LandingPageSectionController;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The section enable/reorder endpoint, exercised the same way
 * LandingPageAdminApiTest exercises the rest of the builder API: by calling
 * the controller directly rather than over HTTP.
 *
 * Not over HTTP for the same reason given there: reaching this route needs
 * `saas.auth` + Sanctum + `check.subscription` + the entitlement gate, and
 * this repo has no harness for that stack outside LandingPageTeardownTest's
 * one-route exception. What is left for a test to hold here is the
 * controller's own behaviour: a key the page does not own is refused, the
 * tenant scope is what resolves "my page" and nothing wider, and a brand
 * with no page yet gets a 404 rather than a crash.
 */
class LandingPageSectionApiTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private Organization $org;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // brands lives in the content schema, and BelongsToBrand's creating
        // hook queries it on every insert that arrives without a brand.
        $this->setUpLandingContentSchema();

        $this->org  = $this->makeOrg('Glamour');
        $this->user = $this->makeUser($this->org);

        $this->actAs($this->user, $this->defaultBrandId($this->org));
    }

    // ─── Fixtures ────────────────────────────────────────────────────────

    /**
     * A new organisation, with the default brand its own `created` hook
     * makes for it (app/Models/Organization.php:93).
     *
     * The tenant binding is dropped for the duration, and that is not
     * ceremony. That hook creates a Brand, Brand carries
     * BelongsToOrganization, and its `creating` hook FORCES organization_id
     * from the bound tenant -- so creating a second org while the first is
     * bound files the NEW org's default brand under the OLD one. Measured:
     * the bound org ends up with two is_default rows (the state
     * `brands_org_default_unique` forbids) and the new org with none, so
     * defaultBrandId() finds nothing for it and every later lookup resolves
     * some other org's brand. Tests then agree with each other about a world
     * production cannot be in.
     */
    private function makeOrg(string $name, ?string $industry = 'beauty'): Organization
    {
        $bound = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->forgetInstance('current_organization_id');

        try {
            return Organization::create([
                'name'     => $name,
                'slug'     => str()->slug($name) . '-' . uniqid(),
                'industry' => $industry,
            ]);
        } finally {
            if ($bound !== null) {
                app()->instance('current_organization_id', $bound);
            }
        }
    }

    private function makeUser(Organization $org): User
    {
        return User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            'user_type'       => 'staff',
        ]);
    }

    /**
     * The organisation's default brand, which Organization's own `created`
     * hook has already made (app/Models/Organization.php:93).
     *
     * Reused rather than re-inserted, and that is load-bearing rather than
     * tidy: production allows exactly ONE default brand per org --
     * `brands_org_default_unique`, a partial unique index on `deleted_at IS
     * NULL` -- and the sqlite test schema has no partial indexes to enforce
     * it. A fixture that inserted a second default would be a state the
     * database forbids, and it changes which brand
     * LandingPageGuard::currentBrandId() resolves in "All brands" mode --
     * so the tests would agree with each other about a world production
     * cannot be in.
     */
    private function defaultBrandId(Organization $org): int
    {
        $id = DB::table('brands')
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->value('id');

        // Asserted rather than cast. A missing row casts to 0, which binds
        // as `current_brand_id` without complaint and then quietly resolves
        // to whatever LandingPageGuard::currentBrandId()'s orderBy('id')
        // happens to reach -- a passing test standing on an accident.
        $this->assertNotNull($id, 'The organisation has no default brand; its fixture is in a state production forbids.');

        return (int) $id;
    }

    /**
     * An additional, non-default brand of the same org.
     *
     * Inserted directly: Brand's own model hooks rebind the brand context.
     */
    private function makeSiblingBrand(Organization $org): int
    {
        return (int) DB::table('brands')->insertGetId([
            'organization_id' => $org->id,
            'name'            => $org->name . ' Two',
            'is_default'      => false,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    /** Reproduce what TenantMiddleware + BrandMiddleware bind per request. */
    private function actAs(User $user, ?int $brandId): void
    {
        $this->user = $user;
        app()->instance('current_organization_id', $user->organization_id);
        app()->instance('current_brand_id', $brandId);
    }

    /** A page with the industry's default sections, created through the real store() path. */
    private function makePageWithSections(string $slug = 'glamour-salon'): LandingPage
    {
        $body = json_decode(
            (new LandingPageController())->store($this->creationRequest($slug))->getContent(),
            true,
        );

        return LandingPage::with('sections')->findOrFail($body['page']['id']);
    }

    /** A page belonging to a different org entirely, with the same default sections. */
    private function makeOtherOrgPageWithSections(string $slug = 'rival-salon'): LandingPage
    {
        $keepUser  = $this->user;
        $keepBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        $rival = $this->makeOrg('Rival ' . uniqid());
        $this->actAs($this->makeUser($rival), $this->defaultBrandId($rival));

        $page = $this->makePageWithSections($slug);

        $this->actAs($keepUser, $keepBrand);

        return $page;
    }

    private function creationRequest(string $slug): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages', 'POST', [
            'slug' => $slug, 'template_key' => 'ruled_page',
        ]);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    // ─── Plumbing ────────────────────────────────────────────────────────

    private function controller(): LandingPageSectionController
    {
        return new LandingPageSectionController();
    }

    private function request(array $payload): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages/sections', 'PUT', $payload);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    // ─── Tests ───────────────────────────────────────────────────────────

    public function test_it_toggles_a_section_off(): void
    {
        $page = $this->makePageWithSections();

        $res = $this->controller()->update($this->request([
            'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 5]],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'reviews', 'enabled' => false, 'sort' => 5,
        ]);

        // A payload naming only 'reviews' must touch only 'reviews'. Without
        // the per-row `where('key', ...)` scope, `$page->sections()->update()`
        // would write the same enabled/sort onto every section on the page —
        // which the assertion above alone cannot see, because 'reviews' would
        // still land on the values it asks for either way.
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'hero', 'enabled' => true, 'sort' => 0,
        ]);
    }

    public function test_it_refuses_a_key_that_is_not_on_this_page(): void
    {
        $this->makePageWithSections();

        $this->expectException(ValidationException::class);

        $this->controller()->update($this->request([
            'sections' => [['key' => 'not_a_section', 'enabled' => true, 'sort' => 0]],
        ]));
    }

    public function test_it_cannot_touch_another_organizations_sections(): void
    {
        $theirs = $this->makeOtherOrgPageWithSections();
        $this->makePageWithSections();

        $res = $this->controller()->update($this->request([
            'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 0]],
        ]));

        $this->assertSame(200, $res->getStatusCode());

        // Their row is untouched: the tenant scope resolved MY page, not theirs.
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $theirs->id, 'key' => 'reviews', 'enabled' => true,
        ]);
    }

    /**
     * "All brands" mode binds a NULL brand, and BrandScope no-ops on that:
     * a bare LandingPage::first() here matched any page in the org, so this
     * write would have toggled a SIBLING brand's sections while the brand
     * the admin was operating as had no page at all.
     *
     * Same defect the wizard's prefill carried, one layer up and with a
     * write on the end of it.
     */
    public function test_it_does_not_touch_a_sibling_brands_sections_in_all_brands_mode(): void
    {
        $sibling = $this->makeSiblingBrand($this->org);

        $this->actAs($this->user, $sibling);
        $theirs = $this->makePageWithSections('sibling-salon');

        // Back to "All brands". The default brand has no page of its own.
        $this->actAs($this->user, null);

        try {
            $this->controller()->update($this->request([
                'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 0]],
            ]));
            $this->fail('The section endpoint acted on the page of a sibling brand.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $theirs->id, 'key' => 'reviews', 'enabled' => true,
        ]);
    }

    /**
     * ...and where the resolved brand DOES have a page, that is the page it
     * writes to — the default brand's, which is also the brand a page
     * created in this mode lands on.
     *
     * The DEFAULT BRAND IS THE HIGHER-ID ONE here, and that detail is the
     * only thing that makes this a guard rather than a description. An
     * unordered ->first() is served by sqlite in (organization_id, brand_id)
     * index order, so with the default brand created first the wrong lookup
     * reaches the right row by accident and the test stays green however
     * badly the resolver is broken. Ordering the PAGES differently does not
     * help — the discriminator is the brand_id, not the page id.
     *
     * An org that promoted its second brand to default is an ordinary
     * production state, not a contrivance, and it is the state in which
     * "whichever row the database hands back first" and "the brand this
     * request resolves to" are different answers.
     */
    public function test_in_all_brands_mode_it_writes_to_the_default_brands_page(): void
    {
        $wasDefault = $this->defaultBrandId($this->org);
        $promoted   = $this->makeSiblingBrand($this->org);

        // Promote the later brand, demote the original: exactly one default
        // per org, as brands_org_default_unique requires.
        DB::table('brands')->where('id', $wasDefault)->update(['is_default' => false]);
        DB::table('brands')->where('id', $promoted)->update(['is_default' => true]);

        $this->actAs($this->user, $wasDefault);
        $theirs = $this->makePageWithSections('demoted-brand-salon');

        $this->actAs($this->user, $promoted);
        $mine = $this->makePageWithSections('promoted-brand-salon');

        $this->assertGreaterThan($theirs->brand_id, $mine->brand_id, 'The fixture no longer discriminates.');

        $this->actAs($this->user, null);

        $res = $this->controller()->update($this->request([
            'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 3]],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $mine->id, 'key' => 'reviews', 'enabled' => false,
        ]);
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $theirs->id, 'key' => 'reviews', 'enabled' => true,
        ]);
    }

    /**
     * The sixth verb on an organisation-wide page. A page with brand_id NULL
     * is reachable by every other landing endpoint once the org acquires a
     * default brand (see LandingPageAdminApiTest), and this one must not be
     * the exception that leaves its bands permanently unswitchable.
     */
    public function test_it_reaches_an_org_wide_page_once_the_org_has_a_default_brand(): void
    {
        $page = $this->makePageWithSections('org-wide-salon');

        // Retro-fit the state store() produces for an org that had no
        // default brand when the page was made.
        DB::table('landing_pages')->where('id', $page->id)->update(['brand_id' => null]);

        $this->actAs($this->user, null);

        $res = $this->controller()->update($this->request([
            'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 2]],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'reviews', 'enabled' => false,
        ]);
    }

    public function test_it_404s_when_this_brand_has_no_page_yet(): void
    {
        try {
            $this->controller()->update($this->request([
                'sections' => [['key' => 'reviews', 'enabled' => false, 'sort' => 0]],
            ]));
            $this->fail('Expected a 404 when this brand has no landing page yet.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }
}
