<?php

namespace App\Voice;

use Illuminate\Support\Facades\Cache;

/**
 * Short conversational memory so "add a note to that booking" resolves. Held
 * per staff member and session, and deliberately small: a voice turn should
 * not carry an unbounded transcript into every model call.
 */
class TurnSession
{
    private const MAX_MESSAGES = 12;

    private const TTL_SECONDS = 900;

    public function history(int $userId, string $sessionId): array
    {
        return Cache::get($this->key($userId, $sessionId), []);
    }

    public function remember(int $userId, string $sessionId, array $messages): void
    {
        Cache::put($this->key($userId, $sessionId),
            array_slice($messages, -self::MAX_MESSAGES), self::TTL_SECONDS);
    }

    public function forget(int $userId, string $sessionId): void
    {
        Cache::forget($this->key($userId, $sessionId));
    }

    /** Keyed by user so one staff member never inherits another's context. */
    private function key(int $userId, string $sessionId): string
    {
        return 'voice:turn:'.$userId.':'.sha1($sessionId);
    }
}
