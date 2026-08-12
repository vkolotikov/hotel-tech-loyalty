<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Production sits behind Laravel Cloud's load balancer. Without
        // trusting the proxy, $request->ip() is the BALANCER's address for
        // every visitor — so all per-IP rate limits (throttle:60,1 on /auth,
        // 8/min on login, 5/min on forgot-password) become ONE bucket shared
        // by the whole site. Eight failed login attempts by anyone, anywhere,
        // inside a minute locked out every user on the platform. This is the
        // "too many attempts" that appeared intermittently in production and
        // never reproduced locally, where there is no proxy.
        // The widget visitor fingerprint (hash of org|ip|ua) also degrades
        // to UA-only without this.
        $middleware->trustProxies(at: '*');

        $middleware->prepend(\App\Http\Middleware\Cors::class);
        $middleware->alias([
            'saas.auth'          => \App\Http\Middleware\SaasAuthMiddleware::class,
            'check.subscription' => \App\Http\Middleware\CheckSubscription::class,
            'tenant'             => \App\Http\Middleware\TenantMiddleware::class,
            'brand'              => \App\Http\Middleware\BrandMiddleware::class,
            'admin'              => \App\Http\Middleware\AdminMiddleware::class,
            'feature'            => \App\Http\Middleware\RequireFeature::class,
        ]);

        // RFC 8058 one-click unsubscribe. Gmail and Yahoo POST to this URL
        // straight from their own "Unsubscribe" button — there is no
        // browser session and no way for them to carry a CSRF token, so
        // requiring one would silently break the very feature those
        // providers require of bulk senders. The 48-character token in the
        // path is the credential.
        $middleware->validateCsrfTokens(except: [
            'unsubscribe/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                // Sanctum's redirect-to-login → return 401 JSON
                if ($e instanceof \Symfony\Component\Routing\Exception\RouteNotFoundException
                    || $e instanceof \Illuminate\Auth\AuthenticationException) {
                    return response()->json(['error' => 'Unauthenticated', 'message' => 'Authentication required.'], 401);
                }

                // Render Laravel's special exceptions with their proper status codes
                // and payloads instead of mashing them all into a generic 500.
                if ($e instanceof \Illuminate\Validation\ValidationException) {
                    return response()->json([
                        'error'   => 'Validation failed',
                        'message' => $e->getMessage(),
                        'errors'  => $e->errors(),
                    ], $e->status);
                }
                if ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException
                    || ($e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException
                        && $e->getPrevious() instanceof \Illuminate\Database\Eloquent\ModelNotFoundException)) {
                    return response()->json(['error' => 'Not found', 'message' => 'This item no longer exists.'], 404);
                }
                if ($e instanceof \Illuminate\Auth\Access\AuthorizationException) {
                    return response()->json(['error' => 'Forbidden', 'message' => $e->getMessage() ?: 'Forbidden.'], 403);
                }
                // Feature gate (service-level). Shape mirrors what RequireFeature
                // middleware returns at the route level so the SPA's
                // feature-locked / upgrade UX is identical regardless of which
                // layer caught the call.
                if ($e instanceof \App\Exceptions\FeatureNotEntitled) {
                    return response()->json([
                        'error'       => $e->getMessage(),
                        'code'        => 'feature_locked',
                        'feature'     => $e->feature,
                        'plan'        => $e->planSlug,
                        'upgrade_url' => 'https://saas.hotel-tech.ai/admin/subscription',
                    ], 402);
                }
                // Rate limits: keep the Retry-After information instead of a
                // bare "Too Many Attempts." — the person mid-signup needs to
                // know it is a wait, not a failure, and for how long.
                if ($e instanceof \Illuminate\Http\Exceptions\ThrottleRequestsException) {
                    $retryAfter = (int) ($e->getHeaders()['Retry-After'] ?? 60);
                    $wait = $retryAfter >= 120
                        ? ceil($retryAfter / 60) . ' minutes'
                        : $retryAfter . ' seconds';
                    return response()->json([
                        'error'       => "Too many requests — please wait {$wait} and try again.",
                        'message'     => "Too many requests — please wait {$wait} and try again.",
                        'retry_after' => $retryAfter,
                    ], 429, ['Retry-After' => $retryAfter]);
                }
                if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                    // Use the actual exception message as `error` so clients
                    // (e.g. the chat widget) which only display `d.error` see
                    // a meaningful reason instead of a generic "HTTP error"
                    // label that hides the real cause (rate limits, etc.).
                    $msg = $e->getMessage() ?: 'Request failed.';
                    return response()->json([
                        'error'   => $msg,
                        'message' => $msg,
                    ], $e->getStatusCode());
                }

                $debug = config('app.debug');
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

                // Always log 500s with full context so we can debug prod issues.
                if ($status >= 500) {
                    \Log::error('Unhandled API exception', [
                        'url'        => $request->fullUrl(),
                        'method'     => $request->method(),
                        'user_id'    => optional($request->user())->id,
                        'org_id'     => optional($request->user())->organization_id,
                        'exception'  => class_basename($e),
                        'message'    => $e->getMessage(),
                        'file'       => $e->getFile() . ':' . $e->getLine(),
                        'trace'      => collect($e->getTrace())->take(10)->map(fn ($t) => ($t['file'] ?? '?') . ':' . ($t['line'] ?? '?') . ' ' . ($t['function'] ?? '?'))->all(),
                    ]);
                }

                // Authenticated staff users see the real error message even in
                // production — they're trusted operators, and a generic
                // "An unexpected error occurred" makes prod issues impossible
                // to triage from the browser. Anonymous callers still get the
                // sanitized message.
                $isStaff = $request->user() && ($request->user()->user_type ?? null) === 'staff';
                $exposeMessage = $debug || $isStaff;

                $response = [
                    'error'   => $exposeMessage ? class_basename($e) : 'Server error',
                    'message' => $exposeMessage ? $e->getMessage() : 'An unexpected error occurred.',
                ];

                if ($exposeMessage) {
                    $response['file'] = $e->getFile() . ':' . $e->getLine();
                }

                return response()->json($response, $status);
            }
        });
    })->create();
