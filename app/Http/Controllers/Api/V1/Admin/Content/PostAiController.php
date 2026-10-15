<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\ContentCalendarGenerationService;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use App\Services\ContentVisualBriefService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * AI on one post, for every staff member (spec 2026-10-14 §5.1): write the
 * copy, the five rewrites, the quality score, the visual brief, the image,
 * and Fill an open slot with one AI-written post. Each passes the budget
 * first; a provider failure answers ai_failed and changes nothing.
 */
class PostAiController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function write(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000']);
        $post = $this->prepare($request, $id);
        $this->run(fn () => $posts->generate($post, $data['instructions'] ?? null));

        return $this->post($post);
    }

    public function rewrite(Request $request, int $id, ContentPostGenerationService $posts): JsonResponse
    {
        $data = $request->validate([
            'type'     => ['required', Rule::in(ContentRules::REWRITES)],
            'guidance' => 'nullable|string|max:1000',
        ]);
        $post = $this->prepare($request, $id);
        $variation = $this->run(fn () => $posts->generateAlternatives($post, $data['type'], $data['guidance'] ?? null))['variation'];

        return response()->json(['variation' => [
            'id'   => (int) $variation->id,
            'type' => (string) $variation->variation_type,
            'copy' => (string) $variation->copy,
        ]]);
    }

    public function quality(Request $request, int $id, ContentQualityService $quality): JsonResponse
    {
        $post = $this->prepare($request, $id);
        $result = $this->run(fn () => $quality->check($post));

        return response()->json(['quality' => $result, 'post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }

    public function visualBrief(Request $request, int $id, ContentVisualBriefService $briefs): JsonResponse
    {
        $post = $this->prepare($request, $id);
        $this->run(fn () => $briefs->generateFor($post));

        return $this->post($post);
    }

    public function image(Request $request, int $id, ImageGenerationService $images): JsonResponse
    {
        $data = $request->validate(['instructions' => 'nullable|string|max:1000']);
        $post = $this->prepare($request, $id);
        $this->run(fn () => $images->generateForPost($post, $data['instructions'] ?? null));

        return $this->post($post);
    }

    /** One AI-written post for an open slot (spec §4.2), through the calendar's own one-day generation. */
    public function fill(Request $request, ContentCalendarGenerationService $calendar): JsonResponse
    {
        $data = $request->validate([
            'date'     => 'required|date_format:Y-m-d',
            'platform' => ['required', Rule::in(ContentRules::PLATFORMS)],
        ]);
        $org = $request->attributes->get('workspace_org');
        $this->gate->allow($org);
        $profile = ContentContext::requireProfile();
        $open = ContentPlan::openSlots($profile, $data['date'], $data['date'], VenueClock::today((int) $org->id));
        if (!in_array(['date' => $data['date'], 'platform' => $data['platform']], $open, true)) {
            throw new ContentRefused('slot_not_open', 'That day already has a post for this platform, or it is not one of its days.', 422);
        }

        set_time_limit(600);
        $result = $this->gate->oneGenerationAtATime((int) $org->id, (int) $profile->brand_id, fn () => $this->run(
            fn () => $calendar->generate($profile, $data['date'], $data['date'], ['platforms' => [$data['platform']], 'fill_empty_only' => true])
        ));
        $post = collect($result['created'])->first(fn (ContentPlannerPost $p) => $p->platform === $data['platform']);
        if (!$post) {
            throw new ContentRefused('ai_failed', 'The AI did not write a post for this slot. Please try again.', 502);
        }

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))], 201);
    }

    private function prepare(Request $request, int $id): ContentPlannerPost
    {
        $this->gate->allow($request->attributes->get('workspace_org'));
        $post = PostController::find($id);
        set_time_limit(600); // one AI call can take a minute or more

        return $post;
    }

    private function post(ContentPlannerPost $post): JsonResponse
    {
        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }

    /** One AI call. A provider failure becomes ai_failed (502); a refusal passes through. */
    private function run(callable $call): mixed
    {
        try {
            return $call();
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words (keys, quotas, internals) stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }
    }
}
