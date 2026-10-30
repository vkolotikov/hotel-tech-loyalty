<?php

namespace App\Services\Wallet;

use App\Models\WalletConfig;

final class Credentials
{
    /** Strict issuance preflight. A readable certificate is not necessarily the configured Pass Type certificate. */
    public function appleProblem(WalletConfig $config): ?string
    {
        try {
            $parts = [];
            if (!@openssl_pkcs12_read($config->fileBytes('apple_cert') ?? '', $parts, (string) $config->apple_cert_password)) return 'apple_certificate_unreadable';
            $cert = @openssl_x509_parse($parts['cert']);
            $wwdr = $config->fileBytes('apple_wwdr') ?? '';
            $intermediate = @openssl_x509_parse($wwdr);
            if (!$cert || !$intermediate || !@openssl_x509_check_private_key($parts['cert'], $parts['pkey'])) return 'apple_certificate_invalid';
            foreach ([$cert, $intermediate] as $item) {
                if (($item['validFrom_time_t'] ?? PHP_INT_MAX) > time() || ($item['validTo_time_t'] ?? 0) <= time()) return 'apple_certificate_expired';
            }
            $subject = $cert['subject'] ?? [];
            if (($subject['UID'] ?? '') !== $config->apple_pass_type_id || ($subject['OU'] ?? '') !== $config->apple_team_id) return 'apple_certificate_identity';
            $public = @openssl_pkey_get_public($wwdr);
            if (!$public || @openssl_x509_verify($parts['cert'], $public) !== 1) return 'apple_certificate_chain';
            return null;
        } catch (\Throwable) {
            return 'apple_certificate_invalid';
        } finally {
            while (openssl_error_string() !== false) {}
        }
    }
}
