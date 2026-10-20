<?php

namespace App\Jobs;

use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerChannel;
use App\Models\User;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentGenerationRun;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\CalendarGenerationBudget;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;

/**
 * Generate on the queue (2026-10-20): production cuts a web request off at 60 s, and one week of posts takes longer. The
 * controller took the brand's generation lock and recorded the run as queued; this — on the `ai` queue's own worker —
 * writes the posts with the same service as the manager who pressed Generate, records the result for the panel, and
 * hands the lock back. A job that comes after its run was called lost, and another run took the brand, does nothing.
 */
class GenerateContentCalendar implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Each attempt is a large, billable AI call: never tried twice on its own. */
    public int $tries = 1;

    /** Under ContentAiGate::RUN_SECONDS (the lock) and every queue connection's retry_after (660 s). */
    public int $timeout = 600;

    /** The AI's time for the whole run: on the queue it is not held to the in-request 240 s, so a month can finish. */
    public const BUDGET_SECONDS = 540;

    /** @param list<string>|null $platforms */
    public function __construct(
        public int $organizationId,
        public int $brandId,
        public int $profileId,
        public string $from,
        public string $to,
        public ?array $platforms,
        public bool $fillEmptyOnly,
        public ?string $instructions,
        public string $lockOwner,
        public int $userId,
    ) {
        // The long AI jobs have their own queue and worker: mail never waits behind them (queue review).
        $this->onQueue('ai');
    }

    public function handle(ContentCalendarGenerationService $calendar): void
    {
        $gate = app(ContentAiGate::class);
        // Still this run's brand? A job called lost while it waited, whose brand another run has taken, writes nothing.
        if (!$gate->resumeGeneration($this->organizationId, $this->brandId, $this->lockOwner)) {
            return;
        }
        ContentGenerationRun::started($this->brandId, $this->lockOwner);

        // A queue worker has no request: bind the tenant and the manager who pressed Generate for the run (the posts are
        // theirs: `created_by`, the bell, the AI usage), then leave everything as found.
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', $this->organizationId);
        app()->instance('current_brand_id', $this->brandId);
        try {
            if ($user = User::find($this->userId)) {
                Auth::setUser($user);
            }
            $profile = ContentPlannerProfile::find($this->profileId);
            if ($profile === null) {
                ContentGenerationRun::fail($this->brandId, 'no_profile', $this->lockOwner);

                return;
            }
            $result = $calendar->generate($profile, $this->from, $this->to, [
                'platforms'       => $this->platforms,
                'fill_empty_only' => $this->fillEmptyOnly,
                'instructions'    => $this->instructions,
            ], new CalendarGenerationBudget(null, self::BUDGET_SECONDS));
            ContentGenerationRun::finish($this->brandId, $result, $this->lockOwner);
        } catch (\InvalidArgumentException $e) {
            // The service's refusal for a brand without an active channel (checked before the queue, so rare here);
            // anything else of that kind is a failure to report.
            $channels = ContentPlannerChannel::where('planner_profile_id', $this->profileId)->where('active', true)->exists();
            if ($channels) {
                report($e);
            }
            ContentGenerationRun::fail($this->brandId, $channels ? 'generation_failed' : 'no_channels', $this->lockOwner);
        } catch (\Throwable $e) {
            report($e);
            ContentGenerationRun::fail($this->brandId, 'generation_failed', $this->lockOwner);
        } finally {
            $gate->endGeneration($this->organizationId, $this->brandId, $this->lockOwner);
            Auth::forgetGuards();
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Killed by the worker (its timeout) before handle() could report: say so, and free the brand — if still this run's. */
    public function failed(?\Throwable $e): void
    {
        ContentGenerationRun::fail($this->brandId, 'generation_failed', $this->lockOwner);
        app(ContentAiGate::class)->endGeneration($this->organizationId, $this->brandId, $this->lockOwner);
    }
}
