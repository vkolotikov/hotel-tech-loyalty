<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ensures the authenticated user is a staff member.
 * Optionally restricts to specific roles via parameter:
 *   ->middleware('admin')          — any staff
 *   ->middleware('admin:super_admin,manager') — only those roles
 */
class AdminMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user || $user->user_type !== 'staff') {
            return response()->json([
                'error' => 'Forbidden',
                'message' => 'This endpoint requires staff access.',
            ], 403);
        }

        // If specific roles are required, check the staff record
        if (!empty($roles)) {
            $staff = \App\Models\Staff::withoutGlobalScopes()
                ->where('user_id', $user->id)
                ->first();

            if (!$staff || !in_array($staff->role, $roles, true)) {
                return response()->json([
                    'error' => 'Forbidden',
                    'message' => 'Insufficient role privileges.',
                ], 403);
            }
        }

        return $next($request);
    }
}
