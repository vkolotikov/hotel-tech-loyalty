<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponResolver;
use App\Services\MemberProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Resolves a member-typed coupon code (an offer's `code` or a reward
 * redemption's `REW-` code) into the same coupon summary the portal shows
 * for an already-claimed offer, claiming an offer on the spot when needed.
 */
class PortalCouponController extends Controller
{
    public function resolve(Request $request, CouponResolver $resolver, MemberProvisioner $provisioner): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|min:2|max:32']);

        $member = $provisioner->ensureForUser($request->user());
        if (!$member) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }

        try {
            return response()->json($resolver->resolveCode($member, $data['code']));
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
    }
}
