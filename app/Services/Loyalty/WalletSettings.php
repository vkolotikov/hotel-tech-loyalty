<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\WalletConfig;
use App\Services\Loyalty\App\WalletFiles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * The wallet pass settings' one writer (release 2 §7), moved unchanged out of the full admin's WalletConfigController,
 * which calls it, and called by HexaTech Loyalty's WalletController too: one row per organisation (`wallet_configs`),
 * the three files on the private local disk under `wallet/{organisation}/` with fixed names, so a new upload replaces
 * the old one. The answer both sides give (`shape`) says whether each secret is set, never the secret or a path.
 *
 * The workspace checks more before it calls here (WalletFiles: the file's kind by its content); the full admin's
 * acceptance stays as it was (tests/Feature/Admin/WalletConfigEndpointsTest.php).
 */
final class WalletSettings
{
    public const APPLE_CERT = 'apple-cert.p12';
    public const APPLE_WWDR = 'apple-wwdr.pem';
    public const GOOGLE_SERVICE_ACCOUNT = 'google-service-account.json';

    /** The organisation's row, made on first use. firstOrCreate's new model carries no column default until read again. */
    public static function for(int $orgId): WalletConfig
    {
        return WalletConfig::firstOrCreate(['organization_id' => $orgId]);
    }

    /**
     * The text and colour fields, and booleans for each secret and file, so a screen can say "uploaded" without
     * seeing the path; the password never leaves the server.
     *
     * @return array<string, mixed>
     */
    public static function shape(WalletConfig $config): array
    {
        return [
            'apple_pass_type_id'              => $config->apple_pass_type_id,
            'apple_team_id'                   => $config->apple_team_id,
            'apple_organization_name'         => $config->apple_organization_name,
            'apple_pass_background_color'     => $config->apple_pass_background_color,
            'apple_pass_foreground_color'     => $config->apple_pass_foreground_color,
            'apple_pass_label_color'          => $config->apple_pass_label_color,
            'apple_cert_uploaded'             => !empty($config->apple_cert_path),
            'apple_cert_password_set'         => !empty($config->getAttributes()['apple_cert_password']),
            'apple_wwdr_uploaded'             => !empty($config->apple_wwdr_path),
            'apple_ready'                     => $config->appleReady(),
            'google_issuer_id'                => $config->google_issuer_id,
            'google_class_suffix'             => $config->google_class_suffix,
            'google_service_account_uploaded' => !empty($config->google_service_account_path),
            'google_ready'                    => $config->googleReady(),
            'is_active'                       => (bool) $config->is_active,
        ];
    }

    /**
     * The text, colour and on/off fields. `apple_cert_password` sent as '' keeps the stored one and null clears it
     * (the full admin's rule; Laravel's ConvertEmptyStringsToNull makes an HTTP '' a null before it gets here).
     * Audited `wallet_config_updated` with the field names only.
     *
     * @param array<string, mixed> $data validated fields
     */
    public static function update(WalletConfig $config, array $data, User $by): WalletConfig
    {
        if (array_key_exists('apple_cert_password', $data) && $data['apple_cert_password'] === '') {
            unset($data['apple_cert_password']);
        }

        $config->fill($data)->save();

        AuditLog::record('wallet_config_updated', $config, ['fields' => array_keys($data)], [], $by, 'Wallet config updated');

        return $config->fresh();
    }

    /**
     * The Pass Type ID certificate (.p12), and its password when one is given (null keeps the stored one).
     *
     * @param array<string, mixed> $audit what the audit row records about the file (never its content or path)
     */
    public static function storeAppleCert(WalletConfig $config, UploadedFile|string $file, ?string $password, User $by, array $audit): WalletConfig
    {
        $update = ['apple_cert_path' => self::store($file, (int) $config->organization_id, self::APPLE_CERT)];
        if ($password !== null && $password !== '') {
            $update['apple_cert_password'] = $password;
        }
        $config->fill($update)->save();

        AuditLog::record('wallet_apple_cert_uploaded', $config, $audit, [], $by, 'Apple Pass Type ID cert uploaded');

        return $config->fresh();
    }

    /** @param array<string, mixed> $audit */
    public static function storeAppleWwdr(WalletConfig $config, UploadedFile|string $file, User $by, array $audit): WalletConfig
    {
        $config->update(['apple_wwdr_path' => self::store($file, (int) $config->organization_id, self::APPLE_WWDR)]);

        AuditLog::record('wallet_apple_wwdr_uploaded', $config, $audit, [], $by, 'Apple WWDR cert uploaded');

        return $config->fresh();
    }

    /** @param array<string, mixed> $audit */
    public static function storeGoogleServiceAccount(WalletConfig $config, UploadedFile|string $file, User $by, array $audit): WalletConfig
    {
        $config->update(['google_service_account_path' => self::store($file, (int) $config->organization_id, self::GOOGLE_SERVICE_ACCOUNT)]);

        AuditLog::record('wallet_google_sa_uploaded', $config, $audit, [], $by, 'Google Wallet service account uploaded');

        return $config->fresh();
    }

    /**
     * What stops each pass, as codes, for the workspace's readiness (release 2 §7: "ready, or exactly what is
     * missing"): the model's own conditions (appleReady / googleReady), plus what the pass builders find only when a
     * member asks for a pass — a file named but no longer on the disk, a certificate that does not open with the
     * stored password (the full admin's Save clears that password unless it is typed again).
     *
     * @return array{apple: list<string>, google: list<string>}
     */
    public static function missing(WalletConfig $config): array
    {
        $off = $config->is_active ? [] : ['switched_off'];
        $apple = $off;
        if (!$config->apple_pass_type_id) $apple[] = 'pass_type_id';
        if (!$config->apple_team_id) $apple[] = 'team_id';
        $cert = self::file($config->apple_cert_path);
        if ($cert === null) {
            $apple[] = 'certificate';
        } elseif ($cert === false) {
            $apple[] = 'certificate_gone';
        } elseif (!WalletFiles::opens($cert, (string) ($config->apple_cert_password ?? ''))) {
            $apple[] = 'certificate_password';
        }
        $wwdr = self::file($config->apple_wwdr_path);
        if ($wwdr === null) $apple[] = 'wwdr';
        elseif ($wwdr === false) $apple[] = 'wwdr_gone';

        $google = $off;
        if (!$config->google_issuer_id) $google[] = 'issuer_id';
        if (!$config->google_class_suffix) $google[] = 'class_suffix';
        $account = self::file($config->google_service_account_path);
        if ($account === null) $google[] = 'service_account';
        elseif ($account === false) $google[] = 'service_account_gone';

        return ['apple' => $apple, 'google' => $google];
    }

    /** A stored file's bytes; null when none is named, false when the named file is not on the disk. */
    private static function file(?string $path): string|false|null
    {
        if (!$path) {
            return null;
        }
        $disk = Storage::disk('local');

        return $disk->exists($path) ? (string) $disk->get($path) : false;
    }

    private static function store(UploadedFile|string $file, int $orgId, string $filename): string
    {
        $dir = "wallet/{$orgId}";
        if ($file instanceof UploadedFile) {
            Storage::disk('local')->putFileAs($dir, $file, $filename);
        } else {
            Storage::disk('local')->put("{$dir}/{$filename}", $file);
        }

        return "{$dir}/{$filename}";
    }
}
