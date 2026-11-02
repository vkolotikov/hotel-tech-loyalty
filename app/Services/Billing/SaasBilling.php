<?php

namespace App\Services\Billing;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * This application's link to the billing application (SaaS): a JWT for the signed-in user's organisation, the
 * organisation registered there when it is not yet, the entitlements synced back, and this application's own public
 * address for Stripe's return links. Moved unchanged out of AuthController (2026-11-02) so the full admin's Billing
 * endpoints and the modules' Plan & products endpoints (PlanModulesController) share one copy.
 */
class SaasBilling
{
    /**
     * Sync entitlements from SaaS bootstrap endpoint onto the local Organization.
     */
    public function syncEntitlementsFromSaas(Request $request, string $saasToken): void
    {
        $saasApi = config('services.saas.api_url');
        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;
        if (!$org || !$saasApi) return;

        try {
            $bootstrap = Http::withToken($saasToken)->timeout(5)
                ->get("{$saasApi}/tools/bootstrap");

            if ($bootstrap->successful()) {
                $data = $bootstrap->json();
                $sub = $data['subscription'] ?? null;
                if ($sub) {
                    $org->plan_slug           = $sub['plan']['slug'] ?? null;
                    $org->subscription_status = $sub['status'] ?? null;
                    $org->trial_end           = $sub['trialEnd'] ?? null;
                    $org->period_end          = $sub['currentPeriodEnd'] ?? null;
                }
                $org->entitled_products     = $data['entitled_product_slugs'] ?? [];
                $org->plan_features         = (array) ($data['features'] ?? []);
                $org->entitlements_synced_at = now();
                $org->save();
            }
        } catch (\Exception $e) {
            report($e);
        }
    }

    /**
     * Get a SaaS JWT for the current user's org.
     * Tries: (1) existing SaaS JWT on the request, (2) service-to-service token endpoint.
     *
     * Negative-cached: when the service-token call fails (timeout, 5xx, etc.)
     * we set a short-lived "unhealthy" key in the cache so subsequent calls
     * return null fast instead of every admin request blocking for the full
     * HTTP timeout. Without this, a slow SaaS makes the loyalty backend feel
     * frozen for everyone — PHP-FPM children pile up waiting on 5s curls
     * because the dashboard polls /subscription, which calls this, which
     * hangs, exhausting the FPM worker pool within seconds.
     */
    public function getSaasToken(Request $request): ?string
    {
        // If the request already has a SaaS JWT (user came from SaaS dashboard), use it
        $authHeader = $request->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
            // Sanctum tokens contain "|" — SaaS JWTs don't
            if (!str_contains($token, '|')) {
                return $token;
            }
        }

        // Service-to-service: request a short-lived JWT from SaaS using the shared secret
        $saasApi = config('services.saas.api_url');
        $user = $request->user();
        if (!$user || !$saasApi) return null;

        $org = \App\Models\Organization::find($user->organization_id);
        if (!$org || !$org->saas_org_id) return null;

        $jwtSecret = config('services.saas.jwt_secret', '');
        if (!$jwtSecret) return null;

        // Fail-fast circuit breaker. Two cache keys:
        //   saas_token_unhealthy — set for 60s after a confirmed failure.
        //     Returns null immediately so polling admin tabs don't repeat
        //     the curl call across the next minute.
        //   saas_token_inflight — set for 3s when we START the call. Catches
        //     the concurrent-request race: two admin polls within the same
        //     2s window otherwise both make the call (both miss the breaker
        //     because the first hasn't tripped it yet). With this key, the
        //     second sees an in-flight call and returns null without burning
        //     a second curl. 3s is the timeout (2s) + a small grace.
        $cache = \Illuminate\Support\Facades\Cache::store();
        if ($cache->has('saas_token_unhealthy') || $cache->has('saas_token_inflight')) {
            return null;
        }

        $payload = implode('|', [$user->email, $org->saas_org_id]);
        $signature = hash_hmac('sha256', $payload, $jwtSecret);

        // Mark in-flight before the curl call so concurrent requests bail.
        $cache->put('saas_token_inflight', 1, 3);

