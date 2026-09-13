<?php

namespace App\Voice\Alexa;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Proves a request came from Alexa, following Amazon's "Host a Custom Skill as
 * a Web Service" requirements. Every check is fatal and the class fails closed:
 * a missing CA bundle, an unreadable certificate or an empty skill allowlist
 * rejects the request instead of letting it through unverified.
 */
class AlexaRequestVerifier
{
    private const SUBJECT_ALT_NAME = 'DNS:echo-api.amazon.com';

    private const CERT_HOST = 's3.amazonaws.com';

    private const CERT_PATH_PREFIX = '/echo.api/';

    /** @return array<string, mixed> the decoded payload, once every check has passed */
    public function verify(string $rawBody, ?string $certUrl, ?string $signature): array
    {
        $path = $this->certificatePath($certUrl);

        $payload = json_decode($rawBody, true);
        if (! is_array($payload)) {
            throw new AlexaVerificationException('The request body is not JSON.');
        }

        // Cheap checks before any certificate download.
        $this->assertFreshTimestamp($payload);
        $this->assertKnownSkill($payload);

        $chain = $this->certificates($path);
        $this->assertLeafIdentity($chain[0]);
        $this->assertTrustedChain($chain[0], array_slice($chain, 1));
        $this->assertSignature($rawBody, $signature, $chain[0]);

        return $payload;
    }

    /** Validates the SignatureCertChainUrl and returns its normalized path. */
    private function certificatePath(?string $url): string
    {
        $parts = is_string($url) && $url !== '' ? parse_url($url) : false;
        $path = is_array($parts) ? $this->normalizePath((string) ($parts['path'] ?? '')) : '';

        if (! is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || strtolower((string) ($parts['host'] ?? '')) !== self::CERT_HOST
            || (isset($parts['port']) && (int) $parts['port'] !== 443)
            || isset($parts['user']) || isset($parts['pass'])
            // Case-sensitive by Amazon's rule.
            || ! str_starts_with($path, self::CERT_PATH_PREFIX)) {
            throw new AlexaVerificationException('The signing certificate URL is not an Alexa URL.');
        }

        return $path;
    }

    /** Removes dot segments and duplicate slashes before the path is judged. */
    private function normalizePath(string $path): string
    {
        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                array_pop($segments);

                continue;
            }
            $segments[] = $segment;
        }

        return '/'.implode('/', $segments);
    }

    private function assertFreshTimestamp(array $payload): void
    {
        $timestamp = data_get($payload, 'request.timestamp');

        try {
            $sent = is_string($timestamp) ? CarbonImmutable::parse($timestamp) : null;
        } catch (Throwable) {
            $sent = null;
        }

        $tolerance = (int) config('voice.alexa.timestamp_tolerance_seconds', 150);
        if ($sent === null || abs(now()->getTimestamp() - $sent->getTimestamp()) > $tolerance) {
            throw new AlexaVerificationException('The request timestamp is outside the allowed window.');
        }
    }

    private function assertKnownSkill(array $payload): void
    {
        $skill = data_get($payload, 'context.System.application.applicationId')
            ?? data_get($payload, 'session.application.applicationId');
        $allowed = array_values(array_filter((array) config('voice.alexa.skill_ids', []), 'is_string'));

        // An empty allowlist denies every request, like the other voice allowlists.
        if (! is_string($skill) || ! in_array($skill, $allowed, true)) {
            throw new AlexaVerificationException('The request is for a skill this endpoint does not serve.');
        }
    }

    /**
     * Downloads the chain from the canonical URL rebuilt from the validated
     * path, never the caller's raw string. Only the download is cached; every
     * request re-validates dates, name, chain and signature.
     *
     * @return non-empty-list<string> PEM certificates, leaf first
     */
    private function certificates(string $path): array
    {
        $url = 'https://'.self::CERT_HOST.$path;

        try {
            $pem = Cache::get($key = 'voice:alexa-certificate:'.sha1($url));
            if (! is_string($pem)) {
                $response = Http::timeout(3)->connectTimeout(2)->withoutRedirecting()->get($url);
                $pem = $response->successful() ? $response->body() : null;
                if (is_string($pem)) {
                    Cache::put($key, $pem, (int) config('voice.alexa.certificate_cache_seconds', 3600));
                }
            }
        } catch (Throwable) {
            $pem = null;
        }

        if (! is_string($pem)
            || ! preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', $pem, $matches)
            || $matches[0] === []) {
            throw new AlexaVerificationException('The signing certificate could not be read.');
        }

        return $matches[0];
    }

    private function assertLeafIdentity(string $leafPem): void
    {
        $parsed = openssl_x509_parse($leafPem);
        // The application clock, so validity is judged against the same "now"
        // as the request timestamp.
        $now = now()->getTimestamp();

        if (! is_array($parsed)
            || $now < (int) ($parsed['validFrom_time_t'] ?? PHP_INT_MAX)
            || $now > (int) ($parsed['validTo_time_t'] ?? 0)) {
            throw new AlexaVerificationException('The signing certificate is not currently valid.');
        }

        $names = array_map('trim', explode(',', (string) ($parsed['extensions']['subjectAltName'] ?? '')));
        if (! in_array(self::SUBJECT_ALT_NAME, $names, true)) {
            throw new AlexaVerificationException('The signing certificate is not issued to echo-api.amazon.com.');
        }
    }

    /** @param list<string> $intermediates */
    private function assertTrustedChain(string $leafPem, array $intermediates): void
    {
        $bundle = $this->caBundle();
        $untrusted = null;

        try {
            if ($intermediates !== []) {
                $untrusted = tempnam(sys_get_temp_dir(), 'alexa-chain');
                file_put_contents($untrusted, implode("\n", $intermediates));
            }

            $result = $untrusted === null
                ? openssl_x509_checkpurpose($leafPem, X509_PURPOSE_ANY, [$bundle])
                : openssl_x509_checkpurpose($leafPem, X509_PURPOSE_ANY, [$bundle], $untrusted);
        } finally {
            if ($untrusted !== null) {
                @unlink($untrusted);
            }
        }

        if ($result !== true) {
            throw new AlexaVerificationException('The signing certificate does not chain to a trusted root.');
        }
    }

    /** An explicit setting is never silently replaced by a system default. */
    private function caBundle(): string
    {
        $configured = config('voice.alexa.ca_bundle');
        $locations = openssl_get_cert_locations();
        $candidates = is_string($configured) && $configured !== ''
            ? [$configured]
            : [$locations['default_cert_file'] ?? null, $locations['default_cert_dir'] ?? null,
                ini_get('openssl.cafile') ?: null, ini_get('curl.cainfo') ?: null];

        foreach ($candidates as $path) {
            if (is_string($path) && $path !== '' && (is_file($path) || is_dir($path))) {
                return $path;
            }
        }

        throw new AlexaVerificationException('No trusted certificate authorities are available to verify Alexa.');
    }

    private function assertSignature(string $rawBody, ?string $signature, string $leafPem): void
    {
        $decoded = is_string($signature) ? base64_decode($signature, true) : false;

        if ($decoded === false || $decoded === ''
            || openssl_verify($rawBody, $decoded, $leafPem, OPENSSL_ALGO_SHA256) !== 1) {
            throw new AlexaVerificationException('The request signature does not match its body.');
        }
    }
}
