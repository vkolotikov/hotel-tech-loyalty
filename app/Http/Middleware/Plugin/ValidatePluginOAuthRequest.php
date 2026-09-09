<?php

namespace App\Http\Middleware\Plugin;

use Closure;
use Illuminate\Http\Request;
use Laravel\Passport\Passport;
use Symfony\Component\HttpFoundation\Response;

class ValidatePluginOAuthRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $clientId = $request->input('client_id');
        if (! is_string($clientId) || $clientId === '' || $clientId !== config('chatgpt.client_id')) {
            return $this->invalid('invalid_client', 'The plugin client is not configured.');
        }
        $client = Passport::client()->newQuery()->find($clientId);
        if (! $client || $client->revoked || $client->confidential() || ! $client->hasGrantType('authorization_code')) {
            return $this->invalid('invalid_client', 'An active public authorization-code client is required.');
        }
        if ($request->input('resource') !== rtrim(config('chatgpt.url'), '/').'/mcp') {
            return $this->invalid('invalid_target', 'The resource must be the Hexa-Tech MCP endpoint.');
        }
        if ($request->isMethod('GET')) {
            $callback = $request->input('redirect_uri');
            if (! is_string($callback) || ! in_array($callback, config('chatgpt.redirect_uris', []), true)
                || ! in_array($callback, $client->redirect_uris, true)) {
                // Never redirect an error to an unvalidated callback.
                return $this->invalid('invalid_request', 'The callback URL is not allowed.');
            }
            if ($request->input('response_type') !== 'code'
                || $request->input('code_challenge_method') !== 'S256'
                || ! is_string($request->input('code_challenge'))
                || ! preg_match('/\A[A-Za-z0-9_-]{43}\z/', $request->input('code_challenge'))) {
                return $this->invalid('invalid_request', 'Authorization code flow with PKCE S256 is required.');
            }
            if ($request->input('scope') !== 'mcp:use') {
                return $this->invalid('invalid_scope', 'Request only the mcp:use scope.');
            }
            // Show consent for every connection, including a previously approved client.
            $request->query->set('prompt', 'consent');
        } elseif (! in_array($request->input('grant_type'), ['authorization_code', 'refresh_token'], true)) {
            return $this->invalid('unsupported_grant_type', 'Only authorization codes and refresh tokens are supported.');
        }

        return $next($request);
    }

    private function invalid(string $error, string $description): Response
    {
        return response()->json(['error' => $error, 'error_description' => $description], 400);
    }
}
