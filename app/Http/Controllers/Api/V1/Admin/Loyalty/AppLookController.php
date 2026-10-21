<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\AppLook;
use App\Services\Loyalty\LoyaltyAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member app's look (release 2 §7): every staff member may read it (the apps' public theme answer says the same
 * to anyone), a manager changes it (`admin/loyalty/app-look`: staff / manager). The writes are AppLook's, in the full
 * admin's keys and format. Field errors are Laravel's 422 (`colors.primary`, `radius`, `logo`).
 */
class AppLookController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['look' => AppLook::read(), 'options' => AppLook::options()]);
    }

    /** The whole look at once, as the form holds it. */
    public function update(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(AppLook::rules());

        return response()->json(['look' => AppLook::save($data, $request->user())]);
    }

    /** Multipart `logo`: upload or replace. */
    public function logo(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(AppLook::logoRules());

        return response()->json(['logo_url' => AppLook::setLogo($data['logo'], $request->user())]);
    }
}
