<?php

namespace App\Services\Wallet;

use App\Models\{WalletConfig, WalletPass, WalletRegistration};

final class SyncPass
{
    public function run(WalletPass $pass): void
    {
        try {
            $config = WalletConfig::withoutGlobalScopes()->where('organization_id', $pass->organization_id)->first();
            if (!$config) throw new \RuntimeException('wallet_configuration_missing');
            $passes = app(Passes::class);
            $pass = $passes->refresh($pass, $config);
            $hash = $pass->content_hash;
            $observed = $pass->last_success_at;
            if ($hash !== $pass->synced_hash) {
                if ($pass->provider === 'apple') {
                    foreach (WalletRegistration::where('wallet_pass_id', $pass->id)->get() as $registration) {
                        if (!app(ApplePush::class)->send($config, $registration)) {
                            // Do not delete a token refreshed by a simultaneous registration.
                            WalletRegistration::whereKey($registration->id)->where('updated_at', $registration->getRawOriginal('updated_at'))
                                ->where('push_token', $registration->getRawOriginal('push_token'))->delete();
                        } else {
                            $observed = now();
                        }
                    }
                } elseif (!app(GoogleClient::class)->update($config, $passes->payload($pass, $config))) {
                    $pass->forceFill(['failure_code' => null, 'next_attempt_at' => now()->addHour()])->save();
                    return;
                } else {
                    $observed = now();
                }
            }
            WalletPass::whereKey($pass->id)->where('content_hash', $hash)->update([
                'synced_hash' => $hash, 'failure_code' => null, 'attempts' => 0,
                'last_success_at' => $observed, 'next_attempt_at' => now()->addMinutes(5),
            ]);
        } catch (\Throwable $e) {
            // Provider exception messages may contain URLs, tokens or request bodies. Store a fixed code only.
            $code = $e instanceof \RuntimeException && in_array($e->getMessage(), ['wallet_identity_changed', 'wallet_configuration_missing'], true)
                ? $e->getMessage() : ($pass->provider === 'apple' ? 'apple_update_failed' : 'google_update_failed');
            $attempts = min(12, $pass->attempts + 1);
            $pass->forceFill(['failure_code' => $code, 'attempts' => $attempts,
                'next_attempt_at' => now()->addMinutes(min(60, 2 ** $attempts))])->save();
        }
    }
}
