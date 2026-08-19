<?php

namespace App\Jobs;

use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerStrategy;
use App\Services\ContentPlannerStrategyService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Generate a content strategy off the request.
 *
 * WHY THIS EXISTS
 * ContentPlannerStrategyController::generate ran the AI call inline and raised
 * PHP's limit with set_time_limit(600). But set_time_limit only governs PHP —
 * the platform's gateway has its own, much shorter, deadline, and it closes the
 * connection first. The admin saw "Request failed with status code 504" while
 * the worker kept generating, so the strategy often existed and the UI never
 * learned about it. A screen that says "takes 1–3 minutes" cannot be served by
 * a synchronous request behind a load balancer.
 *
 * The controller pre-creates a `generating` placeholder and hands its id back
 * immediately; this job fills that same row, so the client has something stable
 * to poll from the moment it asks.
 *
 * tries = 1 deliberately. Each attempt is a large, billable AI call, and a
 * silent retry would charge the venue twice for one click. A failure is
 * recorded on the row instead, where the admin can see it and decide.
 */
class GenerateContentStrategy implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 600;

    public function __construct(
        public int $strategyId,
        public int $profileId,
        public int $organizationId,
        public array $params = [],
    ) {
    }

    public function handle(ContentPlannerStrategyService $strategies): void
    {
        // A queued job runs outside the request that created it, so
        // TenantMiddleware never fires and every scoped query would otherwise
        // fail closed and match nothing.
        app()->instance('current_organization_id', $this->organizationId);

        $strategy = ContentPlannerStrategy::withoutGlobalScopes()->find($this->strategyId);
        $profile  = ContentPlannerProfile::withoutGlobalScopes()->find($this->profileId);

        if (!$strategy || !$profile) {
            return; // deleted while queued
        }

        $strategies->generate($profile, $this->params, $strategy);
    }

    /**
     * Record the failure on the row the client is polling. Without this the UI
     * would sit on `generating` forever, which is worse than an error — the
     * admin cannot tell a slow job from a dead one.
     */
    public function failed(\Throwable $e): void
    {
        Log::error('content strategy generation failed', [
            'strategy_id'     => $this->strategyId,
            'organization_id' => $this->organizationId,
            'error'           => $e->getMessage(),
        ]);

        ContentPlannerStrategy::withoutGlobalScopes()
            ->where('id', $this->strategyId)
            ->update([
                'status'  => 'failed',
                'summary' => mb_substr($e->getMessage(), 0, 500),
            ]);
    }
}
