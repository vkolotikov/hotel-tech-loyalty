<?php

namespace App\Http\Controllers\Api\Internal;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Machine-to-machine endpoint that lets the SaaS backend invalidate
 * an org's cached `plan_features` + `entitled_products` map after a
 * Stripe webhook reports a plan change (upgrade, downgrade, cancel).
 *
 * Without this push, a customer who upgrades via Stripe Customer
 * Portal (NOT Checkout) waits up to 5 minutes for the next
 * `SaasAuthMiddleware::maybeSyncEntitlements` cycle to pull fresh
 * entitlements. A downgrade in the same window means the customer
 * keeps using the higher plan's features for 5 minutes (which is
 * customer-friendly grace but lets paying customers slip below their
 * new tier). This endpoint flips that window from "up to 5 min" to
 * "next request after webhook lands".
 *
 * Auth pattern mirrors InternalAiUsageController:
 *   X-Signature: hex(hmac_sha256(raw_body, SAAS_JWT_SECRET))
 *
 * Body:
 *   { "saas_org_id": "cm..." }
 *
 * Response:
 *   { "ok": true, "found": true|false }
 *
 * Found=false is not an error — the SaaS webhook can fire for orgs
 * that haven't logged into the loyalty admin yet (no local row).
 *
 * NOT versioned (under /api/internal/* like ai-usage). Behind HMAC,
 * no JWT, no Sanctum — designed for cron + webhook callers.
 */
class InternalEntitlementController extends Controller
{
    /**
     * POST /internal/entitlements/bust
     */
    public function bust(Request $request): JsonResponse
    {
        if (!$this->signatureMatches($request)) {
            return response()->json(['error' => 'invalid signature'], 401);
        }

        $saasId = (string) $request->input('saas_org_id', '');
        if ($saasId === '') {
            return response()->json(['error' => 'saas_org_id required'], 422);
        }

        // Cross-tenant — bypass the scope. We're not RETURNING tenant
        // data, just invalidating a cache key.
        $org = Organization::withoutGlobalScopes()
            ->where('saas_org_id', $saasId)
            ->first();

        if (!$org) {
            return response()->json(['ok' => true, 'found' => false]);
        }

        // Drop the entitlements_synced_at marker so SaasAuthMiddleware
        // treats the next request as stale and force-refetches from
        // the SaaS bootstrap endpoint. This is cheaper than touching
        // plan_features here — we let the next sync write the
        // authoritative payload.
        $org->entitlements_synced_at = null;
        $org->saveQuietly();

        // Also bust the CheckSubscription middleware's 60s cache key
        // (subscription_status:{saas_org_id}) so subscription status
        // change reflects on the very next request.
        Cache::forget("subscription_status:{$saasId}");

        return response()->json(['ok' => true, 'found' => true]);
    }

    private function signatureMatches(Request $request): bool
    {
        $secret = config('services.saas.jwt_secret') ?: env('SAAS_JWT_SECRET');
        if (!$secret) return false;
        $provided = (string) $request->header('X-Signature', '');
        if ($provided === '') return false;
        $expected = hash_hmac('sha256', $request->getContent(), $secret);
        return hash_equals($expected, $provided);
    }
}
