<?php

namespace App\Http\Middleware;

use App\Models\Staff;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware that gates access by per-staff capability flag.
 *
 * Usage: Route::middleware('staff.can:can_manage_offers')->group(...)
 *
 * The `staff` table has carried can_award_points, can_redeem_points,
 * can_manage_offers and can_view_analytics for a long time, and TeamController
 * lets an admin set them per person — but only the points flags were ever
 * CHECKED (MemberAdminController::award/redeem). can_manage_offers and
 * can_view_analytics were stored, returned to the client, rendered in the UI as
 * if they meant something, and enforced nowhere: any authenticated staff
 * account could create, edit and delete the organisation's offers and benefits
 * regardless of what its permissions said.
 *
 * Fails CLOSED on a missing Staff row, matching the convention in
 * MemberAdminController / PlannerController / SettingsController:
 * SaasAuthMiddleware repairs missing Staff rows on every request, so a null
 * here means that repair failed too, and proceeding would grant full rights to
 * an account in an unknown permission state.
 */
class RequireStaffCapability
{
    /**
     * Capabilities this middleware is allowed to gate on. An explicit list
     * rather than a raw column read, so a typo in a route definition fails
     * loudly at request time instead of silently checking a non-existent
     * property (which would be null, i.e. permanently denied — a very
     * confusing outage).
     */
    private const CAPABILITIES = [
        'can_award_points',
        'can_redeem_points',
        'can_manage_offers',
        'can_view_analytics',
    ];

    /** Human-readable action names for the 403 body. */
    private const LABELS = [
        'can_award_points'   => 'award points',
        'can_redeem_points'  => 'redeem points',
        'can_manage_offers'  => 'manage offers and benefits',
        'can_view_analytics' => 'view analytics',
    ];

    public function handle(Request $request, Closure $next, string $capability): Response
    {
        if (!in_array($capability, self::CAPABILITIES, true)) {
            throw new \InvalidArgumentException(
                "Unknown staff capability '{$capability}' in route middleware."
            );
        }

        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'error'   => 'Unauthenticated',
                'message' => 'Authentication required.',
            ], 401);
        }

        // Platform admin bypass — same escape hatch RequireFeature uses, so
        // operator support can always act on a tenant's data.
        if (method_exists($user, 'isPlatformAdmin') && $user->isPlatformAdmin()) {
            return $next($request);
        }

        $staff = Staff::where('user_id', $user->id)->first();

        if (!$staff || !$staff->{$capability}) {
            $label = self::LABELS[$capability] ?? $capability;

            return response()->json([
                'error'      => 'permission_denied',
                'message'    => "You do not have permission to {$label}.",
                'capability' => $capability,
            ], 403);
        }

        return $next($request);
    }
}
