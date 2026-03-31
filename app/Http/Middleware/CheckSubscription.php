<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifies the organization has an active or trialing subscription on the SaaS platform.
 * Caches the result for 5 minutes to avoid excessive cross-service calls.
 */
class CheckSubscription
{
    public function handle(Request $request, Closure $next): Response
    {
        // Only enforce for SaaS-authenticated requests (not local Sanctum-only users)
        $orgId = $request->attributes->get('saas_org_id');
        if (!$orgId) {
            // Not a SaaS-authenticated request — skip check (backward compat for dev)
            return $next($request);
        }

        $cacheKey = "subscription_status:{$orgId}";
        $status = Cache::get($cacheKey);

        if ($status === null) {
            $status = $this->fetchSubscriptionStatus($orgId, $request);
            Cache::put($cacheKey, $status, now()->addMinutes(5));
        }

        if (!in_array($status['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
            return response()->json([
                'error' => 'subscription_required',
                'message' => 'Your subscription has expired. Please renew to continue using the platform.',
                'subscription' => $status,
            ], 403);
        }

        // Attach subscription info for downstream use
        $request->attributes->set('subscription_status', $status['status']);
        $request->attributes->set('subscription_plan', $status['plan'] ?? null);
        $request->attributes->set('subscription_trial_end', $status['trialEnd'] ?? null);

        return $next($request);
    }

    private function fetchSubscriptionStatus(string $orgId, Request $request): array
    {
        $saasApiUrl = config('services.saas.api_url');
        if (!$saasApiUrl) {
            // SaaS not configured — allow through (dev mode)
            return ['status' => 'ACTIVE', 'plan' => 'dev'];
        }

        try {
            // Forward the bearer token to the SaaS API
            $token = $request->bearerToken();
            $response = Http::withToken($token)
                ->timeout(5)
                ->get("{$saasApiUrl}/billing/subscriptions");

            if ($response->successful()) {
                $subs = $response->json('subscriptions', []);
                // Find first active/trialing subscription
                foreach ($subs as $sub) {
                    if (in_array($sub['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
                        return [
                            'status'   => $sub['status'],
                            'plan'     => $sub['plan']['slug'] ?? $sub['plan']['name'] ?? 'unknown',
                            'planName' => $sub['plan']['name'] ?? 'Unknown',
                            'trialEnd' => $sub['trialEnd'] ?? null,
                            'periodEnd'=> $sub['currentPeriodEnd'] ?? null,
                        ];
                    }
                }
                return ['status' => 'EXPIRED'];
            }
        } catch (\Exception $e) {
            // On network error, allow through to avoid blocking during outages
            report($e);
            return ['status' => 'ACTIVE', 'plan' => 'fallback'];
        }

        return ['status' => 'EXPIRED'];
    }
}
