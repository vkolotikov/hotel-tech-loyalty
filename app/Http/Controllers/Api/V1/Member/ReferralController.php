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
            'referral_link' => $this->referralLink($member),
            'total_referrals' => $member->referrals()->count(),
            'rewarded_referrals' => $member->referrals()->where('status', 'rewarded')->count(),
            'total_points_earned' => $member->referrals()->sum('referrer_points_awarded'),
            'referrals' => $member->referrals()->with('referee.user:id,name,email')->orderByDesc('created_at')->get(),
        ]);
    }

    /**
     * Build a referral link that actually goes somewhere.
     *
     * This used to be `config('app.url') . '/join?ref=' . $code`, and `/join`
     * is not a route — not in the SPA router, not in web.php. Every referral a
     * member has ever shared landed their friend on the SPA catch-all, i.e. the
     * staff admin login screen. The friend had no way to join, the code was
     * never applied, and neither side earned the bonus the app promised in the
     * share text.
     *
     * The real public sign-up page is `/portal/join?org={widget_token}`
     * (PortalJoin.tsx), so the referral link is that URL plus the code. The
     * token also tells the page WHICH programme is being joined — without it
     * registration 422s, because /v1/auth/register requires an org.
     *
     * Returns null rather than a broken string when either half is missing, so
     * the client can hide the share button instead of sharing a dead link.
     */
    private function referralLink(\App\Models\LoyaltyMember $member): ?string
    {
        if (!$member->referral_code) {
            return null;
        }

        // Organizations carry a denormalised widget_token kept in sync with
        // their default brand (see Brand::booted), which is what the public
        // join page resolves.
        $token = \App\Models\Organization::withoutGlobalScopes()
            ->whereKey($member->organization_id)
            ->value('widget_token');

        if (!$token) {
            return null;
        }

        // Same fallback shape as AuthController::resolveLoyaltyUrl: an unset
        // app.url in production must not silently produce a localhost link in
        // something a member forwards to a friend.
        $base = trim((string) config('app.url'));
        if (!$base && !app()->environment('production')) {
            $base = request()->getSchemeAndHttpHost();
        }
        if (!$base) {
            return null;
        }

        return rtrim($base, '/')
            . '/portal/join?org=' . urlencode($token)
            . '&ref=' . urlencode($member->referral_code);
    }
}
