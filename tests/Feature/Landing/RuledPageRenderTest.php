<?php
namespace Tests\Feature\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
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

        // Task 5: the headline's last word carries the <em> emphasis (the
        // server-side split in hero.blade.php); the CHAIN this test pins —
        // name over an absent headline — is unchanged.
        $this->assertStringContainsString('<h1>Maison <em>Mimi</em></h1>', $this->body());
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

        // Task 5: em-wrapped, same chain — see the test above.
        $this->assertStringContainsString('<h1>Maison <em>Mimi</em></h1>', $this->body());
    }

    /** The last tenant-owned rung: the title they chose for the page. */
    public function test_the_headline_falls_back_to_the_pages_own_seo_title(): void
    {
        $page = $this->published();
        $page->update(['content' => [], 'seo' => ['title' => 'Maison Mimi']]);

        // Task 5: em-wrapped, same chain — see the two tests above.
        $this->assertStringContainsString('<h1>Maison <em>Mimi</em></h1>', $this->body());
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
        // Task 5: and with no name anywhere, there is no monogram DEVICE
        // either — an empty plate would be the <h1></h1> mistake as a
        // graphic.
        $this->assertStringNotContainsString('rp-hero__device', $body,
            'A page with no name at all composed a monogram device around nothing.');
    }

    // ─── The hero composition (Task 5, landing phase 3c; D5) ───────────────

    /**
     * The em-wrap must never weaken the escaping discipline: the split
     * happens server-side into two plain strings and BOTH halves echo
     * through `{{ }}`, so a headline that itself contains markup — an
     * `<em>`, a quote, an ampersand — arrives entity-escaped in whichever
     * half it lands in, and the only <em> inside the h1 is the template's
     * own. This is the test the "make the helper emit raw" mutation goes
     * red against (alongside the no-raw-echo scan).
     */
    public function test_the_headline_emphasis_split_preserves_escaping(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero' => ['headline' => 'Pure <em>Joy</em> & "Calm" Now'],
        ]]);

        $this->assertStringContainsString(
            '<h1>Pure &lt;em&gt;Joy&lt;/em&gt; &amp; &quot;Calm&quot; <em>Now</em></h1>',
            $this->body(),
            'The emphasis split must escape tenant bytes in both halves and emit exactly one template-owned <em>.'
        );
    }

    /**
     * A single-word headline gets NO <em>: emphasis reads as emphasis only
     * against roman text beside it, and a wholly-italic headline is just a
     * slanted one. (The empty-headline case is covered by the
     * no-empty-heading test above — the h1 is dropped before the split
     * matters.)
     */
    public function test_a_single_word_headline_carries_no_emphasis(): void
    {
        $page = $this->published();
        $page->update(['content' => ['hero' => ['headline' => 'Serenity']]]);

        $body = $this->body();

        $this->assertStringContainsString('<h1>Serenity</h1>', $body);
        $this->assertDoesNotMatchRegularExpression('/<h1>[^<]*<em>/', $body,
            'A one-word headline must not be wrapped in <em> wholesale.');
    }

    /**
     * The chip: the hero's kicker (copy override, else the industry
     * vocabulary — no profile authors one today) set as the reference's
     * dot-and-pill eyebrow. The same stored field the nav now rejects as
     * an anchor source (see the #hero test below) has exactly one
     * consumer: this.
     */
    public function test_a_stored_hero_kicker_renders_as_the_chip(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero' => ['headline' => 'The Art of Wellness', 'kicker' => 'Wellness atelier'],
        ]]);

        $this->assertStringContainsString(
            '<p class="rp-hero__chip"><span class="rp-hero__chip-dot" aria-hidden="true"></span>Wellness atelier</p>',
            $this->body()
        );
    }

    /** No kicker stored, none authored — no chip element at all, not an empty pill. */
    public function test_a_page_without_a_hero_kicker_gets_no_chip(): void
    {
        $this->published();

        $this->assertStringNotContainsString('rp-hero__chip', $this->body());
    }

    /**
     * The imageless hero's monogram DEVICE (closing the Appendix-B 4.4 gap
     * ruling 3b-3 deferred): with no photo, the 4.4 monogram plate is
     * composed beside the content column. The initials are the BUSINESS's
     * — the name chain is the nav wordmark's (name → seo.title →
     * headline), so a salon whose headline is a slogan monograms as the
     * salon.
     */
    public function test_the_imageless_hero_composes_the_monogram_device_from_the_business_name(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('<figure class="rp-hero__device">', $body);
        $this->assertStringContainsString('<span class="rp-plate__mark">GS</span>', $body,
            'The device must monogram the BUSINESS (Glamour Salon), not the headline.');
    }

    /** Without a Property the chain falls through to the headline — a device still composes. */
    public function test_the_imageless_hero_device_falls_back_to_the_headline(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringContainsString('<figure class="rp-hero__device">', $body);
        $this->assertStringContainsString('<span class="rp-plate__mark">TA</span>', $body);
    }

    /**
     * The CTA pair: gold (the profile's primary verb, booking-else-contact
     * — the gate this partial always had) plus the ghost explore half,
     * which is honest only where a services band renders and speaks the
     * profile's own services vocabulary rather than invented copy. Both on
     * the same two-part enabled+has() gate the nav and footer use.
     */
    public function test_the_hero_carries_the_gold_and_ghost_cta_pair(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65]);
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<div class="rp-hero__actions">\s*'
            . '<a class="rp-cta" href="#contact">Book appointment<\/a>\s*'
            . '<a class="rp-cta rp-cta--ghost" href="#services">Treatments<\/a>\s*'
            . '<\/div>/',
            $body,
            'The hero must carry the gold+ghost pair, gold first, ghost at the services band.'
        );
    }

    /** No services band, no ghost — the pair degrades to the gold button alone. */
    public function test_the_ghost_cta_is_absent_when_no_services_band_renders(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('<a class="rp-cta" href="#contact">', $body);
        $this->assertStringNotContainsString('rp-cta--ghost', $body);
    }

    /**
     * THE MOBILE-PARITY PIN (D5: the hero image is "never display:none").
     * PHPUnit has no layout engine, so this is enforced at the CSS level:
     * every rule block whose selector names the hero plate — desktop,
     * photo variant, or any media query — must be free of display:none.
     * The services plate's own mobile display:none (a different element
     * with an inline replacement) is out of scope by selector. This is the
     * test the "hide the mobile hero image" mutation goes red against.
     */
    public function test_no_hero_media_rule_ever_hides_the_image(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $rules, PREG_SET_ORDER);

        $inspected = 0;
        foreach ($rules as $rule) {
            if (!str_contains($rule[1], 'rp-hero__plate')) {
                continue;
            }
            $inspected++;
            $selector = trim(preg_replace('/\s+/', ' ', $rule[1]));
            $this->assertDoesNotMatchRegularExpression('/display\s*:\s*none/', $rule[2],
                "[{$selector}] hides the hero image — the mobile-parity rule forbids display:none on the hero media.");
        }

        $this->assertGreaterThan(0, $inspected,
            'No hero plate rules were found at all — the selector this test guards has been renamed.');
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
        // and the chat config makes the layout emit its chat dock. The dock
        // is the reason the expected COUNT dropped from three to two: the
        // chat used to be a same-origin <script src="/w/chat.js">, and it is
        // now an iframe on the admin origin (see
        // test_the_chat_is_framed_from_the_admin_origin_and_ships_no_script).
        // With the chat switched on and the ld+json block emitted, this
        // fixture still renders every <script> tag the template is capable of
        // producing — there are exactly two left, ruled_page.js and the
        // ld+json block, and a third appearing here is a regression whatever
        // it turns out to be.
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
        $this->assertStringContainsString('rp-chat__launcher', $body,
            'The chat fixture rendered no dock, so this no longer covers the chat path at all.');

        preg_match_all('/<script\b[^>]*>/i', $body, $m);
        $tags = $m[0];

        $this->assertSame(2, count($tags), 'Expected exactly ruled_page.js and the ld+json block.');

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
        // The /w/chat.js spellings these cases used to carry are gone with the
        // embed itself (the chat is framed now), so every one of them is
        // restated against the src the template does still emit. The shapes
        // are unchanged, and they are what this guard is about: a browser
        // treats all five as the same tag.
        $legitimate = [
            'external same-origin src'     => '<script src="/landing/ruled_page.js" data-x="y" defer>',
            'ruled_page.js'                => '<script src="/landing/ruled_page.js" defer>',
            'ld+json with nonce'           => '<script type="application/ld+json" nonce="AbCdEf1234567890123456">',
            'ld+json with no nonce'        => '<script type="application/ld+json">',
            'attributes reordered'         => '<script defer src="/landing/ruled_page.js">',
            'self-closing syntax'          => '<script src="/landing/ruled_page.js" defer />',
            'mixed-case tag and attribute' => '<SCRIPT SRC="/landing/ruled_page.js" DEFER>',
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

        // Task 4 (landing phase 3c): the emission writes the spec §3 accent
        // names — --accent/--accent-on/--accent-deep/--accent-bright/--halo —
        // which the rebuilt stylesheet consumes. Accent's PHP is untouched;
        // only the template's output keys moved. --brand-hover has no
        // successor: the rebuilt CTA's hover is a lift and a sheen, never a
        // fill-colour change, so no hover token exists to write.
        $this->assertStringContainsString('--accent: #1f5fa8;', $body);
        $this->assertStringContainsString('--accent-on: ' . $accent->on . ';', $body);
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($accent->on, '#1f5fa8'));

        // Nothing is left wearing the house mauve beside it: the halo and
        // both text shades all move to the tenant's hue.
        foreach (['--halo', '--accent-deep', '--accent-bright'] as $token) {
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
        $this->assertStringContainsString('--accent: #9b5c8f;', strtolower($body));

        // Falling back means the stylesheet's measured house tokens govern,
        // so the layout must NOT also write derived overrides for them.
        $this->assertStringNotContainsString('--accent-deep', $body);
    }

    public function test_a_page_with_no_tenant_colour_leaves_the_house_tokens_alone(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringContainsString('--accent: #9b5c8f;', $body);
        $this->assertStringNotContainsString('--accent-on', $body);
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

    /**
     * The chat is FRAMED now, and the same-origin script it replaces is gone.
     *
     * This test asserted the opposite until this task, on the argument that a
     * script cannot be iframed. The argument was sound and the result was
     * not: this page's script-src is 'self' with no nonce and its style-src
     * is 'self' plus a per-request nonce, and the widget injects an inline
     * <script> and writes every position it needs as an inline style
     * ATTRIBUTE. A style nonce rescues a <style> ELEMENT and nothing else, so
     * what a real tenant page rendered was the widget's raw DOM — unstyled
     * avatar, SVG and text, position:static, below the footer. The chat
     * therefore joins booking, services, reviews and lead forms behind the
     * origin boundary.
     *
     * The assertion that CARRIES OVER is the last one, and it is the one that
     * mattered: no SCRIPT on this page may name the admin origin. It now
     * holds for a stronger reason — there is no chat script at all.
     */
    public function test_the_chat_is_framed_from_the_admin_origin_and_ships_no_script(): void
    {
        $this->published();
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1,
            'widget_key' => 'wk-same-origin', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<iframe[^>]+class="rp-chat__panel"[^>]+src="[^"]*\/chat-frame\/wk-same-origin/i',
            $body,
            'The chat panel is not framed from the chat-frame page.'
        );
        $this->assertStringContainsString('rp-chat__launcher', $body,
            'The template ships no launcher of its own.');

        // The same-origin embed is GONE, not merely joined: a page carrying
        // both would run the widget twice, once of them broken.
        $this->assertStringNotContainsString('/w/chat.js', $body);
        $this->assertStringNotContainsString('data-widget-key', $body);
        $this->assertStringNotContainsString('data-style-nonce', $body);

        preg_match_all('/<script[\s>][^>]*>/i', $body, $tags);
        $this->assertNotEmpty($tags[0], 'The fixture rendered no script at all.');

        foreach ($tags[0] as $tag) {
            $this->assertStringNotContainsString(rtrim(config('app.url'), '/'), $tag,
                "A script on this page names the admin origin: {$tag}");
        }
    }

    public function test_a_switched_off_chat_widget_is_not_embedded(): void
    {
        $this->published();
        ChatWidgetConfig::create([
            'organization_id' => 1, 'brand_id' => 1,
            'widget_key' => 'wk-off', 'is_active' => false,
        ]);

        $body = $this->body();

        // Both spellings, so the answer does not depend on which era of the
        // embed someone happens to be looking for.
        $this->assertStringNotContainsString('/w/chat.js', $body);
        $this->assertStringNotContainsString('/chat-frame/', $body);
        $this->assertStringNotContainsString('rp-chat', $body);
    }

    /**
     * No ChatWidgetConfig at all is the other route to the same absence, and
     * it is the common one: most pages have no chat. A launcher shipped
     * without a key would open an iframe pointed at /chat-frame/ with nothing
     * after it, which 404s inside itself and shows the visitor an empty box.
     */
    public function test_a_page_with_no_chat_widget_ships_no_launcher(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringNotContainsString('rp-chat', $body);
        $this->assertStringNotContainsString('/chat-frame/', $body);
    }

    public function test_a_disabled_section_is_not_rendered(): void
    {
        $page = $this->published();
        $page->sections()->where('key', 'hero')->update(['enabled' => false]);

        $this->assertStringNotContainsString('data-section="hero"', $this->body());
    }

    /**
     * The self-hosted equivalent (Task 3, landing phase 3c; D3) of the old
     * "the font request must ask for a weight RANGE" check.
     *
     * There is no Google href to read any more — every face is a committed
     * woff2 under public/landing/fonts/, declared by @font-face rules at the
     * top of ruled_page.css — so this now reads THAT declaration instead of
     * a query string. Same intent: Fraunces must be declared with a
     * font-weight RANGE (`300 500`, not a bare `300` or a comma-separated
     * list), because a single fixed weight is what silently synthesises
     * --t-h3's 400 instead of loading the real instance — the exact bug the
     * old test caught against `wght@9..144,300;9..144,600` in the Google
     * href. The file behind the declaration was independently confirmed to
     * really be a variable font spanning this range (python fontTools read
     * of its own `fvar` table, recorded in this task's report) — a check
     * with no offline equivalent, so it is not repeated here.
     */
    public function test_the_fraunces_face_spans_the_weights_the_stylesheet_uses(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertSame(1, preg_match(
            '/@font-face\{font-family:Fraunces;font-style:normal;font-weight:(\d+) (\d+);/',
            $css,
            $range
        ), 'No self-hosted Fraunces @font-face with a weight range was found.');

        // The range must bracket both the base rule's 300 and h3's own 400.
        $this->assertLessThanOrEqual(300, (int) $range[1]);
        $this->assertGreaterThanOrEqual(400, (int) $range[2]);

        // The other two faces the shared pairings use, self-hosted the same
        // way, and the two `grand` (Task 3) adds.
        $this->assertStringContainsString("font-family:'IBM Plex Mono';font-style:normal;font-weight:500;", $css);
        $this->assertStringContainsString("font-family:'Inter Tight';font-style:normal;font-weight:", $css);
        $this->assertStringContainsString("font-family:'Cormorant Garamond';font-style:normal;font-weight:", $css);
        $this->assertStringContainsString("font-family:'Cormorant Garamond';font-style:italic;font-weight:", $css);
        $this->assertStringContainsString('font-family:Inter;font-style:normal;font-weight:', $css);
    }

    /**
     * Self-hosted equivalent (Task 3, D3) of the old text-face pairing
     * check. The pair that has to move together used to be "Inter Tight
     * requested, body.rp names Inter Tight" — it is now "--font-body
     * defaults to Inter Tight, and body.rp actually consumes the token"
     * rather than a hardcoded literal, because `grand` (Task 3) has to be
     * able to override the SAME property without touching body.rp itself.
     * See the type-scale :root's own comment on --font-body for why a
     * custom property replaced the literal.
     */
    public function test_the_stylesheet_sets_the_text_face_the_font_request_loads(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertSame(1, preg_match('/--font-body:([^;]+);/', $css, $token),
            'No --font-body token was declared.');
        $this->assertStringContainsString("'Inter Tight'", $token[1]);

        $this->assertSame(1, preg_match('/body\.rp\{[^}]*font-family:([^;]+)/', $css, $stack));
        $this->assertStringContainsString('var(--font-body)', $stack[1],
            'body.rp does not consume the --font-body token at all.');

        // And the metric-matched fallbacks 4.1 specifies, without which
        // display=swap reflows the headline on every first paint. Unaffected
        // by self-hosting — these were always local()-only, never a network
        // font.
        $this->assertStringContainsString("font-family:'Fraunces fb'", $css);
        $this->assertStringContainsString("font-family:'Inter Tight fb'", $css);
    }

    /**
     * F3 (phase 3c final fix wave): every SELF-HOSTED @font-face rule this
     * stylesheet declares (one with a real network src, not a local()-only
     * metric-fallback face — see test_every_font_face_source_is_same_
     * origin_and_relative for the same src:url(...) scoping) must carry an
     * explicit unicode-range now that more than one subset exists per
     * family — without it a browser cannot tell which of a family's several
     * files serves which codepoints and, per spec, has to fetch every one
     * of them for every page, which is exactly the extra-bytes-for-latin-
     * only-tenants cost self-hosting (Task 3) was supposed to avoid paying.
     * The metric-matched `local()`-only fallback faces ('Fraunces fb' etc.)
     * are deliberately excluded: they never fetch a file at all, so a
     * unicode-range on them would restrict which characters the LOCAL
     * system font is allowed to substitute, not which network request
     * fires — a real behaviour change this task is not making.
     */
    public function test_every_font_face_declares_a_unicode_range(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        preg_match_all('/@font-face\{([^}]*\bsrc:url\([^}]*)\}/', $css, $rules);
        $this->assertNotEmpty($rules[1], 'No self-hosted @font-face rule was found at all.');

        foreach ($rules[1] as $rule) {
            $this->assertStringContainsString('unicode-range:', $rule,
                "self-hosted @font-face rule '{$rule}' carries no unicode-range.");
        }
    }

    /**
     * The regression this task exists to fix: Inter Tight (the default
     * body face), Inter (`grand`'s body face), IBM Plex Mono (`modern`'s
     * heading face) and Cormorant Garamond (`grand`'s heading face, both
     * styles) must each carry a genuine Cyrillic-covering @font-face now,
     * not just a latin-only one — RU tenant body copy fell back to a
     * system face before this fix. Fraunces is excluded on purpose: it has
     * no Cyrillic upstream at all (see the @font-face block's own header
     * comment and the font-pairing block's F3 note) — Russian headings in
     * classic/editorial fell back before this branch and still do after
     * it, which is a pre-existing gap this task does not claim to close.
     */
    public function test_a_cyrillic_range_is_declared_for_every_family_this_task_extends(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        foreach (["'Inter Tight'", 'Inter;', "'IBM Plex Mono'", "'Cormorant Garamond'"] as $family) {
            $this->assertMatchesRegularExpression(
                '/@font-face\{font-family:' . preg_quote($family, '/') . '[^}]*unicode-range:[^}]*U\+0400-045F/',
                $css,
                "No Cyrillic-covering @font-face was found for {$family}."
            );
        }
    }

    /**
     * F2 (phase 3c final fix wave): both static assets this template links
     * must carry AssetVersion's cache-bust query string, so a returning
     * visitor's cached copy can never be paired with markup it predates —
     * the two bare asset() calls this fixes never changed their URL across
     * a deploy no matter how much the files' actual bytes did. The four
     * byte goldens elsewhere in this file pin the exact query value for the
     * fixtures they cover; this is the general assertion, independent of
     * any one fixture.
     */
    public function test_the_stylesheet_and_script_urls_carry_a_cache_bust_version(): void
    {
        $this->published();
        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '#<link rel="stylesheet" href="[^"]*landing/ruled_page\.css\?v=[0-9a-f]{10}">#',
            $body,
            'The stylesheet link carries no non-empty version query.'
        );
        $this->assertMatchesRegularExpression(
            '#<script src="[^"]*landing/ruled_page\.js\?v=[0-9a-f]{10}" defer></script>#',
            $body,
            'The script tag carries no non-empty version query.'
        );
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
        $this->assertStringContainsString('--accent: #9b5c8f', $response->getContent());
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
        // Task 5: em-wrapped, same claim — the nested leaf is DROPPED and
        // the name takes the heading.
        $this->assertStringContainsString('<h1>Maison <em>Mimi</em></h1>', $response->getContent());
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
        foreach (['editorial', 'modern', 'classic', 'grand'] as $pairing) {
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
     * attribute) and must reuse one of the families ruled_page.css's own
     * @font-face block already self-hosts (Task 3, D3) -- Fraunces, IBM Plex
     * Mono or (the `grand` pairing this task adds) Cormorant Garamond --
     * never a font this page does not already ship.
     */
    public function test_each_font_pairing_selector_targets_the_headings_and_a_loaded_family(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        foreach (['classic', 'editorial', 'modern', 'grand'] as $pairing) {
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
                str_contains($rule[1], 'Fraunces')
                    || str_contains($rule[1], 'IBM Plex Mono')
                    || str_contains($rule[1], 'Cormorant Garamond'),
                "The \"{$pairing}\" pairing does not set a font-family the page already loads."
            );
        }
    }

    /**
     * Self-hosted equivalent (Task 3, landing phase 3c; D3) of Fix round 1,
     * Important 2's original check. There is no Google href to read any
     * more, so the axis list this test checks against comes from the
     * self-hosted Fraunces file's own `fvar` table instead -- read once by
     * hand with python fontTools when the file was acquired for this task
     * (recorded in the task report) rather than re-decoded here on every
     * run. That is no weaker a source of truth than the OLD test's: the old
     * test also never decoded the served bytes, it only parsed the QUERY
     * STRING that requested them and trusted Google to honour it.
     *
     * fraunces-var.woff2 carries exactly `opsz` and `wght` -- no `SOFT`, no
     * `WONK` -- confirmed against its own `fvar` table. A
     * `font-variation-settings` declaration naming any axis outside that
     * pair is silently ignored by every browser: no error, no fallback, just
     * a declaration that does nothing. `editorial` shipped exactly this bug
     * for `SOFT`/`WONK` in this task's first pass, and
     * `test_each_font_pairing_selector_targets_the_headings_and_a_loaded_family`
     * above could not catch it -- it only asserts the FAMILY is one the page
     * loads, never that a declared AXIS is one the self-hosted file actually
     * carries. This is the general form of that check, for every family and
     * every pairing -- not a one-off assertion tied to the specific axis
     * that went dead that time.
     */
    public function test_no_font_pairing_rule_declares_an_axis_the_self_hosted_font_lacks(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        // Verified against public/landing/fonts/fraunces-var.woff2's own
        // `fvar` table (python fontTools, see this task's report): opsz and
        // wght only. No other self-hosted face in this stylesheet is ever
        // targeted by a font-variation-settings declaration.
        $servedAxes = ['opsz', 'wght'];

        // Task 7: the scan covers the WHOLE stylesheet now, not just the
        // font-pairing block between the RULING 5 markers. The BASE
        // h1,h2,h3 rule carried its own dead 'SOFT' 0,'WONK' 0 pair — the
        // exact bug class this test was written for, sitting one rule
        // outside its original scan — and the block-scoped version could
        // never have caught it (the Task 5 review's charge list did).
        preg_match_all('/font-variation-settings:([^;]+);/', $css, $declarations);
        $this->assertNotEmpty($declarations[1], 'No rule declares font-variation-settings at all.');

        $checked = 0;
        foreach ($declarations[1] as $declaration) {
            preg_match_all("/'([a-zA-Z]{4})'/", $declaration, $tags);
            foreach ($tags[1] as $tag) {
                $checked++;
                $this->assertContains(
                    $tag,
                    $servedAxes,
                    "A font-pairing rule declares axis '{$tag}', which the self-hosted Fraunces file's "
                        . "own fvar table does not carry -- every browser silently ignores it. This is "
                        . "exactly how SOFT/WONK went dead on the editorial pairing."
                );
            }
        }
        $this->assertGreaterThan(0, $checked, 'No axis tag was found inside any font-variation-settings declaration.');
    }

    /**
     * The rendered <head> must name neither Google Fonts host any more
     * (Task 3, landing phase 3c; D3) -- every face is self-hosted under
     * public/landing/fonts/ and declared entirely inside ruled_page.css's
     * own @font-face rules, so there is nothing left in the template that
     * would ever need to link to fonts.googleapis.com or fonts.gstatic.com.
     */
    public function test_the_rendered_head_names_no_google_fonts_host(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringNotContainsString('fonts.googleapis.com', $body);
        $this->assertStringNotContainsString('fonts.gstatic.com', $body);
    }

    /**
     * Every @font-face this stylesheet declares must point at a same-origin,
     * relative path under fonts/ -- never an absolute URL, never a
     * protocol-relative one, and never a path that escapes public/landing/
     * (the only directory this test can independently confirm the file
     * actually exists in). A relative `url('fonts/…')` resolves against
     * ruled_page.css's own location (public/landing/), so this is the whole
     * same-origin contract D3 asks for.
     */
    public function test_every_font_face_source_is_same_origin_and_relative(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        preg_match_all('/@font-face\{[^}]*\bsrc:url\(\'([^\']+)\'\)/', $css, $faces);
        $this->assertNotEmpty($faces[1], 'No @font-face src was found at all.');

        foreach ($faces[1] as $src) {
            $this->assertStringStartsWith('fonts/', $src,
                "@font-face src '{$src}' is not a relative fonts/… path.");
            $this->assertStringNotContainsString('://', $src,
                "@font-face src '{$src}' names a scheme -- it is not same-origin.");
            $this->assertStringNotContainsString('..', $src,
                "@font-face src '{$src}' escapes the fonts/ directory.");
        }
    }

    /**
     * Every file every @font-face declaration names must actually exist on
     * disk -- a typo'd or un-committed filename here is a face that
     * silently falls through to its fallback stack on every real page,
     * with no error anywhere a developer would see it.
     */
    public function test_every_declared_font_file_exists_on_disk(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        preg_match_all('/@font-face\{[^}]*\bsrc:url\(\'([^\']+)\'\)/', $css, $faces);
        $this->assertNotEmpty($faces[1], 'No @font-face src was found at all.');

        foreach ($faces[1] as $src) {
            $this->assertFileExists(
                public_path('landing/' . $src),
                "Declared font file '{$src}' does not exist under public/landing/."
            );
        }
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
     *
     * Task 3 update (landing phase 3c; D3): the two Google Fonts preconnect
     * links and the Google css2 stylesheet link are gone from <head> — every
     * face is self-hosted under public/landing/fonts/ now, declared entirely
     * inside ruled_page.css's own @font-face rules, so there is nothing left
     * to link. The golden below drops exactly those three lines and keeps
     * the one blank line that used to sit between the preconnects and the
     * Google stylesheet link — it now sits between the JSON-LD script and
     * the (only remaining) ruled_page.css stylesheet link instead.
     *
     * Task 4 update (landing phase 3c; D1/D5): re-captured DELIBERATELY for
     * the template-shell rebuild — the shell adds the glass-pill nav (with
     * this fixture's one anchorable section and its #contact CTA), the two
     * ambient glow divs, the rebuilt footer, and renames the Accent
     * emission's output keys to the spec §3 names (--accent instead of
     * --brand). The contact band's own markup is untouched beyond none of
     * that; the hostile/survival assertions elsewhere in this file pass
     * against the new markup unchanged.
     *
     * Task 5 update (landing phase 3c; D5): re-captured DELIBERATELY for
     * the hero rebuild — this fixture's hero now carries the em-wrapped
     * headline, the monogram DEVICE (imageless page with a business name:
     * "GS"), and the gold CTA inside the .rp-hero__actions wrapper. The
     * contact band's own markup — the thing this golden exists to pin —
     * is byte-untouched, and the capture is the renderer's own output
     * (temporary in-test dump, spliced escaped, dump reverted), never
     * hand-edited.
     *
     * F2 update (phase 3c final fix wave): re-captured DELIBERATELY — the
     * stylesheet and script URLs now carry AssetVersion's cache-bust query
     * string (?v=<10 hex chars of the file's own md5>), which changes
     * whenever either file's content does. This golden's own bytes moved
     * for that reason alone; the contact band's own markup is untouched.
     */
    public function test_the_contact_band_renders_byte_identical_to_before_contactdetails(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'address' => '12 Elizabetes iela',
            'city' => 'Riga', 'country' => 'Latvia', 'is_active' => true,
        ]);

        $body = preg_replace(['/nonce="[^"]*"/', '/\?v=[0-9a-f]{10}/'], ['nonce="TESTNONCE"', '?v=ASSETHASH'], $this->body());

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

<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css?v=ASSETHASH">

<style nonce="TESTNONCE">
  :root{
    --accent: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>


<div class="ambient-glow ambient-glow--left" aria-hidden="true"></div>
<div class="ambient-glow ambient-glow--right" aria-hidden="true"></div>

<nav class="nav">
  <div class="nav__inner">
    <a class="nav__wordmark" href="#">Glamour Salon</a>
    <div class="nav__links">
      <a href="#contact">Finding us</a>
    </div>
    <a class="rp-cta rp-cta--sm nav__cta" href="#contact">Book appointment</a>
  </div>
</nav>


<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
    <div class="rp-hero__grid">
    <div class="rp-hero__content">
              <h1>The Art of <em>Wellness</em></h1>
                  <div class="rp-hero__actions">
              <a class="rp-cta" href="#contact">Book appointment</a>
                  </div>
        </div>
      <figure class="rp-hero__device">
        <span class="rp-plate rp-plate--mono" aria-hidden="true">
  <span class="rp-plate__mark">GS</span>
  </span>
      </figure>
    </div>
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
    <div class="rp-footer__top">
      <p class="rp-footer__wordmark">Glamour Salon</p>
      <a class="rp-cta rp-cta--sm rp-footer__cta" href="#contact">Book appointment</a>
    </div>
    <div class="rp-footer__bar">
      <p class="rp-footer__legal">&copy; 2026 Glamour Salon</p>
    </div>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js?v=ASSETHASH" defer></script>

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
     *
     * Task 3 update (landing phase 3c; D3): see the identical note on
     * test_the_contact_band_renders_byte_identical_to_before_contactdetails
     * above — the two Google Fonts preconnects and the Google stylesheet
     * link are gone from <head>, self-hosting having moved every face into
     * ruled_page.css's own @font-face rules.
     *
     * Task 4 update (landing phase 3c; D1/D5): re-captured DELIBERATELY for
     * the template-shell rebuild — nav (wordmark only here: no section on
     * this fixture is anchorable and neither CTA target renders), ambient
     * glow divs, the rebuilt footer (legal-only: no Property, so no
     * wordmark), and --accent in place of --brand in the emission. The
     * plate-absence this golden exists to pin is unchanged.
     *
     * Task 5 update (landing phase 3c; D5): re-captured DELIBERATELY —
     * this IS the imageless hero the rebuild redesigns, and the brief
     * names this golden as the one that moves. What it pins now: the
     * em-wrapped headline (last word), the serif-italic subtitle, and the
     * monogram DEVICE composed from the name chain's headline fallback
     * ("TA") — while STILL pinning the absences that always mattered: no
     * .rp-hero__plate-img (mutation target: the unconditional plate goes
     * red here), no --photo variant, no glow/veil/vignette layers, no
     * chip, no CTAs. Capture is the renderer's own output (temporary
     * in-test dump, spliced escaped, dump reverted), never hand-edited.
     *
     * F2 update (phase 3c final fix wave): re-captured DELIBERATELY — see
     * the identical note on test_the_contact_band_renders_byte_identical_
     * to_before_contactdetails above. The imageless-hero markup this golden
     * exists to pin is untouched.
     */
    public function test_the_hero_band_renders_byte_identical_with_no_image_url(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero' => ['headline' => 'The Art of Wellness', 'subtext' => 'Quiet luxury, considered service.'],
        ]]);

        $body = preg_replace(['/nonce="[^"]*"/', '/\?v=[0-9a-f]{10}/'], ['nonce="TESTNONCE"', '?v=ASSETHASH'], $this->body());

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

