<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\WalletConfig;
use App\Services\Loyalty\App\WalletFiles;
use Illuminate\Http\UploadedFile;

/**
 * The wallet pass settings' one writer (release 2 §7), moved unchanged out of the full admin's WalletConfigController,
 * which calls it, and called by HexaTech Loyalty's WalletController too: one row per organisation (`wallet_configs`).
 * Since release 3 (§2, R3-1) the three files are kept in that row, encrypted (WalletConfig::putFile), not on the local
 * disk, which Laravel Cloud loses on every deploy and does not share between replicas; a new upload replaces the old
 * one, and the path columns are no longer written. The answer both sides give (`shape`) says whether each secret is
 * set — read from the row — never the secret, a path or what a file holds.
 *
 * The workspace checks more before it calls here (WalletFiles: the file's kind by its content); the full admin's
 * acceptance stays as it was (tests/Feature/Admin/WalletConfigEndpointsTest.php).
 */
final class WalletSettings
{
    /** The organisation's row, made on first use. firstOrCreate's new model carries no column default until read again. */
    public static function for(int $orgId): WalletConfig
    {
        return WalletConfig::firstOrCreate(['organization_id' => $orgId]);
    }

    /**
     * The text and colour fields, and booleans for each secret and file (a file is uploaded when the row holds it), so a
     * screen can say "uploaded" without seeing it; the password never leaves the server.
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
            'apple_cert_uploaded'             => $config->hasFile('apple_cert'),
            'apple_cert_password_set'         => !empty($config->getAttributes()['apple_cert_password']),
            'apple_wwdr_uploaded'             => $config->hasFile('apple_wwdr'),
            'apple_ready'                     => $config->appleReady(),
            'google_issuer_id'                => $config->google_issuer_id,
            'google_class_suffix'             => $config->google_class_suffix,
            'google_service_account_uploaded' => $config->hasFile('google_service_account'),
            'google_ready'                    => $config->googleReady(),
            'is_active'                       => (bool) $config->is_active,
        ];
    }

    /**
     * The text, colour and on/off fields. A blank `apple_cert_password` ('' or null) keeps the stored one, as the full
     * admin's form promises ("Leave blank to keep current"): that form sends '' on every save, and Laravel's
     * ConvertEmptyStringsToNull makes it null before it gets here, which used to clear the password and stop the
     * passes (owner, 2026-10-22). A password is replaced by a new one, or comes with a new certificate.
     * Audited `wallet_config_updated` with the field names only.
     *
     * @param array<string, mixed> $data validated fields
     */
    public static function update(WalletConfig $config, array $data, User $by): WalletConfig
    {
        if (array_key_exists('apple_cert_password', $data) && ($data['apple_cert_password'] ?? '') === '') {
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
        $bytes = self::bytes($file);
        // Replacing a protected certificate with an unprotected one must not retain an unusable old password.
        if ($password === null && !WalletFiles::opens($bytes, (string) $config->apple_cert_password) && WalletFiles::opens($bytes, '')) {
            $password = '';
        }
        $config->putFile('apple_cert', $bytes);
        if ($password !== null) {
            $config->apple_cert_password = $password === '' ? null : $password;
        }
        $config->save();

        AuditLog::record('wallet_apple_cert_uploaded', $config, $audit, [], $by, 'Apple Pass Type ID cert uploaded');

        return $config->fresh();
    }

    /** @param array<string, mixed> $audit */
    public static function storeAppleWwdr(WalletConfig $config, UploadedFile|string $file, User $by, array $audit): WalletConfig
    {
        $config->putFile('apple_wwdr', self::bytes($file))->save();

        AuditLog::record('wallet_apple_wwdr_uploaded', $config, $audit, [], $by, 'Apple WWDR cert uploaded');

        return $config->fresh();
    }

    /** @param array<string, mixed> $audit */
    public static function storeGoogleServiceAccount(WalletConfig $config, UploadedFile|string $file, User $by, array $audit): WalletConfig
    {
        $config->putFile('google_service_account', self::bytes($file))->save();

        AuditLog::record('wallet_google_sa_uploaded', $config, $audit, [], $by, 'Google Wallet service account uploaded');

        return $config->fresh();
    }

    /**
     * What stops each pass, as codes, for the workspace's readiness (release 2 §7: "ready, or exactly what is
     * missing"): the model's own conditions (appleReady / googleReady), plus what the pass builders find only when a
     * member asks for a pass — a file uploaded before release 3 whose path is named but which was gone from the disk
     * before it could be taken into the database, or one the row holds but that no longer decrypts (`*_gone`: upload
     * it again), a certificate that does not open with the stored password (a password cleared before release 2).
     *
     * @return array{apple: list<string>, google: list<string>}
     */
    public static function missing(WalletConfig $config): array
    {
        $off = $config->is_active ? [] : ['switched_off'];
        $apple = $off;
        if (!$config->apple_pass_type_id) $apple[] = 'pass_type_id';
        if (!$config->apple_team_id) $apple[] = 'team_id';
        $cert = self::file($config, 'apple_cert');
        if ($cert === null) {
            $apple[] = 'certificate';
        } elseif ($cert === false) {
            $apple[] = 'certificate_gone';
        } elseif (!WalletFiles::opens($cert, (string) ($config->apple_cert_password ?? ''))) {
            $apple[] = 'certificate_password';
        }
        $wwdr = self::file($config, 'apple_wwdr');
        if ($wwdr === null) $apple[] = 'wwdr';
        elseif ($wwdr === false) $apple[] = 'wwdr_gone';

        $google = $off;
        if (!$config->google_issuer_id) $google[] = 'issuer_id';
        if (!$config->google_class_suffix) $google[] = 'class_suffix';
        $account = self::file($config, 'google_service_account');
        if ($account === null) $google[] = 'service_account';
        elseif ($account === false) $google[] = 'service_account_gone';

        return ['apple' => $apple, 'google' => $google];
    }

    /**
     * A file's bytes from the row; null when there is none and none was ever named, false when one is named but cannot
     * be had: a pre-release-3 path whose file was not on the disk when the row was read (WalletConfig::takeLocalFiles
     * runs on every read), or content that no longer decrypts.
     */
    private static function file(WalletConfig $config, string $file): string|false|null
    {
        $bytes = $config->fileBytes($file);
        if ($bytes !== null) {
            return $bytes;
        }
        $path = $config->getAttributes()[WalletConfig::FILES[$file]['path']] ?? null;

        return $config->hasFile($file) || (is_string($path) && $path !== '') ? false : null;
    }

    private static function bytes(UploadedFile|string $file): string
    {
        return $file instanceof UploadedFile ? (string) file_get_contents($file->getRealPath()) : $file;
    }
}
