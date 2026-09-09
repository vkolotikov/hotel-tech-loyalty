<?php

namespace App\Http\Middleware\Plugin;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PluginCors
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');
        $allowed = array_merge([rtrim(config('chatgpt.url'), '/'), 'https://chatgpt.com'], config('chatgpt.allowed_origins', []));
        if ($request->isMethod('OPTIONS')) {
            $response = ! config('chatgpt.enabled')
                ? response()->json(['error' => 'Not found.'], 404)
                : (! $origin || ! in_array($origin, $allowed, true)
                    ? response()->json(['error' => 'Origin is not allowed.'], 403)
                    : response('', 204));
        } else {
            $response = $next($request);
        }
        if (config('chatgpt.enabled') && $origin && in_array($origin, $allowed, true)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
            $response->headers->set('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id, Retry-After');
            $response->headers->set('Access-Control-Max-Age', '600');
        }
        $response->headers->set('Vary', 'Origin', false);
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
