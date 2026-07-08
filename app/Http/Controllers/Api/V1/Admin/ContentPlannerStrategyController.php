<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerStrategy;
use App\Services\ContentPlannerStrategyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPlannerStrategyController extends Controller
{
    public function __construct(protected ContentPlannerStrategyService $strategyService) {}

    /**
     * List strategies for a profile.
     */
    public function index(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        $profileId = $request->query('planner_profile_id');

        $strategies = ContentPlannerStrategy::where('organization_id', $orgId)
            ->when($profileId, fn($q) => $q->where('planner_profile_id', $profileId))
            ->with(['pillars' => fn($q) => $q->where('active', true)])
            ->orderByDesc('created_at')
            ->paginate(10);

        return response()->json($strategies);
    }

    /**
     * Generate a new strategy using AI.
     *
     * Body:
     * {
     *   "planner_profile_id": 1,
     *   "target_audience": "Hotel Owners",
     *   "focus_platforms": ["linkedin", "instagram"],
     *   "instructions": "Focus on thought leadership and education"
     * }
     */
    public function generate(Request $request): JsonResponse
    {
        set_time_limit(600); // strategy generation is a long AI call

        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }

        $validated = $request->validate([
            'planner_profile_id' => 'required|exists:content_planner_profiles,id',
            'target_audience' => 'nullable|string',
            'focus_platforms' => 'nullable|array',
            'instructions' => 'nullable|string',
        ]);

        // Verify profile ownership
        $profile = ContentPlannerProfile::findOrFail($validated['planner_profile_id']);
        if ($profile->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        try {
            $result = $this->strategyService->generate($profile, $validated);

            return response()->json([
                'strategy' => $result['strategy'],
                'pillars' => $result['pillars'],
                'message' => 'Strategy generated successfully. Next: generate a content calendar.',
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Strategy generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get a single strategy with its pillars.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $strategy = ContentPlannerStrategy::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($strategy->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $strategy->load('pillars');

        return response()->json($strategy);
    }

    /**
     * Update strategy metadata (not AI-generated fields).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $strategy = ContentPlannerStrategy::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($strategy->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'nullable|string|max:255',
            'summary' => 'nullable|string',
            'status' => 'nullable|string|in:active,archived,superseded',
        ]);

        $strategy->update($validated);

        return response()->json($strategy);
    }

    /**
     * Archive a strategy (soft delete).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $strategy = ContentPlannerStrategy::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($strategy->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $strategy->update(['status' => 'archived']);

        return response()->json(['message' => 'Strategy archived']);
    }

    /**
     * Set a strategy as the active one for this profile.
     * (Used when generating a calendar — which strategy to base it on)
     */
    public function setActive(Request $request, int $id): JsonResponse
    {
        $strategy = ContentPlannerStrategy::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($strategy->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Deactivate others, activate this one
        ContentPlannerStrategy::where('planner_profile_id', $strategy->planner_profile_id)
            ->where('id', '!=', $id)
            ->update(['status' => 'archived']);

        $strategy->update(['status' => 'active']);

        return response()->json($strategy);
    }
}
