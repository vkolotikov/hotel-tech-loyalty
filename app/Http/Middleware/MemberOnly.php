<?php

namespace App\Http\Middleware;

use App\Models\HotelSetting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The member portal's door.
 *
 * Several member endpoints answer 500 to a staff token because they read a
 * loyalty_member row that does not exist; the portal prefix refuses at the
 * door instead. It also honours the venue's switch: a portal that is off
 * answers the same 403 on every route, so the SPA can show one page.
 */
class MemberOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user || $user->user_type !== 'member') {
            return response()->json([
                'error'   => 'member_only',
                'message' => 'This area is for members of the venue.',
            ], 403);
        }

        $enabled = HotelSetting::getValue('portal_enabled', true);
        if (!filter_var($enabled, FILTER_VALIDATE_BOOLEAN)) {
            return response()->json([
                'error'   => 'portal_disabled',
                'message' => 'The member portal is switched off for this venue.',
            ], 403);
        }

        return $next($request);
    }
}
