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

        $this->actAs($this->user, $this->makeBrand($this->org, isDefault: true));
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

    private function makeOrg(string $name, ?string $industry = 'beauty'): Organization
    {
        return Organization::create([
            'name'     => $name,
            'slug'     => str()->slug($name) . '-' . uniqid(),
            'industry' => $industry,
        ]);
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

    /** Inserted directly: Brand's own model hooks rebind the brand context. */
    private function makeBrand(Organization $org, bool $isDefault = true): int
    {
        return (int) DB::table('brands')->insertGetId([
            'organization_id' => $org->id,
            'name'            => $org->name,
            'is_default'      => $isDefault,
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
    private function pageOwnedByAnotherTenant(string $slug): void
    {
        $rival      = $this->makeOrg('Rival ' . uniqid());
        $keep       = $this->user;
        $keepBrand  = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        $this->actAs($this->makeUser($rival), null);
        LandingPage::create([
            'slug' => $slug, 'template_key' => 'ruled_page',
            'industry' => 'beauty', 'status' => LandingPage::STATUS_PUBLISHED,
        ]);

        $this->actAs($keep, $keepBrand);
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
        $brandless = $this->makeOrg('Brandless');
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
     * "One page per brand, so there is no index" holds only while a brand is
     * bound. BrandScope no-ops on a null brand, so in "All brands" mode every
     * page in the org matches and an unordered ->first() picks one — publish()
     * would publish whichever row sorted first while the other stayed
     * unreachable, with nothing raised to say so.
     *
     * Refusing beats guessing, and refusing beats demanding a brand:
     * test_a_page_created_in_all_brands_mode_is_accepted covers the org that
     * legitimately has no brand at all, and a blanket brand requirement would
     * lock that org out of the feature entirely.
     */
    public function test_all_brands_mode_refuses_to_guess_which_page_is_meant(): void
    {
        $second = $this->makeBrand($this->org, isDefault: false);

        $this->create('brand-one-page');
        $this->actAs($this->user, $second);
        $this->create('brand-two-page');

        $this->actAs($this->user, null);

        try {
            $this->controller()->show();
            $this->fail('show() picked one of two pages instead of refusing.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    /** ...and with a brand bound it is unambiguous again. */
    public function test_selecting_a_brand_resolves_the_ambiguity(): void
    {
        $second = $this->makeBrand($this->org, isDefault: false);

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
        $brandless = $this->makeOrg('Brandless');
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
        $brandless = $this->makeOrg('Brandless');
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
