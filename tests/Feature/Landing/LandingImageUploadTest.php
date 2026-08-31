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

    // ─── Slots for a tenant-ADDED band (the repeatable-sections round) ────
    //
    // `slot` used to be the literal `in:hero,about`. It is now
    // Rule::in(SectionType::imageKeys()) — the same catalogue the renderer
    // reads — so a `text_N` instance is a photo slot and everything else
    // still is not. These tests are the hero/about ones above, re-aimed:
    // the single-writer rule and its carry-forward have to hold for a band
    // that did not exist when the template was written.

    public function test_uploading_to_a_text_instance_stores_the_url_on_the_page(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon', ['text_1' => ['body' => 'Quiet rooms.']]);

        $this->actAsStaff($org);

        $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot'  => 'text_1',
            'image' => $this->smallImage(),
        ]);

        $response->assertOk();
        $this->assertSame('text_1', $response->json('slot'));
        $this->assertStringStartsWith('/storage/', $response->json('image_url'));

        $fresh = $page->fresh();
        $this->assertSame($response->json('image_url'), $fresh->content['text_1']['image_url'] ?? null);
        // The leaf-only write left the band's own copy alone.
        $this->assertSame('Quiet rooms.', $fresh->content['text_1']['body']);

        Storage::disk('public')->assertExists(
            ltrim(substr($response->json('image_url'), strlen('/storage/')), '/'),
        );
    }

    /** The other half of the single-writer rule, on an added band: the leaf clears and the file goes. */
    public function test_removing_a_text_instance_image_clears_the_leaf_and_deletes_the_file(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/text-one.png', 'bytes');
        $page = $this->page($org, 'glamour-salon', [
            'text_1' => ['image_url' => '/storage/landing/text-one.png', 'body' => 'Quiet rooms.'],
        ]);

        $this->actAsStaff($org);

        $response = $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => 'text_1']);

        $response->assertOk();
        $this->assertNull($response->json('image_url'));

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey('image_url', $fresh->content['text_1']);
        $this->assertSame('Quiet rooms.', $fresh->content['text_1']['body']);

        Storage::disk('public')->assertMissing('landing/text-one.png');
    }

    /**
     * Two bands, two slots, no crossing. The endpoint takes the slot as an
     * opaque key and writes one level down, so this is the test that would
     * catch a write that reached the type rather than the instance.
     */
    public function test_two_instances_hold_their_own_photos(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $first = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot' => 'text_1', 'image' => $this->smallImage('one.png'),
        ]);
        $first->assertOk();

        $second = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
            'slot' => 'text_2', 'image' => $this->smallImage('two.png'),
        ]);
        $second->assertOk();

        $fresh = $page->fresh();

        $this->assertNotSame($first->json('image_url'), $second->json('image_url'));
        $this->assertSame($first->json('image_url'), $fresh->content['text_1']['image_url']);
        $this->assertSame($second->json('image_url'), $fresh->content['text_2']['image_url']);

        // Neither upload deleted the other's file: `$old` is read per slot.
        Storage::disk('public')->assertExists(ltrim(substr($first->json('image_url'), strlen('/storage/')), '/'));
        Storage::disk('public')->assertExists(ltrim(substr($second->json('image_url'), strlen('/storage/')), '/'));
    }

    /**
     * The allowlist is bounded, and these are the shapes that test it:
     *
     *   - text_7 is one past the instance cap. The cap bounds the key
     *     GRAMMAR and not merely the create endpoint, precisely so this
     *     rule cannot become an infinite family of upload targets, each one
     *     a file the renderer would never read.
     *   - `text` bare is not a section key at all.
     *   - `services` is a real section that carries no photo.
     */
    public function test_a_slot_outside_the_catalogues_photo_keys_is_refused_kindly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        foreach (['text_7', 'text_0', 'text', 'services', 'text_1_2'] as $slot) {
            $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
                'slot'  => $slot,
                'image' => $this->smallImage(),
            ]);

            $response->assertStatus(422);
            $this->assertSame(
                'Please choose which photo you are replacing.',
                $response->json('errors.slot.0'),
                "The refusal for slot '{$slot}' was not the friendly one.",
            );
        }
    }

    public function test_removing_a_slot_outside_the_catalogues_photo_keys_is_refused_kindly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => 'text_7']);

        $response->assertStatus(422);
        $this->assertSame('Please choose which photo you are removing.', $response->json('errors.slot.0'));
    }

    /**
     * D4 on an added band. The free-text path must refuse
     * `content.text_1.image_url` exactly as it refuses hero's — that loop
     * was already written over every section key, and this is what pins it
     * there rather than leaving it a happy accident.
     */
    public function test_update_refuses_to_write_an_instance_image_url_directly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['text_1' => ['body' => 'Quiet rooms.', 'image_url' => '/storage/landing/hack.png']],
        ]);

        $response->assertStatus(422);

        $message = $response->json('errors.content.0');
        $this->assertSame('Photos are changed with the photo controls, not by editing text.', $message);
        $this->assertStringNotContainsString('text_1', $message);
        $this->assertStringNotContainsString('image_url', $message);
    }

    /**
     * Ruling 3b-2's carry-forward, on an added band — and the one place
     * ruling 3b-7's `in_array($sectionKey, ['hero', 'about'])` literal
     * would have quietly become wrong. update() replaces `content`
     * wholesale and D4 leaves exactly one legal text-only payload (omit
     * image_url), so without the catalogue-driven scope the very next save
     * after a photo upload erased the leaf and orphaned the file — the
     * exact defect 3b-2 was written to fix, reintroduced for the new
     * sections only.
     *
     * Mutation target: narrow the carry-forward back to hero/about and this
     * goes red — the save still returns 200 and the body still updates, but
     * `image_url` is gone.
     */
    public function test_a_text_only_save_does_not_erase_an_added_bands_image(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/text-one.png', 'bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero'   => ['headline' => 'Old headline'],
            'text_1' => ['image_url' => '/storage/landing/text-one.png', 'body' => 'Old words'],
        ]);

        $this->actAsStaff($org);

        $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => [
                'hero'   => ['headline' => 'New headline'],
                'text_1' => ['body' => 'New words'],
            ],
        ]);

        $response->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('New words', $fresh->content['text_1']['body']);
        $this->assertSame('/storage/landing/text-one.png', $fresh->content['text_1']['image_url']);
        Storage::disk('public')->assertExists('landing/text-one.png');
    }

    /** The more severe half: the whole section is absent from the save and must survive with its photo. */
    public function test_a_save_omitting_an_added_band_entirely_still_keeps_its_image(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/text-one.png', 'bytes');
        $page = $this->page($org, 'glamour-salon', [
            'hero'   => ['headline' => 'Old headline'],
            'text_1' => ['image_url' => '/storage/landing/text-one.png', 'body' => 'Words'],
        ]);

        $this->actAsStaff($org);

        $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['hero' => ['headline' => 'New headline']],
        ])->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('/storage/landing/text-one.png', $fresh->content['text_1']['image_url'] ?? null);
        Storage::disk('public')->assertExists('landing/text-one.png');
    }

    /**
     * And the carry-forward stays scoped: a key PAST the grammar carries no
     * photo, so a leaf sitting under it is a raw-DB shape nothing here ever
     * wrote and must not be re-saved onto the row. This is
     * test_carry_forward_does_not_protect_a_leaf_outside_hero_and_about's
     * claim, restated against the boundary the new grammar creates rather
     * than the one the old literal did.
     */
    public function test_carry_forward_does_not_protect_a_leaf_past_the_instance_cap(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon', ['hero' => ['headline' => 'Old headline']]);

        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode([
                'hero'   => ['headline' => 'Old headline'],
                'text_7' => ['image_url' => '/storage/landing/leaked.png', 'body' => 'Words'],
            ]),
        ]);

        $this->actAsStaff($org);

        $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => [
                'hero'   => ['headline' => 'New headline'],
                'text_7' => ['body' => 'Words'],
            ],
        ])->assertOk();

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey('image_url', $fresh->content['text_7'] ?? []);
        $this->assertSame('Words', $fresh->content['text_7']['body'] ?? null);
    }

    // ─── Gallery slots (the multi-photo round) ───────────────────────────
    //
    // A `slot` stopped naming a SECTION and started naming a PICTURE. A
    // single-photo band still names itself (`hero`, `text_4`) and a gallery
    // names the picture (`gallery_1.image_3`) — see
    // SectionType::imageSlot(), the one parser both endpoints go through.
    // Everything the two verbs already guaranteed for one photo has to hold
    // for eight, so these are the tests above re-aimed, plus the cap.

    public function test_uploading_to_a_gallery_slot_stores_a_scalar_leaf_beside_its_siblings(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon', ['gallery_1' => ['heading' => 'The rooms']]);

        $this->actAsStaff($org);

        $urls = [];

        foreach (['image_1', 'image_2', 'image_8'] as $leaf) {
            $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
                'slot'  => 'gallery_1.' . $leaf,
                'image' => $this->smallImage($leaf . '.png'),
            ]);

            $response->assertOk();
            $this->assertSame('gallery_1.' . $leaf, $response->json('slot'));
            $urls[$leaf] = $response->json('image_url');
        }

        $fresh = $page->fresh();

        // SCALAR LEAVES under the section, one per picture — never a nested
        // array. `content` is validated ScalarLeaves(depth: 2), so a nested
        // shape would not be a legal value in this column at all.
        foreach ($urls as $leaf => $url) {
            $this->assertSame($url, $fresh->content['gallery_1'][$leaf] ?? null);
            $this->assertIsString($fresh->content['gallery_1'][$leaf]);
            Storage::disk('public')->assertExists(ltrim(substr($url, strlen('/storage/')), '/'));
        }

        // The band's own copy, and the siblings, survive every leaf-only write.
        $this->assertSame('The rooms', $fresh->content['gallery_1']['heading']);
        $this->assertCount(3, array_unique($urls), 'Three uploads did not produce three distinct files.');
    }

    /**
     * Removing one picture drops THAT leaf and deletes THAT file, and
     * touches nothing else — including the gap it leaves in the sequence,
     * which is deliberate (galleryImages() closes it at render time; see
     * removeImage()'s own comment for why renumbering here would be a write
     * this request was not asked to make).
     *
     * Mutation target: drop the MediaService::delete() from removeImage()
     * and this goes red on the assertMissing.
     */
    public function test_removing_one_gallery_picture_drops_its_leaf_and_deletes_only_its_file(): void
    {
        $org = $this->org();
        Storage::disk('public')->put('landing/one.png', 'one');
        Storage::disk('public')->put('landing/two.png', 'two');
        Storage::disk('public')->put('landing/three.png', 'three');

        $page = $this->page($org, 'glamour-salon', [
            'gallery_1' => [
                'heading' => 'The rooms',
                'image_1' => '/storage/landing/one.png',
                'image_2' => '/storage/landing/two.png',
                'image_3' => '/storage/landing/three.png',
            ],
        ]);

        $this->actAsStaff($org);

        $response = $this->deleteJson(
            $this->adminUrl('/api/v1/admin/landing-pages/image'),
            ['slot' => 'gallery_1.image_2'],
        );

        $response->assertOk();
        $this->assertSame('gallery_1.image_2', $response->json('slot'));
        $this->assertNull($response->json('image_url'));

        $fresh = $page->fresh();
        $this->assertArrayNotHasKey('image_2', $fresh->content['gallery_1']);
        $this->assertSame('/storage/landing/one.png', $fresh->content['gallery_1']['image_1']);
        $this->assertSame('/storage/landing/three.png', $fresh->content['gallery_1']['image_3']);
        $this->assertSame('The rooms', $fresh->content['gallery_1']['heading']);

        Storage::disk('public')->assertMissing('landing/two.png');
        Storage::disk('public')->assertExists('landing/one.png');
        Storage::disk('public')->assertExists('landing/three.png');
    }

    /**
     * THE CAP, and it is enforced as the slot allowlist rather than as a
     * count: a gallery holds eight pictures, so `gallery_1.image_9` is not a
     * slot at all and never reaches a disk.
     *
     * MUTATION TARGET: raise `images` on the gallery type in
     * App\Landing\SectionType and this goes red — the ninth slot becomes
     * accepted, the upload succeeds, and the 422 never arrives.
     *
     * The refusal is checked for WORDS, not just for a status: spec §9 says
     * no field path and no Laravel default may reach a tenant, and
     * "The selected slot is invalid." is exactly what this rule would say if
     * anybody removed the named message.
     */
    public function test_a_ninth_gallery_picture_is_refused_kindly(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        foreach (['gallery_1.image_9', 'gallery_1.image_12', 'gallery_1.image_0'] as $slot) {
            $response = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
                'slot'  => $slot,
                'image' => $this->smallImage(),
            ]);

            $response->assertStatus(422);

            $message = $response->json('errors.slot.0');

            $this->assertSame('Please choose which photo you are replacing.', $message);
            // No field name, no key, no Laravel phrasing.
            foreach (['slot', 'image_', 'gallery', 'invalid', 'selected', 'field'] as $leak) {
                $this->assertStringNotContainsStringIgnoringCase($leak, $message,
                    "The cap refusal leaks '{$leak}' to the tenant: {$message}");
            }
        }

        $this->assertSame([], Storage::disk('public')->allFiles(),
            'A refused upload still put a file on the disk.');
    }

    /**
     * The two spellings do not overlap, and neither is a way into the
     * other's leaves. A gallery must be named picture by picture (its bare
     * key must never quietly mean image_1), and a single-plate band must be
     * named by itself (spelling its implied leaf is not a second form).
     */
    public function test_neither_slot_spelling_reaches_the_others_leaves(): void
    {
        $org = $this->org();
        $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        foreach ([
            'gallery_1',              // bare key of a multi-photo band
            'gallery_7.image_1',      // past the instance cap
            'gallery_1.body',         // a copy field, not a picture
            'hero.image_url',         // the implied leaf spelled out
            'text_1.image_1',         // a gallery leaf on a single-plate band
            'gallery_1.image_1.image_2',
        ] as $slot) {
            $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
                'slot' => $slot, 'image' => $this->smallImage(),
            ])->assertStatus(422);

            $this->deleteJson($this->adminUrl('/api/v1/admin/landing-pages/image'), ['slot' => $slot])
                ->assertStatus(422);
        }
    }

    /**
     * D4 for eight leaves: `update()` refuses a gallery picture key exactly
     * as it refuses `image_url`, with the same words and the same silence
     * about which field path was at fault.
     */
    public function test_update_refuses_to_write_a_gallery_image_key_directly(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon', ['gallery_1' => ['heading' => 'The rooms']]);

        $this->actAsStaff($org);

        foreach (['image_1', 'image_8', 'image_9'] as $leaf) {
            $response = $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
                'content' => ['gallery_1' => ['heading' => 'The rooms', $leaf => '/storage/landing/smuggled.png']],
            ]);

            $response->assertStatus(422);
            $this->assertSame(
                'Photos are changed with the photo controls, not by editing text.',
                $response->json('errors.content.0'),
            );
        }

        $this->assertArrayNotHasKey('image_1', $page->fresh()->content['gallery_1']);
    }

    /**
     * Ruling 3b-2's carry-forward, for eight leaves: a text-only save omits
     * every picture (it has to — D4 refuses them all), so every one of them
     * must be carried forward from the stored row or the very next save
     * erases eight files' worth of pointers at once.
     *
     * Mutation target: scope update()'s carry-forward back to `image_url`
     * only and this goes red on the first picture.
     */
    public function test_a_text_only_save_does_not_erase_a_gallerys_pictures(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon');

        $this->actAsStaff($org);

        $stored = [];

        foreach (['image_1', 'image_2', 'image_3'] as $leaf) {
            $stored[$leaf] = $this->post($this->adminUrl('/api/v1/admin/landing-pages/image'), [
                'slot' => 'gallery_1.' . $leaf, 'image' => $this->smallImage($leaf . '.png'),
            ])->json('image_url');
        }

        // A save that mentions the band but none of its pictures ...
        $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => [
                'hero'      => ['headline' => 'New headline'],
                'gallery_1' => ['heading' => 'The rooms'],
            ],
        ])->assertOk();

        $fresh = $page->fresh();

        foreach ($stored as $leaf => $url) {
            $this->assertSame($url, $fresh->content['gallery_1'][$leaf] ?? null,
                "The save erased {$leaf}, orphaning its file.");
            Storage::disk('public')->assertExists(ltrim(substr($url, strlen('/storage/')), '/'));
        }

        $this->assertSame('The rooms', $fresh->content['gallery_1']['heading']);

        // ... and a save that omits the band ENTIRELY keeps them too.
        $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['hero' => ['headline' => 'Newer headline']],
        ])->assertOk();

        foreach ($stored as $leaf => $url) {
            $this->assertSame($url, $page->fresh()->content['gallery_1'][$leaf] ?? null);
        }
    }

    /**
     * The other half of the carry-forward's boundary, the same claim
     * test_carry_forward_does_not_protect_a_leaf_past_the_instance_cap makes
     * one type over: a `image_9` leaf that reached the column by a raw write
     * is not a picture the catalogue holds, so nothing carries it forward
     * and the first ordinary save drops it.
     */
    public function test_carry_forward_does_not_protect_a_gallery_leaf_past_the_cap(): void
    {
        $org  = $this->org();
        $page = $this->page($org, 'glamour-salon');

        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode([
                'gallery_1' => [
                    'heading' => 'The rooms',
                    'image_1' => '/storage/landing/kept.png',
                    'image_9' => '/storage/landing/leaked.png',
                ],
            ]),
        ]);

        $this->actAsStaff($org);

        $this->putJson($this->adminUrl('/api/v1/admin/landing-pages'), [
            'content' => ['gallery_1' => ['heading' => 'The suites']],
        ])->assertOk();

        $fresh = $page->fresh();
        $this->assertSame('/storage/landing/kept.png', $fresh->content['gallery_1']['image_1'] ?? null);
        $this->assertArrayNotHasKey('image_9', $fresh->content['gallery_1']);
        $this->assertSame('The suites', $fresh->content['gallery_1']['heading']);
    }
}