        try {
            // Tightened from 5s to 2s. The endpoint is a single signed POST
            // against a Laravel route — when it's healthy it returns in
            // ~100ms. 2s is well above any real latency floor while keeping
            // worker-block time bounded under SaaS slowdowns.
            $response = Http::timeout(2)->connectTimeout(2)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post("{$saasApi}/auth/service-token", [
                    'email' => $user->email,
                    'orgId' => $org->saas_org_id,
                ]);

            $cache->forget('saas_token_inflight');

            if ($response->successful()) {
                return $response->json('token');
            }

            // Non-2xx: SaaS is up but rejecting. Don't trip the circuit on
            // a 401/403 — that's our problem (bad signature / disabled org),
            // not theirs, and we don't want to mask it. Only trip on 5xx.
            if ($response->serverError()) {
                $cache->put('saas_token_unhealthy', 1, 60);
            }
        } catch (\Throwable $e) {
            // Connection-level failure (timeout, DNS, refused). Trip the
            // breaker so the next 60s of admin requests skip the call.
            $cache->forget('saas_token_inflight');
            $cache->put('saas_token_unhealthy', 1, 60);
            // Log once per breaker window instead of every failed request.
            // The previous behaviour (report() on every call) produced
            // duplicate Nightwatch entries for the same outage.
            \Illuminate\Support\Facades\Log::warning('SaaS service-token call failed — breaker tripped for 60s', [
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    /**
     * Resolve this app's public URL (used for Stripe Checkout return URLs).
     * Returns null when APP_URL is missing in production — caller decides what
     * to do; we never silently fall back to the production loyalty domain
     * from a staging / preview deploy.
     */
    public function resolveLoyaltyUrl(): ?string
    {
        $url = trim((string) config('app.url'));
        if ($url) return rtrim($url, '/');

        // Dev convenience: in non-prod, fall back to the request origin so
        // local tunneling / preview environments still work without config.
        if (!app()->environment('production')) {
            return rtrim(request()->getSchemeAndHttpHost(), '/');
        }
        return null;
    }

    /**
     * Ensure the local organization exists on SaaS.
     * If it doesn't have a saas_org_id, register the user+org on SaaS
     * and store the returned IDs. Returns a SaaS JWT on success.
     *
     * IMPORTANT: All HTTP calls use very short timeouts (2s connect, 4s total)
     * because Laravel Cloud kills PHP workers on long requests.
     */
    public function ensureSaasOrg(Request $request): ?string
    {
        $user = $request->user();
        $org = $user ? \App\Models\Organization::find($user->organization_id) : null;
        if (!$user || !$org) return null;

        $saasApi = config('services.saas.api_url');
        if (!$saasApi) return null;

        // Already linked — get a token via the normal path
        if ($org->saas_org_id) {
            return $this->getSaasToken($request);
        }

        // Not linked — register on SaaS to create the org there. Use a fresh
        // random password rather than deriving from app.key + email: that
        // older scheme meant anyone with APP_KEY could compute every linked
        // user's SaaS password. The password is never used again after this
        // call — subsequent loyalty→SaaS auth goes through service-lookup /
        // service-verify-password which are HMAC-signed.
        $tempPassword = \Illuminate\Support\Str::random(40);

        try {
            $response = Http::connectTimeout(2)->timeout(4)->post("{$saasApi}/auth/register", [
                'name'     => $user->name,
                'email'    => $user->email,
                'password' => $tempPassword,
                'orgName'  => $org->name,
                'planSlug' => $org->plan_slug ?? 'starter',
            ]);
        } catch (\Exception $e) {
            \Log::error('[ensureSaasOrg] SaaS unreachable', [
                'url' => "{$saasApi}/auth/register",
                'error' => $e->getMessage(),
            ]);
            return null;
        }

        // Success — new user registered on SaaS
        if ($response->successful()) {
            $data = $response->json();
            $saasOrgId = $data['organization']['id'] ?? null;
            $saasToken = $data['token'] ?? null;

            if ($saasOrgId) {
                $org->saas_org_id = $saasOrgId;
                $org->save();
            }

            return $saasToken;
        }

        // User already exists on SaaS — use service-lookup (HMAC-signed, no password needed)
        if (in_array($response->status(), [409, 422])) {
            return $this->serviceLookupSaas($user, $org, $saasApi);
        }

        \Log::error('[ensureSaasOrg] Registration failed', [
            'status' => $response->status(),
            'body' => substr($response->body(), 0, 200),
        ]);
        return null;
    }

    /**
     * Look up existing user on SaaS using HMAC-signed service call.
     * No password needed — authenticated via shared JWT secret.
     */
    private function serviceLookupSaas($user, $org, string $saasApi): ?string
    {
        $jwtSecret = config('services.saas.jwt_secret', '');
        if (!$jwtSecret) {
            \Log::error('[serviceLookupSaas] No jwt_secret configured');
            return null;
        }

        $signature = hash_hmac('sha256', $user->email, $jwtSecret);

        try {
            $lookupRes = Http::connectTimeout(2)->timeout(4)
                ->withHeaders(['X-Service-Signature' => $signature])
                ->post("{$saasApi}/auth/service-lookup", [
                    'email' => $user->email,
                ]);
        } catch (\Exception $e) {
            \Log::error('[serviceLookupSaas] SaaS unreachable', ['error' => $e->getMessage()]);
            return null;
        }

        if ($lookupRes->successful()) {
            $data = $lookupRes->json();
            $saasOrgId = $data['organization']['id'] ?? null;
            $saasToken = $data['token'] ?? null;

            if ($saasOrgId && !$org->saas_org_id) {
                $org->saas_org_id = $saasOrgId;
                $org->save();
                \Log::error('[serviceLookupSaas] Linked org ' . $org->id . ' → SaaS ' . $saasOrgId);
            }

            return $saasToken;
        }

        \Log::error('[serviceLookupSaas] Lookup failed', [
            'status' => $lookupRes->status(),
            'body' => substr($lookupRes->body(), 0, 200),
        ]);
        return null;
    }
}
