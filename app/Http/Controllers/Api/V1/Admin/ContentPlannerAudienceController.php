<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPlannerAudienceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;
        $profileId = $request->query('planner_profile_id');

        $audiences = ContentPlannerAudience::where('organization_id', $org->id)
            ->when($profileId, fn($q) => $q->where('planner_profile_id', $profileId))
            ->orderBy('name')
            ->paginate(25);

        return response()->json($audiences);
    }

    public function store(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;

        $validated = $request->validate([
            'planner_profile_id' => 'required|exists:content_planner_profiles,id',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'industry' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
            'language' => 'nullable|string|max:10',
            'pain_points' => 'nullable|array',
            'goals' => 'nullable|array',
            'objections' => 'nullable|array',
            'buying_triggers' => 'nullable|array',
            'preferred_platforms' => 'nullable|array',
            'preferred_tone' => 'nullable|string|max:100',
        ]);

        // Verify profile ownership
        $profile = ContentPlannerProfile::findOrFail($validated['planner_profile_id']);
        if ($profile->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $audience = ContentPlannerAudience::create(array_merge($validated, [
            'organization_id' => $org->id,
            'brand_id' => $profile->brand_id,
        ]));

        return response()->json($audience, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $audience = ContentPlannerAudience::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($audience->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        return response()->json($audience);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $audience = ContentPlannerAudience::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($audience->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'industry' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
            'language' => 'nullable|string|max:10',
            'pain_points' => 'nullable|array',
            'goals' => 'nullable|array',
            'objections' => 'nullable|array',
            'buying_triggers' => 'nullable|array',
            'preferred_platforms' => 'nullable|array',
            'preferred_tone' => 'nullable|string|max:100',
            'active' => 'nullable|boolean',
        ]);

        $audience->update($validated);

        return response()->json($audience);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $audience = ContentPlannerAudience::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($audience->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $audience->delete();

        return response()->json(['message' => 'Audience deleted']);
    }
}
