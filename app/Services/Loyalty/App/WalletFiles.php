<?php

namespace App\Services\Loyalty\App;

/**
 * What HexaTech Loyalty checks in a wallet file before WalletSettings stores it (release 2 §7): the file's kind read
 * from its content, not its name, and that the server can use it the way the pass builders will (AppleWalletService
 * opens the .p12 with openssl_pkcs12_read and hands the WWDR file to openssl_pkcs7_sign, which reads PEM;
 * GoogleWalletService signs with the JSON's private key). The full admin's endpoints check none of this and keep not
 * checking it. Without the openssl extension only the shapes are checked.
 *
 * Each check answers null for a good file or the refusal code the workspace turns into its words. Nothing here logs
 * or returns what a file holds.
 */
final class WalletFiles
{
    /** A Pass Type ID certificate: PKCS#12 that opens with the password. */
    public static function appleCertProblem(string $bytes, string $password): ?string
    {
        if (!self::isPkcs12($bytes)) {
            return 'not_pkcs12';
        }

        return self::opens($bytes, $password) ? null : 'cert_unreadable';
    }

    /**
     * Whether a .p12 opens with the password on this server. A file that does not, the pass builder cannot sign with
     * either: a wrong password, or an export in a cipher this server's OpenSSL no longer reads.
     */
    public static function opens(string $bytes, string $password): bool
    {
        if (!function_exists('openssl_pkcs12_read')) {
            return self::isPkcs12($bytes);
        }
        $parts = [];
        $ok = @openssl_pkcs12_read($bytes, $parts, $password);
        self::clearOpensslErrors();

        return $ok === true;
    }

    /**
     * Apple's WWDR intermediate certificate as PEM, which the signing step reads: a PEM file as it is, the DER `.cer`
     * Apple publishes wrapped as PEM. Null for anything that is not one X.509 certificate.
     */
    public static function wwdrPem(string $bytes): ?string
    {
        $pem = str_contains($bytes, '-----BEGIN CERTIFICATE-----')
            ? $bytes
            : ($bytes !== '' && $bytes[0] === "\x30"
                ? "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($bytes), 64, "\n") . "-----END CERTIFICATE-----\n"
                : null);
        if ($pem === null) {
            return null;
        }
        if (!function_exists('openssl_x509_read')) {
            return str_contains($bytes, '-----BEGIN CERTIFICATE-----') ? $pem : null;
        }
        $certificate = @openssl_x509_read($pem);
        self::clearOpensslErrors();

        return $certificate === false ? null : $pem;
    }

    /** A Google service account key: JSON with the account's email and a private key the server can sign with. */
    public static function googleProblem(string $bytes): ?string
    {
        $json = json_decode($bytes, true);
        if (!is_array($json)) {
            return 'not_json';
        }
        $email = $json['client_email'] ?? null;
        $key = $json['private_key'] ?? null;
        if (!is_string($email) || trim($email) === '' || !is_string($key) || trim($key) === '') {
            return 'not_service_account';
        }
        if (function_exists('openssl_pkey_get_private')) {
            $private = @openssl_pkey_get_private($key);
            self::clearOpensslErrors();
            if ($private === false) {
                return 'not_service_account';
            }
        }

        return null;
    }

    /**
     * PKCS#12's outer shape: an ASN.1 SEQUENCE (DER, or BER of indefinite length as some tools write it) whose first
     * element is the version, INTEGER 3.
     */
    public static function isPkcs12(string $bytes): bool
    {
        if (strlen($bytes) < 8 || $bytes[0] !== "\x30") {
            return false;
        }
        $length = ord($bytes[1]);
        $at = 2;
        if ($length !== 0x80 && ($length & 0x80)) {
            $octets = $length & 0x7f;
            if ($octets < 1 || $octets > 4) {
                return false;
            }
            $at += $octets;
        }

        return substr($bytes, $at, 3) === "\x02\x01\x03";
    }

    /** OpenSSL keeps failures in a queue a later call would read as its own. */
    private static function clearOpensslErrors(): void
    {
        if (function_exists('openssl_error_string')) {
            while (openssl_error_string() !== false) {
            }
        }
    }
}
