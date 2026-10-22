<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\WalletConfig;
use App\Services\Loyalty\WalletSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin endpoints for Wallet pass config:
 *   GET    /v1/admin/wallet-config
 *   PUT    /v1/admin/wallet-config          — text + color fields
 *   POST   /v1/admin/wallet-config/apple-cert        — multipart .p12 upload
 *   POST   /v1/admin/wallet-config/apple-wwdr        — multipart .pem upload
 *   POST   /v1/admin/wallet-config/google-service-account  — multipart .json upload
 *
 * Cert files are stored encrypted in the organisation's wallet_configs
 * row (HexaTech Loyalty release 3 §2; before it, on the local disk at
 * storage/app/wallet/{org_id}/*, which Laravel Cloud loses on every
 * deploy) — never served. Only the pass builders read them, through
 * WalletConfig::fileBytes().
 *
 * The reads strip the cert password from the response so it's never
 * echoed back to the client — admin re-enters when they need to
 * change it.
 *
 * The writes are App\Services\Loyalty\WalletSettings', which HexaTech
 * Loyalty calls too (release 2 §7); the answers are the same as before
 * the move (tests/Feature/Admin/WalletConfigEndpointsTest.php).
 */
class WalletConfigController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $config = $this->getOrCreate($request);
        return response()->json(['config' => WalletSettings::shape($config)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'apple_pass_type_id'           => 'sometimes|nullable|string|max:191',
            'apple_team_id'                => 'sometimes|nullable|string|max:32',
            'apple_organization_name'      => 'sometimes|nullable|string|max:191',
            'apple_cert_password'          => 'sometimes|nullable|string|max:255',
            'apple_pass_background_color'  => 'sometimes|string|max:32',
            'apple_pass_foreground_color'  => 'sometimes|string|max:32',
            'apple_pass_label_color'       => 'sometimes|string|max:32',
            'google_issuer_id'             => 'sometimes|nullable|string|max:64',
            'google_class_suffix'          => 'sometimes|nullable|string|max:191',
            'is_active'                    => 'sometimes|boolean',
        ]);

        $config = WalletSettings::update($this->getOrCreate($request), $data, $request->user());

        return response()->json(['config' => WalletSettings::shape($config)]);
    }

    public function uploadAppleCert(Request $request): JsonResponse
    {
        $request->validate([
            'file'     => 'required|file|max:200', // KB; .p12 should be tiny
            'password' => 'sometimes|nullable|string|max:255',
        ]);
        $config = WalletSettings::storeAppleCert(
            $this->getOrCreate($request),
            $request->file('file'),
            $request->filled('password') ? (string) $request->input('password') : null,
            $request->user(),
            ['filename' => $request->file('file')->getClientOriginalName()],
        );

        return response()->json(['config' => WalletSettings::shape($config)]);
    }

    public function uploadAppleWwdr(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:200']);
        $config = WalletSettings::storeAppleWwdr(
            $this->getOrCreate($request),
            $request->file('file'),
            $request->user(),
            ['filename' => $request->file('file')->getClientOriginalName()],
        );

        return response()->json(['config' => WalletSettings::shape($config)]);
    }

    public function uploadGoogleServiceAccount(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:200']);
        $config = $this->getOrCreate($request);

        // Sanity check — must be a valid JSON with the expected keys.
        $raw = (string) file_get_contents($request->file('file')->getRealPath());
        $json = json_decode($raw, true);
        if (!is_array($json) || empty($json['private_key']) || empty($json['client_email'])) {
            return response()->json([
                'message' => 'Uploaded file is not a valid Google service account JSON (missing private_key or client_email).',
            ], 422);
        }

        $config = WalletSettings::storeGoogleServiceAccount($config, $request->file('file'), $request->user(), ['client_email' => $json['client_email']]);

        return response()->json(['config' => WalletSettings::shape($config)]);
    }

    private function getOrCreate(Request $request): WalletConfig
    {
        return WalletSettings::for((int) $request->user()->organization_id);
    }
}
