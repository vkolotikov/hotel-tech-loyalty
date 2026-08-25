<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingOnboardingController;
use App\Landing\IndustryProfile;
use App\Landing\PageContent;
use App\Models\LandingPage;
use App\Models\LandingPageSection;
use App\Models\Organization;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The wizard's prefill and apply endpoints, exercised by calling the
 * controller directly.
 *
 * Not over HTTP, for the reason LandingPageAdminApiTest and
 * LandingPageSectionApiTest both give: reaching these routes needs
 * `saas.auth` + Sanctum + `check.subscription` + the entitlement gate, and
 * this repo has no harness for that stack. That the gate is ATTACHED is
 * LandingPageEntitlementTest's job, and it enumerates the routes by URI
 * prefix, so `onboarding` is covered there with no edit. The tenancy traits
 * read `current_organization_id` / `current_brand_id` off the container,
 * which is exactly what TenantMiddleware and BrandMiddleware bind, so
 * binding them here reproduces the request context faithfully.
 *
 * What this file is really for is the one requirement the endpoint shape
 * cannot express: the availability counts must come from the SAME resolution
 * the renderer uses. A second implementation of "does this tenant have any
 * services" would agree with PageContent on the easy cases and disagree on
 * the ones that matter -- an inactive service, an unfeatured review, a
 * featured review with a blank comment, a sibling brand's rows -- and every
 * one of those disagreements ends the same way: the wizard offers a section
 * that then renders empty. So the tests below assert the hard cases by
 * value, and then assert parity with PageContent::has() across every key,
 * which is what catches a key nobody thought to write a case for.
 */
class LandingOnboardingTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private Organization $org;
    private User $user;
    private int $brandId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // The prefill reads live tenant content -- services, team, reviews,
        // the Property behind the contact band -- so every table the
        // renderer reads has to exist here too.
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
     * it. A fixture that inserted a second default would therefore be a
     * state the database forbids, and it would quietly change which brand
     * the "All brands" fallback resolves to, making these tests agree with
     * each other about a world production cannot be in.
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
        $this->user    = $user;
        $this->brandId = (int) $brandId;
        app()->instance('current_organization_id', $user->organization_id);
        app()->instance('current_brand_id', $brandId);
    }

    private function makeProperty(array $attributes = []): Property
    {
        return Property::create(array_merge([
            'name'      => 'Glamour Salon',
            'phone'     => '+371 20000000',
            'email'     => 'hello@glamour.test',
            'address'   => '12 Elizabetes iela',
            'city'      => 'Riga',
            'country'   => 'LV',
            'is_active' => true,
        ], $attributes));
    }

    private function makeServices(int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            Service::create(['name' => "Treatment {$i}", 'is_active' => true, 'sort_order' => $i]);
        }
    }

    private function makeTeam(int $count): void
    {
        for ($i = 1; $i <= $count; $i++) {
            ServiceMaster::create(['name' => "Therapist {$i}", 'is_active' => true, 'sort_order' => $i]);
        }
    }

    private function makeFeaturedReview(string $comment = 'Wonderful.'): ReviewSubmission
    {
        return ReviewSubmission::create([
            'comment'        => $comment,
            'overall_rating' => 5,
            'is_featured'    => true,
            'anonymous_name' => 'A guest',
            'submitted_at'   => now(),
        ]);
    }

    /** A page for this brand, created the way the wizard would create one. */
    private function makePage(string $slug = 'glamour-salon'): LandingPage
    {
        $page = LandingPage::create([
            'slug'         => $slug,
            'template_key' => 'ruled_page',
            'industry'     => $this->org->resolved_industry,
            'status'       => LandingPage::STATUS_DRAFT,
        ]);

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page->fresh('sections');
    }

    /**
     * A second brand of the SAME organisation, already finished: it has its
     * own landing page, its own Property and its own service.
     *
     * Every row is inserted directly rather than through the models, because
     * the models' creating hooks would rewrite brand_id to the bound brand --
     * the whole point of this fixture is rows that belong to a brand the
     * request is not operating as.
     *
     * @return int the sibling brand's id
     */
    private function makeFinishedSiblingBrand(): int
    {
        $sibling = $this->makeSiblingBrand($this->org);

        DB::table('landing_pages')->insert([
            'organization_id' => $this->org->id,
            'brand_id'        => $sibling,
            'slug'            => 'sibling-salon',
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'published',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        DB::table('properties')->insert([
            'organization_id' => $this->org->id,
            'brand_id'        => $sibling,
            'name'            => 'Sibling Site',
            'phone'           => '+371 999',
            'email'           => 'sibling@glamour.test',
            'address'         => 'Somewhere else entirely',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        DB::table('services')->insert([
            'organization_id' => $this->org->id,
            'brand_id'        => $sibling,
            'name'            => 'The sibling salon only',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        return $sibling;
    }

    // ─── Plumbing ────────────────────────────────────────────────────────

    private function controller(): LandingOnboardingController
    {
        return app(LandingOnboardingController::class);
    }

    /** @return array<string, mixed> */
    private function prefill(): array
    {
        return json_decode($this->controller()->show()->getContent(), true);
    }

    /** @return array<string, mixed> */
    private function apply(array $payload): array
    {
        $request = Request::create('/api/v1/admin/landing-pages/onboarding', 'POST', $payload);
        $request->setUserResolver(fn () => $this->user);

        return json_decode($this->controller()->store($request)->getContent(), true);
    }

    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'template_key' => 'ruled_page',
            'slug'         => 'maison-mimi',
            'copy'         => ['headline' => 'Quiet luxury', 'subtext' => 'Considered care'],
            'theme'        => ['brand_color' => '#1f5fa8', 'font_pairing' => 'editorial'],
            'sections'     => [],
        ], $overrides);
    }

    /** @return array<string, mixed> */
    private function section(array $prefill, string $key): array
    {
        $section = collect($prefill['sections'])->firstWhere('key', $key);

        $this->assertNotNull($section, "The prefill never mentioned the '{$key}' section.");

        return $section;
    }

    // ─── Prefill ─────────────────────────────────────────────────────────

    public function test_prefill_comes_from_the_tenants_own_property(): void
    {
        $this->makeProperty(['name' => 'Maison Mimi', 'phone' => '+371 20000000']);

        $prefill = $this->prefill();

        $this->assertSame('Maison Mimi', $prefill['prefill']['business_name']);
        $this->assertSame('+371 20000000', $prefill['prefill']['phone']);
        $this->assertSame('hello@glamour.test', $prefill['prefill']['email']);
        $this->assertSame('12 Elizabetes iela', $prefill['prefill']['address']);
        $this->assertFalse($prefill['completed']);
    }

    public function test_prefill_reads_the_property_the_page_itself_would_publish(): void
    {
        // A sibling brand's site, and this brand's own. PageContent prefers
        // the page's own brand; a prefill that ran its own Property query
        // would be free to hand the wizard the sibling's phone number and
        // address, which is the same cross-brand leak PageContent's
        // preferOwnBrand() exists to prevent -- only this time printed into
        // the form the tenant is about to confirm.
        DB::table('properties')->insert([
            'organization_id' => $this->org->id,
            'brand_id'        => $this->brandId + 99,
            'name'            => 'Sibling Site',
            'phone'           => '+371 999',
            'address'         => 'Elsewhere',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->makeProperty(['name' => 'Our Site', 'phone' => '+371 111']);

        $prefill = $this->prefill();

        $this->assertSame('Our Site', $prefill['prefill']['business_name']);
        $this->assertSame('+371 111', $prefill['prefill']['phone']);
    }

    public function test_the_brand_colour_prefills_from_the_brand_normalised(): void
    {
        // Normalised through CssColor because that is what Accent::for()
        // does at render time: a swatch the wizard paints in a form the
        // renderer would then discard is a colour the tenant chose and never
        // gets.
        $this->makeProperty();
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => '#3366CC']);

        $this->assertSame('#3366cc', $this->prefill()['prefill']['brand_color']);
    }

    public function test_the_brand_colour_falls_back_to_the_industrys_house_accent(): void
    {
        $this->makeProperty();

        $this->assertSame(
            strtolower(IndustryProfile::for('beauty')->accent),
            $this->prefill()['prefill']['brand_color'],
        );
    }

    public function test_a_section_with_no_data_is_reported_unavailable_with_its_count(): void
    {
        $this->makeProperty();          // no services, no featured reviews

        $prefill = $this->prefill();

        $services = $this->section($prefill, 'services');
        $this->assertFalse($services['available']);
        $this->assertSame(0, $services['count']);

        $reviews = $this->section($prefill, 'reviews');
        $this->assertFalse($reviews['available']);
        $this->assertSame(0, $reviews['count']);
    }

    public function test_a_section_with_data_reports_its_real_count(): void
    {
        $this->makeProperty();
        $this->makeServices(12);

        $services = $this->section($this->prefill(), 'services');

        $this->assertTrue($services['available']);
        $this->assertSame(12, $services['count']);
    }

    public function test_availability_ignores_every_row_the_page_would_not_show(): void
    {
        // Each of these rows EXISTS. None of them would appear on the page,
        // and a count written from scratch here would have to rediscover
        // every one of those exclusions to agree with the renderer.
        $this->makeProperty();

        // Retired: PageContent filters on is_active.
        Service::create(['name' => 'Retired', 'is_active' => false]);

        // A sibling brand's row, and another tenant's row.
        foreach ([[$this->org->id, $this->brandId + 99], [$this->org->id + 999, null]] as [$orgId, $brandId]) {
            DB::table('services')->insert([
                'organization_id' => $orgId,
                'brand_id'        => $brandId,
                'name'            => 'Not ours to show',
                'is_active'       => true,
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);
        }

        // Featured but blank, and written but never featured. Both are rows
        // in review_submissions; neither is a testimonial anyone can read.
        $this->makeFeaturedReview('');
        ReviewSubmission::create([
            'comment'        => 'Never chosen for the page.',
            'overall_rating' => 5,
            'is_featured'    => false,
            'submitted_at'   => now(),
        ]);

        // Inactive staff, same rule as services.
        ServiceMaster::create(['name' => 'Left last year', 'is_active' => false]);

        $prefill = $this->prefill();

        foreach (['services', 'team', 'reviews'] as $key) {
            $section = $this->section($prefill, $key);
            $this->assertSame(0, $section['count'], "'{$key}' counted a row the page would never show.");
            $this->assertFalse($section['available'], "'{$key}' was offered with nothing to show.");
        }
    }

    public function test_a_property_with_no_address_or_phone_is_not_a_contact_section(): void
    {
        // has('contact') is not "a Property exists" -- a band with a name and
        // nothing else is an empty band.
        $this->makeProperty(['phone' => null, 'address' => null]);

        $contact = $this->section($this->prefill(), 'contact');

        $this->assertFalse($contact['available']);
        $this->assertSame(0, $contact['count']);
    }

    public function test_every_sections_availability_matches_the_renderers_own_answer(): void
    {
        // A deliberately mixed fixture: some sections full, some empty, some
        // holding only rows that do not qualify. Then every key is compared
        // with what PageContent would tell the renderer about the page this
        // wizard is about to create. This is the assertion that covers the
        // keys nobody wrote a bespoke case for.
        $this->makeProperty();
        $this->makeServices(3);
        $this->makeTeam(2);
        $this->makeFeaturedReview('');   // present, unusable

        $prefill = $this->prefill();

        $probe = new LandingPage([
            'organization_id' => $this->org->id,
            'brand_id'        => $this->brandId,
            'industry'        => $this->org->resolved_industry,
        ]);
        $content = PageContent::for($probe);

        $this->assertNotEmpty($prefill['sections']);

        foreach ($prefill['sections'] as $section) {
            $this->assertSame(
                $content->has($section['key']),
                $section['available'],
                "The wizard and the renderer disagree about '{$section['key']}'.",
            );
            $this->assertSame(
                $content->has($section['key']),
                $section['count'] > 0,
                "'{$section['key']}' reports a count that contradicts its own availability.",
            );
        }
    }

    public function test_the_count_is_what_the_page_will_actually_publish(): void
    {
        // PageContent caps a price list at MAX_SERVICES. The number the
        // wizard shows is the number of rows the page will publish, not the
        // number of rows the tenant owns -- because it is the same
        // collection, and a second uncapped query here is exactly the
        // duplication this endpoint is not allowed to have.
        $this->makeProperty();
        $this->makeServices(PageContent::MAX_SERVICES + 6);

        $services = $this->section($this->prefill(), 'services');

        $this->assertTrue($services['available']);
        $this->assertSame(PageContent::MAX_SERVICES, $services['count']);
    }

    public function test_in_all_brands_mode_the_counts_belong_to_the_page_that_gets_created(): void
    {
        // The SPA's "All brands" mode binds no brand, and BelongsToBrand's
        // creating hook then puts the page on the org's DEFAULT brand. So a
        // prefill that counted whatever the bound (null) brand could see
        // would count the whole organisation while the page it is about to
        // create shows one brand -- and a services section holding nothing
        // but a SIBLING brand's rows would be offered and then render empty.
        $this->makeProperty();

        $sibling = $this->makeSiblingBrand($this->org);
        DB::table('services')->insert([
            'organization_id' => $this->org->id,
            'brand_id'        => $sibling,
            'name'            => 'The sibling salon only',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $this->actAs($this->user, null);

        $services = $this->section($this->prefill(), 'services');
        $this->assertFalse($services['available']);
        $this->assertSame(0, $services['count']);

        $this->apply($this->validPayload());

        // The round trip, which is the assertion that actually matters: what
        // the wizard offered is what the finished page shows.
        $page = LandingPage::with('sections')->first();

        $this->assertNotSame($sibling, $page->brand_id);
        $this->assertFalse(
            PageContent::for($page)->has('services'),
            'The wizard offered a section that the page it created then renders empty.',
        );
    }

    /*
     * The three tests below are one bug seen from three sides, and the bug
     * is not in any query this endpoint writes: it is in the one it DOESN'T.
     * BrandScope no-ops when the bound brand is null ("All brands" mode), so
     * a page lookup that leaves the brand to the scope matches ANY brand's
     * page in the organisation. The wizard then describes a page it is not
     * building -- and `completed`, the prefill and the counts each fail
     * differently as a result. LandingPageGuard::onBrand() is what makes the
     * brand explicit; these hold it there.
     */

    public function test_in_all_brands_mode_a_sibling_brands_page_does_not_finish_this_brands_wizard(): void
    {
        $this->makeProperty();
        $this->makeFinishedSiblingBrand();

        $this->actAs($this->user, null);

        $this->assertFalse(
            $this->prefill()['completed'],
            'A brand with no page of its own was told the wizard was already finished, '
            . 'because a SIBLING brand had one. That is per-organisation completion — '
            . 'the exact failure the crm_settings marker was rejected to avoid.',
        );
    }

    public function test_in_all_brands_mode_the_prefill_never_describes_a_sibling_brands_property(): void
    {
        $this->makeProperty(['name' => 'Our Site', 'phone' => '+371 111']);
        $this->makeFinishedSiblingBrand();

        $this->actAs($this->user, null);

        $prefill = $this->prefill()['prefill'];

        // A cross-brand leak into the form the tenant is about to confirm:
        // another brand's name, phone, email and address, presented as
        // theirs.
        $this->assertSame('Our Site', $prefill['business_name']);
        $this->assertSame('+371 111', $prefill['phone']);
        $this->assertNotSame('sibling@glamour.test', $prefill['email']);
        $this->assertNotSame('Somewhere else entirely', $prefill['address']);
    }

    public function test_in_all_brands_mode_a_sibling_brands_content_is_never_counted_for_this_brand(): void
    {
        $this->makeProperty();
        $sibling = $this->makeFinishedSiblingBrand();

        $this->actAs($this->user, null);

        $services = $this->section($this->prefill(), 'services');
        $this->assertFalse($services['available']);
        $this->assertSame(0, $services['count']);

        $this->apply($this->validPayload());

        // The round trip. The sibling's page is the lower id and BrandScope
        // no-ops here too, so the page has to be named rather than taken
        // off a bare first().
        $page = LandingPage::with('sections')->where('slug', 'maison-mimi')->first();

        $this->assertNotSame($sibling, $page->brand_id);
        $this->assertFalse(
            PageContent::for($page)->has('services'),
            'The wizard offered a section that the page it created then renders empty.',
        );
    }

    public function test_the_sections_the_wizard_lists_are_the_sections_it_creates(): void
    {
        // The industry decides the section list, and it is read in two
        // places -- the probe the prefill describes, and the row apply()
        // writes. Listing one set of bands and seeding another would leave
        // nothing downstream able to tell which was meant.
        $this->makeProperty();

        $listed = collect($this->prefill()['sections'])->pluck('key')->all();

        $this->apply($this->validPayload());

        $seeded = LandingPage::with('sections')->first()->sections->pluck('key')->all();

        $this->assertSame($listed, $seeded);
    }

    public function test_prefill_names_a_template_the_apply_endpoint_will_accept(): void
    {
        $this->makeProperty();

        $prefill = $this->prefill();

        $this->assertNotEmpty($prefill['templates']);

        foreach ($prefill['templates'] as $template) {
            $this->assertArrayHasKey('key', $template);
            $this->assertArrayHasKey('name', $template);
            $this->assertArrayHasKey('blurb', $template);

            // Offered and accepted must be one list. A template the wizard
            // shows and the validator refuses is a dead card in the UI.
            $this->apply($this->validPayload([
                'template_key' => $template['key'],
                'slug'         => 'template-' . $template['key'],
            ]));

            LandingPage::query()->delete();
        }
    }

    public function test_completed_is_true_once_a_page_exists(): void
    {
        $this->makeProperty();
        $this->makePage();

        $this->assertTrue($this->prefill()['completed']);
    }

    public function test_completed_is_per_brand_not_per_organization(): void
    {
        // The house onboarding pattern is a crm_settings marker, and it is
        // wrong here: crm_settings is unique on (organization_id, key) with
        // no brand column, so one brand finishing the wizard would hide it
        // from every other brand in the organisation. Completion is the
        // existence of THIS brand's page and nothing else.
        $this->makeProperty();
        $this->makePage();

        $second = $this->makeSiblingBrand($this->org);
        $this->actAs($this->user, $second);

        $this->assertFalse(
            $this->prefill()['completed'],
            'A second brand was told the wizard was already finished.',
        );
    }

    // ─── The suggested slug ──────────────────────────────────────────────

    public function test_the_suggested_slug_is_one_apply_accepts(): void
    {
        // The slug never appears in the wizard at all (spec §9), so the
        // tenant cannot repair a suggestion that turns out to be invalid,
        // reserved or taken. A suggestion apply() would refuse is therefore
        // a dead end with no error the person can act on.
        $this->makeProperty(['name' => 'Maison Mimi']);

        $suggested = $this->prefill()['suggested_slug'];

        $this->assertSame('maison-mimi', $suggested);

        $body = $this->apply($this->validPayload(['slug' => $suggested]));

        $this->assertSame('maison-mimi', $body['page']['slug']);
    }

    public function test_the_suggested_slug_steps_around_an_address_another_tenant_holds(): void
    {
        DB::table('landing_pages')->insert([
            'organization_id' => $this->org->id + 999,
            'brand_id'        => null,
            'slug'            => 'maison-mimi',
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'published',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->makeProperty(['name' => 'Maison Mimi']);

        $suggested = $this->prefill()['suggested_slug'];

        $this->assertNotSame('maison-mimi', $suggested);

        $body = $this->apply($this->validPayload(['slug' => $suggested]));

        $this->assertSame($suggested, $body['page']['slug']);
    }

    public function test_the_suggested_slug_survives_a_name_that_cannot_be_one(): void
    {
        // Two characters normalises to a slug shorter than the minimum, and
        // emoji normalise to nothing at all. Both are names a real business
        // has; neither may produce a suggestion apply() refuses.
        foreach (['Jo', '✂️', '   '] as $name) {
            $this->makeProperty(['name' => $name]);

            $suggested = $this->prefill()['suggested_slug'];

            $body = $this->apply($this->validPayload(['slug' => $suggested]));
            $this->assertSame($suggested, $body['page']['slug'], "Name '{$name}' produced an unusable slug.");

            LandingPage::query()->delete();
            Property::query()->delete();
        }
    }

    // ─── Apply ───────────────────────────────────────────────────────────

    public function test_apply_creates_a_draft_page_with_the_chosen_sections(): void
    {
        $this->makeProperty();

        $body = $this->apply($this->validPayload([
            'sections' => [['key' => 'reviews', 'enabled' => false]],
        ]));

        $this->assertSame('maison-mimi', $body['page']['slug']);

        $page = LandingPage::with('sections')->first();

        $this->assertSame('maison-mimi', $page->slug);
        $this->assertSame(LandingPage::STATUS_DRAFT, $page->status);
        $this->assertNull(
            $page->published_at,
            'The wizard creates a DRAFT. Publishing stays a deliberate, separate act.',
        );
        $this->assertFalse($page->sections->firstWhere('key', 'reviews')->enabled);
        $this->assertTrue($page->sections->firstWhere('key', 'services')->enabled);
    }

    public function test_apply_stores_the_copy_and_theme_where_the_renderer_reads_them(): void
    {
        $this->makeProperty();

        $this->apply($this->validPayload());

        $page = LandingPage::first();

        // The layout hands $page->content[$section->key] to the partial as
        // $copy, and hero.blade.php reads headline/subtext off it.
        $this->assertSame('Quiet luxury', $page->content['hero']['headline']);
        $this->assertSame('Considered care', $page->content['hero']['subtext']);
        $this->assertSame('#1f5fa8', $page->theme['brand_color']);
        $this->assertSame('editorial', $page->theme['font_pairing']);
    }

    public function test_apply_is_atomic(): void
    {
        // The failure is forced AFTER the page row and its first sections
        // are written, because that is the only place a transaction can make
        // a difference: a slug refused up front never writes anything, so it
        // cannot tell a wrapped apply() from an unwrapped one.
        $this->makeProperty();

        LandingPageSection::creating(function (LandingPageSection $section) {
            if ($section->key === 'about') {
                throw new RuntimeException('Section write failed midway.');
            }
        });

        try {
            $this->apply($this->validPayload());
            $this->fail('Expected the seeded section write to fail.');
        } catch (RuntimeException $e) {
            $this->assertSame('Section write failed midway.', $e->getMessage());
        } finally {
            LandingPageSection::flushEventListeners();
        }

        $this->assertDatabaseCount('landing_pages', 0);
        $this->assertDatabaseCount('landing_page_sections', 0);
    }

    public function test_a_reserved_slug_leaves_nothing_behind(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload(['slug' => 'admin']));
            $this->fail('Expected a reserved slug to be refused.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('slug', $e->errors());
        }

        $this->assertDatabaseCount('landing_pages', 0);
        $this->assertDatabaseCount('landing_page_sections', 0);
    }

    public function test_apply_refuses_a_slug_another_tenant_already_holds(): void
    {
        DB::table('landing_pages')->insert([
            'organization_id' => $this->org->id + 999,
            'brand_id'        => null,
            'slug'            => 'maison-mimi',
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => 'published',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $this->makeProperty();

        try {
            $this->apply($this->validPayload());
            $this->fail('Expected a taken slug to be refused.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('slug', $e->errors());
        }

        $this->assertSame(1, LandingPage::withoutGlobalScopes()->count());
    }

    public function test_apply_refuses_a_second_page_for_the_same_brand(): void
    {
        // Running the wizard twice -- a stale tab, a double submit -- must
        // not produce a second page. For a brand-bound page the unique index
        // would catch it as a 500; for the null brand an org can legitimately
        // have, NULLs are distinct in a unique index on both sqlite and
        // Postgres, so nothing would catch it at all and the org would end up
        // with two pages and an ambiguous editor.
        $this->makeProperty();
        $this->makePage('already-here');

        try {
            $this->apply($this->validPayload());
            $this->fail('Expected a second page for the same brand to be refused.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }

        $this->assertSame(1, LandingPage::count());
    }

    public function test_apply_refuses_a_section_this_page_would_not_have(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload([
                'sections' => [['key' => 'not_a_section', 'enabled' => true]],
            ]));
            $this->fail('Expected an unknown section key to be refused.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('sections', $e->errors());
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }

    public function test_apply_refuses_a_copy_leaf_that_is_not_a_single_value(): void
    {
        // Phase 1's ScalarLeaves rule: theme and content are schemaless JSON
        // columns whose leaves the renderer reads as strings, and an array
        // leaf is a 500 on a live public page rather than a cosmetic problem.
        $this->makeProperty();

        try {
            $this->apply($this->validPayload([
                'copy' => ['headline' => ['a', 'list'], 'subtext' => 'fine'],
            ]));
            $this->fail('Expected an array leaf to be refused.');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors());
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }

    /**
     * The twin of LandingPageAdminApiTest's own pair of these (Task 10b
     * round 1): the word "slug" must never reach a tenant (spec §9), and
     * `$request->validate()`'s `max:63` runs BEFORE
     * `LandingPageGuard::validatedSlug()`, whose messages are already
     * clean. The wizard never renders an address field, so the only way to
     * reach this is a direct API call — narrow, but not closed, and the
     * three controllers that accept an address must refuse one the same
     * way.
     */
    public function test_apply_rejects_a_too_long_slug_without_the_word_slug_reaching_the_tenant(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload(['slug' => str_repeat('a', 64)]));
            $this->fail('A 64-character slug should have been rejected.');
        } catch (ValidationException $e) {
            $message = $e->errors()['slug'][0] ?? '';
            $this->assertStringNotContainsStringIgnoringCase('slug', $message,
                "The wizard's apply path says the word \"slug\": \"{$message}\"");
            $this->assertStringContainsString('63 characters', $message);
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }

    /** The same guarantee for the other two rules on the same field. */
    public function test_apply_rejects_a_missing_address_without_the_word_slug_reaching_the_tenant(): void
    {
        $this->makeProperty();
        $payload = $this->validPayload();
        unset($payload['slug']);

        try {
            $this->apply($payload);
            $this->fail('A missing slug should have been rejected.');
        } catch (ValidationException $e) {
            $message = $e->errors()['slug'][0] ?? '';
            $this->assertStringNotContainsStringIgnoringCase('slug', $message,
                "The wizard's apply path says the word \"slug\": \"{$message}\"");
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }
}
