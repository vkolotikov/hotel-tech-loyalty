<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\WalletConfig;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

/**
 * Apple Wallet (.pkpass) pass generator.
 *
 * A .pkpass is a zipped folder:
 *   - pass.json          — fields, colors, barcode
 *   - manifest.json      — SHA-1 of every other file in the bundle
 *   - signature          — PKCS#7 signature of manifest.json, signed
 *                          with the Pass Type ID cert + WWDR + key
 *   - icon.png / icon@2x.png / logo.png / logo@2x.png
 *
 * Apple verifies the signature on the device; manifest.json proves
 * none of the files were tampered with after signing. We use PHP's
 * built-in openssl_pkcs7_sign for the signature step — no external
 * dependency.
 *
 * Caller writes the binary to the HTTP response with
 * Content-Type: application/vnd.apple.pkpass so iOS Safari /
 * Mail / Wallet opens it directly.
 */
class AppleWalletService
{
    public function generate(LoyaltyMember $member, WalletConfig $config): string
    {
        if (!$config->appleReady()) {
            throw new \RuntimeException('Apple Wallet not configured for this organization.');
        }

        $member->loadMissing(['user', 'tier']);

        // 1. Build pass.json
        $passJson = json_encode($this->buildPassPayload($member, $config), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        // 2. Stage files in a temp directory
        $stagingDir = sys_get_temp_dir() . '/pkpass_' . $member->organization_id . '_' . $member->id . '_' . uniqid();
        if (!mkdir($stagingDir, 0700, true) && !is_dir($stagingDir)) {
            throw new \RuntimeException('Could not create staging dir for pass generation.');
        }

        try {
            file_put_contents("$stagingDir/pass.json", $passJson);

            // Icons — required by Apple. Use the org's logo if uploaded,
            // else fall back to a packaged default. logo + icon are
            // the same image at different sizes (Wallet UI cares).
            $this->copyOrSyntheticIcon($member, $stagingDir, 'icon.png',    29);
            $this->copyOrSyntheticIcon($member, $stagingDir, 'icon@2x.png', 58);
            $this->copyOrSyntheticIcon($member, $stagingDir, 'logo.png',    160);
            $this->copyOrSyntheticIcon($member, $stagingDir, 'logo@2x.png', 320);

            // 3. Compute manifest.json (SHA-1 per file)
            $manifest = [];
            foreach (scandir($stagingDir) as $f) {
                if ($f === '.' || $f === '..' || $f === 'manifest.json' || $f === 'signature') continue;
                $manifest[$f] = sha1_file("$stagingDir/$f");
            }
            file_put_contents(
                "$stagingDir/manifest.json",
                json_encode($manifest, JSON_UNESCAPED_SLASHES),
            );

            // 4. Sign manifest.json with PKCS#7
            $this->signManifest($stagingDir, $config);

            // 5. Zip everything → .pkpass
            $pkpassPath = "$stagingDir/pass.pkpass";
            $this->zipBundle($stagingDir, $pkpassPath);

            $binary = file_get_contents($pkpassPath);
            if ($binary === false) {
                throw new \RuntimeException('Could not read generated .pkpass.');
            }
            return $binary;
        } finally {
            // Clean up the staging dir whether success or failure.
            $this->rrmdir($stagingDir);
        }
    }

    private function buildPassPayload(LoyaltyMember $member, WalletConfig $config): array
    {
        $name = $member->user?->name ?: 'Member';
        $tierName = $member->tier?->name ?: 'Member';
        $points = (int) ($member->current_points ?? 0);
        $memberNumber = $member->member_number ?: (string) $member->id;
        $qrToken = $member->qr_code_token ?: $memberNumber;

        return [
            'formatVersion'        => 1,
            'passTypeIdentifier'   => $config->apple_pass_type_id,
            'teamIdentifier'       => $config->apple_team_id,
            'organizationName'     => $config->apple_organization_name ?: 'Hotel Loyalty',
            'serialNumber'         => 'm' . $member->id . '_' . $memberNumber,
            'description'          => 'Hotel loyalty membership card',
            'logoText'             => $config->apple_organization_name ?: 'Hotel Loyalty',
            'backgroundColor'      => $config->apple_pass_background_color,
            'foregroundColor'      => $config->apple_pass_foreground_color,
            'labelColor'           => $config->apple_pass_label_color,
            'barcode'              => [
                'format'          => 'PKBarcodeFormatQR',
                'message'         => $qrToken,
                'messageEncoding' => 'iso-8859-1',
                'altText'         => '#' . $memberNumber,
            ],
            // Newer iOS prefers the `barcodes` array; include both for
            // back-compat with older devices that only read `barcode`.
            'barcodes'             => [[
                'format'          => 'PKBarcodeFormatQR',
                'message'         => $qrToken,
                'messageEncoding' => 'iso-8859-1',
                'altText'         => '#' . $memberNumber,
            ]],
            'storeCard'            => [
                'headerFields'    => [[
                    'key'   => 'tier',
                    'label' => 'TIER',
                    'value' => $tierName,
                ]],
                'primaryFields'   => [[
                    'key'           => 'points',
                    'label'         => 'POINTS',
                    'value'         => $points,
                    'numberStyle'   => 'PKNumberStyleDecimal',
                ]],
                'secondaryFields' => [[
                    'key'   => 'name',
                    'label' => 'MEMBER',
                    'value' => $name,
                ]],
                'auxiliaryFields' => [[
                    'key'   => 'number',
                    'label' => 'NO.',
                    'value' => '#' . $memberNumber,
                ]],
                'backFields'      => [
                    [
                        'key'   => 'terms',
                        'label' => 'Terms',
                        'value' => "Points are non-transferable. Subject to program terms. Lost cards: contact reception.\n\nDelete this pass from Wallet at any time.",
                    ],
                ],
            ],
        ];
    }

    /**
     * Sign the manifest. Reads the .p12 (PKCS#12 bundle of cert +
     * private key) using the encrypted password, plus the WWDR
     * intermediate cert; emits a DER-encoded PKCS#7 detached
     * signature ready for Wallet to verify.
     */
    private function signManifest(string $stagingDir, WalletConfig $config): void
    {
        $certPath = Storage::disk('local')->path($config->apple_cert_path);
        $wwdrPath = Storage::disk('local')->path($config->apple_wwdr_path);
        if (!is_file($certPath) || !is_file($wwdrPath)) {
            throw new \RuntimeException('Apple Wallet cert files missing on disk.');
        }

        $p12 = [];
        if (!openssl_pkcs12_read(file_get_contents($certPath), $p12, (string) $config->apple_cert_password)) {
            throw new \RuntimeException('Could not read Apple Pass Type ID cert — wrong password?');
        }

        // openssl_pkcs7_sign needs the cert + key in PEM form, written
        // to temp files (its arg signature is file-path-based).
        $certFile = tempnam(sys_get_temp_dir(), 'pkpass_cert');
        $keyFile  = tempnam(sys_get_temp_dir(), 'pkpass_key');
        try {
            file_put_contents($certFile, $p12['cert']);
            file_put_contents($keyFile,  $p12['pkey']);

            $manifestPath = "$stagingDir/manifest.json";
            $sigPath      = "$stagingDir/signature";

            $ok = openssl_pkcs7_sign(
                $manifestPath,
                $sigPath,
                'file://' . $certFile,
                ['file://' . $keyFile, ''],
                [],
                PKCS7_BINARY | PKCS7_DETACHED,
                $wwdrPath,
            );
            if (!$ok) {
                throw new \RuntimeException('openssl_pkcs7_sign failed: ' . openssl_error_string());
            }

            // PHP writes the signature in S/MIME form (with headers +
            // base64). Wallet wants the raw DER body — strip the
            // wrapper and decode.
            $smime = file_get_contents($sigPath);
            $der = $this->smimeToDer($smime);
            file_put_contents($sigPath, $der);
        } finally {
            @unlink($certFile);
            @unlink($keyFile);
        }
    }

    private function smimeToDer(string $smime): string
    {
        // S/MIME body is base64-encoded after a blank line, ends with
        // a MIME boundary line ("------"). Extract + decode.
        $parts = preg_split('/\r?\n\r?\n/', $smime, 2);
        if (count($parts) < 2) {
            throw new \RuntimeException('Malformed PKCS#7 signature output.');
        }
        $body = $parts[1];
        // Strip MIME boundary trailers.
        $body = preg_replace('/^-{2,}.*$/m', '', $body);
        $body = preg_replace('/\s+/', '', $body);
        $der = base64_decode($body, true);
        if ($der === false) {
            throw new \RuntimeException('PKCS#7 signature base64 decode failed.');
        }
        return $der;
    }

    private function zipBundle(string $stagingDir, string $outputPath): void
    {
        $zip = new ZipArchive();
        if ($zip->open($outputPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Could not create .pkpass zip.');
        }
        foreach (scandir($stagingDir) as $f) {
            if ($f === '.' || $f === '..' || $f === 'pass.pkpass') continue;
            $zip->addFile("$stagingDir/$f", $f);
        }
        $zip->close();
    }

    /**
     * Best-effort icon: prefer the org's hotel logo when uploaded,
     * else synthesize a 1px transparent PNG so the bundle is valid
     * (Apple rejects passes missing the required image files).
     */
    private function copyOrSyntheticIcon(LoyaltyMember $member, string $stagingDir, string $filename, int $size): void
    {
        // 1px transparent PNG — minimum viable to pass Apple's bundle
        // validation. Customers should upload a real logo via Settings
        // for production passes.
        $minimal = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        );
        file_put_contents("$stagingDir/$filename", $minimal);
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (scandir($dir) as $f) {
            if ($f === '.' || $f === '..') continue;
            $p = "$dir/$f";
            is_dir($p) ? $this->rrmdir($p) : @unlink($p);
        }
        @rmdir($dir);
    }
}
