<?php

namespace Tests\Feature\VoiceAlexa;

/**
 * Real X.509 fixtures for the Alexa signature checks, generated with OpenSSL so
 * the verifier is exercised end to end rather than mocked. Key generation is
 * the slow part, so the main set is built once per process and reused.
 */
final class AlexaCertificates
{
    public const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-test.pem';

    /** @var array<string, mixed>|null */
    private static ?array $set = null;

    /**
     * A trusted root, a valid leaf, a leaf without the echo-api SAN, and a
     * leaf issued by a root the verifier does not trust.
     *
     * @return array{rootPem:string, leafPem:string, leafKey:\OpenSSLAsymmetricKey,
     *   noSanPem:string, noSanKey:\OpenSSLAsymmetricKey, untrustedLeafPem:string,
     *   untrustedLeafKey:\OpenSSLAsymmetricKey}
     */
    public static function set(): array
    {
        if (self::$set !== null) {
            return self::$set;
        }

        $config = self::config();

        [$rootKey, $rootPem] = self::authority('Test Alexa Root', $config);
        [$leafKey, $leafPem] = self::leaf($rootPem, $rootKey, 'leaf', 30, $config);
        [$noSanKey, $noSanPem] = self::leaf($rootPem, $rootKey, 'leaf_nosan', 30, $config);

        [$otherKey, $otherPem] = self::authority('Untrusted Root', $config);
        [$untrustedLeafKey, $untrustedLeafPem] = self::leaf($otherPem, $otherKey, 'leaf', 30, $config);

        return self::$set = compact('rootPem', 'leafPem', 'leafKey', 'noSanPem', 'noSanKey',
            'untrustedLeafPem', 'untrustedLeafKey');
    }

    /**
     * A fresh root with a one-day leaf, for the expiry test. The caller trusts
     * the returned root, so only the leaf's dates can cause the rejection.
     *
     * @return array{rootPem:string, leafPem:string, leafKey:\OpenSSLAsymmetricKey}
     */
    public static function shortLived(): array
    {
        $config = self::config();
        [$rootKey, $rootPem] = self::authority('Short Lived Root', $config);
        [$leafKey, $leafPem] = self::leaf($rootPem, $rootKey, 'leaf', 1, $config);

        return compact('rootPem', 'leafPem', 'leafKey');
    }

    public static function sign(string $body, \OpenSSLAsymmetricKey $key): string
    {
        openssl_sign($body, $signature, $key, OPENSSL_ALGO_SHA256);

        return base64_encode($signature);
    }

    /** @return array{0:\OpenSSLAsymmetricKey, 1:string} */
    private static function authority(string $name, string $config): array
    {
        $key = self::key($config);
        $csr = openssl_csr_new(['commonName' => $name], $key, ['config' => $config, 'digest_alg' => 'sha256']);
        $cert = openssl_csr_sign($csr, null, $key, 365, ['config' => $config, 'digest_alg' => 'sha256',
            'x509_extensions' => 'ca'], random_int(1, PHP_INT_MAX));
        openssl_x509_export($cert, $pem);

        return [$key, $pem];
    }

    /** @return array{0:\OpenSSLAsymmetricKey, 1:string} */
    private static function leaf(string $issuerPem, \OpenSSLAsymmetricKey $issuerKey, string $section,
        int $days, string $config): array
    {
        $key = self::key($config);
        $csr = openssl_csr_new(['commonName' => 'echo-api.amazon.com'], $key, ['config' => $config, 'digest_alg' => 'sha256']);
        $cert = openssl_csr_sign($csr, $issuerPem, $issuerKey, $days, ['config' => $config,
            'digest_alg' => 'sha256', 'x509_extensions' => $section], random_int(1, PHP_INT_MAX));
        openssl_x509_export($cert, $pem);

        return [$key, $pem];
    }

    private static function key(string $config): \OpenSSLAsymmetricKey
    {
        return openssl_pkey_new(['config' => $config, 'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    }

    /** Windows builds of PHP need an explicit OpenSSL config to create certificates. */
    private static function config(): string
    {
        $path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'hexatech-alexa-test-openssl.cnf';
        file_put_contents($path, implode("\n", [
            '[req]', 'distinguished_name=dn', '[dn]',
            '[ca]', 'basicConstraints=critical,CA:TRUE', 'keyUsage=critical,keyCertSign,cRLSign',
            'subjectKeyIdentifier=hash',
            '[leaf]', 'basicConstraints=CA:FALSE', 'keyUsage=digitalSignature,keyEncipherment',
            'subjectAltName=DNS:echo-api.amazon.com',
            '[leaf_nosan]', 'basicConstraints=CA:FALSE', 'keyUsage=digitalSignature,keyEncipherment',
            '',
        ]));

        return $path;
    }
}
