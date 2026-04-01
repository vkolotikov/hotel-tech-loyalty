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

                $debug = config('app.debug');
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

                // Never expose stack traces in API responses — use logs instead.
                // In debug mode, include the error message and file location.
                $response = [
                    'error'   => $debug ? $e->getMessage() : 'Server error',
                    'message' => $debug ? $e->getMessage() : 'An unexpected error occurred.',
                ];

                if ($debug) {
                    $response['exception'] = class_basename($e);
                    $response['file'] = $e->getFile() . ':' . $e->getLine();
                }

                return response()->json($response, $status);
            }
        });
    })->create();
