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
        $middleware->prepend(\App\Http\Middleware\Cors::class);
        $middleware->alias([
            'saas.auth'          => \App\Http\Middleware\SaasAuthMiddleware::class,
            'check.subscription' => \App\Http\Middleware\CheckSubscription::class,
            'tenant'             => \App\Http\Middleware\TenantMiddleware::class,
            'admin'              => \App\Http\Middleware\AdminMiddleware::class,
            'feature'            => \App\Http\Middleware\RequireFeature::class,
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
