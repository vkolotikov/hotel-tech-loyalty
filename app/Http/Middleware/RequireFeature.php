<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware that gates access by SaaS plan feature flag.
 *
 * Usage: Route::middleware('feature:ai_insights')->group(...).
 *
 * Reads the cached feature map on the user's Organization (populated by
 * SaasAuthMiddleware via the SaaS BootstrapController) and returns 402
 * Payment Required if the current plan does not unlock that feature.
 */
class RequireFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $user = Auth::user();
        $org  = $user?->organization;

        if (!$org) {
            return response()->json([
                'error' => 'No organization context',
                'code'  => 'no_org',
            ], 403);
        }

        if (!$org->hasActiveSubscription()) {
            return response()->json([
                'error' => 'Your subscription is inactive. Visit billing to choose a plan.',
                'code'  => 'subscription_inactive',
                'plan'  => $org->plan_slug,
            ], 402);
        }

        if (!$org->hasFeature($feature)) {
            return response()->json([
                'error'    => "Your current plan does not include this feature ({$feature}).",
                'code'     => 'feature_locked',
                'feature'  => $feature,
                'plan'     => $org->plan_slug,
                'upgrade_url' => 'https://saas.hotel-tech.ai/admin/subscription',
            ], 402);
        }

        return $next($request);
    }
}
