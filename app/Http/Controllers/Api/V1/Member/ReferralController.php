<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('referrals.referee.user')->firstOrFail();

        return response()->json([
            'referral_code' => $member->referral_code,
            'referral_link' => config('app.url') . '/join?ref=' . $member->referral_code,
            'total_referrals' => $member->referrals()->count(),
            'rewarded_referrals' => $member->referrals()->where('status', 'rewarded')->count(),
            'total_points_earned' => $member->referrals()->sum('referrer_points_awarded'),
            'referrals' => $member->referrals()->with('referee.user:id,name,email')->orderByDesc('created_at')->get(),
        ]);
    }
}
