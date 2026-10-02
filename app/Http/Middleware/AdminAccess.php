<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Models\Staff;
use App\Support\AdminAccess\AccessMap;
use App\Support\AdminAccess\AccessRecorder;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Symfony\Component\HttpFoundation\Response;

/**
 * Says no on the server where only the menu said it before (Part C spec §5).
 * Runs on every /v1/admin route, after `admin` and before
 * `check.subscription`, and on four staff routes outside it. It decides in
 * this order:
 *
 *   1. a platform admin passes (the operator escape hatch RequireFeature and
 *      RequireStaffCapability already have);
 *   2. the route's rule comes from AccessMap;
 *   3. an organisation on the Appointments plan reaches only the workspace
 *      and the caller's own account: anything else is 403 not_in_plan, in
 *      every mode;
 *   4. the caller needs an active staff row in THIS organisation, else
 *      staff_inactive;
 *   5. the rule for the method (GET/HEAD read, anything else change) must be
 *      met, else not_allowed.
 *
 * Steps 4 and 5 refuse only when config('admin_access.mode') is `enforce`.
 * In report mode (the default) they record and let the call through. Every
 * refusal, made or not, is recorded (AccessRecorder). The route's own
 * middleware (staff.can, feature, workspace, admin:role) and the
 * controllers' own checks still run after this one.
 */
class AdminAccess
{
    private const MESSAGES = [
        'not_in_plan'    => "This is not part of your organisation's HexaTech plan.",
        'staff_inactive' => 'Your access to this organisation has been switched off. Ask an owner or a manager.',
        'not_allowed'    => 'Only an owner or a manager can do this.',
        'no_capability'  => 'Your account does not have permission for this.',
    ];

    public function __construct(private readonly AccessRecorder $recorder)
    {
    }

    /** Whether the role and deactivation rules refuse (enforce) or only record (report, the default). */
    public static function enforcing(): bool
    {
        return config('admin_access.mode') === 'enforce';
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $route = $request->route();
        // Authentication already refused an anonymous caller; a platform admin is the operator.
        if (!$user || !$route instanceof Route || $user->isPlatformAdmin()) {
            return $next($request);
        }

        $rule = AccessMap::ruleFor($route);
        $method = $request->method();
        $need = $rule->forMethod($method);
        $bound = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $orgId = $bound ? (int) $bound : null;

        if (!in_array($rule->product, AccessMap::PLAN_PRODUCTS, true) && Organization::isAppointmentsOnly($orgId)) {
            $this->recorder->record($orgId, (int) $user->id, null, $rule->key, $method, 'not_in_plan', true);

            return $this->refusal('not_in_plan', 'not_in_plan');
        }

        // Tenant-scoped (TenantScope): this organisation's row, never another one's; an active one first.
        $staff = Staff::where('user_id', $user->id)->orderByDesc('is_active')->first();
        $reason = match (true) {
            $staff === null || !$staff->is_active => 'staff_inactive',
            !self::meets($staff, $need)           => 'not_allowed',
            default                               => null,
        };
        if ($reason === null) {
            return $next($request);
        }

        $enforce = self::enforcing();
        $this->recorder->record($orgId, (int) $user->id, $staff?->role, $rule->key, $method, $reason, $enforce);
        if (!$enforce) {
            return $next($request);
        }

        return $this->refusal($reason, $reason === 'not_allowed' && !in_array($need, ['staff', 'manager'], true) ? 'no_capability' : $reason);
    }

    /** Managers meet every rule; anyone active meets `staff`; a capability rule also admits staff whose flag is set. */
    private static function meets(Staff $staff, string $need): bool
    {
        if ($need === 'staff' || in_array($staff->role, AccessMap::MANAGER_ROLES, true)) {
            return true;
        }

        return $need !== 'manager' && (bool) $staff->getAttribute($need);
    }

    private function refusal(string $code, string $message): Response
    {
        return response()->json(['error' => $code, 'message' => self::MESSAGES[$message]], 403);
    }
}
