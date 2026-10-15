<?php

namespace App\Services\Content;

use App\Models\Organization;
use App\Services\AiUsageService;
use Illuminate\Support\Facades\Cache;

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
        $lock = Cache::lock("content:generate:{$orgId}:{$brandId}", self::LOCK_SECONDS);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'A generation is already running for this brand.', 409);
        }

        try {
            return $run();
        } finally {
            $lock->release();
        }
    }
}
