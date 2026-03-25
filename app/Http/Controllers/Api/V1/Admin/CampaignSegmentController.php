<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CampaignSegment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CampaignSegmentController extends Controller
{
    public function index(): JsonResponse
    {
        $segments = CampaignSegment::orderByDesc('created_at')->get();

        return response()->json(['segments' => $segments]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'        => 'required|string|max:255',
            'description' => 'nullable|string',
            'rules'       => 'required|array|min:1',
            'rules.*.field'    => 'required|string',
            'rules.*.operator' => 'required|string|in:eq,neq,gt,gte,lt,lte,in,not_in,between,contains',
            'rules.*.value'    => 'required',
            'is_dynamic'  => 'boolean',
        ]);

        $validated['created_by'] = $request->user()->id;

        $segment = CampaignSegment::create($validated);
        $segment->computeSize();

        return response()->json(['message' => 'Segment created', 'segment' => $segment->fresh()], 201);
    }

    public function show(int $id): JsonResponse
    {
        $segment = CampaignSegment::findOrFail($id);

        // Recompute if dynamic
        if ($segment->is_dynamic) {
            $segment->computeSize();
            $segment->refresh();
        }

        return response()->json(['segment' => $segment]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $segment = CampaignSegment::findOrFail($id);

        $validated = $request->validate([
            'name'        => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'rules'       => 'sometimes|array|min:1',
            'rules.*.field'    => 'required_with:rules|string',
            'rules.*.operator' => 'required_with:rules|string|in:eq,neq,gt,gte,lt,lte,in,not_in,between,contains',
            'rules.*.value'    => 'required_with:rules',
            'is_dynamic'  => 'sometimes|boolean',
        ]);

        $segment->update($validated);

        if (isset($validated['rules'])) {
            $segment->computeSize();
        }

        return response()->json(['message' => 'Segment updated', 'segment' => $segment->fresh()]);
    }

    public function destroy(int $id): JsonResponse
    {
        CampaignSegment::findOrFail($id)->delete();

        return response()->json(['message' => 'Segment deleted']);
    }

    public function preview(int $id): JsonResponse
    {
        $segment = CampaignSegment::findOrFail($id);
        $members = $segment->buildQuery()->with(['user:id,name,email', 'tier:id,name'])->limit(50)->get();

        return response()->json([
            'estimated_size' => $segment->estimated_size,
            'preview'        => $members,
        ]);
    }
}
