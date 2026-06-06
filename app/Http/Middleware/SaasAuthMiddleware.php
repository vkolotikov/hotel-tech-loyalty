<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * SaaS Platform JWT authentication middleware.
 *
 * Checks for a Bearer JWT issued by the SaaS Platform's /api/auth/token endpoint.
 * If valid, authenticates the request (creating a local user + organization if needed).
 */
class SaasAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Check for gateway-injected headers — only trust if HMAC signature is valid.
        // The gateway must sign headers with the shared secret (SAAS_GATEWAY_SECRET).
        $gatewayUserId = $request->header('X-Saas-User-Id');
        if ($gatewayUserId) {
            $gatewaySecret = config('services.saas.gateway_secret', '');
            $signature = $request->header('X-Saas-Signature', '');

            if (!$gatewaySecret || !$signature) {
                // No gateway secret configured or no signature — reject gateway headers
                // Strip untrusted headers and fall through to JWT/Sanctum auth
            } else {
                // Verify HMAC signature over the gateway header values
                $payload = implode('|', [
                    $gatewayUserId,
                    $request->header('X-Saas-User-Email', ''),
                    $request->header('X-Saas-Org-Id', ''),
                    $request->header('X-Saas-Role', ''),
                ]);
                $expected = hash_hmac('sha256', $payload, $gatewaySecret);

                if (hash_equals($expected, $signature)) {
                    $request->attributes->set('saas_authenticated', true);
                    $request->attributes->set('saas_user_id', $gatewayUserId);
                    $request->attributes->set('saas_user_email', $request->header('X-Saas-User-Email', ''));
                    $request->attributes->set('saas_org_id', $request->header('X-Saas-Org-Id', ''));
                    $request->attributes->set('saas_org_slug', $request->header('X-Saas-Org-Slug', ''));
                    $request->attributes->set('saas_role', $request->header('X-Saas-Role', ''));
                    $this->authenticateSaasUser($request);
                    return $next($request);
                }
                // Invalid signature — fall through, do NOT trust headers
            }
        }

        // Check for Bearer token
        $authHeader = $request->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
            // Sanctum tokens contain a "|" separator — let Sanctum handle those
            if ($token !== '' && !str_contains($token, '|')) {
                $result = $this->verifyJwt($token);
                if ($result['valid'] ?? false) {
                    $user = $result['user'] ?? [];
                    $org = $result['organization'] ?? [];
                    $request->attributes->set('saas_authenticated', true);
                    $request->attributes->set('saas_user_id', $user['id'] ?? '');
                    $request->attributes->set('saas_user_email', $user['email'] ?? '');
                    $request->attributes->set('saas_org_id', $org['id'] ?? '');
                    $request->attributes->set('saas_org_slug', $org['slug'] ?? '');
                    $request->attributes->set('saas_role', $org['role'] ?? '');
                    // Phase 2 — carry the industry through so authenticateSaasUser
                    // can stamp it on a fresh org. Empty string = SaaS didn't
                    // pick one (legacy orgs / super-admin pre-created without
                    // industry) → loyalty falls back to its own column.
                    $request->attributes->set('saas_org_industry', $org['industry'] ?? '');
                    $this->authenticateSaasUser($request);
                    return $next($request);
                }

                return response()->json([
                    'error' => $result['error'] ?? 'Invalid or expired SaaS token',
                    'code' => 'unauthorized',
                ], 401);
            }
        }

        // No SaaS auth — pass through to Sanctum
        return $next($request);
    }

    /**
     * Pull current plan/products/features from the SaaS BootstrapController and
     * cache them onto the local Organization. Refreshed at most every 5 minutes
     * so a plan upgrade in saas.hotel-tech.ai propagates within that window.
     */
    private function maybeSyncEntitlements(Organization $org, Request $request): void
    {
        $stale = !$org->entitlements_synced_at
            || $org->entitlements_synced_at->lt(now()->subMinutes(5));

        if (!$stale) return;

        // services.saas.api_url already ends in `/api` per config default
        // (https://saas.hotel-tech.ai/api). Just append `/tools/bootstrap`
        // here — the rest of the codebase (AuthController billing proxies,
        // ReconcileSaasOrgs, etc.) treats $saasApi the same way. Prior to
        // this fix the path doubled to `/api/api/tools/bootstrap` and
        // every entitlement sync via this middleware silently 404'd.
        $base = rtrim((string) config('services.saas.api_url'), '/');
        if (!$base) return;

        $token = '';
        $authHeader = $request->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
        }
        if (!$token) return;

        try {
            $resp = \Illuminate\Support\Facades\Http::timeout(3)
                ->withToken($token)
                ->get($base . '/tools/bootstrap');

            if (!$resp->successful()) return;

            $data = $resp->json();
            $sub = $data['subscription'] ?? null;

            $org->plan_slug             = $sub['plan']['slug'] ?? null;
            $org->subscription_status   = $sub['status'] ?? null;
            $org->trial_end             = $sub['trialEnd'] ?? null;
            $org->period_end            = $sub['currentPeriodEnd'] ?? null;
            $org->entitled_products     = $data['entitled_product_slugs'] ?? [];
            $org->plan_features         = (array) ($data['features'] ?? []);
            $org->entitlements_synced_at = now();
            $org->save();
        } catch (\Throwable $e) {
            // Sync failure is best-effort — we never block the request on it,
            // and a previously cached set of entitlements keeps the org running.
            // Bump from debug to warning so the failure is visible in prod log
            // aggregators (most filter debug-level out): an undiagnosed sync
            // outage means plan upgrades silently fail to propagate.
            \Log::warning('SaasAuthMiddleware: entitlement sync failed', [
                'org_id' => $org->id,
                'error'  => $e->getMessage(),
            ]);
        }
    }

    private function verifyJwt(string $token): array
    {
        $secret = config('services.saas.jwt_secret', '');
        if (!$secret) {
            return ['valid' => false, 'error' => 'JWT secret not configured'];
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return ['valid' => false, 'error' => 'Invalid token format'];
        }

        [$header, $payload, $signature] = $parts;

        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$header.$payload", $secret, true)), '+/', '-_'), '=');
        if (!hash_equals($expected, $signature)) {
            return ['valid' => false, 'error' => 'Invalid signature'];
        }

        $data = json_decode(base64_decode(str_pad(strtr($payload, '-_', '+/'), strlen($payload) % 4 ? strlen($payload) + 4 - strlen($payload) % 4 : strlen($payload), '=')), true);
        if (!$data) {
            return ['valid' => false, 'error' => 'Invalid payload'];
        }

        if (isset($data['exp']) && $data['exp'] < time()) {
            return ['valid' => false, 'error' => 'Token expired'];
        }

        return [
            'valid' => true,
            'user'  => [
                'id'    => $data['userId'] ?? $data['sub'] ?? '',
                'email' => $data['email'] ?? '',
                'name'  => $data['name'] ?? '',
            ],
            'organization' => isset($data['currentOrgId']) ? [
                'id'   => $data['currentOrgId'],
                'slug' => $data['currentOrgSlug'] ?? '',
                'name' => $data['currentOrgName'] ?? '',
                'role' => $data['role'] ?? 'STAFF',
                // Industry Platform Plan Phase 2 — SaaS forwards the
                // canonical industry choice (set at register or via
                // Stripe Checkout return) so the loyalty side can
                // stamp it on a fresh first-time org without round-
                // tripping back to the SaaS DB. Empty string when the
                // SaaS-side org has no industry stamped yet (legacy
                // orgs before the column existed, or orgs created via
                // super-admin admin tool without picking) — loyalty
                // falls back to current_industry from its own column.
                'industry' => $data['currentOrgIndustry'] ?? '',
            ] : null,
        ];
    }

    /**
     * Find or create a local user + organization matching the SaaS identity.
     */
    private function authenticateSaasUser(Request $request): void
    {
        $email = $request->attributes->get('saas_user_email');
        $saasOrgId = $request->attributes->get('saas_org_id');

        if (!$email) return;

        // Find or create local organization linked to SaaS org
        $org = null;
        if ($saasOrgId) {
            $isNew = false;
            $org = Organization::where('saas_org_id', $saasOrgId)->first();
            if (!$org) {
                // Derive a globally-unique slug. Archived orgs (saas_deleted_at)
                // keep their slug in the table, so a fresh SaaS company that
                // happens to share a name with a previously-archived one would
                // collide on organizations.slug UNIQUE and blow up the SSO
                // middleware with a 500 — the invited owner then lands on the
                // loyalty login form unable to sign in (their local password
                // is random because it was never set here).
                $baseSlug = $request->attributes->get('saas_org_slug')
                    ?: Str::slug($saasOrgId);
                $slug = $baseSlug;
                $suffix = 1;
                while (Organization::where('slug', $slug)->exists()) {
                    $slug = $baseSlug . '-' . $suffix++;
                }

                // Phase 2 — pull the SaaS-side industry choice off the
                // request attributes (set by verifyJwt). Empty / unknown
                // falls back to null so the loyalty column stays NULL
                // and `resolved_industry` defaults to 'hotel'.
                $saasIndustry = \App\Models\Organization::normaliseIndustry(
                    $request->attributes->get('saas_org_industry') ?: null
                );

                try {
                    $org = Organization::create([
                        'saas_org_id' => $saasOrgId,
                        'name' => $request->attributes->get('saas_org_slug') ?: 'Organization',
                        'slug' => $slug,
                        // Stamp the JWT-forwarded industry on first-time
                        // org creation. NULL when SaaS didn't supply one
                        // (legacy or pre-created by super-admin without
                        // industry); the org will silently default to
                        // 'hotel' via the accessor until the admin
                        // explicitly picks via Phase 4's mismatch banner
                        // or Phase 10's Settings → Industry switcher.
                        'industry' => $saasIndustry,
                    ]);
                    $isNew = true;
                } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
                    // Race: two concurrent requests for the same SaaS org
                    // both passed the first() check and raced to create.
                    // The loser re-fetches the winner's row.
                    $org = Organization::where('saas_org_id', $saasOrgId)->first();
                    if (!$org) throw $e;
                }
            } elseif ($org->saas_deleted_at) {
                // Reconcile job had previously marked this org as deleted in
                // SaaS, but SaaS is still signing JWTs for it — resurrect.
                // Usually means the reconcile raced a restore, or the delete
                // was rolled back on the SaaS side.
                $org->update(['saas_deleted_at' => null]);
            }

            // Phase 2 — silent backfill of industry when SaaS forwards
            // one AND the loyalty column is unset. Existing orgs created
            // before the Phase 1 column shipped get their industry
            // populated on first SSO touch instead of waiting for the
            // Phase 10 batch backfill. We never overwrite an explicit
            // loyalty-side choice — admins can switch via apply-industry
            // and that decision wins over the JWT.
            if ($org && !$org->hasExplicitIndustry()) {
                $jwtIndustry = \App\Models\Organization::normaliseIndustry(
                    $request->attributes->get('saas_org_industry') ?: null
                );
                if ($jwtIndustry !== null) {
                    $org->industry = $jwtIndustry;
                    $org->save();
                }
            }

            // Auto-setup defaults for new organizations. Run this best-effort —
            // a partial seed failure must NOT block the SSO handoff, or the
            // invited owner lands on the loyalty login screen staring at a
            // generic error and is forced to enter credentials they don't
            // have (SSO-created users have a random local password).
            if ($isNew) {
                try {
                    app(\App\Services\OrganizationSetupService::class)->setupDefaults($org);
                } catch (\Throwable $e) {
                    \Log::warning('OrganizationSetupService::setupDefaults failed during SSO — continuing', [
                        'org_id'  => $org->id,
                        'saas_org_id' => $org->saas_org_id,
                        'error'   => $e->getMessage(),
                        'file'    => $e->getFile() . ':' . $e->getLine(),
                    ]);
                }
            }

            // Refresh cached SaaS entitlements (plan, products, features) if stale.
            // We do this best-effort and never block the request on a transient SaaS
            // outage — if the call fails the previous cached values keep working.
            $this->maybeSyncEntitlements($org, $request);
        }

        // Find or create local staff user scoped to THIS org. Pre-multi-org
        // this lookup was just `WHERE email = ?` which silently reused the
        // first matching user across orgs and then required a separate
        // "repoint organization_id" branch below (now removed). With the
        // partial unique `users_email_staff_org_unique` on
        // (organization_id, email) WHERE user_type = 'staff', the same
        // person can have multiple staff rows — one per org. Bypass tenant
        // scopes because no `current_organization_id` is bound yet.
        $user = User::withoutGlobalScopes()
            ->where('email', $email)
            ->where('user_type', 'staff')
            ->where('organization_id', $org?->id)
            ->first();

        if (!$user) {
            try {
                $user = User::create([
                    'name'            => $request->attributes->get('saas_user_email'),
                    'email'           => $email,
                    'password'        => bcrypt(Str::random(32)),
                    'user_type'       => 'staff',
                    'organization_id' => $org?->id,
                ]);
            } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
                // Race: two concurrent requests (e.g. multiple tabs
                // opened at the same time) both passed the first()
                // check and raced to insert the same user. Re-fetch.
                $user = User::withoutGlobalScopes()
                    ->where('email', $email)
                    ->where('user_type', 'staff')
                    ->where('organization_id', $org?->id)
                    ->first();
                if (!$user) throw $e;
            }

            $saasRole = $request->attributes->get('saas_role', 'STAFF');
            $localRole = match (strtoupper($saasRole)) {
                'OWNER' => 'super_admin',
                'ADMIN' => 'manager',
                default => 'receptionist',
            };

            // Best-effort staff seed — if it fails, we still have a user to
            // authenticate. A missing staff row is recoverable (the Setup
            // wizard will create one); a failed SSO is not.
            try {
                Staff::withoutGlobalScopes()->create([
                    'user_id'           => $user->id,
                    'organization_id'   => $org?->id,
                    'role'              => $localRole,
                    'hotel_name'        => $org?->name ?? 'Hotel',
                    'can_award_points'  => in_array($localRole, ['super_admin', 'manager']),
                    'can_redeem_points' => true,
                    'can_manage_offers' => in_array($localRole, ['super_admin', 'manager']),
                    'can_view_analytics'=> in_array($localRole, ['super_admin', 'manager']),
                    'is_active'         => true,
                ]);
            } catch (\Throwable $e) {
                \Log::warning('Staff seed failed during SSO — continuing', [
                    'user_id' => $user->id, 'org_id' => $org?->id, 'error' => $e->getMessage(),
                ]);
            }
        }
        // Note: the old "repoint user organization_id" branch was removed.
        // It existed because the lookup above was `WHERE email = ?` only,
        // which could resolve to a user in a DIFFERENT org and then
        // silently steal them by overwriting `organization_id`. Now the
        // lookup is scoped to the current org, so any user we get back
        // is already in this org by construction — no repoint needed.
        // Multi-org staff get separate rows per org, one per Staff record.

        // Log in on the default (web) guard, and also pin the user on the
        // sanctum guard so that `auth:sanctum` — which runs after this
        // middleware — sees an authenticated user. Without the second call,
        // Sanctum's RequestGuard resolves independently and rejects the JWT
        // (it's not in the `id|plaintext` personal-access-token format), so
        // the whole chain 401s even though we just verified the SaaS token.
        Auth::login($user);
        Auth::guard('sanctum')->setUser($user);
    }
}
