<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    /**
     * The member's code, the link to share and what their referrals earned. Release 7 (spec 2026-10-25 §4.5): a venue
     * with referrals off answers `enabled: false` and no code or link to share (the history stays); `reward_on` says
     * when both are rewarded (`first_visit`: at the friend's first visit; `signup`: when they join) and the two
     * bonuses say how much.
     */
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('referrals.referee.user')->firstOrFail();
        $options = ProgrammeOptions::for((int) $member->organization_id);
        $enabled = (bool) $options['referral_enabled'];

        return response()->json([
            'enabled' => $enabled,
            'reward_on' => $options['referral_reward_on'],
            'referrer_bonus_points' => $enabled ? (int) $options['referrer_bonus_points'] : 0,
            'referee_bonus_points' => $enabled ? (int) $options['referee_bonus_points'] : 0,
            'referral_code' => $enabled ? $member->referral_code : null,
            'referral_link' => $enabled ? $this->referralLink($member) : null,
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
