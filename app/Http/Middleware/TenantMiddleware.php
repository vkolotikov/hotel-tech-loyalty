<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the current organization from the authenticated user
 * and binds it to the container so TenantScope can pick it up.
 */
class TenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $orgId = null;

        // 1. From SaaS JWT (set by SaasAuthMiddleware)
        $saasOrgId = $request->attributes->get('saas_org_id');
        if ($saasOrgId) {
            // SaaS org IDs are CUIDs — look up local organization by saas_org_id
            $org = \App\Models\Organization::where('saas_org_id', $saasOrgId)->first();
            if ($org) {
                $orgId = $org->id;
            }
        }

        // 2. From authenticated user's organization_id
        if (!$orgId && $request->user() && $request->user()->organization_id) {
            $orgId = $request->user()->organization_id;
        }

        // Bind to container for TenantScope
        app()->instance('current_organization_id', $orgId);

        return $next($request);
    }
}
