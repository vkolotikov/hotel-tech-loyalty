<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\ContentCalendarGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Generate (spec 2026-10-14 §4.2): a manager has AI write a week, a month or
 * a range of up to 62 days, empty slots only by default, one generation at a
 * time per brand. A partial run keeps what it wrote and says which windows
 * failed; a run that wrote nothing answers 503.
 */
class GenerationController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function generate(Request $request, ContentCalendarGenerationService $calendar): JsonResponse
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

        set_time_limit(600);
        try {
            $result = $this->gate->oneGenerationAtATime((int) $org->id, (int) $profile->brand_id, fn () => $calendar->generate($profile, $from, $data['to'], [
                'platforms'       => $data['platforms'] ?? null,
                'fill_empty_only' => $request->boolean('fill_empty_only', true),
                'instructions'    => $data['instructions'] ?? null,
            ]));
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\InvalidArgumentException $e) {
            // The service's one remaining refusal once the range is valid: no active channel.
            throw new ContentRefused('no_channels', $e->getMessage(), 422);
        } catch (\Throwable $e) {
            report($e);
            throw new ContentRefused('generation_failed', 'Generation stopped unexpectedly. Any drafts already saved remain in your plan. Please reload before retrying.', 500);
        }

        $created = collect($result['created']);
        $incomplete = $result['failed_windows'] !== [];
        $status = $incomplete ? ($created->isNotEmpty() ? 'partial' : 'failed') : 'completed';

        return response()->json([
            'status'         => $status,
            'created_count'  => $created->count(),
            'posts'          => $created->map(fn (ContentPlannerPost $p) => ContentPostPresenter::card($p->fresh(PostController::WITH)))->values(),
            'skipped'        => $result['skipped_dates'],
            'failed_windows' => $result['failed_windows'],
        ], $status === 'failed' ? 503 : 200);
    }
}
