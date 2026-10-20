<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateContentCalendar;
use App\Models\ContentPlannerChannel;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentGenerationRun;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Generate (spec 2026-10-14 §4.2): a manager has AI write a week, a month or
 * a range of up to 62 days, empty slots only by default, one generation at a
 * time per brand. A partial run keeps what it wrote and says which windows
 * failed; a run that wrote nothing answers 503. The run is a queued job
 * (GenerateContentCalendar, 2026-10-20): POST answers 202 while it runs on
 * the worker, and GET answers how it stands.
 */
class GenerationController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function generate(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'from'            => 'required|date_format:Y-m-d',
            'to'              => 'required|date_format:Y-m-d|after_or_equal:from',
            'platforms'       => 'nullable|array',
            'platforms.*'     => [Rule::in(ContentRules::PLATFORMS)],
            'fill_empty_only' => 'nullable|boolean',
            'instructions'    => 'nullable|string|max:2000',
        ]);
        if (ContentRules::days($data['from'], $data['to']) > ContentRules::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => 'The range can be at most ' . ContentRules::MAX_RANGE_DAYS . ' days.']);
        }
        $org = $request->attributes->get('workspace_org');
        // Days already gone are never slots (spec §6.6): "this week" asked for on a Thursday starts on
        // Thursday, on the venue's clock, and a range that is over asks nothing of the AI.
        $from = max($data['from'], VenueClock::today((int) $org->id));
        if ($from > $data['to']) {
            throw new ContentRefused('range_in_past', 'This range is already over — choose days from today on.', 422);
        }
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();
        // Before the queue: no active channel (of those asked for) is answered at once, not by a failed run.
        $channels = ContentPlannerChannel::where('planner_profile_id', $profile->id)->where('active', true)
            ->when($data['platforms'] ?? null, fn ($q, $platforms) => $q->whereIn('platform', $platforms));
        if (!$channels->exists()) {
            throw new ContentRefused('no_channels', 'This brand has no active channel to plan for.', 422);
        }

        // On the queue (2026-10-20): production cuts a request off at 60 s and a week takes longer. The lock and the run's
        // state live in the cache the web app and the worker share; the job hands the lock back.
        $brandId = (int) $profile->brand_id;
        $owner = $this->gate->startGeneration((int) $org->id, $brandId);
        $userId = (int) $request->user()->id;
        ContentGenerationRun::queued($brandId, $userId, $from, $data['to'], $owner);
        try {
            GenerateContentCalendar::dispatch((int) $org->id, $brandId, (int) $profile->id, $from, $data['to'],
                $data['platforms'] ?? null, $request->boolean('fill_empty_only', true), $data['instructions'] ?? null, $owner, $userId);
        } catch (\Throwable $e) {
            // The queue refused the job (it never started): free the brand and say so.
            report($e);
            ContentGenerationRun::fail($brandId, 'generation_failed', $owner);
            $this->gate->endGeneration((int) $org->id, $brandId, $owner);
            throw new ContentRefused('generation_failed', 'Generation stopped unexpectedly. Any drafts already saved remain in your plan. Please reload before retrying.', 500);
        }

        // Running on the worker: 202 and the panel polls GET generate. Where the queue is `sync` (tests, local), the run
        // is already over: its result, as before.
        return self::answer(ContentGenerationRun::describe($brandId));
    }

    /** The brand's Generate run (`GET generate`): idle, running, or its result — what the panel polls while it runs. */
    public function status(): JsonResponse
    {
        $profile = ContentContext::profile();

        return response()->json($profile ? ContentGenerationRun::describe((int) $profile->brand_id) : ['status' => 'idle']);
    }

    /** @param array<string, mixed> $run */
    private static function answer(array $run): JsonResponse
    {
        $code = match (true) {
            $run['status'] === 'running' => 202,
            $run['status'] === 'failed' && ($run['error'] ?? null) === 'no_channels' => 422,
            $run['status'] === 'failed' => 503,
            default => 200,
        };

        return response()->json($run, $code);
    }
}
