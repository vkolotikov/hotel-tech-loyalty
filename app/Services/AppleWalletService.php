<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\WalletConfig;
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

        // Phase 8 reviewer fix — added `organization` to the
        // eager-load list. buildPassPayload reads the org's industry
        // to flex pass copy; without this, the lazy BelongsTo
        // triggers one extra query per pass generation.
        $member->loadMissing(['user', 'tier', 'organization']);

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

        // Industry Platform Plan Phase 8 — resolve org industry so
        // pass copy reads in the org's industry's vocabulary. Beauty
        // profile uses "Client Card"; restaurant uses "Regular Card".
        // Medical (hasLoyalty=false) never reaches this code path —
        // WalletPassController gates it at the route layer with 404.
        //
        // **Hotel behaviour change**: pre-Phase-5 hotel pass description
        // was "Hotel loyalty membership card"; Phase 5 changed it to
        // "{Org Name} membership card"; Phase 8 evolves to
        // "{Org Name} — Loyalty membership card" (em-dash + capitalised
        // "Loyalty" headline). This applies to any newly-issued or
        // refreshed pass — existing wallet passes are unaffected
        // until the user re-adds the pass or the device pings the
        // web service for an update.
        $industry = $member->organization?->resolved_industry
            ?? \App\Models\Organization::DEFAULT_INDUSTRY;
        $profile = app(\App\Services\IndustryPrompts\IndustryPromptService::class)->for($industry);
        $orgName = $member->organization?->name;
        $brandFallback = $config->apple_organization_name ?: ($orgName ?: $profile->passLabel);

        return [
            'formatVersion'        => 1,
            'passTypeIdentifier'   => $config->apple_pass_type_id,
            'teamIdentifier'       => $config->apple_team_id,
            // Phase 8 — `organizationName` shows in iOS Wallet's
            // notification + lock-screen pass entry. Prefer the
            // admin's `apple_organization_name` override, then the
            // org's display name, then a sensible industry-aware
            // fallback ("Loyalty Card" / "Client Card" / etc.).
            'organizationName'     => $brandFallback,
            'serialNumber'         => 'm' . $member->id . '_' . $memberNumber,
            // Phase 8 — description appears in iOS Wallet's pass
            // details view. Industry-aware ("Loyalty membership card"
            // / "Salon membership card" / "Restaurant membership card").
            'description'          => trim(($orgName ? $orgName . ' — ' : '') . $profile->passDescription),
            'logoText'             => $brandFallback,
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
     *
     * Both files come from the organisation's wallet_configs row
     * (HexaTech Loyalty release 3 §2: the local disk does not survive
     * a deploy on Laravel Cloud). openssl_pkcs7_sign takes its inputs
     * by file name, so the cert, the key and the WWDR cert are written
     * to temporary files readable by this process only, outside the
     * staging dir (which is zipped into the pass), and deleted in the
     * finally block whatever happens.
     */
    private function signManifest(string $stagingDir, WalletConfig $config): void
    {
        $p12Bytes = $config->fileBytes('apple_cert');
        $wwdrBytes = $config->fileBytes('apple_wwdr');
        if ($p12Bytes === null || $wwdrBytes === null) {
            throw new \RuntimeException('Apple Wallet cert files are not stored for this organization.');
        }

        $p12 = [];
        if (!openssl_pkcs12_read($p12Bytes, $p12, (string) $config->apple_cert_password)) {
            throw new \RuntimeException('Could not read Apple Pass Type ID cert — wrong password?');
        }

        // openssl_pkcs7_sign needs the cert + key in PEM form, written
        // to temp files (its arg signature is file-path-based).
        $secrets = [];
        try {
            $certFile = $secrets[] = $this->secretFile('pkpass_cert', $p12['cert']);
            $keyFile  = $secrets[] = $this->secretFile('pkpass_key', $p12['pkey']);
            $wwdrFile = $secrets[] = $this->secretFile('pkpass_wwdr', $wwdrBytes);

            $manifestPath = "$stagingDir/manifest.json";
            $sigPath      = "$stagingDir/signature";

            $ok = openssl_pkcs7_sign(
                $manifestPath,
                $sigPath,
                'file://' . $certFile,
                ['file://' . $keyFile, ''],
                [],
                PKCS7_BINARY | PKCS7_DETACHED,
                $wwdrFile,
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
            foreach ($secrets as $path) {
                @unlink($path);
            }
        }
    }

    /**
     * A temporary file in sys_get_temp_dir() holding a secret, readable
     * and writable by this process's user only (0600, set before the
     * secret is written). Removed again if the write fails; otherwise
     * the caller deletes it.
     */
    private function secretFile(string $prefix, string $contents): string
    {
        $path = tempnam(sys_get_temp_dir(), $prefix);
        if ($path === false) {
            throw new \RuntimeException('Could not create a temporary file for pass signing.');
        }
        if (!@chmod($path, 0600) || file_put_contents($path, $contents) !== strlen($contents)) {
            @unlink($path);
            throw new \RuntimeException('Could not write a temporary file for pass signing.');
        }

        return $path;
    }

    /**
     * A detached signature comes out of openssl_pkcs7_sign as
     * multipart/signed: a preamble, the signed content, then the
     * signature part (application/x-pkcs7-signature, base64). Only that
     * last part's body is the signature. (Reading everything after the
     * first blank line as base64, as this did before HexaTech Loyalty
     * release 3, took the preamble, the manifest and the part headers
     * with it, and no pass was ever produced.)
     */
    private function smimeToDer(string $smime): string
    {
        $parts = preg_split('/\r?\n\r?\n/', $smime, 2);
        if (count($parts) < 2) {
            throw new \RuntimeException('Malformed PKCS#7 signature output.');
        }
        [$headers, $body] = $parts;
        if (preg_match('/boundary="?([^"\r\n;]+)"?/i', $headers, $boundary)) {
            $signature = null;
            foreach (explode('--' . $boundary[1], $body) as $part) {
                $split = preg_split('/\r?\n\r?\n/', ltrim($part, "\r\n"), 2);
                if (count($split) === 2 && preg_match('/^Content-Type:\s*application\/(?:x-)?pkcs7-signature/im', $split[0])) {
                    $signature = $split[1];
                    break;
                }
            }
            if ($signature === null) {
                throw new \RuntimeException('Malformed PKCS#7 signature output.');
            }
            $body = $signature;
        }
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
