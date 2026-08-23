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
        $response->headers->set('Content-Security-Policy', static::policy($nonce));
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');

        return $response;
    }

    public static function policy(string $nonce): string
    {
        return implode('; ', [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "script-src 'self'",
            "style-src 'self' 'nonce-{$nonce}' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
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
            // admin panel itself: /login and /spa/index.html send no
            // X-Frame-Options and no frame-ancestors, so nothing else was
            // stopping an XSS on customer content from clickjacking a signed-in
            // admin. script-src and style-src still refuse this origin outright.
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
