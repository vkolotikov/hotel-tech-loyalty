<?php
namespace Tests\Feature\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\Property;
use App\Models\Service;
use App\Models\User;
use App\Support\Accent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class RuledPageRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'glamour-salon',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'The Art of Wellness']],
        ]);
        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }
        return $page;
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/glamour-salon')->getContent();
    }

    /** Same GET, against an arbitrary page's own slug rather than the fixed 'glamour-salon' one. */
    private function bodyFor(LandingPage $page): string
    {
        return $this->get('http://' . config('landing.host') . '/' . $page->slug)->getContent();
    }

    // ─── Media plates (Task 5, landing phase 3b) ───────────────────────────
    //
    // The brief is explicit that these tests create images through Task 4's
    // real writer — POST /api/v1/admin/landing-pages/image — not by poking
    // image_url into the row directly. That means driving the full admin
    // request stack (a real Organization with the landing_pages
    // entitlement, a real staff user, Sanctum, a faked local disk), exactly
    // as LandingImageUploadTest's own setUp() provisions it. The published()
    // fixture above can't be reused for this: it hardcodes organization_id
    // 1 with no real Organization row behind it, which the public renderer
    // never needs but the admin entitlement gate does.

    /** Schema + fake-disk setup shared by every test in this section, built only when needed. */
    private function ensureImageUploadSchema(): void
    {
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
        // credentials are configured, and this repo's own .env carries real
        // ones — force the local disk deterministically and fake it.
        Config::set('filesystems.media_disk', 'public');
        Config::set('filesystems.disks.do.key', null);
        Config::set('filesystems.disks.do.secret', null);
        Config::set('filesystems.disks.do.bucket', null);
        Storage::fake('public');
    }

    private function orgWithLandingPages(): Organization
    {
        return Organization::create([
            'name' => 'Glamour', 'slug' => 'glamour-' . uniqid(),
            'industry' => 'beauty', 'subscription_status' => 'ACTIVE',
            'plan_slug' => 'enterprise', 'plan_features' => ['landing_pages' => true],
        ]);
    }

    /** A published page tied to a REAL org id, matching what the admin upload endpoint resolves against. */
    private function publishedForOrg(Organization $org, string $slug, array $content = []): LandingPage
    {
        app()->instance('current_organization_id', $org->id);

        $page = LandingPage::create([
            'organization_id' => $org->id, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now(), 'content' => $content,
        ]);
        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        app()->forgetInstance('current_organization_id');

        return $page;
    }

    /** Uploads a real image through Task 4's endpoint and returns the stored /storage/... URL. */
    private function uploadImageViaEndpoint(Organization $org, string $slot): string
    {
        $user = User::create([
            'name' => 'Staff', 'email' => 'staff_' . uniqid() . '@example.test',
            'organization_id' => $org->id, 'user_type' => 'staff',
        ]);
        Sanctum::actingAs($user, ['*']);

        $image = function_exists('imagecreatetruecolor')
            ? UploadedFile::fake()->image('plate.png', 10, 10)
            : UploadedFile::fake()->createWithContent(
                'plate.png',
                file_get_contents(base_path('tests/fixtures/images/small-10x10.png')),
            );

        $response = $this->post(
            'http://' . parse_url(config('app.url'), PHP_URL_HOST) . '/api/v1/admin/landing-pages/image',
            ['slot' => $slot, 'image' => $image],
        );

        $response->assertOk();

        return $response->json('image_url');
    }

    public function test_it_renders_the_customers_own_headline(): void
    {
        $this->published();

        $this->assertStringContainsString('The Art of Wellness', $this->body());
    }

    /**
     * The three tests below cover the one heading on the page.
     *
     * Found by hand, not by a test: a page published with no headline and no
     * active Property rendered `<h1></h1>`. Nothing stops that state --
     * publish() has no precondition on either, and has('hero') is
     * unconditionally true -- so it is reachable by any org that creates a
     * page before filling anything in.
     */
    public function test_the_headline_falls_back_to_the_business_name(): void
    {
        $page = $this->published();
        $page->update(['content' => []]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Mimi', 'is_active' => true]);

        $this->assertStringContainsString('<h1>Maison Mimi</h1>', $this->body());
    }

    /**
     * `??` would have walked straight past this: an empty headline string is
     * a value the editor can store, and `??` only treats null as absent.
     */
    public function test_a_cleared_headline_does_not_shadow_the_business_name(): void
    {
        $page = $this->published();
        $page->update(['content' => ['hero' => ['headline' => '']]]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Mimi', 'is_active' => true]);

        $this->assertStringContainsString('<h1>Maison Mimi</h1>', $this->body());
    }

    /** The last tenant-owned rung: the title they chose for the page. */
    public function test_the_headline_falls_back_to_the_pages_own_seo_title(): void
    {
        $page = $this->published();
        $page->update(['content' => [], 'seo' => ['title' => 'Maison Mimi']]);

        $this->assertStringContainsString('<h1>Maison Mimi</h1>', $this->body());
    }

    /**
     * With nothing left to say the element goes, rather than shipping an empty
     * heading. It must NOT fall through to config('app.name') the way <title>
     * does: a browser tab naming who serves the page is defensible, an <h1>
     * advertising us as the business on a salon's own website is not.
     */
    public function test_a_page_with_no_name_at_all_ships_no_empty_heading(): void
    {
        $page = $this->published();
        $page->update(['content' => [], 'seo' => null]);

        $body = $this->body();

        $this->assertStringNotContainsString('<h1></h1>', $body,
            'A published page shipped an empty heading.');
        $this->assertStringNotContainsString('<h1>' . config('app.name') . '</h1>', $body,
            'The tenant page headlines itself with our own product name.');
    }

    public function test_a_section_with_no_data_is_absent_not_empty(): void
    {
        // No services exist, so there must be no services section at all —
        // not a heading over blank space.
        $this->published();

        $this->assertStringNotContainsString('data-section="services"', $this->body());
    }

    public function test_a_section_with_data_appears(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65, 'duration_minutes' => 60]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="services"', $body);
        $this->assertStringContainsString('Signature Facial', $body);
    }

    public function test_it_uses_the_industry_vocabulary(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true, 'price' => 65]);

        // A salon sells Treatments, not "Services".
        $this->assertStringContainsString('Treatments', $this->body());
    }

    public function test_the_template_contains_no_raw_echoes(): void
    {
        // Blade's {!! !!} on customer content is how this page would become an
        // XSS. resources/views contains zero today; keep it that way.
        foreach (glob(resource_path('views/landing/ruled_page/*.blade.php')) as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /**
     * The partials are scanned too. glob() above does not recurse, so a raw
     * echo inside sections/ — which is where every piece of customer content
     * actually lands — would have gone unread.
     */
    public function test_no_partial_beneath_the_template_contains_a_raw_echo(): void
    {
        $files = glob(resource_path('views/landing/ruled_page/sections/*.blade.php'));

        $this->assertNotEmpty($files, 'The template ships no section partials.');

        foreach ($files as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }

    /**
     * Every guard rooted in "parse the tag, then inspect it" has failed a
     * different way each round, because different consumers of the same
     * bytes disagree about what they mean:
     *
     *   - Round 2 (a regex checking only for `src=`): admitted a src-less
     *     tag with a lookalike string in another attribute.
     *   - Round 3 (DOMDocument): libxml2 discards the attribute right after
     *     a stray solidus (`<script /type="text/javascript"
     *     type="application/ld+json">`), so it read only the ld+json type
     *     — while the HTML5 tokenizer every real browser uses keeps
     *     type="text/javascript" as the FIRST type attribute (duplicate
     *     attributes: first wins) and Chrome executed it.
     *   - This round: PCRE's `\s` matches VERTICAL TAB (0x0B); HTML
     *     whitespace does not. `<script`+VT+`src="…">` is not whitespace to
     *     the tokenizer at all, so the tag name itself swallows `src="`,
     *     Chromium parses it as a bogus element named `scriptsrc="`, and
     *     the "script" body is rendered as ordinary visible text — the
     *     entire JSON-LD payload leaks onto the page as content, though
     *     nothing executes.
     *
     * There is no version of "parse it" that doesn't have this shape of
     * hole; only the whitespace/attribute-grammar DEFINITION changes each
     * time. So the structural check below uses the actual HTML whitespace
     * class ([ \t\n\f\r], never \s) and a plain attribute grammar
     * (name, or name="value"/'value', repeated, with an optional trailing
     * self-closing slash) — anchored so the ENTIRE tag must decompose into
     * that grammar with nothing left over. A stray solidus anywhere but
     * immediately before the final `>` cannot start a valid attribute
     * token, so it breaks the anchor and the whole tag is rejected, rather
     * than being silently reinterpreted the way a specific parser would.
     *
     * The semantic half is deliberately not a byte-exact allowlist of the
     * two shapes this template happens to emit today, because that permits
     * a docblock to claim more than the code checks (round 3's did: "exactly
     * two shapes … and nothing else, ever" was not true of its own regex,
     * which admitted onerror=/onload=/data:/cross-origin src values, all
     * blocked live only by CSP rather than by this guard). Instead:
     *
     *   - No attribute name may start with "on" (event handlers execute
     *     regardless of src, and are inline script by any reading).
     *   - A src attribute must be same-origin: root-relative
     *     (`/…`, not `//…`) or prefixed with $ownOrigin — never a data:
     *     URI or another origin.
     *   - A type attribute equal (case-insensitively) to
     *     "application/ld+json" is accepted with or without a nonce — the
     *     nonce is inert either way (see layout.blade.php's own comment on
     *     that block), so requiring it here was a false positive baked
     *     into the guard, not a real check.
     *
     * Matching is attribute-based (an associative array, first occurrence
     * wins — the real duplicate-attribute rule), so reordering
     * (`<script defer src=…>`), self-closing syntax (`… />`), and mixed
     * case (`<SCRIPT SRC=…>`) all pass, because none of those change what
     * a browser actually does with the tag.
     */
    private function isKnownScriptShape(string $tag, string $ownOrigin): bool
    {
        $ws   = '[ \t\n\f\r]';
        $attr = "[a-zA-Z][\\w:.-]*(?:=(?:\"[^\"]*\"|'[^']*'))?";

        if (!preg_match("#^<script(?:{$ws}+{$attr})*{$ws}*/?>\$#i", $tag)) {
            return false;
        }

        preg_match_all("#{$attr}#", $tag, $matches);

        $attrs = [];
        foreach ($matches[0] as $token) {
            preg_match('#^([a-zA-Z][\w:.-]*)(?:=(?:"([^"]*)"|\'([^\']*)\'))?$#', $token, $am);
            $name = strtolower($am[1]);
            if (!array_key_exists($name, $attrs)) {
                $attrs[$name] = $am[2] ?? ($am[3] ?? '');
            }
        }

        foreach (array_keys($attrs) as $name) {
            if (str_starts_with($name, 'on')) {
                return false;
            }
        }

        if (isset($attrs['src'])) {
            $src = $attrs['src'];
            if (preg_match('#^/(?!/)#', $src) || str_starts_with($src, $ownOrigin . '/')) {
                return true;
            }
        }

        return isset($attrs['type']) && strtolower(trim($attrs['type'])) === 'application/ld+json';
    }

    /** The origin every real src= this template emits must match or be relative to. */
    private function ownOrigin(): string
    {
        return 'http://' . config('landing.host');
    }

    public function test_it_ships_no_inline_script(): void
    {
        // script-src is 'self' with no unsafe-inline and no nonce for
        // scripts. An inline EXECUTABLE script here would not merely be
        // blocked — it would ship a page whose behaviour silently depended
        // on something the browser refuses to run. See isKnownScriptShape()
        // above for what this actually checks and why.
        //
        // Both fixtures below are created deliberately: the Property gives
        // $localBusiness a name, which is what makes the layout emit the
        // ld+json block at all (an unnamed page suppresses it — see
        // LandingSeoTest::test_the_json_ld_block_is_suppressed_when_there_is_no_property),
        // and the chat config makes the layout ALSO emit the same-origin
        // chat embed (carries src=). Together with ruled_page.js, the
        // template's unconditional interactive-layer script (also carries
        // src=), that is all three <script> tags this template can ever
        // produce, so this test exercises every one of them at once.
        $page = $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'is_active' => true,
        ]);
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1,
            'widget_key' => 'wk-inline-check', 'is_active' => true,
        ]);

        $body = $this->body();
        $this->assertStringContainsString('<script', $body, 'The fixture rendered no script at all.');

        preg_match_all('/<script\b[^>]*>/i', $body, $m);
        $tags = $m[0];

        $this->assertSame(3, count($tags), 'Expected exactly the chat embed, ruled_page.js, and the ld+json block.');

        foreach ($tags as $tag) {
            $this->assertTrue(
                $this->isKnownScriptShape($tag, $this->ownOrigin()),
                "The template contains an inline script: {$tag}"
            );
        }
    }

    /**
     * Every bypass found across three rounds of this guard, re-verified
     * together so none of them can quietly reopen: the first three are
     * executable classic scripts or a vertical-tab parser split that leaks
     * the payload as visible text; the last four are why "has a src"
     * alone was never sufficient — script-src's live CSP happens to block
     * all four today, but this guard should not depend on that.
     */
    public function test_bypasses_of_the_ld_json_exemption_are_still_caught(): void
    {
        $bypasses = [
            'duplicate type, first wins' => '<script type="text/javascript" type="application/ld+json">',
            'string in another attribute' => '<script data-note=\'x type="application/ld+json"\'>',
            'stray solidus before duplicate type' => '<script /type="text/javascript" type="application/ld+json">',
            'vertical tab before src' => "<script\x0Bsrc=\"/x.js\">",
            'vertical tab before type' => "<script\x0Btype=\"application/ld+json\" nonce>",
            'onerror handler alongside a real src' => '<script src="/x.js" onerror="alert(1)">',
            'onload handler alongside a real src' => '<script src="/x.js" onload="alert(1)">',
            'data: URI src' => '<script src="data:text/javascript,alert(1)">',
            'cross-origin src' => '<script src="https://evil.example/x.js">',
            'protocol-relative src' => '<script src="//evil.example/x.js">',
        ];

        foreach ($bypasses as $label => $tag) {
            $this->assertFalse(
                $this->isKnownScriptShape($tag, $this->ownOrigin()),
                "[{$label}] was wrongly accepted as a known script shape."
            );
        }
    }

    /**
     * Every browser-equivalent variation of the two real shapes must still
     * pass: reordered attributes, self-closing syntax, mixed case, and an
     * ld+json block with its (inert) nonce removed entirely.
     */
    public function test_every_shape_the_template_actually_emits_is_accepted(): void
    {
        $legitimate = [
            'chat embed'                  => '<script src="/w/chat.js" data-widget-key="wk-example" defer>',
            'ruled_page.js'                => '<script src="/landing/ruled_page.js" defer>',
            'ld+json with nonce'          => '<script type="application/ld+json" nonce="AbCdEf1234567890123456">',
            'ld+json with no nonce'       => '<script type="application/ld+json">',
            'attributes reordered'        => '<script defer src="/w/chat.js">',
            'self-closing syntax'         => '<script src="/w/chat.js" defer />',
            'mixed-case tag and attribute' => '<SCRIPT SRC="/w/chat.js" DEFER>',
        ];

        foreach ($legitimate as $label => $tag) {
            $this->assertTrue(
                $this->isKnownScriptShape($tag, $this->ownOrigin()),
                "[{$label}] — a shape the template genuinely emits, or is browser-equivalent to one — was wrongly rejected."
            );
        }
    }

    /**
     * A tenant colour is only ever painted with a label that can be read on
     * it, and it brings the rest of its family with it.
     */
    public function test_a_tenant_brand_colour_arrives_with_a_readable_label(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['brand_color' => '#1F5FA8']]);   // navy

        $body = $this->body();

        $accent = Accent::for('#1F5FA8', '#9B5C8F');
        $this->assertTrue($accent->isDerived);

        $this->assertStringContainsString('--brand: #1f5fa8;', $body);
        $this->assertStringContainsString('--brand-on: ' . $accent->on . ';', $body);
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($accent->on, '#1f5fa8'));

        // Nothing is left wearing the house mauve beside it: the hover fill,
        // the halo and both text shades all move to the tenant's hue.
        foreach (['--brand-hover', '--brand-halo', '--brand-deep', '--brand-bright'] as $token) {
            $this->assertStringContainsString($token . ':', $body);
        }
        $this->assertStringNotContainsString('#7E4874', $body);
    }

    /**
     * #0078D7 is in the 5% of the sRGB cube where neither white nor the ink
     * token clears 4.5:1. Appendix B 3.4's luminance-threshold rule would
     * paint a label on it anyway.
     */
    public function test_a_brand_colour_no_label_can_sit_on_is_refused(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['brand_color' => '#0078D7']]);

        $body = $this->body();

        $this->assertStringNotContainsString('#0078d7', strtolower($body));
        $this->assertStringContainsString('--brand: #9b5c8f;', strtolower($body));

        // Falling back means the stylesheet's measured house tokens govern,
        // so the layout must NOT also write derived overrides for them.
        $this->assertStringNotContainsString('--brand-deep', $body);
    }

    public function test_a_page_with_no_tenant_colour_leaves_the_house_tokens_alone(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringContainsString('--brand: #9b5c8f;', $body);
        $this->assertStringNotContainsString('--brand-on', $body);
    }

    public function test_every_inline_style_block_carries_the_request_nonce(): void
    {
        $this->published();

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');
        $body     = $response->getContent();

        preg_match(
            "/'nonce-([A-Za-z0-9]+)'/",
            (string) $response->headers->get('Content-Security-Policy'),
            $m
        );
        $this->assertNotEmpty($m, 'The CSP names no style nonce.');

        preg_match_all('/<style\b[^>]*>/i', $body, $tags);
        $this->assertNotEmpty($tags[0], 'The template writes no token block at all.');

        foreach ($tags[0] as $tag) {
            $this->assertStringContainsString('nonce="' . $m[1] . '"', $tag);
        }

        // A style attribute is inline CSS by another name and is refused by
        // the same policy. Per-tenant values belong in the nonced block and
        // stagger belongs in :nth-child() rules.
        $this->assertDoesNotMatchRegularExpression('/\sstyle="/i', $body);
    }

    public function test_the_chat_embed_is_same_origin(): void
    {
        // ChatWidgetConfig::generateEmbedCode() cannot be used here: it builds
        // both the script src and the API base from the admin origin, which
        // script-src 'self' and connect-src 'self' refuse, and it delivers
        // them through an inline script, which has no nonce to run under.
        $this->published();
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1,
            'widget_key' => 'wk-same-origin', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('src="/w/chat.js"', $body);
        $this->assertStringContainsString('data-widget-key="wk-same-origin"', $body);

        // Scoped to the script tags rather than the whole document, because
        // the document legitimately names the admin origin now: the booking
        // band FRAMES /booking-widget from it, which is the opposite ruling to
        // this one and for the opposite reason. Booking can live behind an
        // origin boundary and therefore must; chat is a script that has to
        // execute inside this page, so it cannot, and it stays same-origin
        // under script-src 'self' instead. What must never happen is a SCRIPT
        // pointed at the admin host.
        preg_match_all('/<script[\s>][^>]*>/i', $body, $tags);
        $this->assertNotEmpty($tags[0], 'The fixture rendered no script at all.');

        foreach ($tags[0] as $tag) {
            $this->assertStringNotContainsString(rtrim(config('app.url'), '/'), $tag);
        }
    }

    public function test_a_switched_off_chat_widget_is_not_embedded(): void
    {
        $this->published();
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1,
            'widget_key' => 'wk-off', 'is_active' => false,
        ]);

        $this->assertStringNotContainsString('/w/chat.js', $this->body());
    }

    public function test_a_disabled_section_is_not_rendered(): void
    {
        $page = $this->published();
        $page->sections()->where('key', 'hero')->update(['enabled' => false]);

        $this->assertStringNotContainsString('data-section="hero"', $this->body());
    }

    /**
     * The font request must ask for a weight RANGE, not a list of statics.
     *
     * This is the check the shipped QA gate could not make. Appendix B 3.2's
     * gate is "curl the css2 URL, assert 200 and a non-empty body" — but
     * Google serves a .ttf fallback to any user agent it does not recognise
     * as a browser, so that gate returns 200 for a broken axis tuple exactly
     * as it does for a correct one. It passed for
     * `wght@9..144,300;9..144,600`, which served two STATIC instances and left
     * 4.1's Fraunces 400 for --t-h3 synthesised down onto the 300.
     *
     * Asserted here against the file rather than the network so it is
     * deterministic and runs offline. The live half — fetch with a browser
     * User-Agent and grep for `font-weight: 300 500` in the Fraunces blocks —
     * belongs in a release check, and was run by hand when this landed.
     */
    public function test_the_fraunces_request_spans_the_weights_the_stylesheet_uses(): void
    {
        $layout = file_get_contents(resource_path('views/landing/ruled_page/layout.blade.php'));

        $this->assertSame(1, preg_match('/css2\?([^"]+)/', $layout, $url),
            'The layout requests no Google font stylesheet.');

        $this->assertSame(1, preg_match('/family=Fraunces:opsz,wght@([^&"]+)/', $url[1], $axis),
            'Fraunces is not requested with an opsz,wght tuple.');

        // A range, spelled with `..`, and one whose bounds actually bracket
        // the 400 that --t-h3 asks for. A semicolon list is what silently
        // synthesises instead of loading.
        $this->assertStringNotContainsString(';', $axis[1],
            'Fraunces is requested as static instances; 400 will be synthesised, not loaded.');

        $this->assertSame(1, preg_match('/,(\d+)\.\.(\d+)$/', $axis[1], $range),
            'The Fraunces weight axis is not a range.');

        $this->assertLessThanOrEqual(400, (int) $range[1]);
        $this->assertGreaterThanOrEqual(400, (int) $range[2]);

        // The other two faces 4.1 names, and the one it replaces.
        $this->assertStringContainsString('family=IBM+Plex+Mono', $url[1]);
        $this->assertStringContainsString('family=Inter+Tight', $url[1]);
        $this->assertDoesNotMatchRegularExpression('/family=Inter:/', $url[1]);
    }

    public function test_the_stylesheet_sets_the_text_face_the_font_request_loads(): void
    {
        // The pair that has to move together: requesting Inter Tight while
        // body.rp still names Inter downloads a face nothing uses and renders
        // in one nothing downloaded.
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertSame(1, preg_match('/body\.rp\{[^}]*font-family:([^;]+)/', $css, $stack));
        $this->assertStringContainsString("'Inter Tight'", $stack[1]);

        // And the metric-matched fallbacks 4.1 specifies, without which
        // display=swap reflows the headline on every first paint.
        $this->assertStringContainsString("font-family:'Fraunces fb'", $css);
        $this->assertStringContainsString("font-family:'Inter Tight fb'", $css);
    }

    // ─── Stored values the renderer must survive ───────────────────

    /**
     * theme, content and seo are `array` casts with no schema behind them,
     * and until this was fixed the admin API validated them as no more than
     * `sometimes|array` — nothing constrained the inner values at all. An
     * array LEAF is not a cosmetic problem: theme.brand_color reaches
     * Accent::for(?string ...) and every copy leaf reaches Blade's e(),
     * which is htmlspecialchars() with a `string` parameter, so both throw a
     * TypeError. The result was HTTP 500 on a LIVE public page, on every
     * request, from data the tenant themselves stored — and preview shares
     * this render path, so they had no in-product way to see what broke.
     *
     * The admin API now refuses those writes, but rows predating that rule
     * are already in the database, so the renderer must stand on its own:
     * these tests store the bad shape directly, exactly as such a row would
     * arrive from Postgres.
     */
    public function test_a_nested_brand_colour_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['brand_color' => ['#ffffff']]]);

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

        $response->assertOk();

        // Dropped, not stringified: the page falls back to the house accent
        // rather than writing "Array" into a custom property.
        $this->assertStringContainsString('--brand: #9b5c8f', $response->getContent());
    }

    public function test_a_nested_seo_title_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $page->update(['content' => [], 'seo' => ['title' => ['pwn']]]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Mimi', 'is_active' => true]);

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

        $response->assertOk();

        // An absent leaf is a state every `??` chain in the template already
        // handles, so the next real candidate wins.
        $this->assertStringContainsString('<title>Maison Mimi</title>', $response->getContent());
    }

    public function test_a_nested_copy_leaf_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $page->update(['content' => ['hero' => ['headline' => ['pwn']]]]);
        Property::create(['organization_id' => 1, 'brand_id' => 1, 'name' => 'Maison Mimi', 'is_active' => true]);

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

        $response->assertOk();
        $this->assertStringContainsString('<h1>Maison Mimi</h1>', $response->getContent());
    }

    /** The preview is the only place a tenant could diagnose this, so it must not 500 either. */
    public function test_the_preview_of_a_broken_page_still_renders(): void
    {
        $page = $this->published();
        $page->update(['status' => 'draft', 'theme' => ['brand_color' => ['#ffffff']],
            'seo' => ['title' => ['pwn']], 'content' => ['hero' => ['headline' => ['pwn']]]]);

        $url = URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]);

        $this->get($url)->assertOk();
    }

    /**
     * The pruning must not eat the one level of nesting the template
     * genuinely reads: $page->content[$section->key] is handed to a partial
     * as $copy, so content is a map of section keys onto a map of fields.
     */
    public function test_the_nesting_the_template_actually_reads_survives(): void
    {
        $page = $this->published();
        $page->update(['content' => ['hero' => ['headline' => 'The Art of Wellness', 'subtext' => 'Quiet luxury']]]);

        $body = $this->body();

        $this->assertStringContainsString('The Art of Wellness', $body);
        $this->assertStringContainsString('Quiet luxury', $body);
    }

    // ─── Font pairing (RULING 5): the choice must actually change the page ──

    /**
     * The claim this task has to prove: a page with no `font_pairing` set
     * renders EXACTLY as it did before this feature existed. Not "no visible
     * difference" -- the opening `<html>` tag itself, byte for byte, because
     * that is the one place the attribute could have been written.
     */
    public function test_a_page_with_no_font_pairing_set_gets_no_font_pairing_attribute(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertSame(1, preg_match('/<html\b[^>]*>/i', $body, $tag),
            'The template rendered no <html> tag at all.');
        $this->assertDoesNotMatchRegularExpression('/data-font-pairing/', $tag[0]);

        // Not merely "the attribute is absent somewhere in a longer tag" --
        // the tag is the exact string it was before this feature existed,
        // with no stray trailing space or other leftover from building it
        // conditionally.
        $this->assertMatchesRegularExpression('/^<html lang="[a-z-]+">$/', $tag[0]);
    }

    /**
     * Fix round 1, Minor 3: the tag-level assertion above held even while
     * the response was one byte LONGER than before this feature existed --
     * a `{{-- --}}` comment once sat between `<!doctype html>` and
     * `<html ...>`, and Blade strips a comment's own contents but not the
     * real newline on each side of it, so the doctype/html boundary grew a
     * blank line nothing above could see. This asserts the exact three-line
     * prologue (doctype, then <html>, then <head>, one newline apart) the
     * template has always emitted, at the very start of the response, so a
     * stray blank line anywhere in that boundary fails it.
     */
    public function test_no_font_pairing_set_leaves_the_doctype_prologue_untouched(): void
    {
        $this->published();

        $this->assertMatchesRegularExpression(
            '/^<!doctype html>\n<html lang="[a-z-]+">\n<head>/',
            $this->body()
        );
    }

    /**
     * The one behaviour RULING 5 exists for: choosing a pairing has to
     * SHOW somewhere in the response, or the choice changes nothing and the
     * wizard's specimen cards would be a lie. `:root[data-font-pairing="X"]`
     * in ruled_page.css only ever matches an attribute on the root element,
     * so this is the one place it can be written -- and this test proves
     * exactly that, not merely that the string appears somewhere in the
     * document (a stray copy in, say, a JSON-LD block would also pass a
     * looser check and prove nothing about which element actually carries
     * it).
     */
    public function test_a_chosen_font_pairing_appears_as_a_root_attribute(): void
    {
        foreach (['editorial', 'modern', 'classic'] as $pairing) {
            $page = $this->published();
            $page->update(['theme' => ['font_pairing' => $pairing]]);

            $body = $this->body();

            $this->assertSame(1, preg_match('/<html\b[^>]*>/i', $body, $tag),
                'The template rendered no <html> tag at all.');
            $this->assertMatchesRegularExpression(
                '/^<html lang="[a-z-]+" data-font-pairing="' . $pairing . '">$/',
                $tag[0],
                'The attribute must sit on the root <html> element, in exactly this shape -- not merely appear somewhere in the document.'
            );
            $this->assertSame(
                1,
                substr_count($body, 'data-font-pairing="' . $pairing . '"'),
                'The attribute must appear exactly once.'
            );

            $page->delete();
        }
    }

    /**
     * `theme` is a schemaless `array` cast (see the "Stored values the
     * renderer must survive" tests above) -- a row written before this
     * column existed, or hand-edited, can hold anything. An unrecognised
     * value must be treated the same as no value at all, not echoed
     * verbatim onto <html> as an attribute selector nothing in the
     * stylesheet defines.
     */
    public function test_an_unrecognised_font_pairing_value_is_ignored(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['font_pairing' => 'not-a-real-pairing']]);

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

        $response->assertOk();
        $this->assertStringNotContainsString('data-font-pairing', $response->getContent());
    }

    /**
     * The CSS half of the wiring, asserted against the actual shipped file
     * so a typo in a selector (which no PHP test above can see, since the
     * class-under-test never parses CSS) cannot silently ship a pairing
     * that changes the attribute but not a single heading.
     *
     * Each block must be scoped to :root (only the root element carries the
     * attribute) and must reuse one of the two families
     * layout.blade.php's own Google Fonts request already loads for every
     * page -- Fraunces or IBM Plex Mono -- never a font this page does not
     * already fetch.
     */
    public function test_each_font_pairing_selector_targets_the_headings_and_a_loaded_family(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        foreach (['classic', 'editorial', 'modern'] as $pairing) {
            $this->assertSame(
                1,
                preg_match(
                    '/:root\[data-font-pairing="' . $pairing . '"\][^{]*h1,[^{]*:root\[data-font-pairing="'
                        . $pairing . '"\][^{]*h2,[^{]*:root\[data-font-pairing="' . $pairing . '"\][^{]*h3\{([^}]*)\}/',
                    $css,
                    $rule
                ),
                "No :root[data-font-pairing=\"{$pairing}\"] rule targeting h1, h2 and h3 was found."
            );

            $this->assertTrue(
                str_contains($rule[1], 'Fraunces') || str_contains($rule[1], 'IBM Plex Mono'),
                "The \"{$pairing}\" pairing does not set a font-family the page already loads."
            );
        }
    }

    /**
     * Fix round 1, Important 2. The reviewer downloaded both the served
     * font file and the full Fraunces variable font and read their `fvar`
     * tables directly: the layout's href
     * (`family=Fraunces:opsz,wght@9..144,300..500`) serves an
     * AXIS-SLICED file carrying only `opsz` and `wght` -- Google Fonts
     * serves exactly the axes named in the query's own axis list, nothing
     * more. A `font-variation-settings` declaration naming any OTHER axis
     * (Fraunces genuinely defines `SOFT` and `WONK`, among others) is
     * silently ignored by every browser: no error, no fallback, just a
     * declaration that does nothing. `editorial` shipped exactly this bug
     * for `SOFT`/`WONK` in this task's first pass, and
     * `test_each_font_pairing_selector_targets_the_headings_and_a_loaded_family`
     * above could not catch it -- it only asserts the FAMILY is one the
     * page loads, never that a declared AXIS is one the served file
     * actually carries.
     *
     * This is the general form of that check: every axis tag any
     * `:root[data-font-pairing="X"]` rule declares must be one the page's
     * own Google Fonts href actually asks for, for every family and every
     * pairing -- not a one-off assertion tied to the specific axis that
     * went dead this time.
     */
    public function test_no_font_pairing_rule_declares_an_axis_the_page_never_requests(): void
    {
        $layout = file_get_contents(resource_path('views/landing/ruled_page/layout.blade.php'));
        $css    = file_get_contents(public_path('landing/ruled_page.css'));

        // The only family requested WITH an axis list at all -- IBM Plex
        // Mono and Inter Tight are each requested as a static weight list
        // (`wght@500`, `wght@400;500;600`: no comma before the `@`), so
        // they have no variation axis a `font-variation-settings`
        // declaration could legitimately name.
        $this->assertSame(1, preg_match('/family=Fraunces:([a-z,]+)@/', $layout, $m),
            'The layout requests no Fraunces axis list at all -- has the href changed shape?');
        $servedAxes = explode(',', $m[1]);
        $this->assertContains('opsz', $servedAxes);
        $this->assertContains('wght', $servedAxes);

        $this->assertSame(1, preg_match(
            '/\/\* --- font pairing \(RULING 5\).*?--- end font pairing -+ \*\//s',
            $css,
            $block
        ), 'The font-pairing CSS block markers were not found -- have the comment delimiters moved?');

        preg_match_all('/font-variation-settings:([^;]+);/', $block[0], $declarations);
        $this->assertNotEmpty($declarations[1], 'No font-pairing rule declares font-variation-settings at all.');

        $checked = 0;
        foreach ($declarations[1] as $declaration) {
            preg_match_all("/'([a-zA-Z]{4})'/", $declaration, $tags);
            foreach ($tags[1] as $tag) {
                $checked++;
                $this->assertContains(
                    $tag,
                    $servedAxes,
                    "A font-pairing rule declares axis '{$tag}', which the page's own Google Fonts "
                        . "request never asks for -- every browser silently ignores it. This is exactly "
                        . "how SOFT/WONK went dead on the editorial pairing."
                );
            }
        }
        $this->assertGreaterThan(0, $checked, 'No axis tag was found inside any font-variation-settings declaration.');
    }

    /**
     * The claim this task has to prove: introducing ContactDetails must not
     * change one byte of what a ROUTINE page renders today — a Property with
     * a phone and an address, and no content.contact key at all, which is
     * every existing live page's actual shape. Captured against the
     * renderer BEFORE ContactDetails was wired into PageContent::for() at
     * all (see this commit's own history — the capture predates the wiring
     * commit), so a byte drifting here means the wrapping changed behaviour
     * rather than merely changing the type. The nonce is random per
     * request and is the only thing normalised out.
     *
     * Deliberately phone+address, not email-only: an email-only Property is
     * the one case this task's widening of has('contact') is SUPPOSED to
     * change (see test_an_email_only_property_now_renders_the_contact_band
     * below), so it has no business in a parity fixture.
     *
     * Task 4 update: this fixture's industry is 'beauty', which is no longer
     * one PageContent::count('booking') admits (the widget's Check-in/
     * Check-out/Adults/Children questions fit hotel stays only), so the
     * golden below no longer carries the booking band at all, and the hero
     * CTA now reads #contact rather than a #booking anchor with nothing to
     * scroll to. This is the one place that bug fix is expected to change
     * this test's bytes; RuledPageSectionsTest's own hotel-industry fixtures
     * are what still pin the booking band byte-for-byte where it belongs.
     */
    public function test_the_contact_band_renders_byte_identical_to_before_contactdetails(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'address' => '12 Elizabetes iela',
            'city' => 'Riga', 'country' => 'Latvia', 'is_active' => true,
        ]);

        $body = preg_replace('/nonce="[^"]*"/', 'nonce="TESTNONCE"', $this->body());

        $golden = '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Glamour Salon</title>
