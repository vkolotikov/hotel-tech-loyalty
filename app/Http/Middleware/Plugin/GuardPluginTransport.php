<?php

namespace App\Http\Middleware\Plugin;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class GuardPluginTransport
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = rtrim((string) config('chatgpt.url'), '/');

        // A single canonical origin prevents discovery and consent redirects
        // being built from an arbitrary Host header or another tenant's domain.
        if (! config('chatgpt.enabled') || $request->getSchemeAndHttpHost() !== $origin) {
            return $this->privateResponse(response()->json(['error' => 'Not found.'], 404));
        }

        if (app()->environment('production') && ! str_starts_with($origin, 'https://')) {
            return $this->privateResponse(response()->json(['error' => 'HTTPS is required.'], 503));
        }

        $allowed = array_merge([$origin, 'https://chatgpt.com'], config('chatgpt.allowed_origins', []));
        if ($request->headers->has('Origin') && ! in_array($request->header('Origin'), $allowed, true)) {
            return $this->privateResponse(response()->json(['error' => 'Origin is not allowed.'], 403));
        }

        // Every MCP server mounted under /mcp, including /mcp/voice, gets the
        // same limits. A literal 'mcp' match would leave a second server's
        // endpoint accepting unbounded, untyped bodies.
        if ($request->is('mcp', 'mcp/*') && $request->isMethod('POST')) {
            // ChatGPT first sends a bodyless probe without Content-Type.
            // Let unauthenticated probes reach the OAuth 401 challenge; actual
            // bearer-authenticated tool requests must still use JSON.
            if ($request->bearerToken() && ! $request->isJson()) {
                return $this->privateResponse(response()->json(['error' => 'Use application/json.'], 415));
            }
            // Bound parser work independently of the reverse proxy's limits.
            if (strlen($request->getContent()) > 65536) {
                return $this->privateResponse(response()->json(['error' => 'Request is too large.'], 413));
            }
        }

        $response = $this->privateResponse($next($request));
        if ($request->isMethod('GET') && $request->is('oauth/authorize')
            && $response->getStatusCode() === 200
            && str_starts_with((string) $response->headers->get('Content-Type'), 'text/html')) {
            // no-referrer makes HTML form navigation send Origin:null, which
            // our origin gate correctly rejects. Preserve the same-origin
            // form's origin while keeping cross-origin referrers suppressed.
            $response->headers->set('Referrer-Policy', 'same-origin');
        }

        return $response;
    }

    private function privateResponse(Response $response): Response
    {
        $response->headers->set('Cache-Control', 'no-store, private');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'no-referrer');

        return $response;
    }
}
