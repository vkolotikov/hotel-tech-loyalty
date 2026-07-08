<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPlannerChannelController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;
        $profileId = $request->query('planner_profile_id');
        $platform = $request->query('platform');

        $channels = ContentPlannerChannel::where('organization_id', $org->id)
            ->when($profileId, fn($q) => $q->where('planner_profile_id', $profileId))
            ->when($platform, fn($q) => $q->where('platform', $platform))
            ->orderBy('platform')
            ->paginate(50);

        return response()->json($channels);
    }

    public function store(Request $request): JsonResponse
    {
        $org = $request->user()->current_organization;

        $validated = $request->validate([
            'planner_profile_id' => 'required|exists:content_planner_profiles,id',
            'platform' => 'required|string|max:50',
            'label' => 'required|string|max:255',
            'url' => 'nullable|string|max:255',
            'goal' => 'nullable|string|max:255',
            'audience_id' => 'nullable|exists:content_planner_audiences,id',
            'default_language' => 'nullable|string|max:10',
            'tone_override' => 'nullable|string|max:100',
            'frequency' => 'nullable|array',
            'preferred_formats' => 'nullable|array',
            'emoji_policy' => 'nullable|string|max:50',
            'hashtag_policy' => 'nullable|string|max:50',
            'max_length' => 'nullable|integer',
            'active' => 'nullable|boolean',
        ]);

        // Verify profile ownership
        $profile = ContentPlannerProfile::findOrFail($validated['planner_profile_id']);
        if ($profile->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $channel = ContentPlannerChannel::create(array_merge($validated, [
            'organization_id' => $org->id,
            'brand_id' => $profile->brand_id,
        ]));

        return response()->json($channel, 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $channel = ContentPlannerChannel::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($channel->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        return response()->json($channel);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $channel = ContentPlannerChannel::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($channel->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'label' => 'nullable|string|max:255',
            'url' => 'nullable|string|max:255',
            'goal' => 'nullable|string|max:255',
            'audience_id' => 'nullable|exists:content_planner_audiences,id',
            'default_language' => 'nullable|string|max:10',
            'tone_override' => 'nullable|string|max:100',
            'frequency' => 'nullable|array',
            'preferred_formats' => 'nullable|array',
            'emoji_policy' => 'nullable|string|max:50',
            'hashtag_policy' => 'nullable|string|max:50',
            'max_length' => 'nullable|integer',
            'active' => 'nullable|boolean',
        ]);

        $channel->update($validated);

        return response()->json($channel);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $channel = ContentPlannerChannel::findOrFail($id);
        $org = $request->user()->current_organization;

        if ($channel->organization_id !== $org->id) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $channel->delete();

        return response()->json(['message' => 'Channel deleted']);
    }
}
