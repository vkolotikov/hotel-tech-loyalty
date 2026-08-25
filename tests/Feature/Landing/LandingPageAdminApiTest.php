<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingPageController;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The admin builder API, exercised by calling the controller directly.
 *
 * Not over HTTP: reaching these routes needs `saas.auth` + Sanctum +
 * `check.subscription` + the entitlement gate, and this repo has no harness
 * for that stack (LeadIntakeApiTest is skipped outright for the same reason).
 * That the gate is *attached* is LandingPageEntitlementTest's job. What is
 * left — and what only a test can hold — is the controller's own behaviour:
 * global slug uniqueness, the redirect trail behind a rename, tenant
 * isolation, and the null brand that "All brands" mode legitimately produces.
 *
 * The tenancy traits read `current_organization_id` / `current_brand_id` off
 * the container, which is precisely what TenantMiddleware and BrandMiddleware
 * bind, so binding them here reproduces the request context faithfully.
 */
class LandingPageAdminApiTest extends TestCase
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

        $this->org  = $this->makeOrg('Glamour', 'beauty');
        $this->user = $this->makeUser($this->org);

        $this->actAs($this->user, $this->defaultBrandId($this->org));
    }

    protected function tearDown(): void
    {
        // A test that pins the clock and then fails an assertion never reaches
        // its own reset, and would leave every later test in this process
        // running in 2026-08-01.
        Carbon::setTestNow();
        parent::tearDown();
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
     * An organisation with no brands at all.
     *
     * Emptied deliberately, because Organization::created gives every new
     * org a default brand and this state can no longer be reached simply by
     * creating one. It is a real state all the same -- orgs predating the
     * brands feature, and that hook's own no-op when the brands table is
     * absent -- and it is the state in which BelongsToBrand has no default
     * to fall back on, which is the whole subject of the two tests that use
     * this.
     *
     * Until makeOrg() was fixed, those tests got this state from a FIXTURE
     * DEFECT rather than by asking for it: creating an org while another
     * tenant was bound filed the new org's default brand under the bound
     * org, so the new org really did end up brandless. The premise was
     * right, its provenance was an accident, and an accident that was also
     * corrupting the org it filed the brand into.
     */
    private function makeBrandlessOrg(string $name = 'Brandless'): Organization
    {
        $org = $this->makeOrg($name);

        DB::table('brands')->where('organization_id', $org->id)->delete();

        return $org;
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

    // ─── Plumbing ────────────────────────────────────────────────────────

    private function controller(): LandingPageController
    {
        return new LandingPageController();
    }

    private function request(array $payload = []): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages', 'POST', $payload);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    private function body(JsonResponse $response): array
    {
        return json_decode($response->getContent(), true);
    }

    private function create(string $slug = 'glamour-salon'): array
    {
        return $this->body($this->controller()->store(
            $this->request(['slug' => $slug, 'template_key' => 'ruled_page'])
        ));
    }

    /** A rival tenant already holding an address in the shared namespace. */
    private function pageOwnedByAnotherTenant(string $slug): LandingPage
    {
        $rival      = $this->makeOrg('Rival ' . uniqid());
        $keep       = $this->user;
        $keepBrand  = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        $this->actAs($this->makeUser($rival), null);
        $page = LandingPage::create([
            'slug' => $slug, 'template_key' => 'ruled_page',
            'industry' => 'beauty', 'status' => LandingPage::STATUS_PUBLISHED,
        ]);

        $this->actAs($keep, $keepBrand);

        return $page;
    }

    /** Read a row past every scope — the only honest way to ask about someone else's page. */
    private function statusOf(int $id): string
    {
        return LandingPage::withoutGlobalScopes()->findOrFail($id)->status;
    }

    // ─── Creation ────────────────────────────────────────────────────────

    public function test_a_new_page_starts_as_a_draft_in_the_orgs_industry(): void
    {
        $page = $this->create()['page'];

        $this->assertSame(LandingPage::STATUS_DRAFT, $page['status']);
        $this->assertSame('beauty', $page['industry']);
        $this->assertSame('glamour-salon', $page['slug']);
        $this->assertSame($this->org->id, $page['organization_id']);
    }

    /**
     * Ordering is fixed at creation deliberately: a later revision of the
     * industry profile must not silently reshuffle a page that is already
     * published and already being linked to.
     */
    public function test_creation_seeds_the_industry_default_sections_in_order(): void
    {
        $page = $this->create()['page'];

        $this->assertSame(
            ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'],
            array_column($page['sections'], 'key')
        );
        $this->assertSame([0, 1, 2, 3, 4, 5, 6], array_column($page['sections'], 'sort'));
    }

    /** The slug the tenant types is not the slug we store. */
    public function test_the_submitted_slug_is_normalised_before_it_is_stored(): void
    {
        $this->assertSame('cafe-mimi', $this->create('  Café Mimi  ')['page']['slug']);
    }

    /**
     * "All brands" mode binds a NULL brand. Container::instance() stores that
     * where resolve() looks with isset(), so the binding reads as absent and
     * a bare app('current_brand_id') throws instead of returning null — a 500
     * on the create path for any admin who has not picked a brand. This org
     * has no brand row either, so BelongsToBrand's default-brand fallback
     * cannot fill one in and the page is genuinely org-wide, which is what
     * PageContent already expects.
     */
    public function test_a_page_created_in_all_brands_mode_is_accepted(): void
    {
        $brandless = $this->makeBrandlessOrg();
        $this->actAs($this->makeUser($brandless), null);

        $this->assertNull($this->create('brandless-studio')['page']['brand_id']);
        $this->assertNotNull($this->body($this->controller()->show())['page']);
    }

    // ─── Slug rules ──────────────────────────────────────────────────────

    /**
     * The hazard this exists for: /{slug} is ONE namespace across every
     * tenant, but LandingPage is tenant-scoped, so the natural uniqueness
     * query cannot see the other business already holding the address. Two
     * shopfronts printing one URL is not a validation nicety.
     */
    public function test_a_slug_held_by_another_tenant_is_rejected(): void
    {
        $this->pageOwnedByAnotherTenant('glamour-salon');

        $this->expectException(ValidationException::class);
        $this->create('glamour-salon');
    }

    public function test_a_reserved_slug_is_rejected(): void
    {
        $this->expectException(ValidationException::class);
        $this->create('admin');
    }

    /** Industry ids are reserved too — they read as one of our own brands. */
    public function test_an_industry_name_is_rejected_as_a_slug(): void
    {
        $this->expectException(ValidationException::class);
        $this->create('beauty');
    }

    public function test_a_slug_that_normalises_to_something_too_short_is_rejected(): void
    {
        $this->expectException(ValidationException::class);
        $this->create('a!');
    }

    /**
     * Task 10b round 1 — the word "slug" must never reach the tenant
     * (spec §9), but `$request->validate()`'s own `max:63` rule runs
     * BEFORE `LandingPageGuard::validatedSlug()` (whose messages are
     * clean), and the address input has no `maxLength` — so this is
     * genuinely reachable, not a theoretical validator quirk. Both the
     * creating (`store`) and renaming (`update`) paths carry the same
     * rule and are asserted here.
     */
    public function test_a_too_long_slug_is_rejected_without_the_word_slug_reaching_the_tenant(): void
    {
        $tooLong = str_repeat('a', 64);

        try {
            $this->create($tooLong);
            $this->fail('A 64-character slug should have been rejected.');
        } catch (ValidationException $e) {
            $message = $e->errors()['slug'][0] ?? '';
            $this->assertStringNotContainsStringIgnoringCase('slug', $message,
                "The creation path's validation message says the word \"slug\": \"{$message}\"");
            $this->assertStringContainsString('63 characters', $message);
        }
    }

    public function test_renaming_to_a_too_long_slug_is_rejected_without_the_word_slug_reaching_the_tenant(): void
    {
        $this->create('glamour-salon');
        $tooLong = str_repeat('a', 64);

        try {
            $this->controller()->update($this->request(['slug' => $tooLong]));
            $this->fail('A 64-character slug should have been rejected.');
        } catch (ValidationException $e) {
            $message = $e->errors()['slug'][0] ?? '';
            $this->assertStringNotContainsStringIgnoringCase('slug', $message,
                "The rename path's validation message says the word \"slug\": \"{$message}\"");
            $this->assertStringContainsString('63 characters', $message);
        }
    }

    // ─── Rename ──────────────────────────────────────────────────────────

    /**
     * The old address may already be printed on a card, a menu or a window.
     * Renaming must not 404 it the moment it changes.
     */
    public function test_renaming_leaves_the_old_address_working(): void
    {
        $created = $this->create()['page'];

        $updated = $this->body($this->controller()->update(
            $this->request(['slug' => 'glamour-studio'])
        ))['page'];

        $this->assertSame('glamour-studio', $updated['slug']);

        $redirect = DB::table('landing_page_redirects')->where('slug', 'glamour-salon')->first();
        $this->assertNotNull($redirect, 'The previous address was dropped without a redirect.');
        $this->assertSame($created['id'], (int) $redirect->landing_page_id);
        $this->assertNotNull($redirect->expires_at);
    }

    /**
     * Re-saving the form without touching the address is the commonest write
     * there is. It must not collide with the page's own row, and it must not
     * leave a redirect from a slug to itself — which would make the page's
     * own address a redirect target the day it is renamed for real.
     */
    public function test_saving_an_unchanged_slug_is_neither_a_collision_nor_a_redirect(): void
    {
        $this->create();

        $updated = $this->body($this->controller()->update(
            $this->request(['slug' => 'glamour-salon'])
        ))['page'];

        $this->assertSame('glamour-salon', $updated['slug']);
        $this->assertSame(0, DB::table('landing_page_redirects')->count());
    }

    public function test_a_rename_onto_another_tenants_slug_is_rejected(): void
    {
        $this->create();
        $this->pageOwnedByAnotherTenant('taken-elsewhere');

        $this->expectException(ValidationException::class);
        $this->controller()->update($this->request(['slug' => 'taken-elsewhere']));
    }

    /** Editing copy is not a rename, and must not manufacture a redirect. */
    public function test_updating_content_without_a_slug_leaves_the_address_alone(): void
    {
        $this->create();

        $page = $this->body($this->controller()->update(
            $this->request(['content' => ['hero' => ['headline' => 'Quiet luxury']]])
        ))['page'];

        $this->assertSame('glamour-salon', $page['slug']);
        $this->assertSame(['hero' => ['headline' => 'Quiet luxury']], $page['content']);
        $this->assertSame(0, DB::table('landing_page_redirects')->count());
    }

    /**
     * `sometimes|array` constrained the OUTERMOST value and nothing else, so
     * a nested array could be stored under any key of theme, content or seo
     * — and the renderer reads those leaves as strings: theme.brand_color
     * goes into Accent::for(?string ...), every copy leaf goes through
     * Blade's e(), which is htmlspecialchars() with a `string` parameter.
     * Both throw a TypeError, so one PUT followed by a publish left the
     * tenant's own live page answering 500 to every visitor, with preview
     * — the only place they could have looked — 500ing identically.
     *
     * Scalars are not the problem and are not touched: an int or a bool
     * coerces to a string perfectly well.
     */
    public function test_a_nested_value_in_a_json_column_is_refused(): void
    {
        $this->create();

        foreach ([
            'theme'   => ['brand_color' => ['#ffffff']],
            'seo'     => ['title' => ['pwn']],
            'content' => ['hero' => ['headline' => ['pwn']]],
        ] as $column => $payload) {
            try {
                $this->controller()->update($this->request([$column => $payload]));
                $this->fail('A nested value under ' . $column . ' was accepted.');
            } catch (ValidationException $e) {
                $this->assertArrayHasKey($column, $e->errors());
            }
        }
    }

    /**
     * The message has to name the field. Whoever hits this is filling in a
     * marketing page, not reading a stack trace, and "content is invalid"
     * leaves them hunting through a JSON blob for the one bad key.
     */
    public function test_the_refusal_names_the_field_that_is_wrong(): void
    {
        $this->create();

        try {
            $this->controller()->update($this->request([
                'content' => ['hero' => ['subtext' => 'fine', 'headline' => ['pwn']]],
            ]));
            $this->fail('A nested value under content was accepted.');
        } catch (ValidationException $e) {
            $message = $e->errors()['content'][0];

            $this->assertStringContainsString('hero', $message, $message);
            $this->assertStringContainsString('headline', $message, $message);
        }
    }

    /**
     * The one level of nesting the renderer genuinely expects: the layout
     * reads $page->content[$section->key] and hands it to a partial as
     * $copy, so content is a map of section keys onto a map of fields.
     * Refusing that would refuse every real edit.
     */
    public function test_the_nesting_the_renderer_expects_is_still_accepted(): void
    {
        $this->create();

        $page = $this->body($this->controller()->update($this->request([
            'theme'   => ['brand_color' => '#1F5FA8'],
            'seo'     => ['title' => 'Maison Mimi', 'description' => 'Quiet luxury'],
            'content' => ['hero' => ['headline' => 'The Art of Wellness', 'subtext' => 'Quiet luxury']],
        ])))['page'];

        $this->assertSame('#1F5FA8', $page['theme']['brand_color']);
        $this->assertSame('Maison Mimi', $page['seo']['title']);
        $this->assertSame('The Art of Wellness', $page['content']['hero']['headline']);
    }

    /** A scalar leaf coerces to a string fine, whatever its type. */
    public function test_non_string_scalars_are_still_accepted(): void
    {
        $this->create();

        $page = $this->body($this->controller()->update($this->request([
            'theme'   => ['radius' => 12, 'dark' => false],
            'content' => ['hero' => ['headline' => 0]],
        ])))['page'];

        $this->assertSame(12, $page['theme']['radius']);
        $this->assertSame(0, $page['content']['hero']['headline']);
    }

    // ─── Web address (Task 10) ───────────────────────────────────────────

    /**
     * The admin editor shows the tenant's whole public address ("Web
     * address", never "slug") with a Copy button, and cannot build it
     * itself: nothing about the LANDING host is otherwise visible from the
     * admin SPA's own origin. `url` has to be the SAME address the public
     * renderer answers to, not a second, hand-built guess at it.
     */
    public function test_the_page_carries_its_own_full_public_address(): void
    {
        $page = $this->create('glamour-salon')['page'];

        $this->assertStringContainsString(config('landing.host'), $page['url']);
        $this->assertStringEndsWith('/glamour-salon', $page['url']);
    }

    /** Renaming the address must be reflected in `url` immediately, not just `slug`. */
    public function test_the_full_address_updates_when_the_slug_changes(): void
    {
        $this->create('glamour-salon');

        $updated = $this->body($this->controller()->update(
            $this->request(['slug' => 'glamour-studio'])
        ))['page'];

        $this->assertSame('glamour-studio', $updated['slug']);
        $this->assertStringEndsWith('/glamour-studio', $updated['url']);
    }

    // ─── Publishing ──────────────────────────────────────────────────────

    /**
     * The clock is pinned rather than left to run. Publish, unpublish and
     * republish complete inside the same second, and the column has no
     * sub-second precision, so on a real clock BOTH timestamps serialise
     * identically and the assertion holds against a controller that rewrites
     * first_published_at on every publish — the exact bug it exists to catch.
     * Two pinned instants a day apart is what makes it discriminate.
     */
    public function test_republishing_does_not_rewrite_the_first_publish_date(): void
    {
        $this->create();

        Carbon::setTestNow('2026-08-01 09:00:00');
        $first = $this->body($this->controller()->publish())['page'];
        $this->assertSame(LandingPage::STATUS_PUBLISHED, $first['status']);
        $this->assertNotNull($first['first_published_at']);

        $this->controller()->unpublish();

        Carbon::setTestNow('2026-08-02 17:30:00');
        $republished = $this->body($this->controller()->publish())['page'];

        // first_published_at is the page's birthday, not its last edit, so an
        // unpublish/republish cycle must not move it...
        $this->assertSame($first['first_published_at'], $republished['first_published_at']);
        // ...while published_at is the last edit, and must.
        $this->assertNotSame($first['published_at'], $republished['published_at']);
    }

    public function test_unpublishing_returns_the_page_to_draft(): void
    {
        $this->create();
        $this->controller()->publish();

        $this->assertSame(
            LandingPage::STATUS_DRAFT,
            $this->body($this->controller()->unpublish())['page']['status']
        );
    }

    /**
     * unpublish() now sits OUTSIDE `feature:landing_pages` (routes/api.php),
     * so a downgraded or cancelled tenant can still take their own live page
     * — prices, staff names, phone number, address — off the internet.
     *
     * What that must not become is a way to take somebody ELSE's page down.
     * Nothing in the URL names a page, so the only thing standing between a
     * caller and a rival's row is `current()`'s reliance on the tenant scope:
     * these two tests are what says so. Both directions are asserted — the
     * caller's own page really does go to draft, and the rival's really does
     * stay published — because a controller that unpublished NOTHING would
     * satisfy half of it.
     */
    public function test_unpublishing_does_not_reach_another_tenants_page(): void
    {
        // The rival's row is created FIRST, so it carries the lower id and
        // sorts first: a `current()` that lost its tenant scope would reach
        // for it before the caller's own page, which is the whole failure
        // mode this is watching for. Created the other way round, the query
        // finds the right row by accident and the test proves nothing.
        $rival = $this->pageOwnedByAnotherTenant('rival-salon');

        $mine = $this->create()['page'];
        $this->controller()->publish();

        $this->controller()->unpublish();

        $this->assertSame(LandingPage::STATUS_DRAFT, $this->statusOf($mine['id']),
            'The caller could not take their own page down.');
        $this->assertSame(LandingPage::STATUS_PUBLISHED, $this->statusOf($rival->id),
            "One tenant's unpublish took another tenant's page down.");
    }

    /**
     * And the version with no cover story: a tenant that has no page of its
     * own has nothing to unpublish, and must not fall through to the only
     * row in the table.
     */
    public function test_a_tenant_with_no_page_cannot_unpublish_the_only_page_there_is(): void
    {
        $rival = $this->pageOwnedByAnotherTenant('rival-salon');

        try {
            $this->controller()->unpublish();
            $this->fail("unpublish() acted on another tenant's page.");
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }

        $this->assertSame(LandingPage::STATUS_PUBLISHED, $this->statusOf($rival->id));
    }

    // ─── Status (Task 10b — the read half of teardown) ────────────────────

    /**
     * `status()` is the deliberately minimal read counterpart to
     * `unpublish()` (routes/api.php's own comment on the new route has the
     * full story). These four tests are its whole contract: no page, a
     * draft page, and a published page all answer correctly, and a
     * published-but-not-mine page must not leak through — the same tenant
     * isolation `unpublish()` itself depends on.
     */
    public function test_status_reports_not_published_when_there_is_no_page(): void
    {
        $body = $this->body($this->controller()->status());

        $this->assertFalse($body['published']);
        $this->assertNull($body['url']);
    }

    public function test_status_reports_not_published_for_a_draft_page(): void
    {
        $this->create();

        $body = $this->body($this->controller()->status());

        $this->assertFalse($body['published']);
        $this->assertNull($body['url'],
            'A draft page is nothing to tear down, so its address must not leak through the entitlement-free route.');
    }

    /** The one case a lapsed tenant actually needs: published, with the real address. */
    public function test_status_reports_published_with_the_public_url_for_a_live_page(): void
    {
        $page = $this->create('glamour-salon')['page'];
        $this->controller()->publish();

        $body = $this->body($this->controller()->status());

        $this->assertTrue($body['published']);
        $this->assertSame($page['url'], $body['url']);
        $this->assertStringEndsWith('/glamour-salon', $body['url']);
    }

    /**
     * Same isolation story as unpublish: nothing about this entitlement-free
     * route may let one tenant see whether ANOTHER tenant's page is public.
     * The rival's page is published and sorts first (created before mine),
     * so a `current()` that lost its tenant scope would report it instead.
     */
    public function test_status_does_not_reach_another_tenants_page(): void
    {
        $this->pageOwnedByAnotherTenant('rival-salon');

        $body = $this->body($this->controller()->status());

        $this->assertFalse($body['published']);
        $this->assertNull($body['url']);
    }

    // ─── Preview ─────────────────────────────────────────────────────────

    /** A draft is visible to whoever holds the link, and to nobody else. */
    public function test_the_preview_url_carries_a_signature_that_actually_validates(): void
    {
        $page = $this->create()['page'];

        $url = $this->body($this->controller()->previewUrl())['url'];

        $this->assertStringContainsString(config('landing.host'), $url);
        $this->assertStringContainsString('/preview/' . $page['id'], $url);
        $this->assertTrue(URL::hasValidSignature(Request::create($url)));

        // Point the same signature at a different page and it must not verify,
        // or "and to nobody else" is decoration.
        $tampered = str_replace('/preview/' . $page['id'], '/preview/' . ($page['id'] + 1), $url);
        $this->assertFalse(URL::hasValidSignature(Request::create($tampered)));
    }

    // ─── Nothing there yet, and nothing of anyone else's ─────────────────

    public function test_show_reports_no_page_rather_than_failing(): void
    {
        $this->assertNull($this->body($this->controller()->show())['page']);
    }

    public function test_publishing_a_page_that_does_not_exist_is_a_404(): void
    {
        $this->expectException(HttpException::class);
        $this->controller()->publish();
    }

    /**
     * `current()` carries no where clause by design — the tenant scope is the
     * whole isolation story, and this is the test that says so. Without it,
     * "do not add a where clause" is a comment with nothing behind it.
     */
    public function test_another_tenants_page_is_invisible_here(): void
    {
        $this->pageOwnedByAnotherTenant('rival-salon');

        $this->assertNull($this->body($this->controller()->show())['page']);
    }

    // ─── The redirect table is part of the namespace ─────────────────────

    /**
     * A retired address is still an occupied address, and this is how two
     * businesses end up on one URL:
     *
     *   Salon A creates alpha-salon, renames to beta-salon  → alpha-salon
     *                                                         redirects to page
     *                                                         #1 for 90 days
     *   Salon B creates alpha-salon                         → accepted, page #2
     *
     * Both now own alpha-salon, one row per table. This is live harm before
     * Task 12 ships anything: the public renderer resolves /{slug} straight off
     * landing_pages, so the moment Salon B publishes, every customer scanning
     * Salon A's shopfront QR code lands on a competitor. Task 12 cannot fix it
     * either — whichever table its resolver consults first, one tenant is wrong.
     */
    public function test_an_address_another_tenant_still_redirects_from_is_not_free(): void
    {
        $this->create('alpha-salon');
        $this->controller()->update($this->request(['slug' => 'beta-salon']));

        $rival = $this->makeOrg('Rival ' . uniqid());
        $this->actAs($this->makeUser($rival), null);

        $this->expectException(ValidationException::class);
        $this->create('alpha-salon');
    }

    /**
     * The 90 days are a promise with an end date. Once a redirect has lapsed
     * the address genuinely is free, and continuing to refuse it would quietly
     * turn every rename any tenant ever made into a permanent reservation.
     */
    public function test_an_address_whose_redirect_has_lapsed_is_free_again(): void
    {
        $this->create('alpha-salon');
        $this->controller()->update($this->request(['slug' => 'beta-salon']));

        DB::table('landing_page_redirects')
            ->where('slug', 'alpha-salon')
            ->update(['expires_at' => now()->subDay()]);

        $rival = $this->makeOrg('Rival ' . uniqid());
        $this->actAs($this->makeUser($rival), null);

        $this->assertSame('alpha-salon', $this->create('alpha-salon')['page']['slug']);
    }

    /**
     * A tenant must be able to move back to an address it used to hold — and
     * arrive there cleanly. Left alone, a → b → a ends with the page's own
     * primary URL listed as a redirect to itself: dead weight if Task 12's
     * resolver checks landing_pages first, an infinite loop if it does not.
     */
    public function test_renaming_back_to_a_previous_address_leaves_no_redirect_to_itself(): void
    {
        $this->create('alpha-salon');
        $this->controller()->update($this->request(['slug' => 'beta-salon']));

        $page = $this->body($this->controller()->update($this->request(['slug' => 'alpha-salon'])))['page'];

        $this->assertSame('alpha-salon', $page['slug']);
        $this->assertSame(
            0,
            DB::table('landing_page_redirects')->where('slug', 'alpha-salon')->count(),
            'The page redirects away from its own live address.'
        );
        // The address it has just left keeps working, which is the whole point.
        $this->assertSame(1, DB::table('landing_page_redirects')->where('slug', 'beta-salon')->count());
    }

    // ─── One page per brand ──────────────────────────────────────────────

    /**
     * "All brands" mode used to be answered with a 409 here, because
     * BrandScope no-ops on a null brand: every page in the org matched, and
     * an unordered ->first() would have picked one — publish() putting
     * whichever row sorted first on the internet.
     *
     * The refusal covered the plural case and MISSED the singular one. With
     * exactly one page in the org, belonging to some sibling brand, there
     * was no ambiguity to refuse and that page was simply returned; see
     * test_all_brands_mode_does_not_reach_a_sibling_brands_page, which is
     * the half that mattered.
     *
     * The answer now is the same one the WRITE path has always given:
     * BelongsToBrand puts a page created in this mode on the org's default
     * brand, so this mode reads that brand's page. Deterministic, and the
     * same row a create would target rather than whichever sorted first.
     */
    public function test_all_brands_mode_resolves_the_default_brands_page(): void
    {
        $second = $this->makeSiblingBrand($this->org);

        $this->create('brand-one-page');
        $this->actAs($this->user, $second);
        $this->create('brand-two-page');

        $this->actAs($this->user, null);

        $this->assertSame('brand-one-page', $this->body($this->controller()->show())['page']['slug']);
    }

    /**
     * The half the old 409 could not see: one page in the org, and it
     * belongs to a brand this request is not operating as.
     *
     * Nothing is ambiguous, so nothing was refused, and the sibling's page
     * came back — which means publish() would have put that sibling's
     * prices, staff names, phone number and address on the internet on
     * behalf of an admin who never selected it.
     */
    public function test_all_brands_mode_does_not_reach_a_sibling_brands_page(): void
    {
        $second = $this->makeSiblingBrand($this->org);

        $this->actAs($this->user, $second);
        $this->create('sibling-page');

        $this->actAs($this->user, null);

        $this->assertNull(
            $this->body($this->controller()->show())['page'],
            'An admin in "All brands" mode was handed the page of a sibling brand.',
        );

        try {
            $this->controller()->publish();
            $this->fail('publish() acted on a page belonging to another brand.');
        } catch (HttpException $e) {
            $this->assertSame(404, $e->getStatusCode());
        }

        $this->assertNull(
            LandingPage::withoutGlobalScopes()->where('slug', 'sibling-page')->first()->published_at,
            'The page of a sibling brand was published by a request that never named it.',
        );
    }

    /*
     * A page with brand_id NULL belongs to the ORGANISATION. store() leaves
     * it null only while the org has no default brand -- and
     * Organization::created backfills one -- so "page created first, default
     * brand appears afterwards" is a real if uncommon sequence, and it used
     * to make that page unreachable from every verb and every brand
     * selection at once. The three tests below hold all six verbs on it.
     */

    /** The org-wide page, created before the org had a default brand. */
    private function orgWidePage(string $slug = 'org-wide-studio', string $status = 'draft'): int
    {
        return (int) DB::table('landing_pages')->insertGetId([
            'organization_id' => $this->org->id,
            'brand_id'        => null,
            'slug'            => $slug,
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => $status,
            'published_at'    => $status === 'published' ? now() : null,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    public function test_an_org_wide_page_is_reachable_once_the_org_has_a_default_brand(): void
    {
        $id = $this->orgWidePage();

        // Both affordances an admin actually has: no brand chosen, and the
        // default brand chosen. Neither can bind a null brand, because null
        // is exactly what the resolver substitutes away.
        foreach ([null, $this->defaultBrandId($this->org)] as $selection) {
            $this->actAs($this->user, $selection);

            $page = $this->body($this->controller()->show())['page'];

            $this->assertNotNull($page, 'The organisation-wide page was unreachable.');
            $this->assertSame($id, $page['id']);
            $this->assertNotNull($this->body($this->controller()->previewUrl())['url']);
        }
    }

    /**
     * The verb this is really about.
     *
     * unpublish sits outside the billing gate on purpose, so that ceasing to
     * pay can never compel a business to stay published. A page the resolver
     * cannot find is a live public page whose owner has no way to take it
     * down — the "only way off the internet was us running an UPDATE by
     * hand" failure LandingPageTeardownTest exists to prevent, reached
     * through the resolver instead of through the middleware.
     */
    public function test_an_org_wide_page_can_still_be_taken_off_the_internet(): void
    {
        $id = $this->orgWidePage('org-wide-live', 'published');

        $this->actAs($this->user, null);

        $this->controller()->unpublish();

        $this->assertSame(
            'draft',
            DB::table('landing_pages')->where('id', $id)->value('status'),
            'A published organisation-wide page could not be unpublished by its own owner.',
        );
    }

    public function test_an_org_wide_page_can_still_be_edited_and_published(): void
    {
        $id = $this->orgWidePage();

        $this->actAs($this->user, null);

        $this->controller()->update($this->request(['slug' => 'org-wide-renamed']));
        $this->controller()->publish();

        $row = DB::table('landing_pages')->where('id', $id)->first();

        $this->assertSame('org-wide-renamed', $row->slug);
        $this->assertSame('published', $row->status);
    }

    /**
     * ...and the fallback is exactly one row wide. A page on a SIBLING brand
     * is not the organisation's page and must stay out of reach — the hole
     * this resolver was written to close.
     */
    public function test_the_org_wide_fallback_does_not_reach_a_sibling_brands_page(): void
    {
        $second = $this->makeSiblingBrand($this->org);

        $this->actAs($this->user, $second);
        $this->create('sibling-only-page');

        $this->actAs($this->user, null);

        $this->assertNull(
            $this->body($this->controller()->show())['page'],
            'The organisation-wide fallback reached the page of a sibling brand.',
        );
    }

    /**
     * The ambiguity guard is kept, and this is the one state that can still
     * reach it: two pages belonging to NO brand. The (organization_id,
     * brand_id) unique index treats NULLs as distinct on both sqlite and
     * Postgres, so it cannot forbid the second row — only the
     * brandHasPage() check can, and two simultaneous writes can pass it.
     *
     * Reproduced by hand here because the application refuses to create it.
     */
    public function test_two_pages_belonging_to_no_brand_are_still_refused(): void
    {
        // No default brand to fall back on, so the resolved brand is null.
        DB::table('brands')->where('organization_id', $this->org->id)->delete();

        foreach (['orphan-one', 'orphan-two'] as $slug) {
            DB::table('landing_pages')->insert([
                'organization_id' => $this->org->id,
                'brand_id'        => null,
                'slug'            => $slug,
                'template_key'    => 'ruled_page',
                'industry'        => 'beauty',
                'status'          => 'draft',
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);
        }

        $this->actAs($this->user, null);

        try {
            $this->controller()->show();
            $this->fail('show() picked one of two brandless pages instead of refusing.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    /** ...and with a brand bound it is unambiguous again. */
    public function test_selecting_a_brand_resolves_the_ambiguity(): void
    {
        $second = $this->makeSiblingBrand($this->org);

        $this->create('brand-one-page');
        $this->actAs($this->user, $second);
        $this->create('brand-two-page');

        $this->assertSame('brand-two-page', $this->body($this->controller()->show())['page']['slug']);
    }

    /**
     * Phase 1 has no UI, so this API is the surface and posting twice is the
     * likeliest first mistake an integrator makes. The unique index turns it
     * into a 500; say 409 and say what to do instead.
     */
    public function test_a_second_page_for_the_same_brand_is_a_conflict_not_a_500(): void
    {
        $this->create('first-page');

        try {
            $this->create('second-page');
            $this->fail('A second page was created for a brand that already had one.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertStringContainsString('already has a landing page', $e->getMessage());
        }
    }

    /**
     * The same conflict arriving by the route the pre-check cannot see: nothing
     * is bound, so BelongsToBrand substitutes the org's default brand *after*
     * we have looked for a null-brand row and found none. Only the unique index
     * catches this one.
     */
    public function test_a_second_page_lands_on_the_default_brand_and_still_conflicts(): void
    {
        $this->actAs($this->user, null);

        $first = $this->create('first-page')['page'];
        $this->assertNotNull($first['brand_id'], 'BelongsToBrand did not substitute the default brand.');

        try {
            $this->create('second-page');
            $this->fail('The unique index was allowed to surface as a 500.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    /**
     * And the route the unique index cannot see: NULLs are distinct in a unique
     * index on both sqlite and Postgres, so two org-wide pages never violate
     * (organization_id, brand_id) at all. Only the pre-check catches this one —
     * which is why both exist.
     */
    public function test_a_second_org_wide_page_is_a_conflict_the_index_cannot_see(): void
    {
        $brandless = $this->makeBrandlessOrg();
        $this->actAs($this->makeUser($brandless), null);

        $this->assertNull($this->create('brandless-one')['page']['brand_id']);

        try {
            $this->create('brandless-two');
            $this->fail('A second org-wide page was created.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    // ─── The invariant, and the races that test it ───────────────────────

    /**
     * store() must uphold the invariant update() does: no redirect row may
     * share a slug with a live page. Claiming a lapsed address is the one way
     * to break it — validatedSlug() lets the claim through precisely because
     * the redirect has expired, and the dead row is then left sitting on the
     * same slug as a live page belonging to someone else.
     *
     * Inert against today's resolver, which reads landing_pages only. The cost
     * is paid later: Task 12 cannot use the invariant to make its lookup order
     * irrelevant if the invariant is not actually true.
     */
    public function test_claiming_a_lapsed_address_clears_the_redirect_left_on_it(): void
    {
        $this->create('alpha-salon');
        $this->controller()->update($this->request(['slug' => 'beta-salon']));

        DB::table('landing_page_redirects')
            ->where('slug', 'alpha-salon')
            ->update(['expires_at' => now()->subDay()]);

        $rival = $this->makeOrg('Rival ' . uniqid());
        $this->actAs($this->makeUser($rival), null);

        $this->assertSame('alpha-salon', $this->create('alpha-salon')['page']['slug']);
        $this->assertSame(
            0,
            DB::table('landing_page_redirects')->where('slug', 'alpha-salon')->count(),
            'A live page and a redirect row share one slug.'
        );
    }

    /**
     * The same lost race must read the same to a caller whichever verb they
     * used. store() answers a lost slug race with a 422; before this, update()
     * let the UniqueConstraintViolationException escape as a 500.
     *
     * The collision is wedged into the only window a real race can occupy — the
     * gap between validatedSlug() and the write — by listening for
     * validatedSlug()'s own redirect lookup, which is the last query before
     * DB::transaction() opens its savepoint. Inserting there means the row
     * survives the rollback exactly as another request's committed row would,
     * which a row inserted inside the transaction would not.
     */
    public function test_a_rename_that_loses_a_slug_race_is_a_422_not_a_500(): void
    {
        $this->create('glamour-salon');

        $rival = $this->makeOrg('Rival ' . uniqid());
        $armed = false;

        DB::listen(function ($query) use (&$armed, $rival) {
            if ($armed || !str_contains($query->sql, 'landing_page_redirects')) {
                return;
            }

            $armed = true;
            DB::table('landing_pages')->insert([
                'organization_id' => $rival->id,
                'slug'            => 'contested',
                'template_key'    => 'ruled_page',
                'industry'        => 'beauty',
                'status'          => LandingPage::STATUS_DRAFT,
            ]);
        });

        try {
            $this->controller()->update($this->request(['slug' => 'contested']));
            $this->fail('The rename claimed an address another tenant had just taken.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('slug', $e->errors());
        }

        $this->assertTrue($armed, 'The race was never armed, so this test proved nothing.');
        // The rename rolled back whole: the page keeps its address, and no
        // redirect was left behind for a move that never happened.
        $this->assertSame('glamour-salon', $this->body($this->controller()->show())['page']['slug']);
        $this->assertSame(0, DB::table('landing_page_redirects')->count());
    }

    /**
     * The 409 is the else-branch for a unique violation that is not on `slug`,
     * and on Postgres that detection is SQLSTATE 23505 — which also covers a
     * primary-key collision from a desynced landing_pages_id_seq, routine after
     * a manual insert or a restore. Telling an admin "this brand already has a
     * landing page" when the brand has none sends them looking for a page that
     * does not exist, so the claim is made only once the row is demonstrably
     * there. Anything else stays a 500, which is the honest answer to a failure
     * we cannot explain.
     *
     * A temporary second unique index stands in for that desync. sqlite's
     * AUTOINCREMENT takes max(sqlite_sequence.seq, max rowid), so the sequence
     * cannot be rewound into a collision here — but the class of failure is
     * what the guard turns on, and any index that is neither `slug` nor
     * (organization_id, brand_id) produces it.
     */
    public function test_an_unrelated_unique_violation_is_not_dressed_up_as_a_brand_conflict(): void
    {
        $this->create('first-page');

        // A brandless org, so both the pre-check and the re-check in the catch
        // truthfully answer "this brand has no page" — leaving the collision
        // nowhere to hide behind a plausible-sounding 409.
        $brandless = $this->makeBrandlessOrg();
        $this->actAs($this->makeUser($brandless), null);

        DB::statement('CREATE UNIQUE INDEX tmp_one_template_only ON landing_pages (template_key)');

        try {
            $this->create('second-page');
            $this->fail('A unique violation we cannot explain was reported as a brand conflict.');
        } catch (UniqueConstraintViolationException $e) {
            $this->assertStringNotContainsString('already has a landing page', $e->getMessage());
        } finally {
            DB::statement('DROP INDEX IF EXISTS tmp_one_template_only');
        }
    }
}
