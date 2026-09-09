<?php

use App\Http\Controllers\Plugin\PluginLoginController;
use App\Http\Controllers\Plugin\PluginMetadataController;
use App\Http\Controllers\Plugin\PluginConnectionsController;
use App\Http\Middleware\Plugin\GuardPluginTransport;
use App\Http\Middleware\Plugin\RequirePluginBridgeToken;
use App\Http\Middleware\Plugin\RequirePluginSession;
use App\Http\Middleware\Plugin\ValidatePluginOAuthRequest;
use App\Http\Middleware\Plugin\SerializePluginGrant;
use Illuminate\Support\Facades\Route;
use Laravel\Passport\Http\Controllers\AccessTokenController;
use Laravel\Passport\Http\Controllers\ApproveAuthorizationController;
use Laravel\Passport\Http\Controllers\AuthorizationController;
use Laravel\Passport\Http\Controllers\DenyAuthorizationController;

// Disconnect must stay available even if billing, a brand or the pilot is disabled.
Route::prefix('api/v1/auth/plugin-connections')
    ->middleware(['api', 'saas.auth', 'auth:sanctum', 'tenant', 'admin', 'throttle:60,1,plugin-connections'])
    ->group(function () {
        Route::get('/', [PluginConnectionsController::class, 'index']);
        Route::delete('/', [PluginConnectionsController::class, 'destroyAll']);
    });

Route::middleware([GuardPluginTransport::class, 'throttle:600,1,plugin-oauth'])->group(function () {
    Route::get('/.well-known/oauth-protected-resource', [PluginMetadataController::class, 'resource']);
    Route::get('/.well-known/oauth-protected-resource/mcp', [PluginMetadataController::class, 'resource'])
        ->name('mcp.oauth.protected-resource');
    Route::get('/.well-known/oauth-authorization-server', [PluginMetadataController::class, 'authorizationServer']);

    Route::post('/oauth/token', [AccessTokenController::class, 'issueToken'])
        ->middleware([ValidatePluginOAuthRequest::class, SerializePluginGrant::class])->name('passport.token');

    Route::middleware('web')->group(function () {
        Route::get('/plugin/login', [PluginLoginController::class, 'show'])->name('plugin.login');
        Route::post('/plugin/session', [PluginLoginController::class, 'bridge'])
            ->middleware(RequirePluginBridgeToken::class)->name('plugin.session');
        Route::get('/oauth/authorize', [AuthorizationController::class, 'authorize'])
            ->middleware([ValidatePluginOAuthRequest::class, RequirePluginSession::class])
            ->name('passport.authorizations.authorize');
        Route::post('/oauth/authorize', [ApproveAuthorizationController::class, 'approve'])
            ->middleware([RequirePluginSession::class, SerializePluginGrant::class])->name('passport.authorizations.approve');
        Route::delete('/oauth/authorize', [DenyAuthorizationController::class, 'deny'])
            ->middleware(RequirePluginSession::class)->name('passport.authorizations.deny');
    });
});
