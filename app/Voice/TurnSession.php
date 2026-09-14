<?php

namespace App\Voice;

use Illuminate\Support\Facades\Cache;

/**
 * Short conversational memory so a follow-up such as "and yesterday?" or "add a
 * note to that booking" resolves. Held per staff member and session.
 */
class TurnSession
{
    /** Older questions are dropped whole; the newest are always kept. */
    private const MAX_QUESTIONS = 5;

    private const TTL_SECONDS = 900;

    public function history(int $userId, string $sessionId): array
    {
        // Trimmed on read too, so history saved before whole-question trimming
        // cannot start with a tool result.
        return $this->lastQuestions(Cache::get($this->key($userId, $sessionId), []));
    }

    public function remember(int $userId, string $sessionId, array $messages): void
    {
        Cache::put($this->key($userId, $sessionId), $this->lastQuestions($messages), self::TTL_SECONDS);
    }

    public function forget(int $userId, string $sessionId): void
    {
        Cache::forget($this->key($userId, $sessionId));
    }

    /**
     * A question is a user message and everything after it up to the next
     * user message. Cutting anywhere else can separate a tool result from the
     * assistant message that requested it, which OpenAI rejects with HTTP 400.
     */
    private function lastQuestions(array $messages): array
    {
        $starts = array_keys(array_filter($messages, fn ($message) => ($message['role'] ?? null) === 'user'));
        if ($starts === []) {
            return [];
        }

        return array_values(array_slice($messages, $starts[max(0, count($starts) - self::MAX_QUESTIONS)]));
    }

    /** Keyed by user so one staff member never inherits another's context. */
    private function key(int $userId, string $sessionId): string
    {
        return 'voice:turn:'.$userId.':'.sha1($sessionId);
    }
}
