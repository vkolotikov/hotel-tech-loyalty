<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Security headers for pages built from customer-supplied content.
 *
 * The application has no security-header middleware anywhere, and the only
 * CSP in the repo is `frame-ancestors *` on the widget routes, which exists
 * to defeat the platform's edge X-Frame-Options and restricts nothing about
 * script execution. A landing page is a destination rather than an embed, so
 * it refuses framing outright.
 *
 * Styles need a nonce because each template writes a small block of
 * tenant-derived custom properties. Scripts are same-origin only; templates
 * ship no inline script.
 */
class LandingPageSecurity
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Str::random(24);
        $request->attributes->set('csp_nonce', $nonce);
        view()->share('cspNonce', $nonce);

        return static::harden($next($request), $nonce);
    }

    /**
     * Shared so LandingHostGuard can put the same headers on responses it
     * produces or passes through. An error page on this host is still a page
     * on this host.
     *
     * All four headers are set unconditionally, including over a policy the
     * response arrived with. The widget pages answer with
     * `Content-Security-Policy: frame-ancestors *`, which is not a policy so
     * much as an opt-out of the platform's edge X-Frame-Options; keeping it
     * would leave a landing-origin response with no default-src and no
     * script-src at all. Whether the *caller* should harden at all is the
     * caller's decision -- see LandingHostGuard::enforce().
     */
    public static function harden(Response $response, string $nonce): Response
    {
        // A response may ask to be framable by the admin origin -- only the
        // preview route does, and it sets this attribute on the request.
        // Anything else falls through to policy()'s own 'none' default --
        // no second default is hard-coded here, so that default is the one
        // and only place a published page's frame-ancestors is decided.
        // Read from the REQUEST, not from a response header a controller
        // could be tricked into echoing.
        $frameAncestors = request()->attributes->get('landing.frame_ancestors');

        $csp = $frameAncestors === null
            ? static::policy($nonce)
            : static::policy($nonce, $frameAncestors);

        $response->headers->set('Content-Security-Policy', $csp);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');

        return $response;
    }

    /**
     * @param string $frameAncestors The frame-ancestors value. Defaults to
     *        'none': a tenant's live page has no reason to be framable, and
     *        leaving it open is a clickjacking surface on a page carrying their
     *        booking and contact actions. The editor's preview pane is the one
     *        exception and passes the admin origin explicitly -- see
     *        LandingPageController::preview().
     */
    public static function policy(string $nonce, string $frameAncestors = "'none'"): string
    {
        return implode('; ', [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors {$frameAncestors}",
            "object-src 'none'",
            "script-src 'self'",
            // Task 3 (landing phase 3c; D3): both Google Fonts hosts are
            // gone. Every face the landing template uses is self-hosted
            // woff2 under public/landing/fonts/, declared by @font-face
            // rules in ruled_page.css itself -- style-src needs the nonce
            // for the tenant-derived token blocks and nothing external any
            // more, and font-src needs no external host at all.
            "style-src 'self' 'nonce-{$nonce}'",
            "font-src 'self'",
            "img-src 'self' data: https:",
            "connect-src 'self'",
            // The booking, services, review and lead-form widgets are iframed
            // from the admin host rather than inlined, so that an XSS on
            // customer content cannot reach them: a browser origin boundary,
            // not a routing rule. default-src 'self' would block those frames,
            // so frame-src -- and only frame-src -- opens them up.
            //
            // Paths, not the bare origin. CSP source expressions take a path,
            // and naming the whole admin origin would also permit framing the
            // admin panel itself: /login (and every other route the SPA shell
            // answers) sends no X-Frame-Options and no frame-ancestors, so
            // nothing else was stopping an XSS on customer content from
            // clickjacking a signed-in admin. script-src and style-src still
            // refuse this origin outright.
            'frame-src ' . static::widgetFrameSources(),
        ]);
    }

    /**
     * The widget host pages, as CSP source expressions.
     *
     * A source expression ending in `/` matches by prefix and one that does
     * not matches exactly; the query string is ignored either way, so
     * /booking-widget?brand=... is covered. Each entry is a route in
     * routes/web.php -- keep them in step, and keep them narrow: this list is
     * the only part of the admin origin a landing page may frame.
     */
    private const WIDGET_FRAME_PATHS = [
        '/booking-widget',   // booking-widget
        '/services-widget',  // services-widget
        '/book/',            // book/{token}
        '/review/',          // review/{id}
        '/k/',               // k/{deviceKey}
        '/form/',            // form/{embedKey}
    ];

    /**
     * The absolute URL of one widget page, for a template to put in a src.
     *
     * A landing template must never spell an admin host of its own. There is
     * one origin, it comes from app.url, and the CSP's frame-src is built from
     * the same two values this method is -- so an iframe built here is
     * permitted by construction rather than by two files being kept in step.
     * $path is checked against the frame-src list for the same reason: a page
     * this method would happily address but frame-src does not name renders as
     * a blank box with a console error and no other symptom.
     *
     * Null, not a guess, when app.url has no host: frame-src is 'none' in that
     * case, so there is nothing an iframe could usefully point at, and a
     * caller that has to handle null is a caller that has to render its
     * no-widget fallback instead of an empty frame.
     */
    public static function widgetUrl(string $path, array $query = []): ?string
    {
        if (! in_array($path, self::WIDGET_FRAME_PATHS, true)) {
            throw new \InvalidArgumentException(
                "[{$path}] is not named in frame-src; framing it would be blocked."
            );
        }

        $origin = static::adminOrigin();

        if ($origin === null) {
            return null;
        }

        $query = array_filter($query, static fn ($value) => filled($value));

        return $origin . $path . ($query === [] ? '' : '?' . http_build_query($query));
    }

    private static function widgetFrameSources(): string
    {
        $origin = static::adminOrigin();

        if ($origin === null) {
            return "'none'";
        }

        return implode(' ', array_map(
            fn (string $path): string => $origin . $path,
            self::WIDGET_FRAME_PATHS,
        ));
    }

    /**
     * The origin the iframed widgets are served from, derived from app.url so
     * there is one source of truth and no second value to forget in
     * production. Null rather than something permissive if app.url is
     * unparseable.
     */
    private static function adminOrigin(): ?string
    {
        $parts = parse_url((string) config('app.url'));

        if (empty($parts['host'])) {
            return null;
        }

        $origin = ($parts['scheme'] ?? 'https') . '://' . $parts['host'];

        return isset($parts['port']) ? $origin . ':' . $parts['port'] : $origin;
    }
}