<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css?v=ASSETHASH">

<style nonce="TESTNONCE">
  :root{
    --accent: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>


<div class="ambient-glow ambient-glow--left" aria-hidden="true"></div>
<div class="ambient-glow ambient-glow--right" aria-hidden="true"></div>

<nav class="nav">
  <div class="nav__inner">
    <a class="nav__wordmark" href="#">The Art of Wellness</a>
  </div>
</nav>


<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
    <div class="rp-hero__grid">
    <div class="rp-hero__content">
              <h1>The Art of <em>Wellness</em></h1>
              <p class="rp-hero__sub">Quiet luxury, considered service.</p>
            </div>
      <figure class="rp-hero__device">
        <span class="rp-plate rp-plate--mono" aria-hidden="true">
  <span class="rp-plate__mark">TA</span>
  </span>
      </figure>
    </div>
  </div>
</section>
</main>

<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <div class="rp-footer__bar">
      <p class="rp-footer__legal">&copy; 2026 HotelLoyalty</p>
    </div>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js?v=ASSETHASH" defer></script>

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
     *
     * Task 3 update (landing phase 3c; D3): see the identical note on
     * test_the_contact_band_renders_byte_identical_to_before_contactdetails
     * above — the two Google Fonts preconnects and the Google stylesheet
     * link are gone from <head>, self-hosting having moved every face into
     * ruled_page.css's own @font-face rules.
     *
     * Task 4 update (landing phase 3c; D1/D5): re-captured DELIBERATELY for
     * the template-shell rebuild — nav (this fixture's about band is
     * anchorable via its copy kicker, so one anchor renders), the about
     * wrapper's new id="about", ambient glow divs, the rebuilt footer, and
     * --accent in place of --brand. The plate-absence and column geometry
     * this golden pins are unchanged.
     *
     * Task 5 update (landing phase 3c; D5): re-captured DELIBERATELY for
     * the hero rebuild — the hero band inside this fixture now carries the
     * em-wrapped headline and the monogram device ("TA", headline
     * fallback). The ABOUT band's markup — this golden's actual subject —
     * is byte-untouched. Capture is the renderer's own output (temporary
     * in-test dump, spliced escaped, dump reverted), never hand-edited.
     *
     * F2 update (phase 3c final fix wave): re-captured DELIBERATELY — see
     * the identical note on test_the_contact_band_renders_byte_identical_
     * to_before_contactdetails above. The about band's own markup is
     * untouched.
     */
    public function test_the_about_band_renders_byte_identical_with_no_image_url(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['kicker' => 'The Studio', 'lead' => 'Considered service, unhurried.', 'body' => 'We opened Glamour Salon to slow the whole ritual down.'],
        ]]);

        $body = preg_replace(['/nonce="[^"]*"/', '/\?v=[0-9a-f]{10}/'], ['nonce="TESTNONCE"', '?v=ASSETHASH'], $this->body());

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

