<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

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

        $used = (int) Cache::get($this->bucketKey($organizationId), 0);

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
     * Record messages actually sent, against both buckets.
     *
     * Called AFTER sending rather than before, so a chunk that fails to send
     * does not consume budget it never used. The small race this allows (two
     * workers both reading budget before either records) is acceptable: the
     * consequence is a slight overshoot of a self-imposed limit, whereas
     * reserving up-front would leak budget on every failure.
     */
    public function record(?int $organizationId, int $count): void
    {
        if ($count <= 0) {
            return;
        }

        foreach ([$organizationId, null] as $scope) {
            $key = $this->bucketKey($scope);
            // Seed then increment: increment() on a missing key is a no-op on
            // some cache drivers, which would silently disable the limit.
            Cache::add($key, 0, now()->addHours(2));
            Cache::increment($key, $count);
        }
    }
}