<meta name="description" content="">

<meta property="og:title" content="Glamour Salon">
<meta property="og:type" content="website">
<meta property="og:url" content="http://sites.hexa-tech.uk/glamour-salon">
<script type="application/ld+json" nonce="TESTNONCE">
  {"@context":"https:\\/\\/schema.org","@type":"BeautySalon","name":"Glamour Salon","url":"http:\\/\\/sites.hexa-tech.uk\\/glamour-salon","address":{"@type":"PostalAddress","streetAddress":"12 Elizabetes iela","addressLocality":"Riga","addressCountry":"Latvia"},"telephone":"+371 20000000"}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=IBM+Plex+Mono:wght@500&family=Inter+Tight:wght@400;500;600&display=swap">
<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css">

<style nonce="TESTNONCE">
  :root{
    --brand: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>



<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
          <h1>The Art of Wellness</h1>
            
          <a class="rp-cta" href="#contact">Book appointment</a>
      </div>
</section>
  <section id="contact" data-section="contact" class="band band--ink rp-contact">
  <div class="wrap rp-contact__grid">
    <div class="rp-contact__details">
      <h2 class="band__kicker">Finding us</h2>

              <div class="rp-field">
          <p class="rp-field__label">Address</p>
                      <p class="rp-field__value">12 Elizabetes iela</p>
                      <p class="rp-field__value">Riga</p>
                      <p class="rp-field__value">Latvia</p>
                  </div>
      
              <div class="rp-field">
          <p class="rp-field__label">Telephone</p>
          <p class="rp-field__value"><a class="rp-field__link" href="tel:+37120000000">+371 20000000</a></p>
        </div>
      
          </div>

    
          
      <a class="rp-map" href="https://maps.google.com/?q=12+Elizabetes+iela%2C+Riga%2C+Latvia"
         target="_blank" rel="noopener">
        <span class="rp-map__field" aria-hidden="true"><span class="rp-map__dot"></span></span>
        <span class="rp-map__address">12 Elizabetes iela, Riga, Latvia</span>
        <span class="rp-map__open">Open in Maps &#8599;</span>
      </a>
      </div>
</section>
</main>

<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <p class="rp-footer__legal">&copy; 2026 Glamour Salon</p>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js" defer></script>

</body>
</html>
';

        $this->assertSame($golden, $body);
    }

    // ─── content.contact overrides and hostility (App\Landing\ContactDetails) ──

    /**
     * The other half of the JSON-LD claim the parity test above does not
     * cover: a page-level phone override reaches <script type="application/
     * ld+json"> exactly where the bare Property's phone did before, while
     * addressLocality — never overridable, see ContactDetails — still comes
     * from the Property untouched.
     */
    public function test_json_ld_telephone_reflects_a_page_level_override_while_address_locality_stays_the_propertys(): void
    {
        $page = $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 111', 'address' => '12 Elizabetes iela',
            'city' => 'Riga', 'country' => 'Latvia', 'is_active' => true,
        ]);
        $page->update(['content' => ['hero' => ['headline' => 'The Art of Wellness'],
            'contact' => ['phone' => '+371 999']]]);

        $body = $this->body();

        $this->assertStringContainsString('"telephone":"+371 999"', $body);
        $this->assertStringNotContainsString('"telephone":"+371 111"', $body);
        $this->assertStringContainsString('"addressLocality":"Riga"', $body);
    }

    /**
     * The widening this task makes deliberately: has('contact') used to ask
     * only about address and phone, so an email-only Property published no
     * contact band at all. An email address is exactly as publishable a
     * contact fact as either of those. RuledPageSectionsTest pins the same
     * behaviour at the section-partial level; this is the same claim at the
     * full-page render this task's parity test above also exercises.
     */
    public function test_an_email_only_property_now_renders_the_contact_band(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'email' => 'hello@example.test', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="contact"', $body);
        $this->assertStringContainsString('href="mailto:hello@example.test"', $body);
    }

    /**
     * content.contact is read straight out of a schemaless `array` cast with
     * no schema behind it (see ScalarTree's own docblock), and these rows are
     * written exactly as a pre-existing, hand-edited, or raw-imported row
     * would be: a direct UPDATE, bypassing both the admin API's validation
     * and Eloquent's own re-encoding. The public page must survive every one
     * of these shapes with a 200 -- degrading to "no override" is fine and
     * expected, a 500 is not -- on the live page AND on preview, since
     * preview shares this render path (see LandingPageController::render()'s
     * own comment on exactly that).
     */
    private function storeRawContact(LandingPage $page, mixed $contactValue): void
    {
        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode(['hero' => ['headline' => 'The Art of Wellness'], 'contact' => $contactValue]),
        ]);
    }

    private function assertPageAndPreviewSurvive(LandingPage $page): void
    {
        $this->get('http://' . config('landing.host') . '/glamour-salon')->assertOk();

        $page->refresh();
        $page->status = 'draft';
        $page->save();

        $url = URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]);
        $this->get($url)->assertOk();
    }

    public function test_a_nested_contact_phone_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawContact($page, ['phone' => ['x']]);

        $this->assertPageAndPreviewSurvive($page);
    }

    public function test_a_string_shaped_contact_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawContact($page, 'just a string');

        $this->assertPageAndPreviewSurvive($page);
    }

    public function test_an_object_shaped_contact_with_no_recognised_fields_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawContact($page, ['unexpected' => 'value', 'another' => 123]);

        $this->assertPageAndPreviewSurvive($page);
    }

    public function test_a_200k_character_contact_field_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawContact($page, ['phone' => str_repeat('x', 200_000)]);

        $this->assertPageAndPreviewSurvive($page);
    }

    // ─── Media plates (Task 5, landing phase 3b) — golden captures ────────

    /**
     * The claim Task 5 has to prove before it touches a single Blade file:
     * introducing the hero image plate must not move one byte of what a
     * page with hero copy and NO `content.hero.image_url` renders today.
     * Captured against the renderer BEFORE PageContent::imageUrl() or
     * hero.blade.php's plate markup existed at all (see this commit's own
     * position in git history, ahead of the wiring commit) — a byte
     * drifting here after that lands means the plate rendered when it had
     * no business to, not merely that the wrapping changed. The nonce is
     * random per request and is the only thing normalised out.
     */
    public function test_the_hero_band_renders_byte_identical_with_no_image_url(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero' => ['headline' => 'The Art of Wellness', 'subtext' => 'Quiet luxury, considered service.'],
        ]]);

        $body = preg_replace('/nonce="[^"]*"/', 'nonce="TESTNONCE"', $this->body());

        $golden = '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Art of Wellness</title>
