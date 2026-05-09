<?php

namespace App\Http\Middleware;

use App\Models\Brand;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the current brand and binds it to the container so BrandScope
 * can pick it up.
 *
 * Resolution order (first hit wins):
 *   1. ?brand_id query param (admin SPA explicitly switching brand)
 *   2. brand_token URL segment (public widget routes)
 *   3. authenticated staff user's pivot — if assigned to exactly one brand,
 *      that brand wins; if assigned to none, all brands; if assigned to
 *      many, no specific brand is auto-bound (caller must pass ?brand_id)
 *   4. fall back to org default brand if no specific brand was found
 *      AND the request is on an admin route (where org context exists)
 *
 * Bound value can be:
 *   - integer brand_id  → BrandScope filters queries to that brand
 *   - null              → BrandScope NO-OPs ("All brands" mode)
 *   - unbound           → BrandScope NO-OPs (TenantScope still applies)
 *
 * Must run AFTER TenantMiddleware so the org context is already available.
 */
class BrandMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $brandId = $this->resolveBrandId($request);

        // Bind even when null so the SPA's "All brands" choice is explicit
        // (BrandScope checks `bound()` and treats null as "no filter").
        app()->instance('current_brand_id', $brandId);

        return $next($request);
    }

    private function resolveBrandId(Request $request): ?int
    {
        // 1. Explicit query param wins. SPA passes ?brand_id=N when a brand
        //    is selected, or ?brand_id=all (or omits it) for "All brands".
        $param = $request->query('brand_id');
        if ($param !== null && $param !== '' && $param !== 'all') {
            // Verify the brand belongs to the current org — TenantScope
            // applies because Brand uses BelongsToOrganization.
            $brand = Brand::find((int) $param);
            return $brand?->id;
        }
        if ($param === 'all') {
            return null; // explicit "all brands"
        }

        // 2. Widget token routes (Phase 2 wiring) — `/widget/{brand_token}`.
        //    Resolved here so any code path that reads current_brand_id sees
        //    the right brand without further plumbing.
        $token = $request->route('brand_token');
        if ($token) {
            $brand = Brand::withoutGlobalScopes()->where('widget_token', $token)->first();
            if ($brand) {
                // Bind the brand's org too — public widget routes don't go
                // through SaasAuthMiddleware so TenantScope wouldn't have a
                // tenant context otherwise.
                app()->instance('current_organization_id', $brand->organization_id);
                return $brand->id;
            }
        }

        // 3. Staff user pivot. If the user is restricted to a single brand,
        //    that's their context by default. Multi-brand staff stay
        //    unscoped (admin SPA must pick).
        $user = $request->user();
        if ($user && $user->user_type === 'staff') {
            $assignedIds = $user->brands()->pluck('brands.id')->all();
            if (count($assignedIds) === 1) {
                return $assignedIds[0];
            }
            // Zero rows = full access (no restriction); >1 rows = ambiguous.
        }

        // 4. No fallback to default brand here — leaving it unbound means
        //    BrandScope no-ops. That is the correct behaviour for org-level
        //    pages (Members, Guests, etc.) and for endpoints that don't
        //    care about brand. Brand-scoped pages always pass ?brand_id.
        return null;
    }
}
