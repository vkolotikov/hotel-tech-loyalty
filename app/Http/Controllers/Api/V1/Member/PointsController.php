<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PointsController extends Controller
{
    public function balance(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('tier')->firstOrFail();

        return response()->json([
            'current_points'  => $member->current_points,
            'lifetime_points' => $member->lifetime_points,
            'tier'            => $member->tier,
            'expiry_date'     => $member->points_expiry_date,
            'progress'        => $member->getProgressToNextTier(),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;

        $transactions = $member->pointsTransactions()
            ->orderByDesc('created_at')
            ->paginate($request->get('per_page', 20));

        return response()->json($transactions);
    }
}
