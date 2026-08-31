<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingOnboardingController;
use App\Landing\IndustryProfile;
use App\Landing\PageContent;
use App\Landing\SectionType;
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

    /**
     * A page for this brand, created the way the wizard would create one.
     *
     * `$content` defaults to none, same as a plain apply()-created page: most
     * callers just need a page to EXIST (for `completed`/one-per-brand
     * tests), and only the contact-override test below needs one seeded with
     * `content.contact` already on it.
     */
    private function makePage(string $slug = 'glamour-salon', array $content = []): LandingPage
    {
        $page = LandingPage::create([
            'slug'         => $slug,
            'template_key' => 'ruled_page',
            'industry'     => $this->org->resolved_industry,
            'status'       => LandingPage::STATUS_DRAFT,
            'content'      => $content,
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

    public function test_a_property_with_no_phone_address_or_email_is_not_a_contact_section(): void
    {
        // has('contact') is not "a Property exists" -- a band with a name and
        // nothing else is an empty band. Email is one of the three
        // overridable, publishable facts ContactDetails carries (see
        // App\Landing\ContactDetails), so it has to be null here too, or
        // this fixture would leave a real contact fact standing and prove
        // nothing about the "no contact at all" case.
        $this->makeProperty(['phone' => null, 'address' => null, 'email' => null]);

        $contact = $this->section($this->prefill(), 'contact');

        $this->assertFalse($contact['available']);
        $this->assertSame(0, $contact['count']);
    }

    /**
     * The mirror image of the test above, and the widening this task
     * intends: an email-only Property was NOT a contact section before
     * ContactDetails existed (has('contact') only ever asked about address
     * and phone) -- but an email address is exactly as publishable a contact
     * fact as either of those, and there is no reason a tenant who has only
     * filled in an email should see the wizard tell them they have no
     * contact section to offer.
     */
    public function test_a_property_with_only_an_email_is_a_contact_section(): void
    {
        $this->makeProperty(['phone' => null, 'address' => null]);

        $contact = $this->section($this->prefill(), 'contact');

        $this->assertTrue($contact['available']);
        $this->assertSame(1, $contact['count']);
    }

    /**
     * Task 4: the booking widget asks Check-in/Check-out/Adults/Children --
     * hotel questions -- and is framed unmodified on every industry's page,
     * so PageContent::count('booking') gates the section to the 'hotel'
     * industry alone. Unlike an empty Services screen, "Booking (0)" has no
     * self-explanatory fix on the tenant's own site -- there is no screen to
     * go fill in -- so the wizard has to say WHY, naming the CTA text the
     * page would otherwise print (LandingOnboardingService::SECTION_COPY's
     * 'reason' entry, sprintf'd against the profile the same way every other
     * industry-flavoured string here is).
     *
     * 'beauty', not 'education', is the industry that actually exercises this:
     * IndustryProfile::all()['education']['defaultSections'] never lists
     * 'booking' at all (Task 3), and sections() only ever iterates
     * $content->profile->defaultSections -- so an education organisation's
     * prefill never mentions the key in the first place, gated or not. Only
     * 'hotel' and 'beauty' still list 'booking' there; beauty deliberately,
     * per IndustryProfile::all()'s own docblock ("the row goes inert, your
     * gate decides") -- so beauty is the one non-hotel industry the wizard
     * can actually be asked about this row for.
     */
    public function test_booking_is_unavailable_for_a_beauty_organisation_with_its_reason(): void
    {
        $this->makeProperty(['phone' => '+371 111', 'address' => 'Elizabetes iela']);

        $booking = $this->section($this->prefill(), 'booking');

        $this->assertFalse($booking['available']);
        $this->assertSame(0, $booking['count']);
        $this->assertSame(
            "Online booking currently supports hotel stays. Your 'Book appointment' button will point "
                . 'visitors at your contact details instead.',
            $booking['reason'],
        );
    }

    /**
     * The parity half: a hotel organisation is offered the section outright,
     * with nothing to explain away -- 'reason' is null exactly when
     * 'available' is true, for booking as for every other section.
     */
    public function test_booking_is_available_for_a_hotel_organisation_with_no_reason(): void
    {
        $org  = $this->makeOrg('Seaside Hotel', 'hotel');
        $user = $this->makeUser($org);
        $this->actAs($user, $this->defaultBrandId($org));

        $this->makeProperty();

        $booking = $this->section($this->prefill(), 'booking');

        $this->assertTrue($booking['available']);
        $this->assertSame(1, $booking['count']);
        $this->assertNull($booking['reason']);
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

    /**
     * The section-type catalogue rides on this response for the same reason
     * `templates` and `industries` do: the front end mirrors neither, so a
     * type it can offer and a type the add endpoint accepts are one list by
     * construction rather than by two people remembering.
     *
     * The strong claim here is the round trip — every type the payload marks
     * `repeatable` is one POST /sections actually accepts. A card the editor
     * shows and the validator refuses is a dead button, which is exactly
     * what the template test below refuses to allow for template_key.
     */
    public function test_prefill_carries_a_section_catalogue_the_add_endpoint_will_accept(): void
    {
        $this->makeProperty();

        $types = $this->prefill()['section_types'];

        $this->assertNotEmpty($types);

        $addable = [];

        foreach ($types as $type) {
            $this->assertSame(['id', 'repeatable', 'fields', 'image', 'limit'], array_keys($type));
            // A server-side view path has no business on the wire.
            $this->assertArrayNotHasKey('view', $type);

            if ($type['repeatable']) {
                $addable[] = $type['id'];
            }
        }

        $this->assertNotEmpty($addable, 'The catalogue offers no addable section type at all.');
        $this->assertSame(SectionType::repeatableIds(), $addable,
            'What the wizard/editor is told it can add is not what the add endpoint accepts.');
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

    /**
     * Task 2: prefill.phone/email/address are the EFFECTIVE values
     * (ContactDetails::resolve output) once a page exists, not the raw
     * Property — an override the tenant already saved in content.contact
     * must win over the Property, exactly as it will on the public page
     * itself (PageContent already resolves the two the same way; this pins
     * the wizard's own read of that same resolution).
     */
    public function test_prefill_contact_reflects_page_overrides_once_a_page_exists(): void
    {
        $this->makeProperty(['phone' => '+371 111']);
        $this->makePage('glamour-salon', ['contact' => ['phone' => '+371 999']]);

        $this->assertSame('+371 999', $this->prefill()['prefill']['phone']);
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

    // ─── Theme allowlist (landing phase 3c, Task 2 / D6) ─────────────────

    /**
     * The twin of LandingPageAdminApiTest's own version of this test: the
     * two write surfaces share App\Landing\ThemeRules, so an unrecognised
     * theme key must be refused here the same way, with the same message.
     */
    public function test_apply_refuses_an_unknown_theme_key_with_a_friendly_message(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload([
                'theme' => ['whatever' => 'anything'],
            ]));
            $this->fail('An unrecognised theme key was accepted.');
        } catch (ValidationException $e) {
            $message = $e->errors()['theme'][0] ?? '';
            $this->assertSame('Please choose a valid design option.', $message);
            $this->assertStringNotContainsString('whatever', $message);
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }

    /**
     * Task 1's `palette` reaches the stored row through the wizard too —
     * proof that LandingOnboardingService::theme() was updated to carry it
     * through, not only that the controller's validation accepts it.
     */
    public function test_an_org_that_never_picked_an_industry_gets_neutral_words_not_hotel_ones(): void
    {
        // Organization::resolved_industry answers 'hotel' (DEFAULT_INDUSTRY)
        // for an org that never picked, which is fine for admin chrome and
        // wrong on a page published on the tenant's own domain: a real
        // education tenant's page called itself "The Hotel" and invited its
        // visitors to "Book your stay". A page built with no industry chosen
        // must fall back to the neutral profile instead.
        $org  = $this->makeOrg('No Industry Co', null);
        $user = $this->makeUser($org);
        $this->actAs($user, $this->defaultBrandId($org));

        $this->assertSame(
            'hotel',
            $org->resolved_industry,
            'Precondition: the admin default is still hotel, so this test is testing something.'
        );
        $this->assertNull($org->explicit_industry);

        // No `industry` in the payload: the tenant never answered, exactly as
        // an API caller or a pre-3c wizard would leave it.
        $payload = $this->validPayload(['slug' => 'no-industry-co']);
        unset($payload['industry']);

        $request = Request::create('/api/v1/admin/landing-pages/onboarding', 'POST', $payload);
        $request->setUserResolver(fn () => $user);
        $this->controller()->store($request);

        $page = LandingPage::withoutGlobalScopes()->where('organization_id', $org->id)->first();

        $this->assertNotNull($page, 'The page was never created.');
        $this->assertSame(
            IndustryProfile::FALLBACK_INDUSTRY,
            $page->industry,
            'A page for an org that never picked an industry must not be filed under hotel.'
        );
    }

    public function test_apply_accepts_and_stores_a_valid_palette(): void
    {
        $this->makeProperty();

        $this->apply($this->validPayload([
            'theme' => ['brand_color' => '#1f5fa8', 'font_pairing' => 'editorial', 'palette' => 'midnight_brass'],
        ]));

        $page = LandingPage::first();

        $this->assertSame('midnight_brass', $page->theme['palette']);
    }

    /**
     * Task 6 (D2's deferred application, landing phase 3c): a tenant who
     * never opens the palette picker still gets a page that fits its own
     * industry — `theme.palette` stores `IndustryProfile::for($industry)
     * ->defaultPalette`, not nothing at all. `validPayload()`'s own
     * `theme` never sets `palette` (only `brand_color`/`font_pairing`),
     * so this is exactly the "tenant made no choice" case; 'education' is
     * used (rather than the fixture org's own default 'beauty') because
     * its default, `slate_amber`, is unmistakably different from every
     * other industry's — a wrong industry->palette mapping fails loud
     * here rather than by accident matching beauty's `champagne_noir`.
     */
    public function test_apply_with_no_palette_choice_stores_the_industrys_own_default(): void
    {
        $org  = $this->makeOrg('Learning Loft', 'education');
        $user = $this->makeUser($org);
        $this->actAs($user, $this->defaultBrandId($org));

        $this->makeProperty(['name' => 'Learning Loft']);

        $this->apply($this->validPayload(['slug' => 'learning-loft']));

        $page = LandingPage::where('slug', 'learning-loft')->first();

        $this->assertSame('slate_amber', $page->theme['palette']);
        $this->assertSame(IndustryProfile::for('education')->defaultPalette, $page->theme['palette']);
    }

    public function test_apply_refuses_an_invalid_palette_with_a_friendly_message(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload([
                'theme' => ['palette' => 'nope'],
            ]));
            $this->fail('An unrecognised palette id was accepted.');
        } catch (ValidationException $e) {
            $message = $e->errors()['palette'][0] ?? '';
            $this->assertSame('Please choose one of the available looks.', $message);
        }

        $this->assertDatabaseCount('landing_pages', 0);
    }

    /**
     * Task 2's whole point: content.contact must hold ONLY the fields the
     * tenant actually changed from what the page would otherwise publish.
     * Freezing an untouched field in would make it survive a LATER Property
     * edit that was supposed to flow straight through — the exact failure
     * ContactDetails' "blank override is absence, not erasure" rule already
     * guards for typed-then-cleared fields; this is its mirror image for a
     * field never typed into at all.
     *
     * Email is submitted identical to the Property's own (the wizard's own
     * `form.email ?? prefill.email ?? ''` fallback sends the effective value
     * whether or not the tenant touched the input), so it must be dropped;
     * phone differs and must be kept.
     */
    public function test_apply_stores_only_the_contact_fields_the_tenant_edited(): void
    {
        $this->makeProperty(['phone' => '+371 111', 'email' => 'hi@mimi.lv']);

        $this->apply($this->validPayload([
            'contact' => ['phone' => '+371 999', 'email' => 'hi@mimi.lv'],
        ]));

        $stored = LandingPage::first()->content['contact'] ?? [];
        $this->assertSame(['phone' => '+371 999'], $stored,
            'Unedited fields must not be frozen into the page - the Property stays their source of truth.');
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

    // ─── The industry step (landing phase 3c) ────────────────────────────

    /**
     * Step 1 used to ask which TEMPLATE the tenant wanted, from a list of
     * exactly one. Industry is the question worth asking: it decides the
     * page's whole vocabulary, its default palette and whether the booking
     * band exists at all. So the prefill has to carry every industry the
     * platform offers, each with words a card can actually show -- an
     * industry the picker draws blank is a dead card, the same defect
     * test_prefill_names_a_template_the_apply_endpoint_will_accept exists
     * to catch on the other axis.
     */
    public function test_prefill_offers_every_industry_the_platform_has_with_words_to_show(): void
    {
        $this->makeProperty();

        $industries = $this->prefill()['industries'];

        $this->assertSame(
            Organization::INDUSTRIES,
            collect($industries)->pluck('id')->all(),
            'The wizard offers a different set of industries from the rest of the platform.',
        );

        foreach ($industries as $industry) {
            $profile = IndustryProfile::for($industry['id']);

            // The card's own words, and the profile they must come from --
            // asserted against IndustryProfile rather than against literals,
            // so re-authoring an industry's vocabulary cannot leave the
            // wizard showing the previous wording.
            $this->assertSame($profile->servicesLabel, $industry['services_label']);
            $this->assertSame($profile->peopleLabel, $industry['people_label']);
            $this->assertSame($profile->primaryCta, $industry['primary_cta']);
            $this->assertSame($profile->defaultPalette, $industry['palette']);
            $this->assertSame($profile->defaultSections, $industry['sections']);

            // A colour a card can paint with, normalised the same way the
            // rendered page will normalise it.
            $this->assertMatchesRegularExpression('/^#[0-9a-fA-F]{6}$/', $industry['accent']);

            foreach (['services_label', 'people_label', 'primary_cta'] as $word) {
                $this->assertNotSame('', trim($industry[$word]),
                    "The '{$industry['id']}' card would render a blank {$word}.");
            }
        }
    }

    /** The card step 1 opens pre-selected on is the org's own industry. */
    public function test_prefill_preselects_the_organisations_own_industry(): void
    {
        $this->makeProperty();

        $this->assertSame('beauty', $this->prefill()['prefill']['industry']);

        // And it is always an id the picker itself offers, so the
        // pre-selection can never be a card that is not on screen.
        $this->assertContains(
            $this->prefill()['prefill']['industry'],
            collect($this->prefill()['industries'])->pluck('id')->all(),
        );
    }

    /**
     * The point of asking: a chosen industry has to reach the ORGANISATION,
     * not just this one page. `organizations.industry` is the only column
     * written -- Organization::updated is what carries the snapshot onto
     * every landing page, which is why nothing here writes
     * landing_pages.industry a second time -- and the page created in the
     * same request is filed under the chosen industry with THAT industry's
     * bands and palette, not the one the org opened the wizard on.
     */
    public function test_apply_moves_the_organisation_onto_the_chosen_industry(): void
    {
        $this->makeProperty();

        $this->assertSame('beauty', $this->org->resolved_industry);

        $this->apply($this->validPayload(['industry' => 'education']));

        $this->assertSame('education', $this->org->fresh()->resolved_industry);

        $page = LandingPage::with('sections')->where('slug', 'maison-mimi')->first();

        $this->assertSame('education', $page->industry);
        // Education's own default palette, not beauty's -- the page was
        // built from the profile the tenant chose, front to back.
        $this->assertSame(IndustryProfile::for('education')->defaultPalette, $page->theme['palette']);
        $this->assertSame(
            IndustryProfile::for('education')->defaultSections,
            $page->sections->pluck('key')->all(),
        );
    }

    /**
     * The industry the wizard SHOWED and the sections it OFFERED must not
     * come apart when the tenant changes the first one. `beauty` lists a
     * booking band and `education` does not, so a wizard that posted back
     * the prefill's own section rows unchanged would be refused
     * ("This page has no section called 'booking'.") -- the Create button
     * 422ing on a row the wizard itself drew. The front end filters those
     * rows against the chosen industry's list
     * (frontend/src/pages/landing/industryChoices.ts, sectionsForIndustry);
     * this pins the refusal that filter exists to avoid, so the two cannot
     * quietly stop agreeing.
     */
    public function test_apply_refuses_a_band_the_chosen_industry_does_not_have(): void
    {
        $this->makeProperty();

        $this->assertContains('booking', IndustryProfile::for('beauty')->defaultSections);
        $this->assertNotContains('booking', IndustryProfile::for('education')->defaultSections);

        try {
            $this->apply($this->validPayload([
                'industry' => 'education',
                'sections' => [['key' => 'booking', 'enabled' => true]],
            ]));
            $this->fail('A band the chosen industry has no partial for was accepted.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('sections', $e->errors());
        }

        $this->assertDatabaseCount('landing_pages', 0);
        // Refused before the transaction opened, so the org is untouched
        // too -- a rejected request must not leave the business filed under
        // an industry whose page was never created.
        $this->assertSame('beauty', $this->org->fresh()->resolved_industry);
    }

    /**
     * The overwhelmingly common case: the tenant leaves step 1 on the card
     * it opened on. Nothing is written -- no bumped updated_at, no resync
     * sweep over pages that are already correct -- and the page is filed
     * exactly where it would have been before this step existed.
     */
    public function test_apply_with_the_organisations_own_industry_writes_nothing_to_it(): void
    {
        $this->makeProperty();

        $before = $this->org->fresh()->updated_at;

        $this->apply($this->validPayload(['industry' => 'beauty']));

        $after = $this->org->fresh();

        $this->assertSame('beauty', $after->resolved_industry);
        $this->assertEquals($before, $after->updated_at);
        $this->assertSame('beauty', LandingPage::where('slug', 'maison-mimi')->first()->industry);
    }

    /**
     * A client that never asks -- an older build, a direct API call -- keeps
     * the exact behaviour that shipped before the industry step: the page is
     * filed under the organisation's own industry and the org is left alone.
     */
    public function test_apply_without_an_industry_falls_back_to_the_organisations_own(): void
    {
        $this->makeProperty();

        $this->apply($this->validPayload());

        $this->assertSame('beauty', $this->org->fresh()->resolved_industry);
        $this->assertSame('beauty', LandingPage::where('slug', 'maison-mimi')->first()->industry);
    }

    public function test_apply_refuses_an_industry_the_platform_does_not_have(): void
    {
        $this->makeProperty();

        try {
            $this->apply($this->validPayload(['industry' => 'lunar_mining']));
            $this->fail('An unknown industry was accepted.');
        } catch (ValidationException $e) {
            $message = $e->errors()['industry'][0] ?? '';
            $this->assertSame('Please choose one of the listed industries.', $message);
        }

        $this->assertDatabaseCount('landing_pages', 0);
        $this->assertSame('beauty', $this->org->fresh()->resolved_industry);
    }

    /**
     * Every industry the picker offers has to be one apply() will accept --
     * the same "offered and accepted are one list" guarantee
     * test_prefill_names_a_template_the_apply_endpoint_will_accept gives
     * template_key, on the axis that now actually has nine options.
     */
    public function test_every_offered_industry_is_one_the_apply_endpoint_accepts(): void
    {
        $this->makeProperty();

        foreach ($this->prefill()['industries'] as $industry) {
            $id = $industry['id'];

            $this->apply($this->validPayload([
                'industry' => $id,
                'slug'     => 'industry-' . str_replace('_', '-', $id),
            ]));

            $page = LandingPage::where('industry', $id)->first();

            $this->assertNotNull($page, "The wizard offered '{$id}' and apply() would not create it.");
            $this->assertSame($id, $this->org->fresh()->resolved_industry);

            LandingPageSection::query()->delete();
            LandingPage::query()->delete();
        }
    }
}
