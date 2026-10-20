<?php

namespace App\Services\Content;

use App\Models\Organization;
use App\Services\AiUsageService;
use App\Support\SharedCache;

/**
 * What every Content AI action passes first (spec 2026-10-14 §5.2): the
 * organisation's monthly AI budget (refused at 100 % before any provider
 * call; writing by hand keeps working; an organisation without a cap is
 * never stopped), and one generation at a time per brand, so a double click
 * cannot write the same days twice.
 */
final class ContentAiGate
{
    /** Longer than the calendar's own 240-second budget, so a running generation always holds its brand. */
    public const LOCK_SECONDS = 300;

    /**
     * How long a queued Generate holds its brand: longer than its job may run (600 s), so the lock never ends under a
     * live run; a run past it reads as failed (ContentGenerationRun).
     */
    public const RUN_SECONDS = 660;

    /**
     * How long a Generate may wait on the queue before its job starts (it may queue behind other AI work): the lock taken
     * at dispatch lasts this long; the job, when it starts, holds it for RUN_SECONDS from then (queue review).
     */
    public const QUEUED_SECONDS = 1800;

    public function __construct(private AiUsageService $usage)
    {
    }

    public function allow(Organization $org): void
    {
        if (($this->usage->budgetStatus($org)['status'] ?? null) === 'over') {
            throw new ContentRefused('ai_budget_used_up', "This month's AI budget is used up — see Settings → AI Usage.", 403);
        }
    }

    /**
     * Runs $run while holding the brand's generation lock; a second request
     * while it runs is refused, not queued. The lock is released however
     * $run ends.
     *
     * @template T
     * @param callable(): T $run
     * @return T
     */
    public function oneGenerationAtATime(int $orgId, int $brandId, callable $run): mixed
    {
        // In the cache the web app and the queue worker share: a queued Generate holds the same lock (startGeneration).
        $lock = SharedCache::store()->lock(self::lockKey($orgId, $brandId), self::LOCK_SECONDS);
        if (!$lock->get()) {
            throw self::busy();
        }

        try {
            return $run();
        } finally {
            $lock->release();
        }
    }

    /**
     * Takes the brand's generation lock for a queued Generate and answers its owner, which the job hands back to
     * endGeneration when it is done — in another container (spec: generate on the queue, 2026-10-20).
     */
    public function startGeneration(int $orgId, int $brandId): string
    {
        $lock = SharedCache::store()->lock(self::lockKey($orgId, $brandId), self::QUEUED_SECONDS);
        if (!$lock->get()) {
            throw self::busy();
        }

        return (string) $lock->owner();
    }

    /**
     * When the job starts: whether the brand's lock is still this run's (a job called lost while it waited, whose brand
     * another run has taken, must not write), and — still holding it — its time from now (the database lock refreshes
     * its expiry for its own owner).
     */
    public function resumeGeneration(int $orgId, int $brandId, string $owner): bool
    {
        if (!SharedCache::store()->restoreLock(self::lockKey($orgId, $brandId), $owner)->isOwnedByCurrentProcess()) {
            return false;
        }
        $lock = SharedCache::store()->lock(self::lockKey($orgId, $brandId), self::RUN_SECONDS, $owner);
        if (!$lock->get()) {
            // A store that does not refresh its owner's lock (array): hand it back and take it again, same owner.
            SharedCache::store()->restoreLock(self::lockKey($orgId, $brandId), $owner)->release();
            $lock->get();
        }

        return true;
    }

    public function endGeneration(int $orgId, int $brandId, string $owner): void
    {
        SharedCache::store()->restoreLock(self::lockKey($orgId, $brandId), $owner)->release();
    }

    private static function lockKey(int $orgId, int $brandId): string
    {
        return "content:generate:{$orgId}:{$brandId}";
    }

    private static function busy(): ContentRefused
    {
        return new ContentRefused('already_generating', 'A generation is already running for this brand.', 409);
    }
}
