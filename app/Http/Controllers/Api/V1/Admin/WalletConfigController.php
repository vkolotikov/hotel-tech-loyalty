<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\WalletConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Admin endpoints for Wallet pass config:
 *   GET    /v1/admin/wallet-config
 *   PUT    /v1/admin/wallet-config          — text + color fields
 *   POST   /v1/admin/wallet-config/apple-cert        — multipart .p12 upload
 *   POST   /v1/admin/wallet-config/apple-wwdr        — multipart .pem upload
 *   POST   /v1/admin/wallet-config/google-service-account  — multipart .json upload
 *
 * Cert files are stored privately at storage/app/wallet/{org_id}/*
 * — never served publicly. Reading them requires going through the
 * service classes (which run inside an authenticated request and
 * resolve via Storage::disk('local')).
 *
 * The reads strip the cert password from the response so it's never
 * echoed back to the client — admin re-enters when they need to
 * change it.
 */
class WalletConfigController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $config = $this->getOrCreate($request);
        return response()->json(['config' => $this->shape($config)]);
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

        $config = $this->getOrCreate($request);

        // apple_cert_password explicitly: empty string means "no
        // change" (admins re-load the page without re-entering the
        // password). Pass null to clear.
        if (array_key_exists('apple_cert_password', $data) && $data['apple_cert_password'] === '') {
            unset($data['apple_cert_password']);
        }

        $config->fill($data)->save();

        AuditLog::record('wallet_config_updated', $config,
            ['fields' => array_keys($data)], [],
            $request->user(), 'Wallet config updated');

        return response()->json(['config' => $this->shape($config->fresh())]);
    }

    public function uploadAppleCert(Request $request): JsonResponse
    {
        $request->validate([
            'file'     => 'required|file|max:200', // KB; .p12 should be tiny
            'password' => 'sometimes|nullable|string|max:255',
        ]);
        $config = $this->getOrCreate($request);
        $path = $this->storeWalletFile($request->file('file'), $config->organization_id, 'apple-cert.p12');
        $update = ['apple_cert_path' => $path];
        if ($request->filled('password')) $update['apple_cert_password'] = $request->input('password');
        $config->fill($update)->save();

        AuditLog::record('wallet_apple_cert_uploaded', $config,
            ['filename' => $request->file('file')->getClientOriginalName()], [],
            $request->user(), 'Apple Pass Type ID cert uploaded');

        return response()->json(['config' => $this->shape($config->fresh())]);
    }

    public function uploadAppleWwdr(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:200']);
        $config = $this->getOrCreate($request);
        $path = $this->storeWalletFile($request->file('file'), $config->organization_id, 'apple-wwdr.pem');
        $config->update(['apple_wwdr_path' => $path]);

        AuditLog::record('wallet_apple_wwdr_uploaded', $config,
            ['filename' => $request->file('file')->getClientOriginalName()], [],
            $request->user(), 'Apple WWDR cert uploaded');

        return response()->json(['config' => $this->shape($config->fresh())]);
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

        $path = $this->storeWalletFile($request->file('file'), $config->organization_id, 'google-service-account.json');
        $config->update(['google_service_account_path' => $path]);

        AuditLog::record('wallet_google_sa_uploaded', $config,
            ['client_email' => $json['client_email']], [],
            $request->user(), 'Google Wallet service account uploaded');

        return response()->json(['config' => $this->shape($config->fresh())]);
    }

    private function getOrCreate(Request $request): WalletConfig
    {
        $orgId = $request->user()->organization_id;
        return WalletConfig::firstOrCreate(['organization_id' => $orgId]);
    }

    private function storeWalletFile(UploadedFile $file, int $orgId, string $filename): string
    {
        $dir = "wallet/{$orgId}";
        $path = "$dir/$filename";
        Storage::disk('local')->putFileAs($dir, $file, $filename);
        return $path;
    }

    private function shape(WalletConfig $config): array
    {
        // Mask the password — admins re-enter when changing. Echo
        // back booleans for "cert is uploaded" so the UI can render
        // a confirmation row without exposing the path.
        return [
            'apple_pass_type_id'           => $config->apple_pass_type_id,
            'apple_team_id'                => $config->apple_team_id,
            'apple_organization_name'      => $config->apple_organization_name,
            'apple_pass_background_color'  => $config->apple_pass_background_color,
            'apple_pass_foreground_color'  => $config->apple_pass_foreground_color,
            'apple_pass_label_color'       => $config->apple_pass_label_color,
            'apple_cert_uploaded'          => !empty($config->apple_cert_path),
            'apple_cert_password_set'      => !empty($config->getAttributes()['apple_cert_password']),
            'apple_wwdr_uploaded'          => !empty($config->apple_wwdr_path),
            'apple_ready'                  => $config->appleReady(),
            'google_issuer_id'             => $config->google_issuer_id,
            'google_class_suffix'          => $config->google_class_suffix,
            'google_service_account_uploaded' => !empty($config->google_service_account_path),
            'google_ready'                 => $config->googleReady(),
            'is_active'                    => (bool) $config->is_active,
        ];
    }
}