<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css?v=ASSETHASH">

<style nonce="TESTNONCE">
  :root{
    --accent: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>


<div class="ambient-glow ambient-glow--left" aria-hidden="true"></div>
<div class="ambient-glow ambient-glow--right" aria-hidden="true"></div>

<nav class="nav">
  <div class="nav__inner">
    <a class="nav__wordmark" href="#">The Art of Wellness</a>
    <div class="nav__links">
      <a href="#about">The Studio</a>
    </div>
  </div>
</nav>


<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
    <div class="rp-hero__grid">
    <div class="rp-hero__content">
              <h1>The Art of <em>Wellness</em></h1>
                </div>
      <figure class="rp-hero__device">
        <span class="rp-plate rp-plate--mono" aria-hidden="true">
  <span class="rp-plate__mark">TA</span>
  </span>
      </figure>
    </div>
  </div>
</section>
  <section id="about" data-section="about" class="band band--paper-2 rp-about">
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
    <div class="rp-footer__bar">
      <p class="rp-footer__legal">&copy; 2026 HotelLoyalty</p>
    </div>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js?v=ASSETHASH" defer></script>

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
     *
     * Task 7 update (surgical, not a re-capture): the plate is the CINEMATIC
     * FRAME now (spec §4) — same img tag byte-for-byte (the hostile
     * battery's rp-about__plate-img needle is untouched), wrapped in the
     * frame/media/shine composition, and the old mono caption repeating the
     * kicker is replaced by the glass tag carrying the BUSINESS NAME (here
     * the page's seo title — the fixture org has no Property — via the
     * footer-wordmark chain). The column-shift claim is unchanged.
     */
    public function test_the_about_plate_renders_with_an_image_uploaded_through_the_real_endpoint_and_shifts_the_text_column(): void
    {
        $this->ensureImageUploadSchema();
        $org  = $this->orgWithLandingPages();
        $page = $this->publishedForOrg($org, 'plate-about-salon', [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['kicker' => 'The Studio', 'body' => 'Our story starts with quiet rooms.'],
        ]);
        $page->update(['seo' => ['title' => 'Glamour Salon']]);

        $url = $this->uploadImageViaEndpoint($org, 'about');
        $this->assertStringStartsWith('/storage/', $url);

        $body = $this->bodyFor($page);

        $this->assertStringContainsString('data-section="about"', $body);
        $this->assertStringContainsString('<figure class="rp-about__frame">', $body);
        $this->assertStringContainsString(
            '<img class="rp-about__plate-img" src="' . $url . '" alt="" loading="lazy" decoding="async">',
            $body,
        );
        $this->assertStringContainsString('<span class="rp-about__frame-shine" aria-hidden="true"></span>', $body);
        $this->assertStringContainsString('<figcaption class="rp-about__frame-tag">Glamour Salon</figcaption>', $body);
        $this->assertStringNotContainsString('rp-about__plate-caption', $body,
            'The old kicker-repeating caption should be gone from the frame.');
        $this->assertStringContainsString('class="rp-about__text rp-about__text--shifted"', $body);
    }

    /**
     * The glass tag never invents a name: with no Property and no seo title
     * the chain is empty, and the frame renders WITHOUT a figcaption rather
     * than with an empty pill (the same absent-not-empty rule every band
     * follows). The frame itself still renders — it is gated on the image,
     * not on the name.
     */
    public function test_the_about_frame_omits_the_tag_when_no_name_exists(): void
    {
        $this->ensureImageUploadSchema();
        $org  = $this->orgWithLandingPages();
        $page = $this->publishedForOrg($org, 'plate-about-nameless', [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['body' => 'Our story starts with quiet rooms.'],
        ]);

        $url = $this->uploadImageViaEndpoint($org, 'about');

        $body = $this->bodyFor($page);

        $this->assertStringContainsString('<figure class="rp-about__frame">', $body);
        $this->assertStringNotContainsString('rp-about__frame-tag', $body,
            'A page with no business name and no seo title must not render an empty tag pill.');
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

        // Task 5: the photo hero is the reference's LAYERED composition —
        // the section takes the --photo variant and the three aria-hidden
        // layers ride above the plate; the monogram device is the
        // imageless composition's and must never render beside a photo.
        $this->assertStringContainsString('class="band rp-hero rp-hero--photo"', $body);
        $this->assertStringContainsString('<div class="rp-hero__glow" aria-hidden="true"></div>', $body);
        $this->assertStringContainsString('<div class="rp-hero__veil" aria-hidden="true"></div>', $body);
        $this->assertStringContainsString('<div class="rp-hero__vignette" aria-hidden="true"></div>', $body);
        $this->assertStringNotContainsString('rp-hero__device', $body,
            'The monogram device rendered beside a photo — the two compositions are exclusive.');
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

    // ─── Palette system (Task 1, landing phase 3c) — golden capture ───────

    /**
     * The claim this task has to prove before Palette.php exists at all:
     * introducing the palette system must not move one byte of what a page
     * with no `theme.palette` set renders today. Captured against the
     * renderer BEFORE App\Landing\Palette, IndustryProfile::defaultPalette
     * or the layout's second nonced style block existed (see this commit's
     * own position in git history, ahead of the wiring commit) — a byte
     * drifting here after that lands means the "absent means porcelain,
     * emit nothing" contract broke, not merely that the wrapping changed.
     * The nonce is random per request and is the only thing normalised out.
     *
     * Deliberately the same bare `published()` fixture the hero/about plate
     * goldens already use (hero headline only, no Property, no theme): the
     * only thing this golden has to isolate is the ABSENCE of a second
     * <style> block in <head>, and a richer fixture would just be more
     * bytes that could drift for reasons this test isn't about.
     *
     * Task 3 update (landing phase 3c; D3): see the identical note on
     * test_the_contact_band_renders_byte_identical_to_before_contactdetails
     * above — the two Google Fonts preconnects and the Google stylesheet
     * link are gone from <head>, self-hosting having moved every face into
     * ruled_page.css's own @font-face rules.
     *
     * Task 4 update (landing phase 3c; D1/D5): re-captured DELIBERATELY for
     * the template-shell rebuild, under ruling 3c-1's pre-authorisation for
     * exactly this golden. What it pins is unchanged in kind: with no
     * palette set there is still exactly ONE inline style block (--accent
     * alone — the renamed Accent emission), never a palette block.
     *
     * Task 5 update (landing phase 3c; D5): re-captured DELIBERATELY for
     * the hero rebuild (the brief flagged this golden as a likely mover:
     * its fixture contains the hero band, which now carries the em-wrapped
     * headline and the monogram device). What it pins is STILL unchanged
     * in kind: exactly one inline style block, no palette block, and — new
     * since wiring I — no --accent-text line either, because that pointer
     * is emitted only inside a palette block and the CSS :root default
     * covers the no-palette page. Capture is the renderer's own output
     * (temporary in-test dump, spliced escaped, dump reverted), never
     * hand-edited.
     *
     * F2 update (phase 3c final fix wave): re-captured DELIBERATELY — see
     * the identical note on test_the_contact_band_renders_byte_identical_
     * to_before_contactdetails above. What this golden exists to pin (no
     * palette block, porcelain stands) is unaffected: F1 also touches this
     * exact no-palette path and, by design, changes nothing about it — see
     * Accent's own docblock and layout.blade.php's palette-resolution
     * comment for why.
     */
    public function test_a_page_with_no_palette_renders_byte_identical_to_before_the_palette_system(): void
    {
        $this->published();

        $body = preg_replace(['/nonce="[^"]*"/', '/\?v=[0-9a-f]{10}/'], ['nonce="TESTNONCE"', '?v=ASSETHASH'], $this->body());

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

<link rel="stylesheet" href="http://sites.hexa-tech.uk/landing/ruled_page.css?v=ASSETHASH">

<style nonce="TESTNONCE">
  :root{
    --accent: #9b5c8f;
  }
</style>
</head>
<body class="rp">


<div class="rule-progress" aria-hidden="true"></div>


<div class="ambient-glow ambient-glow--left" aria-hidden="true"></div>
<div class="ambient-glow ambient-glow--right" aria-hidden="true"></div>

<nav class="nav">
  <div class="nav__inner">
    <a class="nav__wordmark" href="#">The Art of Wellness</a>
  </div>
</nav>


<main>

  <section data-section="hero" class="band rp-hero">
  <div class="wrap">
    <div class="rp-hero__grid">
    <div class="rp-hero__content">
              <h1>The Art of <em>Wellness</em></h1>
                </div>
      <figure class="rp-hero__device">
        <span class="rp-plate rp-plate--mono" aria-hidden="true">
  <span class="rp-plate__mark">TA</span>
  </span>
      </figure>
    </div>
  </div>
</section>
</main>

<footer class="rp-footer" data-section="footer">
  <div class="wrap">
    <div class="rp-footer__bar">
      <p class="rp-footer__legal">&copy; 2026 HotelLoyalty</p>
    </div>
  </div>
</footer>



<script src="http://sites.hexa-tech.uk/landing/ruled_page.js?v=ASSETHASH" defer></script>

</body>
</html>
';

        $this->assertSame($golden, $body);
    }

    /**
     * The one behaviour this task exists to add: choosing a curated palette
     * has to actually show up in the response, or the whole system is a
     * lie. A sampled token per family (a surface, a text shade and the
     * accent) proves the block carries the real §3 values rather than a
     * placeholder, without pinning all fifteen keys in a render test (that
     * job belongs to PaletteTest, which checks every palette's full set).
     */
    public function test_a_chosen_palette_emits_a_nonced_token_block_with_the_right_values(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['palette' => 'champagne_noir']]);

        $response = $this->get('http://' . config('landing.host') . '/glamour-salon');
        $response->assertOk();
        $body = $response->getContent();

        preg_match(
            "/'nonce-([A-Za-z0-9]+)'/",
            (string) $response->headers->get('Content-Security-Policy'),
            $m
        );
        $this->assertNotEmpty($m, 'The CSP names no style nonce.');

        $this->assertStringContainsString('--bg:#15100b', $body);
        $this->assertStringContainsString('--accent:#d8b878', $body);

        preg_match_all('/<style\b[^>]*>/i', $body, $tags);
        foreach ($tags[0] as $tag) {
            $this->assertStringContainsString('nonce="' . $m[1] . '"', $tag);
        }
    }

    /**
     * `theme` is a schemaless `array` cast with no schema behind it (see
     * the "Stored values the renderer must survive" tests above in this
     * file) — an unknown id, a hand-edited row, or a nested/oversized value
     * can all reach `Palette::for()`. Every one of these must be treated
     * the same as no palette at all: the page renders 200 with no second
     * style block, never a 500 from a ?string parameter handed an array.
     */
    public function test_hostile_palette_values_emit_no_block_and_render_200(): void
    {
        $page = $this->published();

        foreach ([
            'an unknown id'        => 'nope',
            'an array leaf'        => ['#ffffff'],
            'a 200k character leaf' => str_repeat('x', 200_000),
        ] as $label => $value) {
            $page->update(['theme' => ['palette' => $value]]);

            $response = $this->get('http://' . config('landing.host') . '/glamour-salon');

            $response->assertOk("[{$label}] took the page down.");
            $this->assertStringNotContainsString('--bg:', $response->getContent(),
                "[{$label}] emitted a palette block that should not exist.");
        }
    }

    // ─── The shell (Task 4, landing phase 3c): nav, tokens, motion hooks ───

    /**
     * A page with a business name and a reachable contact band gets the
     * glass-pill nav: wordmark (the same name chain the hero's h1 resolves)
     * and the primary CTA anchored at booking-else-contact — beauty has no
     * booking band (PageContent gates the widget to hotels), so #contact is
     * the honest target here.
     */
    public function test_the_nav_renders_with_the_wordmark_and_cta(): void
    {
        $this->published();
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringContainsString('<nav class="nav">', $body);
        $this->assertMatchesRegularExpression(
            '/class="nav__wordmark"[^>]*>Glamour Salon<\/a>/',
            $body,
            'The nav carries no wordmark with the business name.'
        );
        $this->assertStringContainsString(
            '<a class="rp-cta rp-cta--sm nav__cta" href="#contact">Book appointment</a>',
            $body,
            'The nav carries no CTA anchored at the contact band.'
        );
    }

    /**
     * The anchor row is the first FOUR rendered sections that can name
     * themselves — a section is anchorable when it resolves a non-empty
     * kicker label (copy override, else the industry vocabulary). With five
     * anchorable bands rendered (services/about/team/reviews/contact), the
     * nav lists exactly the first four, in section order, each pointing at
     * an id the section wrapper actually carries.
     */
    public function test_the_nav_anchors_are_the_first_four_anchorable_sections(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['body' => 'We opened Glamour Salon to slow the whole ritual down.'],
        ]]);
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65]);
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Quiet, careful, unhurried.',
            'anonymous_name' => 'Anna K.', 'is_featured' => true, 'submitted_at' => now(),
        ]);
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        // Exactly four links, in section order, and NOT the fifth
        // anchorable band (contact) — that one is still the CTA's target,
        // which is why the assertion pins the whole nav__links element
        // rather than merely "no #contact anywhere".
        $this->assertMatchesRegularExpression(
            '/<div class="nav__links">\s*'
            . '<a href="#services">[^<]+<\/a>\s*'
            . '<a href="#about">[^<]+<\/a>\s*'
            . '<a href="#team">[^<]+<\/a>\s*'
            . '<a href="#reviews">[^<]+<\/a>\s*'
            . '<\/div>/',
            $body,
            'The nav does not list exactly the first four anchorable sections in order.'
        );

        // And every anchor has a real target: the wrapper carries the key
        // as its id.
        foreach (['services', 'about', 'team', 'reviews'] as $key) {
            $this->assertStringContainsString(
                '<section id="' . $key . '" data-section="' . $key . '"',
                $body,
                "The {$key} wrapper carries no id for the nav anchor to land on."
            );
        }
    }

    /**
     * Toggling a section off must pull its anchor: the nav reads
     * $renderedSections, so a disabled band can never be linked to. With
     * about disabled the fifth anchorable band (contact) moves up into the
     * four.
     */
    public function test_a_disabled_section_drops_out_of_the_nav_anchors(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness'],
            'about' => ['body' => 'We opened Glamour Salon to slow the whole ritual down.'],
        ]]);
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65]);
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Quiet, careful, unhurried.',
            'anonymous_name' => 'Anna K.', 'is_featured' => true, 'submitted_at' => now(),
        ]);
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);
        $page->sections()->where('key', 'about')->update(['enabled' => false]);

        $body = $this->body();

        $this->assertMatchesRegularExpression(
            '/<div class="nav__links">\s*'
            . '<a href="#services">[^<]+<\/a>\s*'
            . '<a href="#team">[^<]+<\/a>\s*'
            . '<a href="#reviews">[^<]+<\/a>\s*'
            . '<a href="#contact">[^<]+<\/a>\s*'
            . '<\/div>/',
            $body
        );
        $this->assertStringNotContainsString('href="#about"', $body);
    }

    /**
     * Task 5 (ride-along from the Task 4 review): a stored
     * content.hero.kicker must never make hero "anchorable". The hero
     * wrapper deliberately carries no id — the wordmark already points at
     * the top — so before hero was rejected by key, a tenant filling that
     * field shipped a DEAD #hero link that also ate one of the four anchor
     * slots (contact, the fifth anchorable band here, was pushed out).
     */
    public function test_a_stored_hero_kicker_never_becomes_a_nav_anchor(): void
    {
        $page = $this->published();
        $page->update(['content' => [
            'hero'  => ['headline' => 'The Art of Wellness', 'kicker' => 'Wellness atelier'],
            'about' => ['body' => 'We opened Glamour Salon to slow the whole ritual down.'],
        ]]);
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65]);
        ServiceMaster::create(['organization_id' => 1, 'name' => 'Marta Nowak', 'is_active' => true]);
        ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5, 'comment' => 'Quiet, careful, unhurried.',
            'anonymous_name' => 'Anna K.', 'is_featured' => true, 'submitted_at' => now(),
        ]);
        Property::create([
            'organization_id' => 1, 'brand_id' => 1, 'name' => 'Glamour Salon',
            'phone' => '+371 20000000', 'is_active' => true,
        ]);

        $body = $this->body();

        $this->assertStringNotContainsString('href="#hero"', $body,
            'A stored hero kicker produced a dead #hero nav anchor.');
        $this->assertMatchesRegularExpression(
            '/<div class="nav__links">\s*'
            . '<a href="#services">[^<]+<\/a>\s*'
            . '<a href="#about">[^<]+<\/a>\s*'
            . '<a href="#team">[^<]+<\/a>\s*'
            . '<a href="#reviews">[^<]+<\/a>\s*'
            . '<\/div>/',
            $body,
            'The four anchor slots must go to the four real anchorable bands, hero kicker or not.'
        );
    }

    /**
     * The accent-TEXT mechanism (Task 5, ride-along from the Task 4
     * review): one token, --accent-text, replaces the six light-dark()
     * double-declarations Task 4 shipped. Three parts to pin — the
     * stylesheet's :root default points it at the deep shade (porcelain is
     * light) and no color:light-dark() remains anywhere; a dark palette's
     * inline block re-points it at var(--accent-bright); a light palette's
     * at var(--accent-deep). Emitted as a var() REFERENCE, never the
     * palette's literal hex, so a tenant brand colour whose Accent block
     * overrides --accent-deep/--accent-bright still flows through it.
     */
    public function test_accent_text_is_one_token_pointed_per_scheme(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertStringContainsString('--accent-text:var(--accent-deep)', $css,
            'The :root porcelain default no longer points --accent-text at the deep shade.');
        $this->assertStringNotContainsString('color:light-dark', $css,
            'A light-dark() double-declaration survives; the token was supposed to replace them all.');
        $this->assertStringContainsString('color:var(--accent-text)', $css,
            'Nothing in the stylesheet consumes --accent-text at all.');

        $page = $this->published();

        $page->update(['theme' => ['palette' => 'champagne_noir']]); // dark
        $this->assertStringContainsString('--accent-text:var(--accent-bright)', $this->body(),
            'A dark palette must point accent text at the bright shade.');

        $page->update(['theme' => ['palette' => 'terracotta']]); // light
        $this->assertStringContainsString('--accent-text:var(--accent-deep)', $this->body(),
            'A light palette must point accent text at the deep shade.');
    }

    /**
     * Task 5 (ride-along from the Task 4 review): body clips horizontal
     * overflow with CLIP, never HIDDEN. overflow:hidden makes body a
     * scroll container — the nearest scrollport for every position:sticky
     * descendant (the services preview plate), which then "sticks" to a
     * box that never scrolls, i.e. never sticks. clip clips the ambient
     * glows' bleed identically and creates no scroll container. Grep-level
     * because PHPUnit has no layout engine; reverting to hidden is the
     * exact mutation this pins.
     */
    public function test_body_clips_horizontal_overflow_without_becoming_a_scroll_container(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertSame(1, preg_match('/body\.rp\{[^}]*overflow-x:clip/', $css),
            'body.rp must clip horizontal overflow with overflow-x:clip.');
        $this->assertDoesNotMatchRegularExpression('/body\.rp\{[^}]*overflow-x:hidden/', $css,
            'body.rp is overflow-x:hidden again — a scroll container that breaks position:sticky.');
    }

    /**
     * A bare page — headline only, nothing else — still gets the nav (the
     * wordmark falls back to the headline the way <title> does), but with
     * no anchor row and no CTA: hero has no kicker so it is not anchorable,
     * and neither CTA target renders. An empty pill would be worse than a
     * quiet one.
     */
    public function test_a_bare_page_gets_a_wordmark_but_no_anchors_and_no_cta(): void
    {
        $this->published();

        $body = $this->body();

        $this->assertStringContainsString('<nav class="nav">', $body);
        $this->assertMatchesRegularExpression(
            '/class="nav__wordmark"[^>]*>The Art of Wellness<\/a>/',
            $body
        );
        $this->assertStringNotContainsString('nav__links', $body);
        $this->assertStringNotContainsString('nav__cta', $body);
    }

    /**
     * Grep-level pins for the motion layer — stated plainly: the JS
     * BEHAVIOUR (an IntersectionObserver adding classes, a scroll listener
     * condensing the nav) cannot be exercised in PHPUnit, which has no DOM
     * and no layout engine. What CAN be pinned is that every load-bearing
     * hook ships: the condensed-nav class exists in the stylesheet, the
     * reveal/is-visible pair exists, the reduced-motion block covers the
     * reveals, ruled_page.js is referenced with defer, and the script
     * carries the condense threshold and the reveal observer's threshold.
     * Removing the condense listener (this task's stated no-red mutation)
     * is caught here at the text level or not at all.
     */
    public function test_the_motion_hooks_are_pinned_in_the_static_files(): void
    {
        $this->published();
        $body = $this->body();

        // F2 (phase 3c final fix wave): the src now carries AssetVersion's
        // cache-bust query string (?v=...), so the match can no longer
        // assume ruled_page.js sits immediately before the closing quote.
        $this->assertMatchesRegularExpression(
            '/<script src="[^"]*landing\/ruled_page\.js(?:\?[^"]*)?" defer><\/script>/',
            $body,
            'ruled_page.js is not referenced with defer.'
        );

        $css = file_get_contents(public_path('landing/ruled_page.css'));
        $this->assertStringContainsString('.nav.is-condensed', $css,
            'The stylesheet defines no condensed nav state.');
        $this->assertStringContainsString('.reveal.is-visible', $css,
            'The stylesheet defines no reveal/is-visible pair.');
        $this->assertMatchesRegularExpression(
            '/@media \(prefers-reduced-motion:\s*reduce\)[^}]*\{[^}]*\.reveal/s',
            $css,
            'No reduced-motion block covers the reveals.'
        );

        $js = file_get_contents(public_path('landing/ruled_page.js'));
        $this->assertStringContainsString("'is-condensed', window.scrollY > 24", $js,
            'The nav condense listener (scrollY > 24) is gone from ruled_page.js.');
        $this->assertStringContainsString('threshold: 0.15', $js,
            'The reveal observer no longer uses the 0.15 threshold.');
        $this->assertStringContainsString("add('is-visible')", $js,
            'Nothing in ruled_page.js ever reveals a .reveal element.');
    }

    /**
     * F5 (phase 3c final fix wave): will-change must be scoped to the
     * PRE-visible state, not sit on the bare .reveal rule — a revealed
     * element that keeps a compositing hint for the rest of the page's life
     * holds a real compositing layer open for nothing, on every element the
     * scroll-reveal plan touches (which is most of the page — see the
     * revealPlan array in ruled_page.js). Grep-level because PHPUnit has no
     * layout engine to observe an actual layer promotion; the mutation this
     * pins is putting will-change back on the bare .reveal rule.
     */
    public function test_will_change_is_scoped_to_the_pre_visible_reveal_state(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $this->assertSame(1, preg_match('/\.reveal:not\(\.is-visible\)\{([^}]*)\}/', $css, $rule),
            'No .reveal:not(.is-visible) rule was found.');
        $this->assertStringContainsString('will-change:opacity,transform', $rule[1],
            'The pre-visible rule does not carry will-change.');

        $this->assertSame(1, preg_match('/\.reveal\{([^}]*)\}/', $css, $base),
            'No bare .reveal rule was found.');
        $this->assertStringNotContainsString('will-change', $base[1],
            'will-change sits on the bare .reveal rule again — it would then never clear.');
    }

    /**
     * The markup must stay reveal-free: the reveal class is added by
     * ruled_page.js on load, so a no-JS visitor (or a blocked script) gets
     * a page where everything is simply visible. A .reveal in the shipped
     * HTML would be an element that never appears without JS.
     *
     * Task 5 (ride-along from the Task 4 review): the needle is the CLASS
     * ATTRIBUTE shape, not the bare word — tenant copy is echoed into this
     * body, and a salon whose about text contains the word "reveal" must
     * not fail a test about a class the template never ships. class="reveal
     * catches both class="reveal" and class="reveal something"; a reveal
     * class appended mid-list (class="band reveal") cannot be shipped by
     * the template either way, since no partial interpolates class lists.
     */
    public function test_the_shipped_markup_carries_no_reveal_class(): void
    {
        $this->published();

        $this->assertStringNotContainsString('class="reveal', $this->body());
    }

    /**
     * Mutation-3's tripwire: the rebuilt stylesheet consumes ONLY the spec
     * §3 token names. A single surviving reference to the retired Appendix-B
     * families (--paper/--ink/--brand/--muted/--warm/--on-ink/--line-dark)
     * is a component that stops responding to palettes entirely — the
     * palette block writes tokens nothing reads, and the retired name
     * resolves to nothing at all now that :root no longer defines it.
     */
    public function test_the_stylesheet_consumes_no_retired_tokens(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        foreach ([
            'var(--paper', 'var(--ink', 'var(--on-ink', 'var(--muted',
            'var(--brand', 'var(--warm', 'var(--line-dark',
        ] as $retired) {
            $this->assertStringNotContainsString($retired, $css,
                "The stylesheet still consumes the retired token family {$retired}…).");
        }

        // And the :root actually holds the porcelain values under the NEW
        // names — the "no palette means porcelain" contract's other half.
        $this->assertStringContainsString('--bg:#F4F6F8', $css);
        $this->assertStringContainsString('--accent:#9B5C8F', $css);
        $this->assertStringContainsString('--text:#211C29', $css);
    }

    /**
     * Mutation-1's tripwire (Task 1 review pre-commitment): the palette
     * block precedes the Accent block in source order, so on the one
     * property both write — --accent — the tenant's derived brand colour
     * wins by cascade. Pinned by final value rather than by byte offset:
     * whatever the document looks like, the LAST --accent declared in it
     * must be Accent's, and the palette's own accent must still be present
     * ahead of it.
     *
     * F1 (phase 3c final fix wave) fixture note: this used to hand-pick
     * #1F5FA8 (a navy that survives Accent::for() against the light PAPER
     * default). F1 makes Accent measure the tenant colour against the
     * PALETTE'S OWN bg once one is chosen — champagne_noir's is #15100b,
     * not PAPER — and #1F5FA8 turns out to sit in exactly the kind of dead
     * band Accent::for() exists to catch on that specific dark bg (2.935:1
     * against it, under the 3:1 fill floor; the clamp that pushes it toward
     * white to clear the fill floor lands it at a point neither label
     * clears 4.5:1 on either). That is Accent discarding a colour correctly,
     * not a regression in this test — see AccentTest's own dark-surface
     * coverage for the general claim. #2E86DE is used here instead purely
     * because it is a brand colour this specific dark palette's bg accepts
     * UNCHANGED (verified directly against Accent::for()), which is what
     * this test needs to exercise the cascade-order claim above; it is not
     * itself a claim about which colours survive derivation.
     */
    public function test_the_accent_block_wins_the_accent_slot_over_the_palette(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['palette' => 'champagne_noir', 'brand_color' => '#2E86DE']]);

        $body = $this->body();

        preg_match_all('/--accent:\s*([^;]+);/', $body, $m);
        $values = array_map('trim', $m[1]);

        $this->assertNotEmpty($values, 'No --accent declaration reached the document at all.');
        $this->assertSame('#2e86de', strtolower(end($values)),
            'The LAST --accent in the document must be the tenant\'s derived colour — '
            . 'the Accent block has to come after the palette block, or the palette clobbers it.');
        $this->assertContains('#d8b878', $values,
            'The palette\'s own accent should still be declared (first), ahead of the override.');
    }

    /**
     * The other half of the same contract: with a palette chosen and NO
     * usable tenant colour, the palette's accent must stand — the layout
     * must NOT write the industry profile's house accent over it. (Today's
     * fixture is beauty, whose profile accent is the porcelain mauve; were
     * the emission unconditional, #9b5c8f would land after champagne
     * noir's gold and win.)
     */
    public function test_a_palette_with_no_tenant_colour_keeps_its_own_accent(): void
    {
        $page = $this->published();
        $page->update(['theme' => ['palette' => 'champagne_noir']]);

        $body = $this->body();

        preg_match_all('/--accent:\s*([^;]+);/', $body, $m);
        $values = array_map('trim', $m[1]);

        $this->assertSame(['#d8b878'], $values,
            'With no tenant brand colour, the palette\'s accent must be the only '
            . '--accent in the document — the profile\'s house accent must not clobber it.');
    }

    // ─── The sections restyle (Task 7, landing phase 3c; spec §4) ──────────

    /**
     * The services pillars: numbered rows (a computed 01/02/…, never stored
     * data) and the reference's hover underline sweep. The sweep is
     * grep-level — PHPUnit has no layout engine — and pins BOTH halves of
     * the mechanism: the resting scaleX(0) gradient pseudo and the :hover
     * rule that scales it in. Mutation target 1 (drop the sweep rule) goes
     * red here.
     */
    public function test_the_service_pillars_are_numbered_and_wear_the_hover_sweep(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65, 'duration_minutes' => 60]);
        Service::create(['organization_id' => 1, 'name' => 'Deep Tissue',
            'is_active' => true, 'price' => 80]);

        $body = $this->body();

        $this->assertStringContainsString('<span class="rp-pillar__num" aria-hidden="true">01</span>', $body);
        $this->assertStringContainsString('<span class="rp-pillar__num" aria-hidden="true">02</span>', $body);
        $this->assertStringContainsString('class="rp-pillar"', $body);

        $css = file_get_contents(public_path('landing/ruled_page.css'));
        $this->assertSame(1, preg_match('/\.rp-pillar::before\{[^}]*transform:scaleX\(0\)/', $css),
            'The pillar sweep pseudo (resting scaleX(0)) is gone from the stylesheet.');
        $this->assertSame(1, preg_match('/\.rp-pillar:hover::before\{[^}]*transform:scaleX\(1\)/', $css),
            'Nothing ever scales the pillar sweep in on hover.');
    }

    /**
     * The booking card's masked-gradient border — the champagne band's
     * signature object (spec §4, reference §booking). The card class must
     * reach a hotel page's markup, and the stylesheet's ::before must carry
     * the full mask mechanism: the padding-box/border-box gradient pair
     * composited with exclude (standard) and xor (-webkit-). Mutation
     * target 2 (remove the mask-composite) goes red here — without the
     * composite the pseudo is a solid gradient SLAB over the card, not a
     * 1px ring.
     */
    public function test_the_booking_card_wears_the_masked_gradient_border(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'grand-hotel',
            'template_key' => 'ruled_page', 'industry' => 'hotel', 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'The Grand Stay']],
        ]);
        foreach (['hero', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        $body = $this->bodyFor($page);

        $this->assertStringContainsString('<div class="rp-book__card">', $body);

        $css = file_get_contents(public_path('landing/ruled_page.css'));
        $this->assertSame(1, preg_match('/\.rp-book__card::before\{([^}]*)\}/', $css, $rule),
            'The booking card has no ::before pseudo for the gradient border.');
        $this->assertStringContainsString('mask-composite:exclude', $rule[1],
            'The standard mask-composite is gone — Firefox gets a gradient slab instead of a ring.');
        $this->assertStringContainsString('-webkit-mask-composite:xor', $rule[1],
            'The -webkit- mask-composite is gone — Chromium/WebKit get a gradient slab instead of a ring.');
        $this->assertStringContainsString('padding:1px', $rule[1],
            'The 1px padding IS the ring\'s thickness — without it the mask pair excludes everything.');
    }

    /**
     * The photo treatment follows the palette's dark flag (Task 7; ruling
     * 3c-4's deferred judgment). The layout stamps data-scheme="dark" on
     * <html> from Palette->dark — the same flag that already drives
     * --accent-text and color-scheme — and the stylesheet forks the photo
     * grade on it: the reference's brightness(.7)/black-vignette/dark
     * text-shadow are DARK-scheme values, restored only under the
     * attribute, while the base rules carry the light grade. Mutation
     * target 3 (flip the emission condition) goes red here: a dark palette
     * would lose the attribute and a light one would gain it.
     */
    public function test_the_photo_treatment_follows_the_palettes_dark_flag(): void
    {
        $page = $this->published();

        $page->update(['theme' => ['palette' => 'champagne_noir']]); // dark
        $this->assertMatchesRegularExpression('/<html[^>]* data-scheme="dark"/', $this->body(),
            'A dark palette must stamp data-scheme="dark" on <html>.');

        $page->update(['theme' => ['palette' => 'terracotta']]); // light
        $this->assertStringNotContainsString('data-scheme', $this->body(),
            'A light palette must not carry the dark-scheme attribute.');

        $page->update(['theme' => []]); // no palette: porcelain default, light
        $this->assertStringNotContainsString('data-scheme', $this->body(),
            'The no-palette default is light and must not carry the attribute.');

        $css = file_get_contents(public_path('landing/ruled_page.css'));
        $this->assertSame(1, preg_match(
            '/:root\[data-scheme="dark"\] \.rp-hero--photo \.rp-hero__plate-img\{[^}]*brightness\(0\.7\)/',
            $css
        ), 'The reference photo grade (brightness .7) must be scoped to the dark scheme.');
        $this->assertSame(1, preg_match(
            '/(?<!\] )\.rp-hero--photo \.rp-hero__plate-img\{[^}]*brightness\(0\.96\)/',
            $css
        ), 'The base (light) photo grade is gone.');
        $this->assertSame(1, preg_match(
            '/:root\[data-scheme="dark"\] \.rp-hero--photo h1\{[^}]*text-shadow/',
            $css
        ), 'The dark text-shadow fork is gone.');
        // The 4-stop veil's bottom anchor (ruling 3c-4's other half): the
        // un-guarded declaration must land the hero into the next band on an
        // opaque surface stop, engines without color-mix included.
        $this->assertSame(1, preg_match(
            '/\.rp-hero__veil\{[^}]*var\(--bg\) 100%/',
            $css
        ), 'The veil no longer anchors its bottom stop into the surface.');
    }

    /**
     * Spec §4's "cards on bg-elev" for the restyled sections, grep-level:
     * the team member card, the reviews aggregate card and the contact
     * hours ledger card each sit on the elevated surface. (The reviews
     * QUOTES deliberately stay un-boxed — the open typographic spotlight is
     * the band's signature; only the aggregate wears the card.)
     */
    public function test_the_restyled_section_cards_sit_on_the_elevated_surface(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        foreach (['.rp-member{', '.rp-reviews__aggregate{', '.rp-hours{'] as $opener) {
            $start = strpos($css, $opener);
            $this->assertNotFalse($start, "{$opener} rule not found.");
            $rule = substr($css, $start, strpos($css, '}', $start) - $start);
            $this->assertStringContainsString('var(--bg-elev)', $rule,
                "{$opener} no longer sits on the elevated surface.");
        }
    }

    /**
     * Task 7 fix round 1: the team grid's count="3" variant sets 3 columns
     * with an attribute selector, which out-specifies the plain
     * `.rp-team__grid` 2-column rule inside the ≤899px media block (equal
     * specificity, later-wins would still favour whichever rule the
     * cascade re-orders least, but the safe fix is a same-specificity
     * answer scoped to the same query). This stylesheet has several
     * `@media (max-width:899px){}` blocks — one per section — so the
     * extraction below brace-matches to find the ONE that actually
     * contains `.rp-team__grid`, rather than grabbing the first breakpoint
     * match anywhere in the file. Mutation (drop the count="3" mobile
     * answer) goes red here.
     */
    public function test_the_team_grid_answers_count_three_at_two_columns_below_900px(): void
    {
        $css = file_get_contents(public_path('landing/ruled_page.css'));

        $tag = '@media (max-width:899px){';
        $offset = 0;
        $block = null;
        while (($start = strpos($css, $tag, $offset)) !== false) {
            $cursor = $start + strlen($tag);
            $depth = 1;
            while ($depth > 0 && $cursor < strlen($css)) {
                if ($css[$cursor] === '{') {
                    $depth++;
                } elseif ($css[$cursor] === '}') {
                    $depth--;
                }
                $cursor++;
            }
            $candidate = substr($css, $start, $cursor - $start);
            if (str_contains($candidate, '.rp-team__grid')) {
                $block = $candidate;
                break;
            }
            $offset = $cursor;
        }

        $this->assertNotNull($block,
            'No @media (max-width:899px) block containing .rp-team__grid was found.');
        $this->assertSame(1, preg_match(
            '/\.rp-team__grid\[data-count="3"\]\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/',
            $block
        ), 'Below 900px, the count="3" team grid must be pinned back to 2 columns with matching '
            . 'specificity — otherwise the [data-count="3"] rule out-specifies the plain .rp-team__grid '
            . 'rule and the row stays stuck at 3-up.');
    }
}