<meta name="description" content="">

<meta property="og:title" content="The Art of Wellness">
<meta property="og:type" content="website">
<meta property="og:url" content="http://sites.hexa-tech.uk/glamour-salon">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=IBM+Plex+Mono:wght@500&family=Inter+Tight:wght@400;500;600&display=swap">
<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css">

<style nonce="TESTNONCE">
  :root{
    --brand: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>



<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
          <h1>The Art of Wellness</h1>
              <p class="rp-hero__sub">Quiet luxury, considered service.</p>
        
      </div>
</section>
</main>

<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <p class="rp-footer__legal">&copy; 2026 HotelLoyalty</p>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js" defer></script>

</body>
</html>
';

        $this->assertSame($golden, $body);
    }

    /**
     * The same claim, for the about band: a page with a kicker, lead and
     * body — and no `content.about.image_url` — must render byte-identical
     * once the plate exists. Captured before either PageContent::imageUrl()
     * or about.blade.php's plate markup existed (see this commit's position
     * in git history, ahead of the wiring commit that adds them). This is
     * also the fixture that proves the docblock's promise wrong: today's
     * about.blade.php claims "text at 62ch, centred in the grid" but the
     * actual markup below is grid-column 3/11 (columns 3-10), not centred —
     * the code, not the comment, is what this golden pins.
     */
    public function test_the_about_band_renders_byte_identical_with_no_image_url(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['kicker' => 'The Studio', 'lead' => 'Considered service, unhurried.', 'body' => 'We opened Glamour Salon to slow the whole ritual down.'],
        ]]);

        $body = preg_replace('/nonce="[^"]*"/', 'nonce="TESTNONCE"', $this->body());

        $golden = '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Art of Wellness</title>
