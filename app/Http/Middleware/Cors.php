<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class Cors
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('OPTIONS')) {
            return response('', 204, $this->headers($request));
        }

        $response = $next($request);

        foreach ($this->headers($request) as $key => $value) {
            $response->headers->set($key, $value);
        }

        return $response;
    }

    private function headers(Request $request): array
    {
        $configured = config('services.cors.allowed_origins', '');
        $origin = $request->header('Origin', '');

        // Widget and public endpoints must be accessible from any origin
        // (embedded on customer websites)
        $isPublicRoute = $request->is('api/v1/widget/*', 'api/v1/theme', 'api/v1/booking/*');

        if ($isPublicRoute) {
            $allowed = $origin ?: '*';
        } elseif ($configured && $configured !== '*') {
            // Explicit allowlist — only reflect matching origins
            $origins = array_map('trim', explode(',', $configured));
            $allowed = in_array($origin, $origins) ? $origin : 'null';
        } elseif (app()->environment('local', 'testing')) {
            // Dev: allow any origin for convenience
            $allowed = $origin ?: '*';
        } else {
            // Production without explicit config: use allowlist or allow all API
            $allowed = $origin ?: '*';
        }

        return [
            'Access-Control-Allow-Origin'  => $allowed,
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With, X-Org-Token, Idempotency-Key, X-Request-Id',
            'Access-Control-Max-Age'       => '86400',
        ];
    }
}
