<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware for a workspace beside the full admin: `workspace:appointments`.
 *
 * The switch is `organizations.settings.workspaces.<name>.enabled`, set by
 * an operator (`php artisan workspace:appointments`); absent means the
 * workspace's default (Organization::WORKSPACE_DEFAULTS — on for the
 * appointments workspace). Off answers 403 `workspace_disabled`. It runs after `tenant`, `admin` and
 * `check.subscription`: the organisation is bound, the caller is staff, and
 * the subscription rule is the admin group's own.
 */
class RequireWorkspace
{
    public function handle(Request $request, Closure $next, string $workspace): Response
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $org = $orgId ? Organization::find($orgId) : null;

        if (!$org || !$org->workspaceEnabled($workspace)) {
            return response()->json([
                'error'   => 'workspace_disabled',
                'message' => 'This workspace is not switched on for your organisation.',
            ], 403);
        }

        $request->attributes->set('workspace_org', $org);

        return $next($request);
    }
}
