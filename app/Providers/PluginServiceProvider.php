<?php

namespace App\Providers;

use App\OAuth\PluginAccessTokenEntity;
use App\OAuth\PluginAccessTokenRepository;
use App\OAuth\PluginAuthCodeRepository;
use App\OAuth\PluginRefreshTokenRepository;
use Illuminate\Support\ServiceProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Passport\Bridge\AccessTokenRepository;
use Laravel\Passport\Bridge\AuthCodeRepository;
use Laravel\Passport\Bridge\RefreshTokenRepository;
use Laravel\Passport\Passport;

class PluginServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // No Passport password, client management, personal-token or cookie API.
        // Keep this unconditional so disabling the integration closes every route.
        Passport::ignoreRoutes();
        $this->app->bind(AuthCodeRepository::class, PluginAuthCodeRepository::class);
        $this->app->bind(AccessTokenRepository::class, PluginAccessTokenRepository::class);
        $this->app->bind(RefreshTokenRepository::class, PluginRefreshTokenRepository::class);
    }

    public function boot(): void
    {
        RateLimiter::for('chatgpt-user', fn (Request $request) => Limit::perMinute(60)
            ->by($request->user()
                ? $request->user()->organization_id.':'.$request->user()->getAuthIdentifier()
                : 'unauthenticated:'.$request->ip()));
        Passport::tokensCan(['mcp:use' => 'Read CRM leads, customers and bookings, and add requested customer or booking notes']);
        Passport::tokensExpireIn(now()->addHour());
        Passport::refreshTokensExpireIn(now()->addDays(30));
        Passport::useAccessTokenEntity(PluginAccessTokenEntity::class);
        Passport::authorizationView('plugin.authorize');
    }
}
