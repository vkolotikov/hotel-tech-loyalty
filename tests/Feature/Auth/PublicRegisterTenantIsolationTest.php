<?php

namespace Tests\Feature\Auth;

use App\Models\Brand;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Regression guard for 24fd82a20 ("Close the tenant-hop hole in public
 * member sign-up").
 *
 * POST /v1/auth/register is public and anonymous — no token, no session,
 * reachable by anyone who can reach the API. It used to accept a caller-
 * supplied `organization_id` and trust it outright:
 *
 *     'organization_id' => 'nullable|integer|exists:organizations,id'
 *     $orgId = $validated['organization_id'] ?? null;
 *
 * Organization ids are sequential, so an anonymous caller could enrol
 * themselves into ANY tenant's loyalty programme just by counting 1, 2,
 * 3 — landing inside another business's member base, visible to that
 * business's staff, counting against that tenant's plan member cap, and
 * collecting their welcome bonus. There was no authorization check of any
 * kind on the id.
 *
 * The fix deletes both lines: `$orgId` can now only come from `org_token`
 * (an unguessable, revocable 32-char value resolved via
 * `Brand::resolveByToken`) or from an already-bound tenant context. No
 * test posted `organization_id` to this endpoint before this file, so
 * nothing stood between the fix and a quiet revert reinstating the two
 * deleted lines — this is that test.
 *
 * Every assertion here is on the OUTCOME (which organization/brand context
 * actually got used, whether a row was actually written), never on the
 * HTTP status alone — a status code is what a re-broken endpoint would
 * still get right by accident.
 *
 * Fixture note: every org used below is given a real, active default-tier
 * loyalty programme (an active LoyaltyTier at min_points 0). Without one,
 * register() 422s before ever reaching the org-resolution bug this file
 * is about ("Loyalty program is not configured for this hotel yet"), and
 * a passing test would prove nothing about tenant isolation. Organizations
 * are built via `Organization::create()`, never by hand-inserting a brand
 * row — `Organization::created` already provisions exactly one default
 * brand per org, and a hand-inserted second `is_default: true` row is a
 * state the production unique index forbids but sqlite happily allows,
 * silently invalidating any assertion that leans on "the" default brand.
 */
class PublicRegisterTenantIsolationTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const REGISTER = '/api/v1/auth/register';

    protected function setUp(): void
    {
        parent::setUp();

        // Builds on setUpLoyaltySchema (organizations, users, guests,
        // points_transactions, loyalty_tiers, brands, loyalty_members,
        // point_expiry_buckets) and adds domain_events + tier_assessments
        // + the extra loyalty_tiers columns — everything
        // LoyaltyService::awardPoints()'s welcome-bonus path touches
        // (DomainEvent::record, AuditLog::record, assessTier). Without
        // this, a successful register() 500s deep inside the welcome-
        // bonus transaction instead of returning 201, and the "legitimate
        // sign-up still works" tests below would fail for a reason that
        // has nothing to do with tenant isolation.
        $this->setUpLoyaltyAwardSchema();

        // setUpLoyaltySchema's `brands` table is missing two columns that
        // Organization::created's default-brand hook unconditionally writes
        // (Brand::$fillable includes both): `logo_url` and `sort_order`.
        // Without them the hook's Brand::create() throws, is caught by the
        // hook's own try/catch, and gets logged as a warning instead of
        // failing loudly — so every org built below would silently end up
        // with NO default brand at all, and defaultBrandOf() would fail
        // for a reason that has nothing to do with tenant isolation.
        if (!Schema::hasColumn('brands', 'logo_url')) {
            Schema::table('brands', fn ($table) => $table->string('logo_url')->nullable());
        }
        if (!Schema::hasColumn('brands', 'sort_order')) {
            Schema::table('brands', fn ($table) => $table->integer('sort_order')->default(0));
        }

        // setUpMinimalSchema's `users` table doesn't carry every column
        // AuthController::register() writes on the member path
        // (User::$fillable has date_of_birth + nationality; the table has
        // neither) — no other test in this suite drives register() far
        // enough to have needed them.
        if (!Schema::hasColumn('users', 'date_of_birth')) {
            Schema::table('users', fn ($table) => $table->date('date_of_birth')->nullable());
        }
        if (!Schema::hasColumn('users', 'nationality')) {
            Schema::table('users', fn ($table) => $table->string('nationality', 100)->nullable());
        }

        // setUpLoyaltySchema's `loyalty_members` table likewise doesn't
        // carry every column register() writes on member creation.
        if (!Schema::hasColumn('loyalty_members', 'qr_code_token')) {
            Schema::table('loyalty_members', fn ($table) => $table->string('qr_code_token', 191)->nullable());
        }
        if (!Schema::hasColumn('loyalty_members', 'referral_code')) {
            Schema::table('loyalty_members', fn ($table) => $table->string('referral_code', 20)->nullable());
        }
        if (!Schema::hasColumn('loyalty_members', 'referred_by')) {
            Schema::table('loyalty_members', fn ($table) => $table->unsignedBigInteger('referred_by')->nullable());
        }

        // register() mints a real Sanctum token on success
        // ($user->createToken('mobile-app')) — not Sanctum::actingAs(),
        // which fakes auth and never touches this table. No other test
        // in this suite exercises a real token mint, so nothing provisions
        // this table already.
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($table) {
                $table->bigIncrements('id');
                $table->string('tokenable_type');
                $table->unsignedBigInteger('tokenable_id');
                $table->text('name');
                $table->string('token', 64)->unique();
                $table->text('abilities')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
                $table->index(['tokenable_type', 'tokenable_id']);
            });
        }
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

    // ─── Fixtures ────────────────────────────────────────────────────────

    /**
     * A real, fully-working tenant: an organization with an active
     * default-tier loyalty programme already running. Deliberately NOT
     * built via OrganizationFactory — that pulls in columns this schema
     * doesn't carry. Organization::create()'s own `created` hook is what
     * gives it exactly one default brand; nothing here touches `brands`
     * directly for the default.
     */
    private function tenantWithLoyaltyProgram(string $name): Organization
    {
        $org = Organization::create([
            'name'                => $name,
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        LoyaltyTier::create([
            'organization_id' => $org->id,
            'name'            => 'Bronze',
            'min_points'      => 0,
            'is_active'       => true,
        ]);

        return $org;
    }

    /**
     * The org's default brand, fetched (not assumed) — asserted non-null
     * rather than cast, so a missing row fails loudly instead of a cast-
     * to-0 quietly making a "not the default brand" assertion trivially
     * true. Mirrors LandingPageTeardownTest::defaultBrandId().
     */
    private function defaultBrandOf(Organization $org): Brand
    {
        $brand = Brand::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->first();

        $this->assertNotNull($brand,
            'Fixture is wrong: the organisation has no default brand — Organization::created should have made one.');

        return $brand;
    }

    /**
     * A second, NON-default brand for a multi-brand org. Inserted with
     * is_default explicitly false and via the model (so Brand::booted()
     * still mints its widget_token) — never true, so this can never
     * collide with the one default the org already has.
     */
    private function siblingBrandOf(Organization $org, string $name): Brand
    {
        return Brand::create([
            'organization_id' => $org->id,
            'name'            => $name,
            'is_default'      => false,
        ]);
    }

    /** A minimally valid register() payload, email unique per call unless overridden. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name'                  => 'New Member',
            'email'                 => 'member_' . uniqid('', true) . '@example.test',
            'password'              => 'Sup3rSecret!1',
            'password_confirmation' => 'Sup3rSecret!1',
        ], $overrides);
    }

    // ─── 1. The hole is shut ─────────────────────────────────────────────

    /**
     * THE regression this file exists for. A real other organisation
     * exists, with its own live loyalty programme (so a hole here would
     * actually succeed in enrolling the caller, not incidentally 422 on
     * "no tier configured"). An anonymous caller supplies its id as
     * `organization_id` and nothing else.
     *
     * Asserted on outcome, not status alone: no user row for this email
     * anywhere, and no new member row landed in the victim org — either
     * of which a re-broken endpoint could satisfy while still returning
     * a superficially plausible-looking response.
     */
    public function test_organization_id_cannot_enrol_an_anonymous_caller_into_another_tenant(): void
    {
        $victim = $this->tenantWithLoyaltyProgram('Victim Hotel');
        $victimMembersBefore = LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $victim->id)->count();

        $email = 'attacker_' . uniqid('', true) . '@example.test';

        $response = $this->postJson(self::REGISTER, $this->payload([
            'email'            => $email,
            'organization_id'  => $victim->id,
        ]));

        $response->assertStatus(422);
        $this->assertStringContainsString(
            'We could not tell which loyalty programme you are joining',
            (string) $response->json('message'),
            'The 422 fired for a different reason than the org-resolution guard — this proves nothing about the tenant-hop fix.'
        );

        $this->assertNull(
            User::withoutGlobalScopes()->where('email', $email)->first(),
            'A user row was created for a request that should have been refused entirely — '
            . 'organization_id alone must not be able to write a row anywhere, not even a rejected one.'
        );

        $this->assertSame(
            $victimMembersBefore,
            LoyaltyMember::withoutGlobalScopes()->where('organization_id', $victim->id)->count(),
            'organization_id alone enrolled the caller into another tenant\'s loyalty programme — the tenant-hop hole is back.'
        );
    }

    // ─── 2. Legitimate sign-up still works, in the right org AND brand ──

    /**
     * The public, sanctioned path — org_token, the same token the
     * booking/services/chat widgets already use — must keep working, and
     * land the member in exactly the right place.
     *
     * The token used here belongs to a SIBLING (non-default) brand, not
     * the org's default one. `Brand::resolveByToken` binds
     * `current_brand_id` as a side effect (there is no brand_id column on
     * users/loyalty_members — loyalty lives at the org level — so this
     * bound context is the only place "which brand" is observable at
     * all). Using the sibling's token rather than the default's is what
     * makes this assertion mean something: if resolution silently fell
     * back to the org's default brand, using the default's own token
     * would never catch it.
     */
    public function test_valid_org_token_enrols_caller_into_the_correct_organization_and_brand(): void
    {
        $org     = $this->tenantWithLoyaltyProgram('Multi-Brand Spa Group');
        $sibling = $this->siblingBrandOf($org, 'Spa Group Riverside');

        $this->assertNotSame(
            $this->defaultBrandOf($org)->id,
            $sibling->id,
            'Fixture is wrong: the sibling brand must not be the default brand for this test to prove anything about brand resolution.'
        );

        $email = 'legit_' . uniqid('', true) . '@example.test';

        $response = $this->postJson(self::REGISTER, $this->payload([
            'email'     => $email,
            'org_token' => $sibling->widget_token,
        ]));

        $response->assertStatus(201);

        $user = User::withoutGlobalScopes()->where('email', $email)->first();
        $this->assertNotNull($user, 'Response was 201 but no user row exists.');
        $this->assertSame($org->id, $user->organization_id, 'Member landed in the wrong organisation.');

        $member = LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->first();
        $this->assertNotNull($member, 'No loyalty member row was created for the new user.');
        $this->assertSame($org->id, $member->organization_id, 'Loyalty member row landed in the wrong organisation.');

        $this->assertTrue(app()->bound('current_brand_id'),
            'org_token must bind brand context via Brand::resolveByToken.');
        $this->assertSame($sibling->id, app('current_brand_id'),
            'org_token resolved to the wrong brand — the member was bound to the default brand instead of the one their token names.');
    }

    // ─── 3. Neither identifier: fail clearly, write nothing ────────────

    /**
     * No org_token, no organization_id, no bound tenant context — the
     * baseline the fix's own docblock names explicitly: without an org,
     * the tier lookup runs unscoped and the pre-fix failure mode was a
     * 500 reading "No query results for model [LoyaltyMember]" after a
     * user row had ALREADY been written with a null organization_id, which
     * TenantScope then fails closed on — a member who can sign in and
     * then sees an empty app. This asserts the clean failure: a 422 with
     * the same explicit message, and no orphan user row left behind.
     */
    public function test_registering_with_no_organization_identifier_fails_clearly_and_writes_nothing(): void
    {
        $email = 'noorg_' . uniqid('', true) . '@example.test';

        $response = $this->postJson(self::REGISTER, $this->payload(['email' => $email]));

        $response->assertStatus(422);
        $this->assertStringContainsString(
            'We could not tell which loyalty programme you are joining',
            (string) $response->json('message'),
        );

        $this->assertNull(
            User::withoutGlobalScopes()->where('email', $email)->first(),
            'No organisation could be resolved, yet a user row was written — the exact orphan-row failure mode the fix\'s own comment describes.'
        );
    }

    // ─── 4. organization_id is inert even alongside a valid org_token ───

    /**
     * Belt-and-braces: organization_id must be dead weight even when a
     * VALID org_token for a DIFFERENT organisation rides along in the same
     * request — not merely "ignored when absent". Pre-fix, this is the
     * sharper failure: `$orgId = $validated['organization_id'] ?? null`
     * ran before the org_token branch and short-circuited it entirely
     * (`if (!$orgId && ...)`), so a supplied id didn't just get consulted
     * ahead of the token — it silently pre-empted the token altogether and
     * the legitimate org_token was never even resolved.
     */
    public function test_organization_id_cannot_override_a_valid_org_token(): void
    {
        $legit  = $this->tenantWithLoyaltyProgram('Legit Org');
        $victim = $this->tenantWithLoyaltyProgram('Other Org');
        $legitBrand = $this->defaultBrandOf($legit);

        $email = 'both_' . uniqid('', true) . '@example.test';

        $response = $this->postJson(self::REGISTER, $this->payload([
            'email'           => $email,
            'org_token'       => $legitBrand->widget_token,
            'organization_id' => $victim->id,
        ]));

        $response->assertStatus(201);

        $user = User::withoutGlobalScopes()->where('email', $email)->first();
        $this->assertNotNull($user);
        $this->assertSame(
            $legit->id,
            $user->organization_id,
            'organization_id overrode a valid org_token — the id must be inert even when a legitimate token is also present.'
        );

        $this->assertSame(
            0,
            LoyaltyMember::withoutGlobalScopes()->where('organization_id', $victim->id)->count(),
            'The caller was enrolled into the org named by organization_id instead of the one named by org_token.'
        );
    }
}
