<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * The landing host serves landing pages, and nothing else.
 *
 * Host separation is the security control behind this whole feature: the
 * admin SPA keeps a Sanctum token in localStorage that never expires and
 * carries every ability, and localStorage is per-origin. That only buys
 * anything if the rest of the application is genuinely absent from the
 * landing origin. It was not. /api answered there, so an admin who loaded the
 * SPA on the landing host could POST /api/v1/auth/login — same-origin, so
 * CORS was never consulted — and the bundle would write a full-privilege
 * token into localStorage on the *landing* origin. Refusing the login
 * endpoint on this host is what breaks that chain: with nothing to mint a
 * token, there is nothing for an XSS on customer content to steal.
 *
 * This is a global middleware rather than an edit to routes/api.php on
 * purpose: it is additive, it cannot mis-scope the 571 admin API routes, and
 * being global it runs before the `web` middleware group. That second part
 * matters. Anything the landing routes do not own used to fall through to the
 * SPA catch-all, which is inside `web`, so StartSession ran and set a session
 * cookie before the route closure could refuse — a public marketing origin
 * setting cookies before any consent. Refusing here happens first.
 *
 * The reachable surface of the landing origin is therefore exactly three
 * things: the landing routes, /w/chat.js, and /api/v1/widget/*.
 *
 * WIDGETS -- read this before widening the list. The other widgets (booking,
 * services, reviews, lead forms) are NOT same-origin here, by ruling. Their
 * host pages (/book/{token}, /form/{embedKey}, /review/{id}, /k/{deviceKey})
 * and their API prefixes (/api/v1/booking/*, /api/v1/services/*,
 * /api/v1/public/reviews/*, /api/v1/public/lead-forms/*) stay blocked on this
 * host. A landing page embeds them in an iframe pointing at the admin host,
 * which already works: those pages send X-Frame-Options: ALLOWALL and
 * frame-ancestors *, precisely so they can be framed. LandingPageSecurity's
 * CSP names those pages -- specific paths, not the bare origin -- in frame-src
 * for that reason and no other; default-src, script-src and style-src are not
 * widened. The isolation is a browser origin boundary, which is stronger than
 * a routing rule; inlining a booking widget and adding its API prefix here
 * would throw that away.
 *
 * CHAT: THE SAME-ORIGIN ALLOWANCE IS NO LONGER USED, AND STAYS ANYWAY. The
 * landing template did eventually ship a same-origin embed built from the
 * tenant's widget_key, and it did not work. A landing page answers with
 * script-src 'self' and style-src 'self' plus a per-request nonce; the widget
 * injects an inline <script> and writes every position it needs as an inline
 * style ATTRIBUTE, and a nonce reaches an injected <style> ELEMENT only. What
 * a real tenant page rendered was the widget's raw DOM -- an unstyled avatar,
 * an SVG and loose text, position:static, below the footer. So the chat moved
 * to /chat-frame/{widgetKey} on the admin host and joined the iframed
 * widgets, where the widget runs under no policy at all and needs no changes;
 * what stays on the landing page is a launcher of the template's own.
 *
 * /w/chat.js and /api/v1/widget/ stay on the list below because they are
 * still correct -- they are public, tenant-scoped by widget key, and carry no
 * user -- and because removing an allowance is a separate decision from
 * ceasing to use one. Nothing on the landing origin requests either any more.
 *
 * NOT covered, and not coverable here: public/spa/** is a tree of deployed
 * static files, and the front controller serves existing files before PHP is
 * reached (public/.htaccess RewriteCond !-f; nginx try_files). Those requests
 * never enter the kernel, so this class cannot refuse them and no web-server
 * rule is available either -- Laravel Cloud's edge has no per-path or
 * per-domain blocking.
 *
 * That was a live hole while the admin shell was one of those files:
 * https://<landing host>/spa/index.html answered 200 with the admin login
 * screen. It was closed by removing the file from the docroot rather than by
 * trying to block it -- the shell now lives at resources/spa-shell/index.html
 * and routes/web.php reads it from there, so the two `/` and `/{any}` routes
 * (which run this guard's addressesLandingHost() themselves) are the only way
 * it is ever served. What is left under public/spa/** is content-hashed JS,
 * CSS and icons, which are public by nature.
 *
 * READ THIS BEFORE PUTTING A NEW FILE IN public/. Anything there is reachable
 * on the landing host, by every client, and nothing in PHP can stop it.
 * public/app/** and public/staff/** are Expo web builds of the member and
 * staff apps and are in exactly that position today.
 */
