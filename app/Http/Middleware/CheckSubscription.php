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
        // Path 1: SaaS JWT-authenticated request — check live from SaaS API
        $saasOrgId = $request->attributes->get('saas_org_id');
        if ($saasOrgId) {
            $cacheKey = "subscription_status:{$saasOrgId}";
            $status = Cache::get($cacheKey);

            if ($status === null) {
                $status = $this->fetchSubscriptionStatus($saasOrgId, $request);
                Cache::put($cacheKey, $status, now()->addMinutes(5));
            }

            if (!in_array($status['status'] ?? '', ['ACTIVE', 'TRIALING'])) {
                return response()->json([
                    'error' => 'subscription_required',
                    'message' => 'Your subscription has expired. Please renew to continue using the platform.',
                    'subscription' => $status,
                ], 403);
            }

            $request->attributes->set('subscription_status', $status['status']);
            $request->attributes->set('subscription_plan', $status['plan'] ?? null);
            $request->attributes->set('subscription_trial_end', $status['trialEnd'] ?? null);

            return $next($request);
        }

        // Path 2: Sanctum-only auth (trial users) — check cached org entitlements
        $user = $request->user();
        if ($user?->organization_id) {
            $org = \App\Models\Organization::find($user->organization_id);
            if ($org && $org->subscription_status) {
                // Check trial expiry
                if ($org->subscription_status === 'TRIALING' && $org->trial_end && $org->trial_end->isPast()) {
                    $org->update(['subscription_status' => 'EXPIRED']);
                    return response()->json([
                        'error' => 'subscription_required',
                        'message' => 'Your trial has expired. Please upgrade to continue.',
                    ], 403);
                }

                if (in_array($org->subscription_status, ['ACTIVE', 'TRIALING'], true)) {
                    $request->attributes->set('subscription_status', $org->subscription_status);
                    $request->attributes->set('subscription_plan', $org->plan_slug);
                    return $next($request);
                }

                return response()->json([
                    'error' => 'subscription_required',
                    'message' => 'Your subscription has expired. Please renew to continue using the platform.',
                ], 403);
            }
        }

        // Path 3: No SaaS config at all (pure local dev) — allow through
        $saasApi = config('services.saas.api_url');
        if (!$saasApi) {
            return $next($request);
        }

        // SaaS configured but no subscription data — block access
        return response()->json([
            'error' => 'subscription_required',
            'message' => 'No active subscription found. Please select a plan.',
        ], 403);
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
