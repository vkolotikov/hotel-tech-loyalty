<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\WalletConfig;
use App\Services\AppleWalletService;
use App\Services\GoogleWalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
    public function apple(Request $request, AppleWalletService $apple): Response
    {
        // Manual auth — this route is public so it can be reached via
        // a Safari navigation (which can't carry an Authorization
        // header). Token rides in ?token=. We also skip tenant
        // middleware on this public route, so the org context is
        // re-bound manually below for any scoped queries downstream.
        $user = $request->user();
        if (!$user) {
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

        $config = WalletConfig::where('organization_id', $member->organization_id)->first();
        if (!$config || !$config->appleReady()) {
            return response()->json([
                'message' => 'Apple Wallet is not enabled for this hotel yet.',
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

        $config = WalletConfig::where('organization_id', $member->organization_id)->first();
        if (!$config || !$config->googleReady()) {
            return response()->json([
                'message' => 'Google Wallet is not enabled for this hotel yet.',
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
