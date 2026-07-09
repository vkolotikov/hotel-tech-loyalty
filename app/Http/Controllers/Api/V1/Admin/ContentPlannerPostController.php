<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use App\Services\ContentVisualBriefService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPlannerPostController extends Controller
{
    public function __construct(
        protected ContentPostGenerationService $postService,
        protected ContentVisualBriefService $visualBriefService,
        protected ContentQualityService $qualityService,
        protected ImageGenerationService $imageService,
    ) {}

    /**
     * List posts with filters.
     */
    public function index(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }

        $from = $request->query('from');
        $to = $request->query('to');

        if ($request->filled('per_page')) {
            $perPage = min(100, max(1, (int) $request->query('per_page')));
        } else {
            $perPage = ($from && $to) ? 200 : 25;
        }

        $posts = ContentPlannerPost::where('organization_id', $orgId)
            ->when($request->query('planner_profile_id'), fn($q) => $q->where('planner_profile_id', $request->query('planner_profile_id')))
            ->when($request->query('status'), fn($q) => $q->where('status', $request->query('status')))
            ->when($request->query('platform'), fn($q) => $q->where('platform', $request->query('platform')))
            ->when($request->query('campaign_id'), fn($q) => $q->where('campaign_id', $request->query('campaign_id')))
            ->when($request->query('pillar_id'), fn($q) => $q->where('pillar_id', $request->query('pillar_id')))
            ->when($from && $to, fn($q) => $q->whereBetween('scheduled_date', [$from, $to]))
            ->when($request->query('q'), fn($q) => $q->where('topic', 'like', '%' . $request->query('q') . '%'))
            ->with(['pillar', 'audience', 'campaign', 'visualBrief'])
            ->orderByDesc('scheduled_date')
            ->paginate($perPage);

        return response()->json($posts);
    }

    /**
     * Create a new post (manual entry or from calendar generation).
     */
    public function store(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        $validated = $request->validate([
            'planner_profile_id' => 'required|exists:content_planner_profiles,id',
            'campaign_id' => 'nullable|exists:content_planner_campaigns,id',
            'pillar_id' => 'nullable|exists:content_planner_pillars,id',
            'audience_id' => 'nullable|exists:content_planner_audiences,id',
            'platform' => 'required|string|max:50',
            'topic' => 'required|string',
            'goal' => 'nullable|string',
            'scheduled_date' => 'nullable|date',
            'scheduled_time' => 'nullable|date_format:H:i',
            'language' => 'nullable|string|max:10',
        ]);

        // Verify profile ownership
        $profile = ContentPlannerProfile::findOrFail($validated['planner_profile_id']);
        if ($profile->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $post = ContentPlannerPost::create(array_merge($validated, [
            'organization_id' => $orgId,
            'brand_id' => $profile->brand_id,
            'status' => 'idea',
            'created_by' => $request->user()->id,
        ]));

        return response()->json($post, 201);
    }

    /**
     * Get single post with all related data.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::with(['pillar', 'audience', 'campaign', 'variations', 'visualBrief'])->findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        return response()->json($post);
    }

    /**
     * Update post fields.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'topic' => 'nullable|string',
            'title' => 'nullable|string|max:255',
            'goal' => 'nullable|string',
            'format' => 'nullable|string|max:100',
            'main_copy' => 'nullable|string',
            'short_copy' => 'nullable|string',
            'hook' => 'nullable|string',
            'cta' => 'nullable|string',
            'hashtags' => 'nullable|array',
            'weekday_role' => 'nullable|string|max:100',
            'funnel_stage' => 'nullable|string|in:awareness,consideration,conversion,retention',
            'post_type' => 'nullable|string|max:100',
            'strategic_reason' => 'nullable|string',
            'engagement_mechanic' => 'nullable|array',
            'pillar_id' => 'nullable|integer|exists:content_planner_pillars,id',
            'audience_id' => 'nullable|integer|exists:content_planner_audiences,id',
            'scheduled_date' => 'nullable|date',
            'scheduled_time' => 'nullable|date_format:H:i',
            'language' => 'nullable|string|max:10',
            'status' => 'nullable|string|in:idea,draft,needs_review,needs_visual,approved,ready_to_publish,published,skipped,archived',
        ]);

        $post->update($validated);

        return response()->json($post);
    }

    /**
     * Generate copy for a post.
     */
    public function generateCopy(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        set_time_limit(600);

        try {
            $result = $this->postService->generate($post);

            return response()->json([
                'post' => $result['post'],
                'message' => 'Post copy generated. Review and click "Mark Ready" when approved.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Copy generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate an alternative version.
     */
    public function generateAlternative(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $variation = $request->query('type', 'alternative'); // shorter, longer, professional, friendly, etc.

        set_time_limit(600);

        try {
            $result = $this->postService->generateAlternatives($post, $variation);

            return response()->json([
                'variation' => $result['variation'],
                'message' => 'Alternative generated. Choose the best version!',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Alternative generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate (or regenerate) the visual brief for a post.
     */
    public function visualBrief(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        set_time_limit(600);

        try {
            $brief = $this->visualBriefService->generateFor($post);

            return response()->json([
                'visual_brief' => $brief,
                'message' => 'Visual brief generated.',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Visual brief generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate (or regenerate) an AI image for a post via OpenAI.
     */
    public function generateImage(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        set_time_limit(600);

        try {
            $brief = $this->imageService->generateForPost($post);

            return response()->json([
                'visual_brief' => $brief,
                'post' => $post->fresh(),
                'message' => 'Image generated.',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Image generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Run the AI quality check on a post.
     */
    public function qualityCheck(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        set_time_limit(600);

        try {
            $quality = $this->qualityService->check($post);

            return response()->json([
                'quality' => $quality,
                'post' => $post->fresh(),
                'message' => 'Quality check complete.',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Quality check failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Mark a post as ready to publish.
     */
    public function markReady(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $post->update(['status' => 'ready_to_publish']);

        return response()->json($post);
    }

    /**
     * Mark a post as published.
     */
    public function markPublished(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'published_url' => 'nullable|string|url',
        ]);

        $post->update(array_merge($validated, [
            'status' => 'published',
            'published_at' => now(),
        ]));

        return response()->json($post);
    }

    /**
     * Duplicate a post.
     */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $original = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($original->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $copy = $original->replicate(['published_url', 'published_at', 'status']);
        $copy->status = 'draft';
        $copy->scheduled_date = now()->addDays(7)->toDateString(); // Default to next week
        $copy->save();

        return response()->json($copy, 201);
    }

    /**
     * Delete a post.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $post = ContentPlannerPost::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($post->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $post->delete();

        return response()->json(['message' => 'Post deleted']);
    }
}