<meta name="description" content="">

<meta property="og:title" content="The Art of Wellness">
<meta property="og:type" content="website">
<meta property="og:url" content="http://sites.hexa-tech.uk/glamour-salon">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=IBM+Plex+Mono:wght@500&family=Inter+Tight:wght@400;500;600&display=swap">
<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css">

<style nonce="TESTNONCE">
  :root{
    --brand: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>



<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
          <h1>The Art of Wellness</h1>
            
      </div>
</section>
  <section data-section="about" class="band band--paper-2 rp-about">
  <div class="wrap rp-about__grid">
    <div class="rp-about__text">
      
      <h2 class="band__kicker">The Studio</h2>

              <p class="rp-about__lead"><span class="rp-about__opening">Considered service,</span> unhurried.</p>
      
      <div class="rp-about__body">
                              <p>We opened Glamour Salon to slow the whole ritual down.</p>
                        </div>
    </div>
  </div>
</section>
</main>

<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <p class="rp-footer__legal">&copy; 2026 HotelLoyalty</p>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js" defer></script>

</body>
</html>
';

        $this->assertSame($golden, $body);
    }

    /**
     * The claim Task 5 exists to prove: an image uploaded through the REAL
     * writer (Task 4's endpoint) reaches the public hero band as a plate.
     * Mutation target 2 (hero plate rendered unconditionally) fails BOTH
     * golden captures above rather than this test, since an unconditional
     * plate would also appear on the no-image fixtures — this test only
     * proves the positive direction: the plate appears, carries the
     * uploaded URL, and the section still renders.
     */
    public function test_the_hero_plate_renders_with_an_image_uploaded_through_the_real_endpoint(): void
    {
        $this->ensureImageUploadSchema();
        $org  = $this->orgWithLandingPages();
        $page = $this->publishedForOrg($org, 'plate-hero-salon', [
            'hero' => ['headline' => 'The Art of Wellness'],
        ]);

        $url = $this->uploadImageViaEndpoint($org, 'hero');
        $this->assertStringStartsWith('/storage/', $url);

        $body = $this->bodyFor($page);

        $this->assertStringContainsString('data-section="hero"', $body);
        $this->assertStringContainsString(
            '<img class="rp-hero__plate-img" src="' . $url . '" alt="" fetchpriority="high" decoding="async">',
            $body,
        );
    }

    /**
     * The about half of the same claim, plus 4.5.4's column shift: the text
     * moves from its no-image columns 3-11 to 6-11 exactly when the plate
     * renders. Mutation target 3 (drop the column shift) is what this test
     * catches — the plate would still appear, but the text div would be
     * missing the `rp-about__text--shifted` modifier class.
     */
    public function test_the_about_plate_renders_with_an_image_uploaded_through_the_real_endpoint_and_shifts_the_text_column(): void
    {
        $this->ensureImageUploadSchema();
        $org  = $this->orgWithLandingPages();
        $page = $this->publishedForOrg($org, 'plate-about-salon', [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['kicker' => 'The Studio', 'body' => 'Our story starts with quiet rooms.'],
        ]);

        $url = $this->uploadImageViaEndpoint($org, 'about');
        $this->assertStringStartsWith('/storage/', $url);

        $body = $this->bodyFor($page);

        $this->assertStringContainsString('data-section="about"', $body);
        $this->assertStringContainsString(
            '<img class="rp-about__plate-img" src="' . $url . '" alt="" loading="lazy" decoding="async">',
            $body,
        );
        $this->assertStringContainsString('<figcaption class="rp-about__plate-caption mono">The Studio</figcaption>', $body);
        $this->assertStringContainsString('class="rp-about__text rp-about__text--shifted"', $body);
    }

    /**
     * An https:// URL is the other half of the allowlist (a cloud-disk
     * upload never starts with /storage/) and gets no less real a check
     * than the local-disk shape above.
     */
    public function test_an_https_image_url_is_accepted_by_the_allowlist(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero' => ['headline' => 'The Art of Wellness', 'image_url' => 'https://cdn.example.test/landing/hero.jpg'],
        ]]);

        $body = $this->body();

        $this->assertStringContainsString(
            '<img class="rp-hero__plate-img" src="https://cdn.example.test/landing/hero.jpg" alt="" fetchpriority="high" decoding="async">',
            $body,
        );
    }

    // ─── Hostile content.{hero,about}.image_url (App\Landing\PageContent::imageUrl) ──

    /**
     * Written exactly as the contact hostility battery above does — a raw
     * DB::table() update, bypassing both the admin API's validation and
     * Eloquent's re-encoding — because content.hero/about is a schemaless
     * `array` cast with no schema behind it, and rows written before D4
     * existed, or hand-edited, are already in the database in shapes like
     * these. A 500 here is not acceptable, on the live page or on preview.
     */
    private function storeRawImageUrl(LandingPage $page, string $section, string $textField, string $textValue, mixed $imageValue): void
    {
        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode([
                'hero' => ['headline' => 'The Art of Wellness'],
                $section => [$textField => $textValue, 'image_url' => $imageValue],
            ]),
        ]);
    }

    private function assertNoPlateImgForSection(string $section, string $body): void
    {
        $this->assertStringNotContainsString('rp-' . $section . '__plate-img', $body,
            "A plate <img> rendered for {$section} despite a hostile image_url.");
    }

    /**
     * Mutation target 1: if imageUrl() returned the raw leaf unchecked, this
     * is the test that goes red — a `javascript:` URI would sail straight
     * into an `<img src>` (inert there, but the guard exists precisely so
     * "which tag happens to be forgiving" is never the thing standing
     * between stored data and a hostile URL scheme).
     */
    public function test_a_javascript_scheme_image_url_renders_no_img_tag(): void
    {
        // Both sections hostile in the SAME row, and asserted in one pass:
        // assertPageAndPreviewSurvive() flips its page to draft to exercise
        // the preview path, so calling it twice against the same fixture
        // (once per section) would find the live route already 404ing from
        // the first call's own mutation. published()'s slug is also fixed,
        // so a second fixture can't be created alongside this one either.
        $page = $this->published();
        DB::table('landing_pages')->where('id', $page->id)->update([
            'content' => json_encode([
                'hero'  => ['headline' => 'The Art of Wellness', 'image_url' => 'javascript:alert(1)'],
                'about' => ['body' => 'Our story.', 'image_url' => 'javascript:alert(1)'],
            ]),
        ]);

        $body = $this->body();

        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertNoPlateImgForSection('about', $body);
        $this->assertPageAndPreviewSurvive($page);
    }

    /**
     * A bare attribute-breakout string: Blade's `{{ }}` would already
     * escape it were it ever echoed, but imageUrl()'s allowlist is the
     * second wall — it refuses the leaf outright, so the string never
     * reaches an attribute context (escaped or otherwise) at all.
     */
    public function test_an_attribute_breakout_image_url_renders_no_img_tag(): void
    {
        $page = $this->published();
        $this->storeRawImageUrl($page, 'hero', 'headline', 'The Art of Wellness', '"><script>');

        $body = $this->body();

        $this->assertStringNotContainsString('"><script>', $body);
        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertPageAndPreviewSurvive($page);
    }

    /**
     * A PROTOCOL-RELATIVE URL — must be treated as absent, not as a
     * root-relative path: a browser resolves `//` against the CURRENT
     * page's scheme, so it is exactly as capable of pointing off-origin as
     * a fully-qualified cross-origin URL, and `^(https?://|/storage/)`
     * matches neither of its prefixes.
     */
    public function test_a_protocol_relative_image_url_renders_no_img_tag(): void
    {
        $page = $this->published();
        $this->storeRawImageUrl($page, 'hero', 'headline', 'The Art of Wellness', '//evil.example/x.jpg');

        $body = $this->body();

        $this->assertStringNotContainsString('evil.example', $body);
        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertPageAndPreviewSurvive($page);
    }

    /**
     * content is pruned to depth 2 before PageContent ever sees it
     * (ScalarTree::prune(), called from the render path) — an array-shaped
     * leaf one level deeper than the column's own shape allows is dropped
     * entirely rather than reaching imageUrl() at all. Proven here anyway,
     * at the render boundary, rather than assumed from prune()'s own unit
     * tests: this is the render path's actual behaviour on a row shaped
     * exactly as a raw import or hand-edit would leave it.
     */
    public function test_an_array_shaped_image_url_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawImageUrl($page, 'hero', 'headline', 'The Art of Wellness', ['first', 'second']);

        $body = $this->body();

        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertPageAndPreviewSurvive($page);
    }

    /** A JSON object rather than a JSON array — both decode to a PHP array through the same `array` cast. */
    public function test_an_object_shaped_image_url_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawImageUrl($page, 'hero', 'headline', 'The Art of Wellness', (object) ['nested' => 'value']);

        $body = $this->body();

        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertPageAndPreviewSurvive($page);
    }

    /**
     * No column-level length limit stands between a raw write and this
     * leaf (content is TEXT/jsonb with no CHECK constraint), so the
     * strlen() <= 2048 guard inside imageUrl() is what stops a pathological
     * value from ever reaching a `src` attribute.
     */
    public function test_a_200k_character_image_url_does_not_take_the_page_down(): void
    {
        $page = $this->published();
        $this->storeRawImageUrl($page, 'hero', 'headline', 'The Art of Wellness', str_repeat('x', 200_000));

        $body = $this->body();

        $this->assertNoPlateImgForSection('hero', $body);
        $this->assertPageAndPreviewSurvive($page);
    }
}
