<?php

namespace App\Services\Wallet;

use App\Models\{WalletConfig, WalletRegistration};
use Illuminate\Support\Facades\Http;

/** Pass updates use the Pass Type ID certificate and production APNs, with an empty JSON dictionary. */
class ApplePush
{
    public function send(WalletConfig $config, WalletRegistration $registration): bool
    {
        $parts = [];
        if (!@openssl_pkcs12_read($config->fileBytes('apple_cert') ?? '', $parts, (string) $config->apple_cert_password)) {
            throw new \RuntimeException('apple_credentials_invalid');
        }
        $files = [];
        try {
            foreach (['cert', 'pkey'] as $key) {
                $path = tempnam(sys_get_temp_dir(), 'wallet_apns_');
                if ($path === false) throw new \RuntimeException('apple_credentials_unavailable');
                $files[$key] = $path;
                if (!chmod($path, 0600) || file_put_contents($path, $parts[$key]) !== strlen($parts[$key])) throw new \RuntimeException('apple_credentials_unavailable');
            }
            $response = Http::withOptions(['version' => 2.0, 'cert' => $files['cert'], 'ssl_key' => $files['pkey']])
                ->withHeaders(['apns-topic' => $config->apple_pass_type_id, 'apns-priority' => '5'])
                ->connectTimeout(3)->timeout(10)->withoutRedirecting()->withBody('{}', 'application/json')
                ->post('https://api.push.apple.com/3/device/'.rawurlencode($registration->push_token));
            if ($response->successful()) return true;
            if (($response->status() === 410 && $response->json('reason') === 'Unregistered') ||
                ($response->status() === 400 && $response->json('reason') === 'BadDeviceToken')) return false;
            throw new \RuntimeException('apple_push_failed');
        } finally {
            foreach ($files as $path) @unlink($path);
            while (openssl_error_string() !== false) {}
        }
    }
}
