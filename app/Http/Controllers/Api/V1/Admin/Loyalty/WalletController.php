<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\WalletConfig;
use App\Services\Loyalty\App\WalletFiles;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\WalletSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

/**
 * The wallet pass (release 2 §7), a manager's (`admin/loyalty/wallet`), behind the plan's `wallet` feature (the route
 * answers 402 `feature_locked` without it). The writes are WalletSettings', the full admin's own; the workspace checks
 * more first, so what it stores can be used:
 *
 * - colours in the form Apple's pass.json reads (AppleWalletService passes them on as stored): `rgb(r, g, b)`, each
 *   0–255, stored as the full admin's defaults are written (`rgb(13,13,13)`);
 * - the identifiers' shapes: a Pass Type ID starts `pass.`, a Team ID is ten capitals or digits, a Google issuer ID
 *   is digits, a class suffix letters, digits, `.`, `_` or `-`;
 * - each file by its content (WalletFiles): a .p12 that opens with its password (sent with it, else the stored one),
 *   a WWDR certificate (Apple's DER `.cer` is stored as the PEM the signing step reads), a Google key that signs.
 *
 * The password is set only with the certificate it opens; the workspace's save never touches it. The answer is
 * WalletSettings::shape plus what each pass still lacks (`apple_missing`, `google_missing`); never a secret, a path or
 * what a file holds, and the audit rows name no file.
 */
class WalletController extends Controller
{
    private const RGB = '/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/';
    private const COLORS = ['apple_pass_background_color', 'apple_pass_foreground_color', 'apple_pass_label_color'];

    public function show(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $config = WalletSettings::for((int) app('current_organization_id'));
        if ($config->wasRecentlyCreated) {
            // A row just made carries the columns' defaults only once read back.
            $config->refresh();
        }

        return $this->answer($config);
    }

    public function update(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        if ($request->filled('apple_team_id')) {
            $request->merge(['apple_team_id' => strtoupper(trim((string) $request->input('apple_team_id')))]);
        }
        $colour = ['sometimes', 'string', 'max:32', function (string $attribute, mixed $value, \Closure $fail) {
            if (!is_string($value) || self::rgb($value) === null) {
                $fail('Write the colour as rgb(r, g, b), each part 0 to 255.');
            }
        }];
        $data = $request->validate([
            'apple_pass_type_id'          => ['sometimes', 'nullable', 'string', 'max:191', 'regex:/^pass\.[A-Za-z0-9][A-Za-z0-9.\-]*$/'],
            'apple_team_id'               => ['sometimes', 'nullable', 'string', 'regex:/^[A-Z0-9]{10}$/'],
            'apple_organization_name'     => ['sometimes', 'nullable', 'string', 'max:191'],
            'apple_pass_background_color' => $colour,
            'apple_pass_foreground_color' => $colour,
            'apple_pass_label_color'      => $colour,
            'google_issuer_id'            => ['sometimes', 'nullable', 'string', 'max:64', 'regex:/^\d+$/'],
            'google_class_suffix'         => ['sometimes', 'nullable', 'string', 'max:191', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'is_active'                   => ['sometimes', 'boolean'],
        ]);
        foreach (self::COLORS as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = self::rgb($data[$field]);
            }
        }

        $config = WalletSettings::update($this->config(), $data, $request->user());

        return $this->answer($config);
    }

    /** Multipart `file` (the .p12) and `password` (optional: without it, the stored one must open the file). */
    public function appleCert(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $request->validate(['file' => 'required|file|max:200', 'password' => 'sometimes|nullable|string|max:255']);
        $config = $this->config();
        $password = $request->filled('password') ? (string) $request->input('password') : null;

        $problem = WalletFiles::appleCertProblem($this->bytes($request->file('file')), $password ?? (string) ($config->apple_cert_password ?? ''));
        if ($problem !== null) {
            throw new LoyaltyRefused($problem, $problem === 'not_pkcs12' ? 'This is not a .p12 certificate.' : 'The certificate does not open with this password.');
        }

        return $this->answer(WalletSettings::storeAppleCert($config, $request->file('file'), $password, $request->user(), ['source' => 'loyalty_workspace']));
    }

    public function appleWwdr(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $request->validate(['file' => 'required|file|max:200']);

        $pem = WalletFiles::wwdrPem($this->bytes($request->file('file')))
            ?? throw new LoyaltyRefused('not_certificate', 'This is not a certificate.');

        return $this->answer(WalletSettings::storeAppleWwdr($this->config(), $pem, $request->user(), ['source' => 'loyalty_workspace']));
    }

    public function googleServiceAccount(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $request->validate(['file' => 'required|file|max:200']);

        $problem = WalletFiles::googleProblem($this->bytes($request->file('file')));
        if ($problem !== null) {
            throw new LoyaltyRefused($problem, $problem === 'not_json' ? 'This is not a JSON file.' : 'This is not a Google service account key.');
        }

        return $this->answer(WalletSettings::storeGoogleServiceAccount($this->config(), $request->file('file'), $request->user(), ['source' => 'loyalty_workspace']));
    }

    private function config(): WalletConfig
    {
        return WalletSettings::for((int) app('current_organization_id'));
    }

    private function answer(WalletConfig $config): JsonResponse
    {
        $missing = WalletSettings::missing($config);

        return response()->json(['wallet' => WalletSettings::shape($config) + [
            'apple_missing'  => $missing['apple'],
            'google_missing' => $missing['google'],
        ]]);
    }

    private function bytes(UploadedFile $file): string
    {
        return (string) file_get_contents($file->getRealPath());
    }

    /** `rgb(r, g, b)` with each part 0–255, written as the stored defaults are; null for anything else. */
    private static function rgb(string $value): ?string
    {
        if (!preg_match(self::RGB, $value, $m)) {
            return null;
        }
        $parts = array_map('intval', array_slice($m, 1, 3));
        foreach ($parts as $part) {
            if ($part > 255) {
                return null;
            }
        }

        return 'rgb(' . implode(',', $parts) . ')';
    }
}
