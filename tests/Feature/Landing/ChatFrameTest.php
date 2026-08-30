<?php
namespace Tests\Feature\Landing;

use App\Http\Middleware\LandingPageSecurity;
use App\Models\ChatWidgetConfig;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * /chat-frame/{widgetKey} — the chat widget's own origin.
 *
 * The landing template used to load the widget as a same-origin
 * <script src="/w/chat.js">, on the argument that a script cannot be iframed
 * the way booking, services, reviews and lead forms are. The argument was
 * sound and the result was not. A landing page answers with script-src 'self'
 * and style-src 'self' plus a per-request nonce; the widget injects an inline
 * <script> and writes every position it needs as an inline style ATTRIBUTE. A
 * style nonce rescues a <style> ELEMENT and nothing else, so what a real
 * tenant page rendered was the widget's raw DOM — an unstyled avatar, an SVG
 * and loose text, position:static, in the document flow below the footer.
 *
 * This page is where the widget went. It is on the admin origin, which sends
 * no script-src and no style-src, so the widget runs unchanged; the landing
 * page keeps a launcher of its own and frames this.
 *
 * What is asserted here is the boundary from this side: who may load the page
 * (the key, resolved the way the widget API resolves it), who may frame it,
 * and that it renders the panel rather than a second launcher.
 */
class ChatFrameTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    /** widget_key is a `uuid` column in production; the route mirrors that. */
    private const KEY = '3f6b0c1e-9d2a-4c77-8b1e-5a0d7c4e2f91';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function widget(array $attributes = []): ChatWidgetConfig
    {
        return ChatWidgetConfig::create($attributes + [
            'organization_id' => 1,
            'brand_id'        => 1,
            'widget_key'      => self::KEY,
            'is_active'       => true,
        ]);
    }

    private function adminHost(): string
    {
        return parse_url((string) config('app.url'), PHP_URL_HOST);
    }

    private function frame(string $key = self::KEY): TestResponse
    {
        return $this->get('http://' . $this->adminHost() . '/chat-frame/' . $key);
    }

    public function test_a_live_widget_key_renders_the_frame(): void
    {
        $this->widget();

        $response = $this->frame();

        $response->assertOk();
        $body = $response->getContent();

        // The key arrives by data attribute, which is what makes the widget
        // derive its API base as the root-relative /api/v1/widget/{key} —
        // same-origin with this page by construction rather than by
        // configuration, and one fewer copy of the origin to keep in step.
        $this->assertStringContainsString('data-widget-key="' . self::KEY . '"', $body);
        $this->assertStringContainsString('/w/chat.js', $body);
    }

    public function test_an_unknown_key_is_a_404_rather_than_an_empty_frame(): void
    {
        $this->frame('11111111-2222-3333-4444-555555555555')->assertNotFound();
    }

    public function test_a_switched_off_widget_is_a_404(): void
    {
        // Exactly the gate the widget API applies. is_active is what a tenant
        // switches, and a frame around a switched-off widget would be a panel
        // whose every request 404s.
        $this->widget(['is_active' => false]);

        $this->frame()->assertNotFound();
    }

    /**
     * widget_key is a Postgres `uuid` column, so comparing it against a
     * non-uuid string is not a miss — it is "invalid input syntax for type
     * uuid", i.e. a 500 on an unauthenticated route anyone can call with
     * anything. WidgetChatController::resolveWidget() guards it for that
     * reason and this route mirrors the guard rather than re-deciding it.
     *
     * @dataProvider keysThatAreNotWidgetKeys
     */
    public function test_a_non_uuid_key_is_a_404_rather_than_a_database_type_error(string $key): void
    {
        $this->widget();

        $this->frame($key)->assertNotFound();
    }

    public static function keysThatAreNotWidgetKeys(): array
    {
        return [
            'free text'          => ['not-a-uuid'],
            'an older fixture'   => ['wk-inline-check'],
            'a bare integer'     => ['1'],
            'far too long'       => [str_repeat('a', 200)],
        ];
    }

    /**
     * The platform serves X-Frame-Options: deny at the edge. Without the
     * override the landing page renders a blank box with nothing in its
     * console — which is exactly how the booking widget's own framing was
     * broken for a while (see routes/web.php on /booking-widget).
     */
    public function test_the_frame_may_be_framed(): void
    {
        $this->widget();

        $response = $this->frame();

        $this->assertSame('ALLOWALL', $response->headers->get('X-Frame-Options'));
        $this->assertStringContainsString(
            'frame-ancestors *',
            (string) $response->headers->get('Content-Security-Policy')
        );
    }

    /**
     * The page is framed CROSS-SITE, so a SameSite=lax session cookie could
     * never be set by the browser anyway — but the session row PHP allocates
     * to name it still gets written, once per chat open, and can never be read
     * back. Hence `withoutMiddleware('web')` on the route, which is the same
     * call /w/chat.js above it makes and for the same reason.
     */
    public function test_the_frame_sets_no_cookies(): void
    {
        $this->widget();

        $response = $this->frame();

        $names = array_map(
            fn ($cookie) => $cookie->getName(),
            $response->headers->getCookies()
        );

        $this->assertSame([], $names,
            'The chat frame is back in the `web` group: it now allocates a session per '
            . 'chat open that nothing can ever look up again.');
    }

    /**
     * One launcher, and it belongs to the framing page. Two would be the frame
     * leaking into the design; a panel that does not fill the frame would be a
     * chat window inside a chat window.
     */
    public function test_the_page_hides_the_widgets_own_launcher_and_fills_itself_with_the_panel(): void
    {
        $this->widget();

        $body = $this->frame()->getContent();

        $this->assertMatchesRegularExpression(
            '/#htchat-launcher\s*\{[^}]*display:\s*none\s*!important/',
            $body,
            "The widget's own launcher would appear inside the frame, beside the page's own."
        );
        $this->assertMatchesRegularExpression(
            '/#htchat-panel[^{]*\{[^}]*inset:\s*0\s*!important/',
            $body,
            'The panel does not fill the frame.'
        );
        $this->assertStringContainsString('.click()', $body,
            'Nothing opens the panel, so the frame paints an invisible widget.');
    }

    /**
     * The inline script is the POINT of this page rather than an oversight: it
     * is what the landing origin's policy makes impossible and what this
     * origin permits. So what is asserted is not "no inline script" — that
     * would be asserting the opposite of the design — but that this origin
     * really does leave one runnable.
     */
    public function test_this_origin_places_no_script_or_style_policy_on_the_page(): void
    {
        $this->widget();

        $response = $this->frame();

        $csp = (string) $response->headers->get('Content-Security-Policy');

        $this->assertStringContainsString('<script>', $response->getContent(),
            'The frame ships no inline script, so nothing opens the panel.');
        $this->assertStringNotContainsString('script-src', $csp,
            'This origin now restricts scripts, which is what the framed widget cannot '
            . 'survive: its own injected inline script would be blocked here too.');
        $this->assertStringNotContainsString('style-src', $csp,
            'This origin now restricts styles. The widget positions itself with inline '
            . 'style attributes, which no nonce reaches — the defect the frame exists to escape.');
    }

    /**
     * The other half of the boundary. LandingPageSecurity::widgetUrl() refuses
     * to build a URL for a path frame-src does not name, so this is the check
     * that the two agree: a page widgetUrl() would happily address but
     * frame-src does not permit renders as a blank box with a console error
     * and no other symptom.
     */
    public function test_the_frames_url_is_buildable_and_named_in_frame_src(): void
    {
        $origin = rtrim((string) config('app.url'), '/');
        $url    = LandingPageSecurity::widgetUrl('/chat-frame/' . self::KEY);

        $this->assertNotNull($url);
        $this->assertStringStartsWith($origin . '/chat-frame/', $url);
        $this->assertStringContainsString($origin . '/chat-frame/',
            LandingPageSecurity::policy('nonce'),
            'frame-src does not name the chat frame, so the browser would refuse it.');
    }

    /**
     * The prefix half of frame-src's matching rule is what makes the URL above
     * legal, and it must not become a hole. A source expression ending in `/`
     * matches by PREFIX, so `..` is the one thing that can start inside the
     * permitted prefix and address something else entirely once a browser
     * normalises it — /chat-frame/../login is /login, which is the admin
     * panel. Same for a smuggled query or fragment (the query belongs in
     * widgetUrl()'s own parameter) and for the protocol-relative //host shape.
     *
     * @dataProvider pathsFrameSrcMustRefuse
     */
    public function test_a_path_that_escapes_its_permitted_prefix_is_refused(string $path): void
    {
        $this->expectException(\InvalidArgumentException::class);

        LandingPageSecurity::widgetUrl($path);
    }

    public static function pathsFrameSrcMustRefuse(): array
    {
        return [
            'traversal out of the prefix' => ['/chat-frame/../login'],
            'protocol relative'           => ['//evil.example/chat-frame/x'],
            'double slash inside'         => ['/chat-frame//evil.example'],
            'smuggled query'              => ['/chat-frame/x?next=/login'],
            'smuggled fragment'           => ['/chat-frame/x#/login'],
            'not rooted'                  => ['chat-frame/x'],
            'a path frame-src never named' => ['/login'],
        ];
    }
}
