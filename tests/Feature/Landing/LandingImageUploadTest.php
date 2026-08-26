<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * Task 4 (landing phase 3b, media round): the two admin endpoints that write
 * `content.{slot}.image_url`, and the single-writer rule that keeps
 * update()'s free-text path from ever writing the same leaf.
 *
 * Driven over real HTTP rather than by calling the controller directly (the
 * pattern LandingPageAdminApiTest uses): a file upload needs a genuine
 * multipart request for Laravel's `image`/`mimes` rules and
 * MaxImageDimensions to have anything real to inspect, and the entitlement
 * gate — one of the nine behaviours this file has to prove — only exists on
 * the assembled middleware stack, exactly as LandingPageTeardownTest found
 * for `unpublish`/`status`. The schema/fixture shape below mirrors that file
 * for the same reason: nothing else in the landing suites walks the full
 * request stack, so nothing else needs `plan_slug`/`staff`/`brand_user`.
 */
class LandingImageUploadTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // Creates `brands`, which BelongsToBrand's creating hook queries for
        // every landing page inserted without an explicit brand_id.
        $this->setUpLandingContentSchema();

        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($table) {
                $table->string('plan_slug', 32)->nullable();
            });
        }
        // CheckSubscription reads $user->staff?->isSuperAdmin() before
        // anything else; the table has to exist and stay empty.
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('role')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        // BrandMiddleware asks every staff user which brands they are pinned to.
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->string('role')->nullable();
                $table->timestamps();
            });
        }

        // MediaService::disk() auto-detects DigitalOcean Spaces whenever its
        // credentials are configured — and this repo's own .env carries real
        // ones, so an un-forced test would try a real network call. Force the
        // local disk deterministically and fake it, same as
        // GalleryUploadValidationTest (Task 2 of this same media round).
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Config::set('filesystems.disks.do.secret', null);
        Config::set('filesystems.disks.do.bucket', null);
        Storage::fake('public');
    }

    // ─── Fixtures ────────────────────────────────────────────────────────

    private function fixturePath(string $name): string
    {
        return base_path("tests/fixtures/images/{$name}");
    }

    /** GD when it exists (confirmed available on the pinned binary); the committed PNG otherwise. */
    private function smallImage(string $name = 'small.png'): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            return UploadedFile::fake()->image($name, 10, 10);
        }

        return UploadedFile::fake()->createWithContent(
            $name,
            file_get_contents($this->fixturePath('small-10x10.png')),
        );
    }

    /** 4200x10 — comfortably over the 4096 ceiling on its longest edge, comfortably under it on its shortest. */
    private function stripeImage(string $name = 'stripe.png'): UploadedFile
    {
        if (function_exists('imagecreatetruecolor')) {
            return UploadedFile::fake()->image($name, 4200, 10);
        }

        return UploadedFile::fake()->createWithContent(
            $name,
            file_get_contents($this->fixturePath('oversized-stripe-4200x10.png')),
        );
    }

    /**
     * Every admin call names the admin host explicitly — a relative URI
     * resolves against whatever host the container last saw, which is a
     * problem the instant a test also touches the public renderer. Same
     * helper shape as LandingPageTeardownTest::adminUrl().
     */
    private function adminUrl(string $uri): string
    {
        return 'http://' . parse_url(config('app.url'), PHP_URL_HOST) . $uri;
    }

    private function org(string $status = 'ACTIVE', string $plan = 'enterprise', array $features = ['landing_pages' => true]): Organization
    {
        return Organization::create([
            'name'                => 'Glamour',
            'slug'                => 'glamour-' . uniqid(),
            'industry'            => 'beauty',
            'subscription_status' => $status,
            'plan_slug'           => $plan,
            'plan_features'       => $features,
        ]);
    }

    private function user(Organization $org, string $type = 'staff'): User
    {
        return User::create([
            'name'            => 'Staff',
            'email'           => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id,
            'user_type'       => $type,
        ]);
    }

    private function actAsStaff(Organization $org): void
    {
        Sanctum::actingAs($this->user($org), ['*']);
    }

    /**
     * A page on the organisation's own (default) brand — the tenant scope is
     * bound just for the insert, exactly as LandingPageTeardownTest::livePage()
     * does, and released again immediately after: every request below
     * rebinds it for real through TenantMiddleware.
     */
    private function page(Organization $org, string $slug, array $content = []): LandingPage
    {
        app()->instance('current_organization_id', $org->id);

        $page = LandingPage::create([
            'organization_id' => $org->id,
            'slug'            => $slug,
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => LandingPage::STATUS_DRAFT,
            'content'         => $content,
        ]);

        app()->forgetInstance('current_organization_id');

        return $page;
    }

    // ─── Upload ──────────────────────────────────────────────────────────

    public function test_uploading_a_hero_image_stores_the_url_on_the_page(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->smallImage(),
        ]);

        $response->assertOk();
        $this->assertSame('hero', $response->json('slot'));
        $this->assertStringStartsWith('/storage/', $response->json('image_url'));

        $fresh = $page->fresh();
        $this->assertSame($response->json('image_url'), $fresh->content['hero']['image_url'] ?? null);

        Storage::disk('public')->assertExists(
            ltrim(substr($response->json('image_url'), strlen('/storage/')), '/'),
        );
    }

    /**
     * Mutation target 1: drop the `$old` delete from uploadImage() and this
     * is the test that goes red — the old file survives on the fake disk.
     */
    public function test_replacing_an_image_deletes_the_previous_file(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/old.png', 'old-bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero' => ['image_url' => '/storage/landing/old.png', 'headline' => 'Quiet luxury'],
        ]);

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->smallImage('new.png'),
        ]);

        $response->assertOk();

        Storage::disk('public')->assertMissing('landing/old.png');

        $fresh = $page->fresh();
        $this->assertNotSame('/storage/landing/old.png', $fresh->content['hero']['image_url']);
        // The sibling field in the same section survives the leaf-only write.
        $this->assertSame('Quiet luxury', $fresh->content['hero']['headline']);
    }

    /**
     * Ruling 3b-6 regression: pins the FRESH-row `$old` capture inside
     * uploadImage()'s transaction. PHP feature tests cannot exercise true
     * concurrency (the brief is explicit about this), so this only proves
     * the sequential end-state stays correct across two uploads to the same
     * slot in a row — a would-be revert to computing `$old` from a stale
     * pre-lock snapshot rather than the lockForUpdate()-re-read row is the
     * kind of change this test is meant to catch: the second upload must
     * delete the FIRST upload's own file, never re-delete (or miss) the
     * pre-test original, and the row must end up holding exactly the
     * second URL.
     */
    public function test_two_sequential_uploads_to_the_same_slot_end_with_only_the_second_file(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/original.png', 'original-bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero' => ['image_url' => '/storage/landing/original.png', 'headline' => 'Quiet luxury'],
        ]);

        $this->actAsStaff($org);

        $first = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->smallImage('first.png'),
        ]);
        $first->assertOk();
        $firstUrl = $first->json('image_url');
        $firstPath = ltrim(substr($firstUrl, strlen('/storage/')), '/');

        // The pre-test file is gone the moment the FIRST upload replaces it.
        Storage::disk('public')->assertMissing('landing/original.png');
        Storage::disk('public')->assertExists($firstPath);

        $second = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->smallImage('second.png'),
        ]);
        $second->assertOk();
        $secondUrl = $second->json('image_url');
        $secondPath = ltrim(substr($secondUrl, strlen('/storage/')), '/');

        $this->assertNotSame($firstUrl, $secondUrl);

        $fresh = $page->fresh();
        $this->assertSame($secondUrl, $fresh->content['hero']['image_url']);
        $this->assertSame('Quiet luxury', $fresh->content['hero']['headline']);

        // The SECOND upload deleted the FIRST upload's own file — not the
        // original again, and not left behind.
        Storage::disk('public')->assertMissing($firstPath);
        Storage::disk('public')->assertExists($secondPath);
    }

    public function test_removing_an_image_clears_the_leaf_and_deletes_the_file(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/existing.png', 'bytes');
        $page = $this->page($org, 'glamour-salon', [
            'about' => ['image_url' => '/storage/landing/existing.png', 'body' => 'Our story'],
        ]);

        $this->actAsStaff($org);

        $response = $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => 'about']);

        $response->assertOk();
        $this->assertSame('about', $response->json('slot'));
        $this->assertNull($response->json('image_url'));

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey('image_url', $fresh->content['about']);
        // The section is not pruned to nothing — update() never does that either.
        $this->assertSame('Our story', $fresh->content['about']['body']);

        Storage::disk('public')->assertMissing('landing/existing.png');
    }

    public function test_a_slot_outside_the_enum_is_refused_kindly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'footer',
            'image' => $this->smallImage(),
        ]);

        $response->assertStatus(422);
        $this->assertSame(
            'Please choose which photo you are replacing.',
            $response->json('errors.slot.0'),
        );
    }

    /**
     * Mutation target 3 lives in this suite too, in spirit: the fixture
     * matters for the same reason as MaxImageDimensionsTest's own stripe
     * fixture — a square image cannot tell max() apart from min().
     */
    public function test_oversized_dimensions_are_refused_by_the_backstop(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->stripeImage(),
        ]);

        $response->assertStatus(422);
        $this->assertSame(
            'That image is very large — please use one up to 4096 pixels on its longest side.',
            $response->json('errors.image.0'),
        );
    }

    /**
     * Ruling 3b-7, amending 3b-2: the carry-forward that protects hero/about's
     * `image_url` must NOT extend to any other section — those are the only
     * two slots the image endpoints (`slot` is `in:hero,about`) own. A
     * `services.image_url` leaf is a shape no endpoint in this build ever
     * writes; planted directly via `DB::table`, the same idiom
     * RuledPageRenderTest's own raw-content fixtures use, standing in for a
     * pre-existing or hand-edited row. An ordinary text-only save that
     * touches `services` (without that key) must not re-carry it back onto
     * the row the way it would for hero/about.
     *
     * Mutation: widen the carry-forward's scope back to every section and
     * this goes red — the leaf survives the save instead of vanishing.
     */
    public function test_carry_forward_does_not_protect_a_leaf_outside_hero_and_about(): void
    {
        $org = $this->org();
        $page = $this->page($org, 'glamour-salon', [
            'hero' => ['headline' => 'Old headline'],
        ]);

        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode([
                'hero'     => ['headline' => 'Old headline'],
                'services' => ['image_url' => '/storage/landing/services-leaked.png', 'heading' => 'Treatments'],
            ]),
        ]);

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => [
                'hero'     => ['headline' => 'New headline'],
                'services' => ['heading' => 'Treatments'],
            ],
        ]);

        $response->assertOk();

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey('image_url', $fresh->content['services'] ?? []);
        $this->assertSame('Treatments', $fresh->content['services']['heading'] ?? null);
    }

    // ─── The single-writer rule (D4) ──────────────────────────────────────

    /**
     * Mutation target 2: drop the D4 refusal from update() and this is the
     * test that goes red — the free-text path would happily overwrite the
     * leaf uploadImage()/removeImage() own, with no matching file delete.
     */
    public function test_update_refuses_to_write_image_url_directly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['hero' => ['image_url' => '/storage/landing/hack.png']],
        ]);

        $response->assertStatus(422);

        $message = $response->json('errors.content.0');
        $this->assertSame('Photos are changed with the photo controls, not by editing text.', $message);
        // The message must name no field path — spec 9's rule for "slug"
        // applies identically here.
        $this->assertStringNotContainsString('hero', $message);
        $this->assertStringNotContainsString('image_url', $message);
    }

    /**
     * Coordinator ruling 3b-2 (fix round 1): D4's refusal alone left exactly
     * one legal payload for a text-only save — omit `image_url` entirely —
     * and update() replaces `content` verbatim, so that one legal payload
     * erased whatever uploadImage() had just written. Proven interleaving:
     * upload a hero photo, then edit only the headline, and the photo is
     * gone with its file orphaned.
     *
     * Mutation target 1: drop the re-hydration and this goes red — the
     * headline still updates (200, not 422 — D4 is unchanged), but
     * `image_url` is missing afterwards.
     */
    public function test_a_text_only_save_does_not_erase_an_uploaded_image(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/hero.png', 'hero-bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero' => ['image_url' => '/storage/landing/hero.png', 'headline' => 'Old headline'],
        ]);

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            // The one payload shape D4 leaves legal: no image_url key at all.
            'content' => ['hero' => ['headline' => 'New headline']],
        ]);

        $response->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('New headline', $fresh->content['hero']['headline']);
        $this->assertSame('/storage/landing/hero.png', $fresh->content['hero']['image_url']);
        Storage::disk('public')->assertExists('landing/hero.png');
    }

    /**
     * The more severe half of the same defect: the section is not merely
     * missing its `image_url` key, the section itself is absent from the
     * submission (a save that only touches `hero` and never mentions
     * `about` at all). `content` is replaced wholesale, so `about` would
     * otherwise vanish along with its photo.
     *
     * Mutation target 2: drop the re-hydration and this goes red the same
     * way — `about` disappears entirely, taking `image_url` with it.
     */
    public function test_a_text_save_omitting_the_whole_section_still_keeps_its_image(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/hero.png', 'hero-bytes');
        Storage::disk('public')->put('landing/about.png', 'about-bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero'  => ['image_url' => '/storage/landing/hero.png', 'headline' => 'Old headline'],
            'about' => ['image_url' => '/storage/landing/about.png', 'body' => 'Our story'],
        ]);

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            // `about` is not mentioned at all — not even an empty array.
            'content' => ['hero' => ['headline' => 'New headline']],
        ]);

        $response->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('New headline', $fresh->content['hero']['headline']);
        $this->assertSame('/storage/landing/hero.png', $fresh->content['hero']['image_url']);
        $this->assertSame('/storage/landing/about.png', $fresh->content['about']['image_url'] ?? null,
            'The about section vanished (and its photo with it) even though the save never touched it.');
        Storage::disk('public')->assertExists('landing/about.png');
    }

    /**
     * The direction that must NOT regress: a photo the tenant deliberately
     * removed stays removed through any number of later text saves — there
     * is nothing STORED to carry forward once removeImage() has cleared it.
     *
     * Mutation target 3: make the re-hydration unconditional (copy forward
     * even when the stored leaf is absent) and this goes red — the removed
     * image would otherwise reappear from nowhere on the very next save.
     */
    public function test_a_removed_image_is_not_resurrected_by_a_later_text_save(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/hero.png', 'hero-bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero' => ['image_url' => '/storage/landing/hero.png', 'headline' => 'Old headline'],
        ]);

        $this->actAsStaff($org);

        $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => 'hero'])
            ->assertOk();
        $this->assertArrayNotHasKey('image_url', $page->fresh()->content['hero']);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['hero' => ['headline' => 'Updated after removal']],
        ]);

        $response->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('Updated after removal', $fresh->content['hero']['headline']);
        $this->assertArrayNotHasKey('image_url', $fresh->content['hero']);
    }

    /**
     * The wizard's `store()` validates `copy`/`theme`/`contact`/`sections` —
     * never a raw `content` key — so `content.hero.image_url` cannot reach
     * `LandingOnboardingService::apply()` at all: it is dropped by
     * `$request->validate()` before the controller ever calls the service.
     *
     * `copy.image_url` is the more interesting probe, sitting inside a key
     * that IS validated, and it is refused twice over rather than once:
     * `copy.headline`/`copy.subtext` are the only two dotted rules named for
     * `copy`, so Laravel's own exclude-unvalidated-array-keys behaviour (the
     * same mechanism update()'s own comment on `content.contact.*` describes)
     * drops `image_url` from `validated()`'s `copy` before the controller
     * returns; and even if it survived that,
     * LandingOnboardingService::content() builds the hero leaf from exactly
     * `['headline' => ..., 'subtext' => ...]` and reads nothing else out of
     * `copy`. Asserting the impossibility rather than forcing a vulnerability
     * that is not there.
     */
    public function test_the_wizard_apply_path_also_refuses_image_url(): void
    {
        $org = $this->org();
        $this->actAsStaff($org);

        $response = $this->postJson($this->adminUrl('/api/v1/admin/landing-pages/onboarding'), [
            'template_key' => 'ruled_page',
            'slug'         => 'wizard-salon',
            'copy'         => ['headline' => 'Wizard headline', 'image_url' => '/storage/landing/hack.png'],
            // A raw `content` key, the same shape update() accepts — never
            // named in store()'s rule set at all, so it cannot even survive
            // as far as $data.
            'content'      => ['hero' => ['image_url' => '/storage/landing/hack2.png']],
        ]);

        $response->assertCreated();

        $page = LandingPage::withoutGlobalScopes()->where('slug', 'wizard-salon')->firstOrFail();

        $this->assertArrayNotHasKey('image_url', $page->content['hero'] ?? []);
        $this->assertSame('Wizard headline', $page->content['hero']['headline'] ?? null);
    }

    // ─── Tenancy and entitlement ───────────────────────────────────────────

    /**
     * Mutation target 3: point the resolver at a bare `LandingPage::first()`
     * and this is the test that goes red. Org A's page is created FIRST — the
     * lower id, which is exactly what an unscoped `first()` would return
     * regardless of which org actually made the request.
     */
    public function test_another_orgs_page_is_never_touched(): void
    {
        $orgA = $this->org();
        Storage::disk('public')->put('landing/org-a.png', 'a-bytes');
        $pageA = $this->page($orgA, 'rival-salon', [
            'hero' => ['image_url' => '/storage/landing/org-a.png'],
        ]);

        $orgB = $this->org();
        Storage::disk('public')->put('landing/org-b.png', 'b-bytes');
        $pageB = $this->page($orgB, 'own-salon', [
            'hero' => ['image_url' => '/storage/landing/org-b.png'],
        ]);

        $this->assertLessThan($pageB->id, $pageA->id,
            'Fixture is wrong: org A must hold the lower id for this test to say anything about an unscoped resolver.');

        $this->actAsStaff($orgB);

        $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => 'hero'])
            ->assertOk();

        // The caller's OWN page was the one acted on...
        $this->assertNull($pageB->fresh()->content['hero']['image_url'] ?? null);
        Storage::disk('public')->assertMissing('landing/org-b.png');

        // ...and the other org's page and file are untouched.
        $this->assertSame('/storage/landing/org-a.png', $pageA->fresh()->content['hero']['image_url'] ?? null);
        Storage::disk('public')->assertExists('landing/org-a.png');
    }

    public function test_a_non_enterprise_org_is_refused(): void
    {
        // Subscription perfectly healthy — growth, not nothing — so a 402
        // here can only have come from the missing landing_pages entitlement,
        // the same reasoning LandingPageEntitlementTest's own 402 test uses.
        $org = $this->org('ACTIVE', 'growth', ['reviews' => true, 'campaigns' => true]);

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'hero',
            'image' => $this->smallImage(),
        ]);

        $response->assertStatus(402);
        $this->assertSame('feature_locked', $response->json('code'));
        $this->assertSame('landing_pages', $response->json('feature'));
        $this->assertSame('growth', $response->json('plan'));
    }
}
