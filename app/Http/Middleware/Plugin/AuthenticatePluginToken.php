<?php

namespace App\Http\Middleware\Plugin;

use App\OAuth\PluginIdentity;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Passport\AccessToken;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Token\Parser;
use Symfony\Component\HttpFoundation\Response;

class AuthenticatePluginToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $bearer = $request->bearerToken();
        if (! $bearer) {
            return $this->unauthorized();
        }
        // Passport verifies signature, expiry, revocation and client before any
        // claim is trusted here. Cookie and Sanctum authentication cannot pass.
        $user = Auth::guard('plugin')->user();
        $access = $user?->currentAccessToken();
        if (! $access instanceof AccessToken || $access->oauth_client_id !== config('chatgpt.client_id')
            || ! PluginIdentity::active($user)) {
            return $this->unauthorized();
        }
        $claims = (new Parser(new JoseEncoder))->parse($bearer)->claims();
        $issuer = rtrim(config('chatgpt.url'), '/');
        if (! in_array($issuer.'/mcp', $claims->get('aud', []), true)
            || $claims->get('iss') !== $issuer
            || ! $claims->get('organization_id')
            || (int) $claims->get('organization_id') !== (int) $user->organization_id
            || (int) $access->plugin_organization_id !== (int) $user->organization_id) {
            return $this->unauthorized();
        }
        if (! $user->tokenCan('mcp:use')) {
            return response()->json(['error' => 'insufficient_scope'], 403,
                ['WWW-Authenticate' => 'Bearer error="insufficient_scope", scope="mcp:use"']);
        }
        $request->setUserResolver(fn () => $user);
        Auth::shouldUse('plugin');

        return $next($request);
    }

    private function unauthorized(): Response
    {
        $metadata = rtrim(config('chatgpt.url'), '/').'/.well-known/oauth-protected-resource/mcp';

        return response()->json(['error' => 'invalid_token'], 401,
            ['WWW-Authenticate' => 'Bearer resource_metadata="'.$metadata.'"']);
    }
}
