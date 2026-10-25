<?php

namespace App\Services\Loyalty\Access;

use App\Services\Loyalty\LoyaltyRefused;
use App\Support\SharedCache;

/**
 * A scan at a place or an event sent again (release 8, spec 2026-10-25 §1): the same `idempotency_key` answers the
 * first scan's answer — its status and body — and writes no second entry; the same key with another code, place or
 * event is 409 `key_reused`. Kept per organisation in SharedCache (production's default cache is each container's own
 * files) for SECONDS: a door retries within moments, and a key is never meant to stand for a scan an hour later.
 */
final class ScanReplay
{
    public const SECONDS = 600;

    public function __construct(private readonly ?string $key, private readonly string $hash)
    {
    }

    /** @param array<string, mixed> $request what the scan was for: the code, and the place or the event */
    public static function for(int $orgId, ?string $sent, array $request): self
    {
        $key = $sent !== null && $sent !== '' ? "loyalty-scan:{$orgId}:" . hash('sha256', $sent) : null;

        return new self($key, hash('sha256', (string) json_encode($request)));
    }

    public function keyed(): bool
    {
        return $this->key !== null;
    }

    /** The advisory lock a keyed scan is taken under, so a retry racing the first waits for its answer. */
    public function lockKey(): ?string
    {
        return $this->key;
    }

    /**
     * The first scan's answer, or null for a key not seen (or no key).
     *
     * @return array{status: int, body: array<string, mixed>}|null
     */
    public function seen(): ?array
    {
        if ($this->key === null || !is_array($seen = SharedCache::store()->get($this->key))) {
            return null;
        }
        if (($seen['hash'] ?? null) !== $this->hash) {
            throw new LoyaltyRefused('key_reused', 'This retry key was used for a different scan.', 409);
        }

        return ['status' => (int) $seen['status'], 'body' => (array) $seen['body']];
    }

    /** @param array<string, mixed> $body */
    public function keep(int $status, array $body): void
    {
        if ($this->key !== null) {
            SharedCache::store()->put($this->key, ['hash' => $this->hash, 'status' => $status, 'body' => $body], self::SECONDS);
        }
    }
}
