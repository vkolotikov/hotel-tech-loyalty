<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\WalletConfig;
use App\Services\AppleWalletService;
use App\Services\GoogleWalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Member-facing Wallet pass endpoints.
 *
 *   GET /v1/member/card/apple-wallet   → binary .pkpass response.
 *                                        iOS Safari/Mail/Wallet opens it.
 *   GET /v1/member/card/google-wallet  → { saveUrl: "https://pay.google..." }
 *                                        Member taps → Google Wallet adds it.
 *
 * Both endpoints 503 with a clear message when their respective
 * config isn't ready, so the mobile UI can grey-out the button
 * with the right hint.
 */
class WalletPassController extends Controller
{
    /**
     * Industry Platform Plan Phase 8 — gate wallet pass endpoints
     * on the org's industry having a loyalty program. Medical orgs
     * (decision #5: no patient loyalty) get a 404 with a clear
     * message — the mobile app then hides the "Add to Wallet"
     * button entirely. Hotel / beauty / restaurant / settings-only
     * industries all have hasLoyalty=true so they fall through.
     */
    private function requireLoyalty(\App\Models\LoyaltyMember $member): ?JsonResponse
    {
        $industry = $member->organization?->resolved_industry
            ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile = app(\App\Services\IndustryPrompts\IndustryPromptService::class)->for($industry);
        if ($profile->hasLoyalty) return null;
        return response()->json([
            'message' => 'Wallet passes are not available for this industry.',
            'reason'  => 'no_loyalty_program',
        ], 404);
    }

    /**
     * How long a wallet download nonce stays valid. Long enough to survive the
     * app→Safari handoff on a slow device, short enough that a leaked log line
     * is worthless by the time anyone reads it.
     */
    private const PASS_NONCE_TTL = 120;

    private const PASS_NONCE_PREFIX = 'wallet_pass_nonce:';

    /**
     * GET /v1/member/card/apple-wallet/link — mint a one-time download URL.
     *
     * Authenticated normally (Bearer header), so nothing sensitive is ever put
     * in a URL. Returns a URL carrying a single-use nonce that `apple()` below
     * exchanges for the pass.
     *
     * WHY: the mobile app used to open
     *   /v1/member/card/apple-wallet?token=<the member's Sanctum token>
     * in Safari, because a Safari navigation cannot carry an Authorization
     * header. That put a LONG-LIVED bearer token — these do not expire — into
     * the query string, where it is written to web-server access logs, Safari
     * history, and any proxy or CDN in between. One leaked log line is
     * permanent access to that member's account.
     *
     * The nonce is single-use (Cache::pull is get-and-delete) and expires in
     * two minutes, so the same exposure is worth nothing.
     */
    public function appleLink(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Authentication required.');
        }

        $member = $user->loyaltyMember()->withoutGlobalScopes()->first();
        if (!$member) {
            abort(404, 'No loyalty membership on this account.');
        }

        $nonce = bin2hex(random_bytes(32));
        Cache::put(self::PASS_NONCE_PREFIX . $nonce, $user->id, self::PASS_NONCE_TTL);

        return response()->json([
            'url'        => url('/api/v1/member/card/apple-wallet?pass=' . $nonce),
            'expires_in' => self::PASS_NONCE_TTL,
        ]);
    }

    public function apple(Request $request, AppleWalletService $apple): Response
    {
        // Manual auth — this route is public so it can be reached via a Safari
        // navigation, which cannot carry an Authorization header. The org
        // context is re-bound manually below for scoped queries downstream.
        $user = $request->user();

        if (!$user) {
            // Preferred: a single-use nonce minted by appleLink(). Cache::pull
            // is get-and-delete, so a replayed URL fails even inside the TTL.
            $nonce = (string) $request->query('pass', '');
            if ($nonce !== '') {
                $userId = Cache::pull(self::PASS_NONCE_PREFIX . $nonce);
                $user = $userId ? \App\Models\User::withoutGlobalScopes()->find($userId) : null;
                if (!$user) {
                    abort(401, 'This download link has expired. Please try again from the app.');
                }
            }
        }

        if (!$user) {
            // DEPRECATED: raw Sanctum token in the query string. Kept only
            // because the builds already installed from the stores (member
            // 1.1.0) send it, and removing it would break "Add to Wallet" for
            // every existing user until they update. Remove once those builds
            // are retired — see the ?pass= path above.
            $tokenString = (string) $request->query('token', '');
            if ($tokenString === '') abort(401, 'Token required.');
            $token = PersonalAccessToken::findToken($tokenString);
            $user = $token?->tokenable;
            if (!$user) abort(401, 'Invalid or expired token.');
        }

        $member = $user->loyaltyMember()->withoutGlobalScopes()->first();
        if (!$member) abort(404, 'No loyalty membership on this account.');

        if ($member->organization_id) {
            app()->instance('current_organization_id', $member->organization_id);
        }

        // Phase 8 — medical orgs (hasLoyalty=false) get a 404 with
        // explicit reason so the mobile app can hide the button.
        if ($gate = $this->requireLoyalty($member)) return $gate;

        $config = WalletConfig::where('organization_id', $member->organization_id)->first();
        if (!$config || !$config->appleReady()) {
            return response()->json([
                'message' => 'Apple Wallet is not enabled for this workspace yet.',
            ], 503);
        }

        try {
            $binary = $apple->generate($member, $config);
        } catch (\Throwable $e) {
            \Log::error('Apple Wallet generation failed', [
                'member_id' => $member->id,
                'error'     => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Could not generate pass — please try again.'], 500);
        }

        $filename = 'loyalty-' . ($member->member_number ?: $member->id) . '.pkpass';
        return response($binary, 200)
            ->header('Content-Type', 'application/vnd.apple.pkpass')
            ->header('Content-Disposition', 'attachment; filename="' . $filename . '"')
            ->header('Cache-Control', 'no-store');
    }

    public function google(Request $request, GoogleWalletService $google): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) abort(404, 'No loyalty membership on this account.');

        // Phase 8 — same hasLoyalty gate as Apple.
        if ($gate = $this->requireLoyalty($member)) return $gate;

        $config = WalletConfig::where('organization_id', $member->organization_id)->first();
        if (!$config || !$config->googleReady()) {
            return response()->json([
                'message' => 'Google Wallet is not enabled for this workspace yet.',
            ], 503);
        }

        try {
            $url = $google->buildSaveUrl($member, $config);
        } catch (\Throwable $e) {
            \Log::error('Google Wallet generation failed', [
                'member_id' => $member->id,
                'error'     => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Could not generate Wallet link — please try again.'], 500);
        }

        return response()->json(['saveUrl' => $url]);
    }
}
