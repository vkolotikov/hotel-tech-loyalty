<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Portal\PortalLinks;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The link a venue prints, shares and puts on a QR at the desk. */
class MemberPortalLinkController extends Controller
{
    public function show(Request $request, QrCodeService $qr): JsonResponse
    {
        $org = Organization::withoutGlobalScopes()->find($request->user()->organization_id);
        $token = $org?->widget_token;

        if (!$token) {
            return response()->json([
                'error'   => 'no_widget_token',
                'message' => 'This organisation has no widget token yet; save Settings once to create one.',
            ], 422);
        }

        $url = PortalLinks::join($token);
        if (!$url) {
            return response()->json([
                'error'   => 'no_app_url',
                'message' => 'APP_URL is not configured, so no absolute link can be built.',
            ], 422);
        }

        return response()->json([
            'url'       => $url,
            'claim_url' => PortalLinks::claim(),
            'qr'        => $qr->urlQrDataUri($url),
        ]);
    }
}
