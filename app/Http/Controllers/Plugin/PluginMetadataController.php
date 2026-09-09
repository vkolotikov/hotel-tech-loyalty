<?php

namespace App\Http\Controllers\Plugin;

class PluginMetadataController
{
    public function resource()
    {
        $issuer = rtrim(config('chatgpt.url'), '/');

        return response()->json([
            'resource' => $issuer.'/mcp',
            'authorization_servers' => [$issuer],
            'scopes_supported' => ['mcp:use'],
            'bearer_methods_supported' => ['header'],
            'resource_name' => 'Hexa-Tech customers and bookings',
        ]);
    }

    public function authorizationServer()
    {
        $issuer = rtrim(config('chatgpt.url'), '/');

        return response()->json([
            'issuer' => $issuer,
            'authorization_endpoint' => $issuer.'/oauth/authorize',
            'token_endpoint' => $issuer.'/oauth/token',
            'response_types_supported' => ['code'],
            'grant_types_supported' => ['authorization_code', 'refresh_token'],
            'code_challenge_methods_supported' => ['S256'],
            'scopes_supported' => ['mcp:use'],
            'token_endpoint_auth_methods_supported' => ['none'],
        ]);
    }
}
