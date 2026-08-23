<?php
namespace Tests\Feature\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\Service;
use App\Support\Accent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\URL;
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
}
