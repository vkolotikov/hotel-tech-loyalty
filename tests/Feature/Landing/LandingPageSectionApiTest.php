<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingPageController;
use App\Http\Controllers\Api\V1\Admin\LandingPageSectionController;
use App\Landing\SectionType;
use App\Models\LandingPage;
use App\Models\LandingPageSection;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

    // ─── Tone: the per-section colour ────────────────────────────────────

    public function test_it_stores_a_tone_against_the_named_section_only(): void
    {
        $page = $this->makePageWithSections();

        $res = $this->controller()->update($this->request([
            'sections' => [
                ['key' => 'about', 'enabled' => true, 'sort' => 2, 'tone' => 'accent'],
                ['key' => 'hero',  'enabled' => true, 'sort' => 0, 'tone' => 'soft'],
            ],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'about', 'tone' => 'accent',
        ]);
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'hero', 'tone' => 'soft',
        ]);
        // Untouched rows keep their null — the per-row `where('key', ...)`
        // scope, same claim the toggle test above makes for enabled/sort.
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'reviews', 'tone' => null,
        ]);
    }

    /**
     * An explicit null clears one — this is how the editor writes "put this
     * band back to the colour it came with", and it must be a real write
     * rather than a no-op, or a tenant could set a tone and never undo it.
     */
    public function test_an_explicit_null_tone_clears_a_stored_one(): void
    {
        $page = $this->makePageWithSections();
        $page->sections()->where('key', 'about')->update(['tone' => 'accent']);

        $this->controller()->update($this->request([
            'sections' => [['key' => 'about', 'enabled' => true, 'sort' => 2, 'tone' => null]],
        ]));

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'about', 'tone' => null,
        ]);
    }

    /**
     * An ABSENT `tone` leaves the stored one alone, which is a different
     * thing from an explicit null and the reason update() tests for the key
     * rather than reading `?? null`.
     *
     * This is not a hypothetical client: `enabled` and `sort` are required
     * and `tone` is not, so any caller that predates this round — or simply
     * does not care about colours — sends rows without it, and a `?? null`
     * would wipe the tenant's chosen colours off the whole page on the next
     * reorder.
     */
    public function test_a_payload_with_no_tone_key_leaves_a_stored_tone_alone(): void
    {
        $page = $this->makePageWithSections();
        $page->sections()->where('key', 'about')->update(['tone' => 'accent']);

        $this->controller()->update($this->request([
            'sections' => [['key' => 'about', 'enabled' => true, 'sort' => 4]],
        ]));

        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'about', 'tone' => 'accent', 'sort' => 4,
        ]);
    }

    /**
     * A tone outside the allowlist is refused, and the sentence a tenant
     * would read names no field and carries none of Laravel's own wording
     * ("The selected sections.0.tone is invalid.").
     */
    public function test_an_unknown_tone_is_refused_kindly(): void
    {
        $page = $this->makePageWithSections();

        try {
            $this->controller()->update($this->request([
                'sections' => [['key' => 'about', 'enabled' => true, 'sort' => 2, 'tone' => 'neon']],
            ]));
            $this->fail('Expected an unknown tone to be refused.');
        } catch (ValidationException $e) {
            $message = $e->validator->errors()->first();

            $this->assertSame('Please choose one of the colours offered for this section.', $message);
            $this->assertStringNotContainsString('sections.', $message);
            $this->assertStringNotContainsString('tone', $message);
        }

        // Refused means nothing was written — the validator runs before the
        // transaction, so the row is untouched rather than half-updated.
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'about', 'tone' => null,
        ]);
    }

    /**
     * `band--ink` is a class the renderer still emits (contact/reviews'
     * authored default) and is deliberately NOT a tone — see
     * SectionType::TONES. A caller naming it, or naming a raw CSS class of
     * any kind, is refused like any other unknown value.
     */
    public function test_a_raw_band_class_is_not_a_tone(): void
    {
        $this->makePageWithSections();

        $this->expectException(ValidationException::class);

        $this->controller()->update($this->request([
            'sections' => [['key' => 'about', 'enabled' => true, 'sort' => 2, 'tone' => 'band--ink']],
        ]));
    }

    /** Every id the allowlist publishes is one this endpoint actually takes. */
    public function test_every_published_tone_is_accepted(): void
    {
        $page = $this->makePageWithSections();

        foreach (SectionType::toneIds() as $tone) {
            $this->controller()->update($this->request([
                'sections' => [['key' => 'about', 'enabled' => true, 'sort' => 2, 'tone' => $tone]],
            ]));

            $this->assertDatabaseHas('landing_page_sections', [
                'landing_page_id' => $page->id, 'key' => 'about', 'tone' => $tone,
            ]);
        }
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

    // ─── Adding and removing a band (the repeatable-sections round) ───────
    //
    // Same plumbing as the reorder tests above — the controller called
    // directly, for the reason this file's own docblock gives. The one thing
    // these need that the reorder tests do not is a fake disk: destroy()
    // deletes the removed band's photo through MediaService, and
    // MediaService::delete() routes a '/storage/...' value to the `public`
    // disk BY THE VALUE'S SHAPE rather than by the configured media disk (see
    // its own comment), so faking `public` is enough and no filesystems
    // config has to be touched.

    private function addRequest(array $payload): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages/sections', 'POST', $payload);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    private function removeRequest(array $payload): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages/sections', 'DELETE', $payload);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    /** The key store() answered with, so a test never has to guess which index it allocated. */
    private function addSection(string $type = 'text'): string
    {
        $res = $this->controller()->store($this->addRequest(['type' => $type]));

        $this->assertSame(201, $res->getStatusCode());

        return json_decode($res->getContent(), true)['key'];
    }

    /**
     * The message a refusal actually hands the tenant — asserted rather than
     * merely "a ValidationException was thrown", because half of what these
     * refusals have to get right is the wording (spec §9: no field paths, no
     * Laravel defaults).
     */
    private function refusalMessage(\Closure $call, string $field): string
    {
        try {
            $call();
        } catch (ValidationException $e) {
            $messages = $e->errors()[$field] ?? [];

            $this->assertNotEmpty($messages, "The refusal named no '{$field}'.");

            return $messages[0];
        }

        $this->fail('The call was accepted; a refusal was expected.');
    }

    /** No refusal a tenant reads may leak a field name, a section key, or Laravel's own phrasing. */
    private function assertReadsLikeAPerson(string $message): void
    {
        foreach (['type', 'key', 'field', '_', 'null', 'invalid', 'selected'] as $leak) {
            $this->assertStringNotContainsStringIgnoringCase($leak, $message,
                "This refusal leaks '{$leak}' to the tenant: {$message}");
        }
    }

    public function test_it_adds_a_text_section_at_the_end_of_the_page(): void
    {
        $page = $this->makePageWithSections();
        $lastSort = (int) $page->sections->max('sort');

        $key = $this->addSection();

        // The first instance is text_1 — the keys are the tenant-invisible
        // half of this feature, but the editor addresses content by them, so
        // which one was allocated is part of the contract.
        $this->assertSame('text_1', $key);
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'text_1', 'enabled' => true, 'sort' => $lastSort + 1,
        ]);

        // Appended, never inserted: nothing the tenant had already arranged
        // moved to make room.
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'hero', 'sort' => 0,
        ]);
    }

    /** The added row is an ordinary section afterwards: the reorder verb owns it like any other. */
    public function test_an_added_section_can_then_be_toggled_and_reordered(): void
    {
        $page = $this->makePageWithSections();
        $key  = $this->addSection();

        $res = $this->controller()->update($this->request([
            'sections' => [['key' => $key, 'enabled' => false, 'sort' => 2]],
        ]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => $key, 'enabled' => false, 'sort' => 2,
        ]);
    }

    public function test_each_add_takes_the_next_free_index(): void
    {
        $this->makePageWithSections();

        $this->assertSame('text_1', $this->addSection());
        $this->assertSame('text_2', $this->addSection());
        $this->assertSame('text_3', $this->addSection());
    }

    /**
     * Lowest FREE index, not highest plus one — and this is the test that
     * says why it matters rather than merely that it happens. With
     * highest-plus-one, a tenant who adds and removes a band six times has
     * burned text_1..text_6 and can never add another despite the page
     * carrying none: the NAMESPACE would be full while the page was empty.
     */
    public function test_a_removed_index_is_available_again(): void
    {
        $this->makePageWithSections();

        $this->addSection();                                  // text_1
        $second = $this->addSection();                        // text_2
        $this->addSection();                                  // text_3

        $this->controller()->destroy($this->removeRequest(['key' => $second]));

        $this->assertSame('text_2', $this->addSection(),
            'The freed index was not reused, so add/remove cycles exhaust the namespace.');
    }

    /**
     * The instance cap. Mutation target: remove the `$key === null` refusal
     * in store() (the cap's one expression — SectionType::nextInstanceKey()
     * returns null at MAX_INSTANCES_PER_TYPE) and this goes red.
     */
    public function test_a_seventh_instance_of_a_type_is_refused_kindly(): void
    {
        $page = $this->makePageWithSections();

        for ($i = 0; $i < SectionType::MAX_INSTANCES_PER_TYPE; $i++) {
            $this->addSection();
        }

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'text'])),
            'type',
        );

        $this->assertSame('You can add up to six sections like this one. Remove one before adding another.', $message);
        $this->assertReadsLikeAPerson($message);

        // Refused, not silently capped: the page still has exactly six.
        $this->assertSame(
            SectionType::MAX_INSTANCES_PER_TYPE,
            $page->fresh('sections')->sections->filter(
                fn ($section) => SectionType::typeOf($section->key) === 'text'
            )->count(),
        );
    }

    /**
     * Template fidelity 3.1 — the door that was shut: a fixed block no
     * industry seeds can now be ADDED, once, and it comes in under its own
     * bare key.
     *
     * `announcement`, `trust` and `faq` are three of the fifteen blocks the
     * BeautyTech kits draw. Before this they were reachable from no screen in
     * the product: no `defaultSections` list names them, so no page was ever
     * seeded with one, and this endpoint accepted repeatable types only.
     */
    public function test_a_kit_block_can_be_added_once_under_its_own_key(): void
    {
        $page = $this->makePageWithSections();
        $lastSort = (int) $page->sections->max('sort');

        foreach (['announcement', 'trust', 'faq'] as $i => $type) {
            $this->assertSame($type, $this->addSection($type),
                'A fixed block must arrive under its own bare key, never an instance index.');

            $this->assertDatabaseHas('landing_page_sections', [
                'landing_page_id' => $page->id, 'key' => $type, 'enabled' => true, 'sort' => $lastSort + 1 + $i,
            ]);
        }
    }

    /**
     * There is only one of each, so a second add is refused in words rather
     * than by the (landing_page_id, key) unique index — which would be a
     * 500, and which is also why the refusal is thrown from inside the
     * row-locked transaction.
     *
     * Mutation target: return the bare id unconditionally from
     * SectionType::keyFor() (drop its `in_array($typeId, $existingKeys)`
     * test) and this goes red.
     */
    public function test_a_second_copy_of_a_kit_block_is_refused_kindly(): void
    {
        $page = $this->makePageWithSections();

        $this->addSection('trust');

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'trust'])),
            'type',
        );

        $this->assertSame('Your page already has one of these. Switch the one you have back on instead.', $message);
        $this->assertReadsLikeAPerson($message);

        $this->assertSame(1, $page->fresh('sections')->sections->where('key', 'trust')->count());
    }

    /**
     * Chrome stays chrome. `footer` is a fixed type no industry seeds — the
     * first half of the addable rule — but it declares no editable copy and
     * no photograph, every layout includes it unconditionally, and adding
     * one would put a row on the page that changes nothing about what
     * renders.
     */
    public function test_the_footer_cannot_be_added(): void
    {
        $this->makePageWithSections();

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'footer'])),
            'type',
        );

        $this->assertSame('That kind of section cannot be added to a page.', $message);
    }

    /**
     * The whole-page cap, which is a different bound from the per-type one
     * and has to be reachable independently of it: with one repeatable type
     * capped at six and the longest industry list at seven, the API alone
     * cannot reach sixteen rows today. So the filler here is inserted
     * directly — it stands in for rows a template rollback, an import or a
     * future second repeatable type leaves on a page, which is exactly the
     * state the cap exists to bound. The cap counts ROWS, not types, because
     * rows are what it is protecting.
     *
     * Mutation target: remove the MAX_SECTIONS_PER_PAGE guard in store() and
     * this goes red.
     */
    public function test_a_page_at_its_section_ceiling_refuses_kindly(): void
    {
        $page = $this->makePageWithSections();

        $sort = (int) $page->sections->max('sort');

        while ($page->sections()->count() < SectionType::MAX_SECTIONS_PER_PAGE) {
            $page->sections()->create(['key' => 'legacy_band_' . ++$sort, 'enabled' => true, 'sort' => $sort]);
        }

        // A free instance index is still available, so nothing but the page
        // cap can be what refuses this.
        $this->assertNotNull(
            SectionType::nextInstanceKey('text', $page->fresh('sections')->sections->pluck('key')->all()),
            'The fixture has exhausted the instance cap, so it can no longer isolate the page cap.',
        );

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'text'])),
            'type',
        );

        $this->assertSame(
            'This page already has as many sections as it can hold. Remove one before adding another.',
            $message,
        );
        $this->assertReadsLikeAPerson($message);
        $this->assertSame(SectionType::MAX_SECTIONS_PER_PAGE, $page->fresh('sections')->sections->count());
    }

    public function test_a_type_that_is_not_repeatable_cannot_be_added(): void
    {
        $this->makePageWithSections();

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'about'])),
            'type',
        );

        $this->assertSame('That kind of section cannot be added to a page.', $message);
        $this->assertReadsLikeAPerson($message);

        // And it certainly did not create a second `about`.
        $this->assertSame(1, LandingPageSection::where('key', 'about')->count());
    }

    public function test_an_unknown_type_is_refused_kindly(): void
    {
        $this->makePageWithSections();

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest(['type' => 'carousel'])),
            'type',
        );

        $this->assertSame('That kind of section cannot be added to a page.', $message);
        $this->assertReadsLikeAPerson($message);
    }

    public function test_adding_without_a_type_is_refused_kindly(): void
    {
        $this->makePageWithSections();

        $message = $this->refusalMessage(
            fn () => $this->controller()->store($this->addRequest([])),
            'type',
        );

        $this->assertSame('Please choose which kind of section to add.', $message);
        $this->assertReadsLikeAPerson($message);
    }

    /**
     * Deleting an instance is three deletions, because a section is three
     * things: the row, the copy filed under its key, and the photo the
     * image endpoint uploaded for it.
     *
     * Mutation target: drop the MediaService::delete() step at the end of
     * destroy() and this goes red on the assertMissing — the row and the
     * copy are gone, and the file is left on the disk with nothing in the
     * database pointing at it.
     */
    public function test_deleting_an_instance_drops_its_row_its_copy_and_its_photo(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('landing/text-one.png', 'plate-bytes');
        Storage::disk('public')->put('landing/about.png', 'about-bytes');

        $page = $this->makePageWithSections();
        $key  = $this->addSection();

        // Written the way the image endpoint writes it (that endpoint is
        // exercised end to end in LandingImageUploadTest); here the subject
        // is what REMOVAL does with what is already stored.
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['body' => 'Our story', 'image_url' => '/storage/landing/about.png'],
            $key    => ['heading' => 'Our promise', 'body' => 'Quiet rooms.', 'image_url' => '/storage/landing/text-one.png'],
        ]]);

        $res = $this->controller()->destroy($this->removeRequest(['key' => $key]));

        $this->assertSame(200, $res->getStatusCode());

        $this->assertDatabaseMissing('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => $key,
        ]);

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey($key, $fresh->content);
        Storage::disk('public')->assertMissing('landing/text-one.png');

        // And nothing else moved: the neighbouring band keeps its copy and
        // its file. A delete that reached past its own key would be the
        // worst version of this bug, not the best.
        $this->assertSame('Our story', $fresh->content['about']['body']);
        $this->assertSame('/storage/landing/about.png', $fresh->content['about']['image_url']);
        Storage::disk('public')->assertExists('landing/about.png');
        $this->assertDatabaseHas('landing_page_sections', [
            'landing_page_id' => $page->id, 'key' => 'about',
        ]);
    }

    /**
     * A gallery holds up to EIGHT files, and removing the band has to take
     * every one of them.
     *
     * MUTATION TARGET: drop the delete-all step at the end of destroy() —
     * or narrow it back to a single `image_url` — and this goes red on the
     * first assertMissing. Seven orphaned files on a customer's disk with
     * nothing in the database pointing at them is the worst version of this
     * bug, not the best: the tenant cannot see them, cannot remove them, and
     * they never expire.
     *
     * The full eight, deliberately, plus a gap: `image_4` is absent because
     * that is the shape a real gallery is in after a tenant removes one
     * picture, and a sweep written as "loop until the first missing leaf"
     * would pass a contiguous fixture and lose four files here.
     */
    public function test_deleting_a_gallery_deletes_every_one_of_its_photos(): void
    {
        Storage::fake('public');

        $files  = [];
        $leaves = [];

        foreach ([1, 2, 3, 5, 6, 7, 8] as $n) {
            $path = "landing/gallery-{$n}.png";
            Storage::disk('public')->put($path, "picture-{$n}");
            $files[] = $path;
            $leaves['image_' . $n] = '/storage/' . $path;
        }

        Storage::disk('public')->put('landing/keep-me.png', 'another band');

        $page = $this->makePageWithSections();
        $key  = $this->addSection('gallery');

        $this->assertSame('gallery_1', $key);

        $page->update(['content' => [
            'hero'   => ['headline' => 'The Art of Wellness'],
            'text_1' => ['body' => 'Quiet rooms.', 'image_url' => '/storage/landing/keep-me.png'],
            $key     => ['heading' => 'The rooms'] + $leaves,
        ]]);

        $res = $this->controller()->destroy($this->removeRequest(['key' => $key]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseMissing('landing_page_sections', ['landing_page_id' => $page->id, 'key' => $key]);
        $this->assertArrayNotHasKey($key, $page->fresh()->content);

        foreach ($files as $path) {
            Storage::disk('public')->assertMissing($path);
        }

        // Nothing else moved: a sweep that reached past its own key would be
        // worse than one that swept too little.
        Storage::disk('public')->assertExists('landing/keep-me.png');
        $this->assertSame('/storage/landing/keep-me.png', $page->fresh()->content['text_1']['image_url']);
    }

    /**
     * A leaf past the eight the catalogue holds is not one of the section's
     * photos — no endpoint could have written it — so the sweep leaves it
     * exactly as it leaves a stranger's file. Same boundary the render path
     * and update()'s carry-forward draw, drawn once more where a DELETE is
     * the irreversible operation.
     */
    public function test_the_photo_sweep_only_touches_the_leaves_the_catalogue_names(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('landing/real.png', 'real');
        Storage::disk('public')->put('landing/ninth.png', 'raw write');

        $page = $this->makePageWithSections();
        $key  = $this->addSection('gallery');

        $page->update(['content' => [
            $key => ['image_1' => '/storage/landing/real.png', 'image_9' => '/storage/landing/ninth.png'],
        ]]);

        $this->controller()->destroy($this->removeRequest(['key' => $key]));

        Storage::disk('public')->assertMissing('landing/real.png');
        Storage::disk('public')->assertExists('landing/ninth.png');
    }

    /** An instance with no photo removes cleanly — the delete step is skipped, not attempted on null. */
    public function test_deleting_an_instance_with_no_photo_still_removes_it(): void
    {
        $page = $this->makePageWithSections();
        $key  = $this->addSection();

        $page->update(['content' => ['hero' => ['headline' => 'x'], $key => ['body' => 'Quiet rooms.']]]);

        $res = $this->controller()->destroy($this->removeRequest(['key' => $key]));

        $this->assertSame(200, $res->getStatusCode());
        $this->assertDatabaseMissing('landing_page_sections', ['landing_page_id' => $page->id, 'key' => $key]);
        $this->assertArrayNotHasKey($key, $page->fresh()->content);
    }

    /**
     * A fixed section can be switched off and never removed. That is a fact
     * about the CATALOGUE rather than about this page, so it is refused
     * before the transaction opens — and it must be refused for a key the
     * page really does carry, which is the only version of this that could
     * ever have succeeded by accident.
     */
    public function test_a_fixed_section_cannot_be_deleted(): void
    {
        $page = $this->makePageWithSections();

        foreach (['hero', 'about', 'contact'] as $fixed) {
            $message = $this->refusalMessage(
                fn () => $this->controller()->destroy($this->removeRequest(['key' => $fixed])),
                'key',
            );

            $this->assertSame(
                'Sections that come with the page can be switched off, but not removed.',
                $message,
            );

            $this->assertDatabaseHas('landing_page_sections', [
                'landing_page_id' => $page->id, 'key' => $fixed,
            ]);
        }
    }

    /** A key past the grammar is not a section at all, so it is refused the same way a fixed one is. */
    public function test_a_key_outside_the_grammar_cannot_be_deleted(): void
    {
        $this->makePageWithSections();

        // `gallery` bare is a repeatable type's id and not a key; `gallery_7`
        // is past the instance cap; `gallery_1.image_1` is an image SLOT,
        // which the image endpoints parse and this one must not.
        foreach (['text', 'text_7', 'text_0', 'gallery', 'gallery_7', 'gallery_1.image_1', '../hero'] as $bogus) {
            $message = $this->refusalMessage(
                fn () => $this->controller()->destroy($this->removeRequest(['key' => $bogus])),
                'key',
            );

            $this->assertSame(
                'Sections that come with the page can be switched off, but not removed.',
                $message,
            );
        }
    }

    public function test_deleting_an_instance_this_page_does_not_have_is_refused(): void
    {
        $this->makePageWithSections();

        $message = $this->refusalMessage(
            fn () => $this->controller()->destroy($this->removeRequest(['key' => 'text_4'])),
            'key',
        );

        $this->assertSame("This page has no section called 'text_4'.", $message);
    }

    /**
     * The two new verbs resolve "my page" exactly as the reorder verb does —
     * through LandingPageGuard, never a bare first() — so neither can reach
     * another organisation's rows. Proven by leaving the neighbour's page
     * untouched while mine gains and loses a band.
     */
    public function test_the_new_verbs_cannot_touch_another_organizations_sections(): void
    {
        $theirs = $this->makeOtherOrgPageWithSections();
        $mine   = $this->makePageWithSections();

        $key = $this->addSection();

        $this->assertDatabaseHas('landing_page_sections', ['landing_page_id' => $mine->id, 'key' => $key]);
        $this->assertDatabaseMissing('landing_page_sections', ['landing_page_id' => $theirs->id, 'key' => $key]);

        $this->controller()->destroy($this->removeRequest(['key' => $key]));

        $this->assertDatabaseMissing('landing_page_sections', ['landing_page_id' => $mine->id, 'key' => $key]);
        // Their page still has every band it started with.
        $this->assertSame(7, LandingPageSection::where('landing_page_id', $theirs->id)->count());
    }

    public function test_adding_404s_when_this_brand_has_no_page_yet(): void
    {
        try {
            $this->controller()->store($this->addRequest(['type' => 'text']));
            $this->fail('Expected a 404 when this brand has no landing page yet.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }

    public function test_removing_404s_when_this_brand_has_no_page_yet(): void
    {
        try {
            $this->controller()->destroy($this->removeRequest(['key' => 'text_1']));
            $this->fail('Expected a 404 when this brand has no landing page yet.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }
    }
}
