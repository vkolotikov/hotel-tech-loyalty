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
        // Super admin bypass — full access without subscription
        $user = $request->user();
        if ($user && method_exists($user, 'staff') && $user->staff?->isSuperAdmin()) {
            $request->attributes->set('subscription_status', 'ACTIVE');
            $request->attributes->set('subscription_plan', 'enterprise');
            return $next($request);
        }

        // ── Defence in depth: regardless of which auth path matched below,
        // if we have a local Organization whose `trial_end` is in the past
        // and the cached status hasn't been demoted yet, flip it to EXPIRED
        // *before* any cache check can grant access.
        //
        // Previously this only fired when subscription_status was the literal
        // string 'TRIALING'. That left a hole: when SaaS expired the trial
        // and bootstrap returned no subscription, maybeSyncEntitlements set
        // local subscription_status to NULL (line 120 of SaasAuthMiddleware
        // does `$sub['status'] ?? null`). The defence then skipped, the
        // cached trial-status row in the SaaS-side cache could still answer
        // ACTIVE/TRIALING, and the user kept working. Widening the trigger
        // to "trial_end in the past AND not already EXPIRED" closes that.
        //
        // We resolve the org from BOTH sources of truth: the authed user's
        // organization_id (Sanctum path) and the saas_org_id attribute set
        // by SaasAuthMiddleware (JWT path). Either one suffices.
        $authedUser = $user;
        $org = null;
        if ($authedUser?->organization_id) {
            $org = \App\Models\Organization::find($authedUser->organization_id);
        }
        $saasOrgIdAttr = $request->attributes->get('saas_org_id');
        if (!$org && $saasOrgIdAttr) {
            $org = \App\Models\Organization::where('saas_org_id', $saasOrgIdAttr)->first();
        }

        if ($org
            && $org->trial_end
            && $org->trial_end->isPast()
            && $org->subscription_status !== 'EXPIRED'
            && $org->subscription_status !== 'ACTIVE' // paid plan, not on trial — ignore
        ) {
            $org->update(['subscription_status' => 'EXPIRED']);
            // Bust any cached "TRIALING"/"ACTIVE" so downstream paths can't re-grant.
            if ($org->saas_org_id) {
                Cache::forget("subscription_status:{$org->saas_org_id}");
            }
        }

        // Path 1: SaaS JWT-authenticated request — check live from SaaS API.
        // Cache reduced from 5min → 60s so a fresh upgrade or expiry is
        // reflected within a minute, not five.
        $saasOrgId = $request->attributes->get('saas_org_id');
        if ($saasOrgId) {
            $cacheKey = "subscription_status:{$saasOrgId}";
            $status = Cache::get($cacheKey);

            if ($status === null) {
                $status = $this->fetchSubscriptionStatus($saasOrgId, $request);
                Cache::put($cacheKey, $status, now()->addSeconds(60));
            }

            // Belt-and-braces: if the SaaS payload says TRIALING but the
            // trialEnd is in the past, treat as EXPIRED. SaaS *should* have
            // demoted it via the daily sweep, but a stale crontab on prod
            // would leave the status untouched indefinitely.
            $effectiveStatus = $status['status'] ?? '';
            $trialEnd = $status['trialEnd'] ?? null;
            if ($effectiveStatus === 'TRIALING' && $trialEnd && strtotime($trialEnd) < time()) {
                $effectiveStatus = 'EXPIRED';
                $status['status'] = 'EXPIRED';
                Cache::put($cacheKey, $status, now()->addSeconds(60));
                if ($org) $org->update(['subscription_status' => 'EXPIRED']);
            }

            // ── PAST_DUE grace period ──────────────────────────────
            // When a paid customer's card fails, Stripe sets PAST_DUE
            // and retries 4 times over ~7 days. Pre-fix we instantly
            // 403'd them — locking them OUT of /billing → couldn't
            // update card → service dead until they emailed support.
            //
            // We now grant access for 3 days after the failed-charge
            // period started, so Stripe's smart retries have time to
            // succeed AND the customer can fix their card themselves.
            // The wall-banner UI uses `grace_until` to show a warning
            // instead of a full lockout during this window.
            $graceUntil = null;
            if ($effectiveStatus === 'PAST_DUE') {
                $periodEnd = $status['periodEnd'] ?? null;
                $graceUntil = $periodEnd
                    ? strtotime($periodEnd . ' +3 days')
                    : strtotime('+3 days');
                $status['grace_until'] = date('c', $graceUntil);
                if ($graceUntil > time()) {
                    // Inside the grace window — let the request through
                    // but mark the status so the frontend shows a banner.
                    $request->attributes->set('subscription_status', 'PAST_DUE_GRACE');
                    $request->attributes->set('subscription_plan', $status['plan'] ?? null);
                    $request->attributes->set('subscription_trial_end', $trialEnd);
                    Cache::put($cacheKey, $status, now()->addSeconds(60));
                    return $next($request);
                }
            }

            if (!in_array($effectiveStatus, ['ACTIVE', 'TRIALING'])) {
                $msg = match ($effectiveStatus) {
                    'PAST_DUE', 'UNPAID' => 'Your most recent payment failed. Please update your payment method to restore access.',
                    'CANCELED'           => 'Your subscription was canceled. Please reactivate to restore access.',
                    'PAUSED'             => 'Your subscription is paused. Resume it to restore access.',
                    'EXPIRED'            => 'Your free trial has expired. Please choose a plan to continue.',
                    default              => 'Your subscription has expired. Please renew to continue using the platform.',
                };
                return response()->json([
                    'error' => 'subscription_required',
                    'message' => $msg,
                    'subscription' => $status,
                ], 403);
            }

            $request->attributes->set('subscription_status', $effectiveStatus);
            $request->attributes->set('subscription_plan', $status['plan'] ?? null);
            $request->attributes->set('subscription_trial_end', $trialEnd);

            return $next($request);
        }

        // Path 2: Sanctum-only auth (trial users) — check cached org entitlements
        if ($org && $org->subscription_status) {
            if (in_array($org->subscription_status, ['ACTIVE', 'TRIALING'], true)) {
                $request->attributes->set('subscription_status', $org->subscription_status);
                $request->attributes->set('subscription_plan', $org->plan_slug);
                return $next($request);
            }

            return response()->json([
                'error' => 'subscription_required',
                'message' => $org->subscription_status === 'EXPIRED'
                    ? 'Your trial has expired. Please upgrade to continue.'
                    : 'Your subscription has expired. Please renew to continue using the platform.',
            ], 403);
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
        } catch (\Throwable $e) {
            // On network error, fall back to the cached org status rather
            // than fail-open. The previous behaviour returned a synthetic
            // "ACTIVE" which let any expired trial keep working as long as
            // the SaaS API was unreachable — a hole big enough for an
            // unscrupulous user to weaponise (even a brief SaaS outage
            // would unlock everyone).
            report($e);
            $org = \App\Models\Organization::where('saas_org_id', $orgId)->first();
            if ($org && $org->subscription_status) {
                return [
                    'status'   => $org->subscription_status,
                    'plan'     => $org->plan_slug,
                    'trialEnd' => $org->trial_end?->toIso8601String(),
                    'periodEnd'=> $org->period_end?->toIso8601String(),
                    'fallback' => 'cached',
                ];
            }
            // No cached state to fall back on — fail closed.
            return ['status' => 'EXPIRED', 'fallback' => 'unknown'];
        }

        return ['status' => 'EXPIRED'];
    }
}