class LandingHostGuard
{
    /**
     * Paths the landing origin may serve, matched against the trimmed path.
     *
     * Keep the first two in step with routes/landing.php. They are repeated
     * rather than derived because this runs before routing: there is no
     * matched route to ask, and asking the route collection here would match
     * every request twice.
     *
     * READ THIS BEFORE ADDING A PATH HERE. enforce() below strips every
     * cookie an allowed response tries to set, but that only hides the
     * cookie -- it does nothing about the session row PHP already inserted
     * while building it. A route that is reachable from this host and still
     * routed through the `web` middleware group therefore allocates a fresh
     * session on every single request, and because the cookie naming that
     * session never reaches the browser, it can never be looked up again --
     * every request leaks one throwaway row. /w/chat.js below is the example
     * of exactly this, not a pattern to copy: it still sits in the `web`
     * group today, cookie-stripping is standing in for the real fix, and
     * enforce()'s own docblock says so. Take a new route OUT of the `web`
     * group before widening this list, not after. This already bit once.
     */
    private const ALLOWED = [
        '#^[a-z0-9-]+$#',      // landing.show
        '#^preview/[0-9]+$#',  // landing.preview

        // The chat widget, and only the chat widget, stays same-origin. It is
        // a script that has to execute inside the landing page, so it cannot
        // be pushed behind an iframe, and its API surface is public and
        // tenant-scoped by widget key. /w/chat.js is the Laravel-served
        // loader; public/widget/hotel-chat.js is a static fallback the edge
        // rule will block, so the loader must work through PHP here.
        '#^w/chat\.js$#',
        '#^api/v1/widget/#',
    ];

    /**
     * Is this request addressed to the landing host?
     *
     * bootstrap/app.php trusts every proxy, and Laravel honours
     * X-Forwarded-Host by default, so $request->getHost() is a value the
     * client can set. Every available signal is consulted and any one of them
     * naming the landing host is enough: the guard fails closed. A forged
     * header therefore cannot move a request off this host, and a proxy that
     * legitimately rewrites Host cannot either.
     *
     * The cost is that someone can aim this at themselves from the admin host
     * by sending X-Forwarded-Host: <landing host> and collecting their own
     * 404s. That is not worth trading a bypass for.
     */
    public static function addressesLandingHost(Request $request): bool
    {
        $landing = self::normalise(config('landing.host'));

        if ($landing === '') {
            return false;
        }

        $candidates = [
            $request->getHost(),                   // honours X-Forwarded-Host, when trusted
            $request->server->get('HTTP_HOST'),    // the header the client sent
            $request->server->get('SERVER_NAME'),  // what the web server matched
        ];

        // Read the forwarded header directly too. This middleware is prepended,
        // so it runs *before* TrustProxies; getHost() therefore reflects the
        // forwarded value only once TrustProxies has set Symfony's static
        // trusted-proxy state, which on the first request of a worker it has
        // not. Where a load balancer legitimately rewrites Host, that would
        // leave the guard blind to its own host. It may be a list.
        foreach (explode(',', (string) $request->headers->get('X-Forwarded-Host', '')) as $forwarded) {
            $candidates[] = $forwarded;
        }

        foreach ($candidates as $candidate) {
            if (self::normalise($candidate) === $landing) {
                return true;
            }
        }

        return false;
    }

    public function handle(Request $request, Closure $next): Response
    {
        if (! self::addressesLandingHost($request)) {
            return $next($request);
        }

        $this->pinHost($request);

        if (! $this->isLandingPath($request)) {
            return $this->refuse($request);
        }

        return $this->enforce($request, $next($request));
    }

