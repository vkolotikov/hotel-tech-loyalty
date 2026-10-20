<?php

namespace App\Providers;

use App\OAuth\PluginAccessTokenEntity;
use App\OAuth\PluginAccessTokenRepository;
use App\OAuth\PluginAuthCodeRepository;
use App\OAuth\PluginRefreshTokenRepository;
use Illuminate\Support\ServiceProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;
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
        // The queue worker is one long-running process: before each job, forget the tenant the last job bound, so a job
        // that binds none never runs as another organisation (queue review, 2026-10-20). Here, not AppServiceProvider:
        // only this provider is listed in bootstrap/providers.php.
        Queue::looping(function () {
            app()->forgetInstance('current_organization_id');
            app()->forgetInstance('current_brand_id');
        });

        RateLimiter::for('chatgpt-user', fn (Request $request) => Limit::perMinute(60)
            ->by($request->user()
                ? $request->user()->organization_id.':'.$request->user()->getAuthIdentifier()
                : 'unauthenticated:'.$request->ip()));

        // Portal coupon-code resolution: 5 attempts/minute per member (or
        // by IP before a member is known), so brute-forcing REW-/offer
        // codes can't fish for other members' rewards. Registered here
        // rather than AppServiceProvider — that provider is not listed in
        // bootstrap/providers.php (only this one is), so its boot() never
        // runs; this is the one place `RateLimiter::for` calls actually
        // execute.
        RateLimiter::for('portal-coupon', fn (Request $request) => Limit::perMinute(5)
            ->by('portal-coupon:' . ($request->user()?->id ?? $request->ip())));
        Passport::tokensCan(['mcp:use' => 'Read lead requirements and conversations, customers and bookings; update requested lead statuses and add internal notes']);
        Passport::tokensExpireIn(now()->addHour());
        Passport::refreshTokensExpireIn(now()->addDays(30));
        Passport::useAccessTokenEntity(PluginAccessTokenEntity::class);
        Passport::authorizationView('plugin.authorize');
    }
}
