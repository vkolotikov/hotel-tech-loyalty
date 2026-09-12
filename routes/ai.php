<?php

use App\Http\Middleware\Plugin\AuthenticatePluginToken;
use App\Http\Middleware\Plugin\GuardPluginTransport;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Mcp\Servers\HexaTechServer;
use App\Mcp\Servers\HexaTechVoiceServer;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Facades\Mcp;
use Laravel\Mcp\Server\Middleware\AddWwwAuthenticateHeader;

// Laravel MCP loads this before the SPA catch-all. Keep registration
// unconditional so the runtime feature switch also works with route caching.
require __DIR__.'/plugin-auth.php';

Route::middleware([GuardPluginTransport::class, 'throttle:6000,1,chatgpt-mcp-network'])->group(function (): void {
    Mcp::web('/mcp', HexaTechServer::class)
        // Custom OAuth discovery/auth supplies the exact resource challenge.
        ->withoutMiddleware(AddWwwAuthenticateHeader::class)
        ->middleware([
            AuthenticatePluginToken::class,
            'tenant',
            'admin',
            'throttle:chatgpt-user',
            CheckPluginSubscription::class,
        ]);

    // The voice assistant is the same product under the same OAuth, tenancy,
    // throttle and subscription rules; only the response shape differs.
    Mcp::web('/mcp/voice', HexaTechVoiceServer::class)
        ->withoutMiddleware(AddWwwAuthenticateHeader::class)
        ->middleware([
            AuthenticatePluginToken::class,
            'tenant',
            'admin',
            'throttle:chatgpt-user',
            CheckPluginSubscription::class,
        ]);
});
