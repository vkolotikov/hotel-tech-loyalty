<?php

namespace App\Services;

use App\Support\SharedCache;
use Illuminate\Support\Str;

/**
 * Hourly send budget for BULK mail.
 *
 * WHY CHUNK SPACING WAS NOT ENOUGH
 * Both campaign jobs pace themselves at one chunk per
 * `mail.campaign_chunk_seconds` — 100 recipients per 60s, about 6,000/hour.
 * That reads like a rate limit and is not one: it is per CAMPAIGN. Two
 * campaigns running at once send twice as much, ten tenants sending at once
 * send ten times as much, and the relay only ever sees the total. The one
 * number that matters — messages per hour arriving at the provider — was
 * unbounded.
 *
 * TWO CEILINGS, FOR TWO DIFFERENT FAILURES
 *  - Per org: stops one tenant with a big stale list consuming the whole
 *    budget, and stops their bounce rate becoming everyone's problem. Every
 *    tenant sends from one shared domain, so reputation damage is collective.
 *  - Global: protects the provider's own ceiling. Exceeding it gets mail
 *    deferred or the account throttled, which looks like a spam run from the
 *    receiving side.
 *
 * WHAT IS DELIBERATELY NOT LIMITED
 * Transactional mail — password resets, verification codes, booking
 * confirmations. Someone locked out of their account at 3am must not wait
 * behind a marketing queue, and these are low-volume by nature. This is
 * consulted by the campaign jobs only, never by the global MessageSending
 * listener, precisely so that stays true.
 *
 * OVER BUDGET MEANS LATER, NOT LOST
 * Callers re-dispatch the chunk with a delay rather than dropping it. A
 * campaign that takes an extra hour is a non-event; a campaign that silently
 * skipped 400 recipients is a support incident nobody can reconstruct.
 */
class CampaignRateLimiter
{
    /** Bucket resets on the clock hour, so a burst cannot straddle two windows. */
    private function bucketKey(?int $organizationId): string
    {
        $hour = now()->format('YmdH');

        return $organizationId
            ? "campaign_sends:org:{$organizationId}:{$hour}"
            : "campaign_sends:global:{$hour}";
    }

    private function limitFor(?int $organizationId): int
    {
        return $organizationId
            ? (int) config('mail.campaign_hourly_limit_per_org', 2000)
            : (int) config('mail.campaign_hourly_limit_global', 6000);
    }

    /** How many more messages this scope may send in the current hour. */
    public function remaining(?int $organizationId): int
    {
        $limit = $this->limitFor($organizationId);
        if ($limit <= 0) {
            return PHP_INT_MAX; // 0 or negative disables the ceiling
        }

        $used = (int) SharedCache::store()->get($this->bucketKey($organizationId), 0);

        return max(0, $limit - $used);
    }

    /**
     * How many of `$wanted` messages may be sent right now, considering BOTH
     * the org's budget and the global one. Returns 0 when either is exhausted.
     */
    public function allowance(?int $organizationId, int $wanted): int
    {
        return max(0, min(
            $wanted,
            $this->remaining($organizationId),
            $this->remaining(null),
        ));
    }

    /**
     * Atomically reserve both budgets before handing any messages to a transport.
     * A worker dying retains its reservation until the clock hour ends: an unknown
     * provider outcome must not free capacity for another possibly duplicate send.
     *
     * @return array{id: string, count: int}
     */
    public function reserve(?int $organizationId, int $wanted): array
    {
        return SharedCache::store()->lock('campaign_sends:budget_lock', 10)->block(5, function () use ($organizationId, $wanted) {
            $count = $this->allowance($organizationId, $wanted);
            $id = (string) Str::uuid();
            $keys = array_values(array_unique([$this->bucketKey($organizationId), $this->bucketKey(null)]));
            $this->add($keys, $count);
            if ($count > 0) {
                SharedCache::store()->put('campaign_sends:reservation:' . $id, ['keys' => $keys, 'count' => $count], now()->addHours(2));
            }

            return ['id' => $id, 'count' => $count];
        });
    }

    /** Return only slots known not to have reached the transport; release is idempotent and uses the original hour. */
    public function release(string $reservationId, int $unused): void
    {
        SharedCache::store()->lock('campaign_sends:budget_lock', 10)->block(5, function () use ($reservationId, $unused) {
            $store = SharedCache::store();
            $reservation = $store->pull('campaign_sends:reservation:' . $reservationId);
            if (!$reservation) {
                return;
            }
            $count = max(0, min($unused, $reservation['count']));
            foreach ($reservation['keys'] as $key) {
                $store->put($key, max(0, (int) $store->get($key, 0) - $count), now()->addHours(2));
            }
        });
    }

    /** Record already-sent mail (legacy callers/operational accounting); new sends must reserve first. */
    public function record(?int $organizationId, int $count): void
    {
        if ($count <= 0) {
            return;
        }

        SharedCache::store()->lock('campaign_sends:budget_lock', 10)->block(5, function () use ($organizationId, $count) {
            $this->add(array_values(array_unique([$this->bucketKey($organizationId), $this->bucketKey(null)])), $count);
        });
    }

    private function add(array $keys, int $count): void
    {
        foreach ($keys as $key) {
            // Seed then increment: increment() on a missing key is a no-op on
            // some cache drivers, which would silently disable the limit.
            SharedCache::store()->add($key, 0, now()->addHours(2));
            SharedCache::store()->increment($key, $count);
        }
    }
}
