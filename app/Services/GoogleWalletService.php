<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\WalletConfig;

/**
 * Google Wallet pass generator.
 *
 * Pattern: build a LoyaltyObject JSON describing the pass, wrap it
 * in a JWT payload, sign with RS256 using the service-account
 * private key, return https://pay.google.com/gp/v/save/{jwt}.
 * Member taps the link → Google Wallet app intercepts → card lands.
 *
 * Note: the LoyaltyClass (template) must exist in Google Pay & Wallet
 * Console before the first object — we DON'T auto-create it here
 * to avoid extra round-trips per request. Admin creates it once;
 * the class_suffix from the config is reused for every member.
 *
 * No external JWT library dependency — RS256 sign is one call to
 * openssl_sign + a couple of base64url encodes.
 */
class GoogleWalletService
{
    public function buildSaveUrl(LoyaltyMember $member, WalletConfig $config, ?\App\Models\WalletPass $pass = null): string
    {
        if (!$config->googleReady()) {
            throw new \RuntimeException('Google Wallet not configured for this organization.');
        }

        $member->loadMissing(['user', 'tier']);

        // The key is the organisation's wallet_configs row's (HexaTech
        // Loyalty release 3 §2), never a file on the local disk, which
        // does not survive a deploy on Laravel Cloud.
        $raw = $config->fileBytes('google_service_account');
        if ($raw === null) {
            throw new \RuntimeException('Google service account JSON is not stored for this organization.');
        }
        $sa = json_decode($raw, true);
        if (!is_array($sa) || empty($sa['private_key']) || empty($sa['client_email'])) {
            throw new \RuntimeException('Invalid Google service account JSON.');
        }

        $loyaltyObject = $pass ? app(\App\Services\Wallet\Passes::class)->payload($pass, $config) : $this->payload($member, $config);

        // The JWT payload wraps the object inline (typ=savetowallet).
        // For a one-off issuance like this, inline is the simplest +
        // doesn't require pre-creating each object via REST.
        $jwtPayload = [
            'iss'   => $sa['client_email'],
            'aud'   => 'google',
            'typ'   => 'savetowallet',
            'iat'   => time(),
            'origins' => [],
            'payload' => [
                'loyaltyObjects' => [$loyaltyObject],
            ],
        ];

        $jwt = $this->signJwt($jwtPayload, $sa['private_key']);
        return 'https://pay.google.com/gp/v/save/' . $jwt;
    }

    private function buildLoyaltyObject(LoyaltyMember $member, WalletConfig $config): array
    {
        return $this->payload($member, $config);
    }

    public function payload(LoyaltyMember $member, WalletConfig $config): array
    {
        $issuerId   = $config->google_issuer_id;
        $classId    = "{$issuerId}.{$config->google_class_suffix}";
        $objectId   = "{$issuerId}.member_{$member->organization_id}_{$member->id}";
        $name       = $member->user?->name ?: 'Member';
        $tierName   = $member->tier?->name ?: 'Member';
        $points     = (int) ($member->current_points ?? 0);
        $memberNumber = $member->member_number ?: (string) $member->id;
        $qrToken    = $member->qr_code_token ?: $memberNumber;

        return [
            'id'                => $objectId,
            'classId'           => $classId,
            'state'             => 'ACTIVE',
            'accountId'         => $memberNumber,
            'accountName'       => $name,
            'loyaltyPoints'     => [
                'label'   => 'Points',
                'balance' => ['int' => $points],
            ],
            'secondaryLoyaltyPoints' => [
                'label'   => 'Tier',
                'balance' => ['string' => $tierName],
            ],
            'barcode' => [
                'type'         => 'QR_CODE',
                'value'        => $qrToken,
                'alternateText' => '#' . $memberNumber,
            ],
        ];
    }

    /**
     * Minimal RS256 JWT sign — header + payload base64url-encoded,
     * concatenated, signed with openssl, signature base64url-appended.
     * No library needed; the spec is short.
     */
    public function signJwt(array $payload, string $privateKeyPem): string
    {
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];

        $segments = [
            $this->base64url(json_encode($header,  JSON_UNESCAPED_SLASHES)),
            $this->base64url(json_encode($payload, JSON_UNESCAPED_SLASHES)),
        ];
        $signingInput = implode('.', $segments);

        $key = openssl_pkey_get_private($privateKeyPem);
        if ($key === false) {
            throw new \RuntimeException('Could not parse Google service account private key.');
        }
        $signature = '';
        if (!openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('openssl_sign failed for Google Wallet JWT.');
        }

        return $signingInput . '.' . $this->base64url($signature);
    }

    private function base64url(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }
}
