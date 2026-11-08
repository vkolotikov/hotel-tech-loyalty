<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware for the AI capture (`crm-ai/capture-lead|member|corporate|guest`): reading a pasted message into a
 * form that a person then checks and saves.
 *
 * Owner, 2026-11-08: "add ai capture in leads and deals for any staff member". The capture is open to an organisation
 * whose HexaTech CRM workspace is on (every CRM customer, whatever its package, and every full customer that has not
 * switched the workspace off), and, as before, to a plan with the staff AI (`admin_ai`). Who may call it is the
 * AccessMap's `admin/crm-ai` (staff, product `crm`); what it costs is the month's AI allowance, which the controller
 * checks before the provider is asked and the service records after. The rest of `crm-ai/*` (the staff copilot's chat
 * and voice) stays behind `feature:admin_ai`.
 *
 * The refusals are RequireFeature's: 403 `no_org`, 402 `subscription_inactive`, 402 `feature_locked`.
 */
class RequireAiCapture
{
    public const WORKSPACE = 'crm';

    /** Whether this organisation may use the AI capture (the CRM's bootstrap reads the same answer). */
    public static function allows(?Organization $org, ?User $user = null): bool
    {
        if ($user && method_exists($user, 'isPlatformAdmin') && $user->isPlatformAdmin()) {
            return true;
        }
        if (!$org) {
            return false;
        }

        return $org->hasFeature('admin_ai') || $org->workspaceEnabled(self::WORKSPACE);
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::user();
        if ($user && method_exists($user, 'isPlatformAdmin') && $user->isPlatformAdmin()) {
            return $next($request);
        }

        $org = $user?->organization;
        if (!$org) {
            return response()->json(['error' => 'No organization context', 'code' => 'no_org'], 403);
        }

        if (!$org->hasActiveSubscription()) {
            return response()->json([
                'error' => 'Your subscription is inactive. Visit billing to choose a plan.',
                'code'  => 'subscription_inactive',
                'plan'  => $org->plan_slug,
            ], 402);
        }

        if (!self::allows($org, $user)) {
            return response()->json([
                'error'       => 'Your current plan does not include this feature (admin_ai).',
                'code'        => 'feature_locked',
                'feature'     => 'admin_ai',
                'plan'        => $org->plan_slug,
                'upgrade_url' => 'https://saas.hotel-tech.ai/admin/subscription',
            ], 402);
        }

        return $next($request);
    }
}
