<?php

namespace App\Voice\Alexa;

use App\Models\User;
use App\Models\VoiceAlexaLink;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Links an Echo to a staff member with a short code issued in the portal. A
 * code lives for voice.alexa.pairing_ttl_seconds, works once, and belongs to
 * the person who generated it. Guessing is rate-limited per Amazon account.
 */
class AlexaPairing
{
    private const MAX_ATTEMPTS = 5;

    private const LOCK_SECONDS = 900;

    public function issue(User $staff): string
    {
        $entry = ['user_id' => (int) $staff->id, 'organization_id' => (int) $staff->organization_id];
        $ttl = (int) config('voice.alexa.pairing_ttl_seconds', 600);

        // add() never overwrites, so two people can never hold the same live
        // code and link an Echo to each other by accident.
        do {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (! Cache::add($this->key($code), $entry, $ttl));

        return $code;
    }

    /**
     * @throws AlexaPairingLockedException after too many wrong codes
     */
    public function claim(string $alexaUserId, ?string $spoken): ?VoiceAlexaLink
    {
        $limiter = 'voice-alexa-pairing:'.VoiceAlexaLink::hashFor($alexaUserId);
        if (RateLimiter::tooManyAttempts($limiter, self::MAX_ATTEMPTS)) {
            throw new AlexaPairingLockedException('Too many wrong codes. Try again later.');
        }

        // Alexa returns spoken digits in several shapes; only the digits count.
        $digits = preg_replace('/\D+/', '', (string) $spoken) ?? '';
        $entry = strlen($digits) === 6
            ? Cache::lock($this->key($digits).':claim', 5)->get(fn () => Cache::pull($this->key($digits)))
            : null;

        if (! is_array($entry)) {
            RateLimiter::hit($limiter, self::LOCK_SECONDS);

            return null;
        }

        RateLimiter::clear($limiter);

        return DB::transaction(function () use ($alexaUserId, $entry) {
            $hash = VoiceAlexaLink::hashFor($alexaUserId);
            $link = VoiceAlexaLink::query()->where('alexa_user_hash', $hash)->lockForUpdate()->first()
                ?? new VoiceAlexaLink(['alexa_user_hash' => $hash]);

            // A new person never inherits the previous holder's permission to add notes.
            $link->fill([
                'user_id' => $entry['user_id'],
                'organization_id' => $entry['organization_id'],
                'can_write' => false,
                'linked_at' => now(),
                'last_used_at' => null,
                'revoked_at' => null,
            ])->save();

            return $link;
        });
    }

    private function key(string $code): string
    {
        return 'voice:alexa-pairing:'.hash('sha256', $code);
    }
}