    /**
     * Nothing served from this origin sets a cookie, and everything served
     * from it carries the landing headers -- whatever route produced it.
     *
     * Allowing a path through is not the same as that path being safe to
     * serve as-is. /w/chat.js lives in routes/web.php and so runs the `web`
     * group: StartSession queued XSRF-TOKEN and a session cookie on it, which
     * is the same "cookies before consent on a public marketing origin"
     * problem the refusals were fixed for, arriving through the front door
     * instead. Enforcing the property on the way out covers every current and
     * future allowance rather than one route at a time.
     *
     * Hardening is skipped only when LandingPageSecurity already ran, which
     * is recorded by the nonce it puts on the request. That is provenance,
     * not presence: keying it on "does the response already carry a CSP"
     * looked equivalent and was a trap for exactly the additions this class's
     * docblock invites. Every widget page answers with
     * `Content-Security-Policy: frame-ancestors *`, so an allowed one would
     * have kept that as its entire policy -- no default-src, no script-src --
     * and skipped nosniff, Referrer-Policy and X-Frame-Options with it.
     *
     * A landing page's own policy is left alone for the opposite reason: it
     * quotes a nonce the template's inline styles use, and re-hardening would
     * issue a new one the markup no longer names.
     */
    private function enforce(Request $request, Response $response): Response
    {
        $stripped = [];

        foreach ($response->headers->getCookies() as $cookie) {
            $stripped[] = $cookie->getName();
            $response->headers->removeCookie($cookie->getName(), $cookie->getPath(), $cookie->getDomain());
        }

        if ($stripped !== []) {
            // Say so, loudly. .env sets LOG_LEVEL=error, so anything below
            // that level never fires in production; this line only appears
            // when an invariant this class exists to enforce is being
            // violated, which belongs at error, not warning. A route that
            // needs a cookie to work does not silently half-work here -- it
            // fails in ways that are miserable to diagnose from the outside,
            // a form endpoint looping on 419 being the obvious one. If this
            // line ever appears, the route wants taking off this host, not
            // the cookie stripping.
            Log::error('Stripped cookies from a landing-host response', [
                'path'    => $request->getPathInfo(),
                'cookies' => $stripped,
            ]);
        }

        if ($request->attributes->get('csp_nonce') === null) {
            LandingPageSecurity::harden($response, Str::random(24));
        }

        return $response;
    }

    /**
     * Make everything downstream agree with the decision above.
     *
     * Route::domain() matches on $request->getHost(), so without this a
     * forged X-Forwarded-Host would leave the guard treating the request as
     * landing traffic while the router treated it as admin traffic and handed
     * back the SPA shell. Only a request that named the landing host in its
     * own Host header is pinned; where a proxy legitimately rewrites Host,
     * HTTP_HOST is not the landing host and the forwarded value still governs.
     */
    private function pinHost(Request $request): void
    {
        if (self::normalise($request->server->get('HTTP_HOST')) !== self::normalise(config('landing.host'))) {
            return;
        }

        $request->headers->remove('X-Forwarded-Host');
        $request->server->remove('HTTP_X_FORWARDED_HOST');
    }

    /**
     * Derived from getPathInfo(), not path().
     *
     * Request::path() collapses leading slashes; Laravel's UriValidator
     * matches on rtrim(getPathInfo(), '/'), which does not. `//login`
     * therefore looked like the slug `login` to this guard and like nothing
     * at all to the router -- it missed landing.show, fell through to the SPA
     * catch-all inside the `web` group, and StartSession queued a session
     * cookie before the closure's abort_if could refuse. Same class of bug as
     * the host signal: the guard and the router were being asked slightly
     * different questions.
     *
     * An empty path segment is refused outright rather than normalised away.
     * No route reachable from this host has one, so there is nothing to lose,
     * and it means a future allow pattern cannot accidentally re-admit one.
     * A trailing slash is not non-canonical in the same way -- the router
     * rtrims it, so /glamour-salon/ is the page, and refusing it would break
     * a URL people legitimately paste.
     */
    private function isLandingPath(Request $request): bool
    {
        $raw = $request->getPathInfo();

        if (str_contains($raw, '//')) {
            return false;
        }

        $path = trim($raw, '/');

        foreach (self::ALLOWED as $pattern) {
            // preg_match returns false, not 0, on malformed input: this
            // middleware is prepended and so runs before ValidatePathEncoding.
            if (preg_match($pattern, $path) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * 404, not 403: the landing origin should not admit that the rest of the
     * application exists. Rendered through the exception handler so the body
     * matches every other 404, then given the same headers a landing page
     * carries — an error page on this host is still a page on this host.
     */
    private function refuse(Request $request): Response
    {
        $response = app(ExceptionHandler::class)->render($request, new NotFoundHttpException());

        return LandingPageSecurity::harden($response, Str::random(24));
    }

    private static function normalise(mixed $host): string
    {
        $host = Str::lower(trim((string) $host));

        // Strip a port, but leave a bracketed IPv6 literal alone.
        return Str::startsWith($host, '[') ? $host : Str::before($host, ':');
    }
}
