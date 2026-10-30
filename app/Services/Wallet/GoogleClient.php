<?php

namespace App\Services\Wallet;

use App\Models\WalletConfig;
use App\Services\GoogleWalletService;
use App\Support\SharedCache;
use Illuminate\Support\Facades\{Crypt, Http};

/** Fixed Google origins, bounded requests, no provider bodies or credentials in exceptions. */
class GoogleClient
{
    public function approved(WalletConfig $config): bool
    {
        $response = $this->send($config, 'GET', 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/'.rawurlencode($config->google_issuer_id.'.'.$config->google_class_suffix));
        if (!$response->successful()) throw new \RuntimeException('google_class_unavailable');
        return strtoupper((string) $response->json('reviewStatus')) === 'APPROVED';
    }

    /** Returns false if the member has not saved the inline object yet. Never creates unsolicited passes. */
    public function update(WalletConfig $config, array $payload): bool
    {
        $url = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/'.rawurlencode($payload['id']);
        $response = $this->send($config, 'PATCH', $url, $payload);
        if ($response->status() === 404) return false;
        if (!$response->successful()) throw new \RuntimeException('google_update_failed');
        return true;
    }

    private function send(WalletConfig $config, string $method, string $url, ?array $payload = null): \Illuminate\Http\Client\Response
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $response = Http::withToken($this->token($config))->acceptJson()->connectTimeout(3)->timeout(10)
                ->withoutRedirecting()->send($method, $url, $payload === null ? [] : ['json' => $payload]);
            if ($response->status() !== 401 || $attempt === 1) return $response;
            // A revoked or prematurely expired cached token must not block updates for its full TTL.
            SharedCache::store()->forget($this->tokenKey($config));
        }
        throw new \RuntimeException('google_auth_failed');
    }

    private function tokenKey(WalletConfig $config): string
    {
        return 'wallet:google:token:'.hash('sha256', $config->fileBytes('google_service_account') ?? '');
    }

    private function token(WalletConfig $config): string
    {
        $raw = $config->fileBytes('google_service_account') ?? '';
        $key = $this->tokenKey($config);
        $encrypted = SharedCache::store()->get($key);
        if (is_string($encrypted)) {
            try { return Crypt::decryptString($encrypted); } catch (\Throwable) { SharedCache::store()->forget($key); }
        }
        $sa = json_decode($raw, true);
        if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) throw new \RuntimeException('google_credentials_invalid');
        $jwt = app(GoogleWalletService::class)->signJwt([
            'iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/wallet_object.issuer',
            'aud' => 'https://oauth2.googleapis.com/token', 'iat' => time(), 'exp' => time() + 3600,
        ], $sa['private_key']);
        $response = Http::asForm()->connectTimeout(3)->timeout(10)->withoutRedirecting()->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt,
        ]);
        $token = $response->json('access_token');
        if (!$response->successful() || !is_string($token) || $token === '') throw new \RuntimeException('google_auth_failed');
        SharedCache::store()->put($key, Crypt::encryptString($token), max(1, min(3300, (int) $response->json('expires_in', 3600) - 60)));
        return $token;
    }
}
