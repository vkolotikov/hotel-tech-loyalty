<?php
namespace Tests\Feature\Landing;

use App\Http\Controllers\Api\V1\Admin\LandingPageController;
use App\Landing\PreviewDraft;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * THE LIVE PREVIEW — the editor's pane following unsaved edits.
 *
 * Two halves, and the seam between them is the whole feature: the admin
 * endpoint takes the editor's in-flight state, validates it with the WRITE
 * PATH's rules and parks it in the cache; the landing host's existing signed
 * preview route renders the REAL Blade template from that stash. Nothing is
 * re-implemented in the browser, and nothing is written to the database.
 *
 * The admin half is exercised by calling the controller directly, for the
 * reason LandingPageAdminApiTest and LandingPageSectionApiTest both give:
 * reaching those routes over HTTP needs `saas.auth` + Sanctum +
 * `check.subscription` + the entitlement gate, and this repo has no harness
 * for that stack. The RENDER half is driven over real HTTP against the
 * landing host, because that is where the signature, the CSP and the
 * fallback actually live.
 *
 * What these tests are here to hold:
 *
 *   - a draft renders WITHOUT the stored row moving one byte;
 *   - an expired, unknown, malformed or FOREIGN key falls back to the saved
 *     draft rather than an error page, and never leaks the other tenant's
 *     content;
 *   - every hostile shape the real render path is guarded against is guarded
 *     here too (nesting, 200k strings, javascript: image values, a scalar
 *     where a section map belongs);
 *   - `content.<slot>.image_url` comes from STORAGE and never from the
 *     payload — the single-writer rule (D4), which a second door into that
 *     leaf would break;
 *   - the order, the toggles and the tones in the payload are what render.
 */
class LandingLivePreviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private Organization $org;
    private User $user;
    private LandingPage $page;

    /** The stored copy every fallback test asserts it can still see. */
    private const SAVED_HEADLINE = 'The Saved Headline';

    /** What the editor is "typing" — never written to the row. */
    private const TYPED_HEADLINE = 'The Typed Headline';

    /**
     * The one test below that pins the clock (`travel()` past the stash's
     * TTL) never reaches its own reset if it fails an assertion, and nothing
     * in the framework undoes it for us — so every later test in the process
     * would run ninety seconds into the future. Reset here for the same
     * reason LandingPageAdminApiTest resets it in its own tearDown.
     */
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

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

        $this->page = $this->makePage($this->org, $this->defaultBrandId($this->org));
    }

    // ─── Fixtures ────────────────────────────────────────────────────────

    /**
     * A new organisation, with the default brand its own `created` hook
     * makes for it — the tenant binding dropped for the duration, for the
     * reason LandingPageAdminApiTest::makeOrg() spells out in full: Brand
     * carries BelongsToOrganization, whose `creating` hook FORCES
     * organization_id from the bound tenant, so creating a second org while
     * the first is bound files the new org's default brand under the old
     * one.
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

    /** The org's own default brand — never a second one, which the production index forbids. */
    private function defaultBrandId(Organization $org): int
    {
        $id = DB::table('brands')
            ->where('organization_id', $org->id)
            ->where('is_default', true)
            ->value('id');

        $this->assertNotNull($id, 'The organisation has no default brand; its fixture is in a state production forbids.');

        return (int) $id;
    }

    /** Reproduce what TenantMiddleware + BrandMiddleware bind per request. */
    private function actAs(User $user, ?int $brandId): void
    {
        $this->user = $user;
        app()->instance('current_organization_id', $user->organization_id);
        app()->instance('current_brand_id', $brandId);
    }

    /**
     * A saved page with copy in the two bands that render off `content`
     * alone.
     *
     * hero and about are chosen deliberately: `PageContent::count()` answers
     * from the tenant's own words for both, where services/team/reviews are
     * data-backed and would need rows in three other tables to appear at
     * all. That keeps every ordering, toggle and tone assertion below about
     * the section rows rather than about fixture depth.
     */
    private function makePage(Organization $org, ?int $brandId, array $overrides = []): LandingPage
    {
        $page = LandingPage::create(array_merge([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'slug'            => 'live-preview-' . uniqid(),
            'template_key'    => 'ruled_page',
            'industry'        => 'beauty',
            'status'          => LandingPage::STATUS_DRAFT,
            'content'         => [
                'hero'  => ['headline' => self::SAVED_HEADLINE],
                'about' => ['body' => 'The saved about copy.'],
            ],
        ], $overrides));

        foreach (['hero', 'services', 'about', 'team', 'reviews', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return $page->fresh('sections');
    }

    // ─── Plumbing ────────────────────────────────────────────────────────

    private function controller(): LandingPageController
    {
        return new LandingPageController();
    }

    private function request(array $payload = []): Request
    {
        $request = Request::create('/api/v1/admin/landing-pages/preview-draft', 'POST', $payload);
        $request->setUserResolver(fn () => $this->user);

        return $request;
    }

    private function body(JsonResponse $response): array
    {
        return json_decode($response->getContent(), true);
    }

    /** Mint a live-preview URL for the caller's own page from an unsaved payload. */
    private function draftUrl(array $payload): string
    {
        return $this->body($this->controller()->previewDraft($this->request($payload)))['url'];
    }

    /** The plain, draft-less preview URL — the path that predates this feature. */
    private function savedUrl(LandingPage $page): string
    {
        return URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]);
    }

    /** A signed preview URL for $page carrying a stash key it was not minted with. */
    private function urlWithKey(LandingPage $page, string $key): string
    {
        return URL::temporarySignedRoute(
            'landing.preview',
            now()->addHours(2),
            ['page' => $page->id, 'draft' => $key],
        );
    }

    /** The whole row and its sections, as a comparable snapshot. */
    private function snapshot(LandingPage $page): array
    {
        $row = LandingPage::withoutGlobalScopes()->findOrFail($page->id);

        return [
            'attributes' => $row->getAttributes(),
            'sections'   => DB::table('landing_page_sections')
                ->where('landing_page_id', $page->id)
                ->orderBy('id')
                ->get()
                ->map(fn ($s) => (array) $s)
                ->all(),
        ];
    }

    /** The section rows as the editor would post them back. */
    private function sectionsPayload(array $overrides = []): array
    {
        return collect($this->page->sections)
            ->map(fn ($s) => array_merge([
                'key'     => $s->key,
                'enabled' => (bool) $s->enabled,
                'sort'    => (int) $s->sort,
                'tone'    => $s->tone,
            ], $overrides[$s->key] ?? []))
            ->values()
            ->all();
    }

    // ─── The draft renders, and the row does not move ─────────────────────

    public function test_a_draft_renders_the_unsaved_copy(): void
    {
        $url = $this->draftUrl([
            'content' => ['hero' => ['headline' => self::TYPED_HEADLINE]],
        ]);

        $response = $this->get($url);

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'draft');
        $this->assertStringContainsString(self::TYPED_HEADLINE, $response->getContent());
        $this->assertStringNotContainsString(self::SAVED_HEADLINE, $response->getContent());
    }

    /**
     * The claim the whole design rests on: rendering an unsaved draft must
     * not be a write. Not "no visible change" — the row's every column and
     * every section row, byte for byte, before and after.
     *
     * If this ever goes red the feature has become a second, unvalidated
     * writer for `content`/`theme` that fires on every keystroke, which is
     * strictly worse than having no live preview at all.
     */
    public function test_a_draft_render_leaves_the_stored_row_untouched(): void
    {
        $before = $this->snapshot($this->page);

        $url = $this->draftUrl([
            'theme'    => ['palette' => 'midnight_brass', 'brand_color' => '#123456'],
            'content'  => ['hero' => ['headline' => self::TYPED_HEADLINE]],
            'sections' => $this->sectionsPayload(['about' => ['enabled' => false, 'sort' => 0]]),
        ]);

        $this->get($url)->assertOk();

        $this->assertSame($before, $this->snapshot($this->page),
            'Rendering an unsaved draft changed the stored page.');
    }

    public function test_the_plain_preview_url_still_renders_the_saved_draft(): void
    {
        // The path that predates this feature, unchanged: no `draft`
        // parameter, so nothing is looked up and the saved row renders.
        $response = $this->get($this->savedUrl($this->page));

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'saved');
        $this->assertStringContainsString(self::SAVED_HEADLINE, $response->getContent());
    }

    // ─── Falling back, never erroring ─────────────────────────────────────

    public function test_an_expired_key_falls_back_to_the_saved_draft(): void
    {
        $url = $this->draftUrl(['content' => ['hero' => ['headline' => self::TYPED_HEADLINE]]]);

        // Past the stash's own TTL but well inside the signature's two
        // hours — the exact window a backgrounded tab reloads in.
        $this->travel(PreviewDraft::TTL_SECONDS + 1)->seconds();

        $response = $this->get($url);

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'saved');
        $this->assertStringContainsString(self::SAVED_HEADLINE, $response->getContent());
        $this->assertStringNotContainsString(self::TYPED_HEADLINE, $response->getContent());
    }

    public function test_an_unknown_key_falls_back_to_the_saved_draft(): void
    {
        $response = $this->get($this->urlWithKey($this->page, Str::random(48)));

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'saved');
        $this->assertStringContainsString(self::SAVED_HEADLINE, $response->getContent());
    }

    /**
     * A key is concatenated into a cache key, so its SHAPE is checked before
     * it is looked up at all: an attacker-supplied query string must not be
     * able to address an entry this feature never wrote.
     */
    public function test_a_malformed_key_is_refused_before_it_reaches_the_cache(): void
    {
        foreach (['', 'short', '../landing.preview-draft:x', str_repeat('a', 49), 'a b'] as $key) {
            $response = $this->get($this->urlWithKey($this->page, $key));

            $response->assertOk();
            $response->assertHeader('X-Landing-Preview-Source', 'saved');
        }
    }

    /**
     * THE TENANT BOUNDARY. A signature only says "you may look at THIS
     * page"; it says nothing about whose draft may be hung off it. A tenant
     * can always mint a valid signature for their own page, so the stash
     * entry itself has to remember which page and which organisation it was
     * minted for — and refuse everything else.
     */
    public function test_a_key_minted_for_another_tenants_page_renders_nothing_of_theirs(): void
    {
        $rivalOrg   = $this->makeOrg('Rival ' . uniqid());
        $rivalUser  = $this->makeUser($rivalOrg);
        $rivalBrand = $this->defaultBrandId($rivalOrg);

        $mine = $this->user;
        $myBrand = app('current_brand_id');

        $this->actAs($rivalUser, $rivalBrand);
        $this->makePage($rivalOrg, $rivalBrand);
        $rivalKey = $this->stashKeyFromUrl($this->draftUrl([
            'content' => ['hero' => ['headline' => 'RIVAL SECRET LAUNCH']],
        ]));

        $this->actAs($mine, $myBrand);

        // My own signed URL — perfectly valid — with their key on it.
        $response = $this->get($this->urlWithKey($this->page, $rivalKey));

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'saved');
        $this->assertStringNotContainsString('RIVAL SECRET LAUNCH', $response->getContent());
        $this->assertStringContainsString(self::SAVED_HEADLINE, $response->getContent());
    }

    private function stashKeyFromUrl(string $url): string
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->assertArrayHasKey('draft', $query, 'The minted URL carries no stash key.');

        return $query['draft'];
    }

    // ─── The same headers as the preview it replaces ──────────────────────

    public function test_the_draft_preview_carries_the_previews_own_headers(): void
    {
        $response = $this->get($this->draftUrl([
            'content' => ['hero' => ['headline' => self::TYPED_HEADLINE]],
        ]));

        $response->assertOk();
        $response->assertHeader('Cache-Control', 'no-store, private');
        $response->assertHeader('X-Robots-Tag', 'noindex');

        $csp = (string) $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("frame-ancestors 'self' " . config('app.url'), $csp);
        $this->assertStringNotContainsString('frame-ancestors *', $csp);

        // Every admin host, not only the one in app.url — the fix that made
        // the pane work on five of the six brand domains.
        preg_match('/frame-ancestors ([^;]+)/', $csp, $directive);
        $permitted = preg_split('/\s+/', trim($directive[1]));

        foreach (array_keys((array) config('pwa.hosts')) as $host) {
            $this->assertContains('https://' . $host, $permitted);
        }
    }

    public function test_an_unsigned_draft_url_is_refused(): void
    {
        $url = $this->draftUrl(['content' => ['hero' => ['headline' => self::TYPED_HEADLINE]]]);

        // Strip the signature: a stash key is not an authorisation.
        $bare = strtok($url, '?') . '?draft=' . $this->stashKeyFromUrl($url);

        $this->get($bare)->assertForbidden();
    }

    // ─── Hostile shapes: every battery the real render path faces ─────────

    public function test_a_nested_content_leaf_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl(['content' => ['hero' => ['headline' => ['pwn']]]]);
    }

    public function test_a_nested_theme_leaf_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl(['theme' => ['brand_color' => ['#ffffff']]]);
    }

    public function test_a_theme_key_outside_the_allowlist_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl(['theme' => ['radius' => '4px']]);
    }

    public function test_a_font_pairing_outside_the_allowlist_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl(['theme' => ['font_pairing' => 'comic']]);
    }

    public function test_a_tone_outside_the_allowlist_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl(['sections' => $this->sectionsPayload(['hero' => ['tone' => 'neon']])]);
    }

    public function test_a_section_key_outside_the_grammar_is_refused(): void
    {
        // text_9 is past SectionType::MAX_INSTANCES_PER_TYPE, so it names no
        // section type at all — the grammar refuses it before ownership is
        // even asked about.
        $this->expectException(ValidationException::class);

        $this->draftUrl(['sections' => [['key' => 'text_9', 'enabled' => true, 'sort' => 0]]]);
    }

    public function test_a_section_key_the_page_does_not_own_is_refused(): void
    {
        // A legal key for a band this page has no row for. The save path
        // refuses it, so the preview must too — a preview that accepted more
        // than the save does is a preview that lies.
        $this->expectException(ValidationException::class);

        $this->draftUrl(['sections' => [['key' => 'booking', 'enabled' => true, 'sort' => 0]]]);
    }

    public function test_a_200k_character_field_does_not_take_the_preview_down(): void
    {
        $response = $this->get($this->draftUrl([
            'content' => ['hero' => ['headline' => str_repeat('x', 200_000)]],
        ]));

        $response->assertOk();
        $response->assertHeader('X-Landing-Preview-Source', 'draft');
    }

    public function test_a_scalar_where_a_section_map_belongs_does_not_take_the_preview_down(): void
    {
        // content.contact as a bare string is a shape ScalarLeaves permits
        // (a scalar IS a legal leaf) and the renderer already survives — see
        // RuledPageRenderTest's "string shaped contact". The live preview
        // shares that render path, so it must survive identically.
        $response = $this->get($this->draftUrl([
            'content' => ['hero' => ['headline' => self::TYPED_HEADLINE], 'contact' => 'just a string'],
        ]));

        $response->assertOk();
        $this->assertStringContainsString(self::TYPED_HEADLINE, $response->getContent());
    }

    // ─── Photos come from storage, never from the payload ─────────────────

    public function test_an_image_value_in_the_payload_is_refused(): void
    {
        $this->expectException(ValidationException::class);

        $this->draftUrl([
            'content' => ['hero' => ['image_url' => 'javascript:alert(1)']],
        ]);
    }

    public function test_even_a_plausible_image_value_in_the_payload_is_refused(): void
    {
        // Not a format check — the leaf has ONE writer (the image
        // endpoints), and a preview that accepted a well-formed URL here
        // would be a second door into it.
        $this->expectException(ValidationException::class);

        $this->draftUrl([
            'content' => ['hero' => ['image_url' => '/storage/landing/somebody-elses.jpg']],
        ]);
    }

    public function test_the_stored_photo_is_what_the_draft_renders(): void
    {
        $this->page->update([
            'content' => [
                'hero'  => ['headline' => self::SAVED_HEADLINE, 'image_url' => '/storage/landing/saved-hero.jpg'],
                'about' => ['body' => 'The saved about copy.'],
            ],
        ]);

        // Exactly what the editor sends: the copy, with the image leaf
        // stripped out (stripImageUrlLeaves) because the server refuses it.
        $response = $this->get($this->draftUrl([
            'content' => ['hero' => ['headline' => self::TYPED_HEADLINE]],
        ]));

        $response->assertOk();
        $this->assertStringContainsString(self::TYPED_HEADLINE, $response->getContent());
        $this->assertStringContainsString('/storage/landing/saved-hero.jpg', $response->getContent());
    }

    // ─── Order, toggles and tones ─────────────────────────────────────────

    public function test_the_section_order_in_the_payload_is_what_renders(): void
    {
        // The band WRAPPERS, not the copy inside them: the hero's headline
        // is em-split on its last word and echoed again in <title>, and the
        // about band's opening words are wrapped in their own span, so
        // neither string is a position anything can be measured from.
        // `data-section` is the one marker each band carries exactly once.
        $saved = $this->get($this->savedUrl($this->page))->getContent();

        $this->assertLessThan(
            strpos($saved, 'data-section="about"'),
            strpos($saved, 'data-section="hero"'),
            'The fixture does not start with the hero above the about band.',
        );

        // Drag the about band above the hero, unsaved.
        $body = $this->get($this->draftUrl([
            'sections' => $this->sectionsPayload([
                'about' => ['sort' => 0],
                'hero'  => ['sort' => 1],
            ]),
        ]))->getContent();

        $this->assertLessThan(
            strpos($body, 'data-section="hero"'),
            strpos($body, 'data-section="about"'),
            'The unsaved order is not what rendered.',
        );
    }

    public function test_a_section_switched_off_in_the_payload_does_not_render(): void
    {
        $body = $this->get($this->draftUrl([
            'sections' => $this->sectionsPayload(['about' => ['enabled' => false]]),
        ]))->getContent();

        $this->assertStringContainsString('data-section="hero"', $body);
        $this->assertStringNotContainsString('data-section="about"', $body);
    }

    public function test_a_tone_chosen_in_the_payload_is_what_the_band_renders(): void
    {
        $body = $this->get($this->draftUrl([
            'sections' => $this->sectionsPayload(['about' => ['tone' => 'accent']]),
        ]))->getContent();

        $this->assertStringContainsString('band band--accent', $body);
    }

    /**
     * A row the payload never mentions keeps what is stored — the section
     * endpoint's own contract ("update the rows you are named, leave the
     * rest alone"). Building the preview from the payload alone would
     * silently drop every band the editor happened not to send.
     */
    public function test_a_row_the_payload_omits_keeps_its_stored_state(): void
    {
        $body = $this->get($this->draftUrl([
            'sections' => [['key' => 'hero', 'enabled' => true, 'sort' => 0]],
        ]))->getContent();

        $this->assertStringContainsString('data-section="hero"', $body);
        $this->assertStringContainsString('data-section="about"', $body);
    }

    // ─── The endpoint's own shape ─────────────────────────────────────────

    public function test_the_response_publishes_the_stash_lifetime(): void
    {
        $body = $this->body($this->controller()->previewDraft($this->request([
            'content' => ['hero' => ['headline' => self::TYPED_HEADLINE]],
        ])));

        $this->assertSame(PreviewDraft::TTL_SECONDS, $body['expires_in']);
        $this->assertSame(['url', 'expires_in'], array_keys($body));
    }

    /**
     * Rate limited, and with a NAMED bucket. routes/api.php's own note at
     * the auth group explains why the third argument is mandatory: an
     * unnamed `throttle:N,1` keys on sha1(domain|ip) alone, so two
     * prefix-less throttles on one route resolve to the same bucket and each
     * one hits it.
     */
    public function test_the_endpoint_is_rate_limited_in_its_own_bucket(): void
    {
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => $r->uri() === 'api/v1/admin/landing-pages/preview-draft');

        $this->assertNotNull($route, 'The live-preview endpoint does not exist.');

        $throttles = array_values(array_filter(
            $route->gatherMiddleware(),
            fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'),
        ));

        $named = array_values(array_filter($throttles, fn ($m) => substr_count($m, ',') === 2));

        $this->assertNotEmpty($named,
            'The live-preview endpoint has no throttle of its own, or its throttle shares the anonymous bucket.');
    }
}
