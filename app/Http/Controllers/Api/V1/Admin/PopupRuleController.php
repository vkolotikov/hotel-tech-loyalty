<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\PopupRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PopupRuleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rules = PopupRule::where('organization_id', $request->user()->organization_id)
            ->orderByDesc('priority')
            ->orderBy('name')
            ->get();

        return response()->json($rules);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'            => 'required|string|max:120',
            'is_active'       => 'nullable|boolean',
            'trigger_type'    => 'required|in:page_load,time_delay,scroll_depth,exit_intent',
            'trigger_value'   => 'nullable|string|max:60',
            'url_match_type'  => 'nullable|in:exact,contains,starts_with,regex',
            'url_match_value' => 'nullable|string|max:500',
            'visitor_type'    => 'nullable|in:all,new,returning',
            'language_targets' => 'nullable|array',
            'message'         => 'required|string|max:2000',
            'quick_replies'   => 'nullable|array',
            'quick_replies.*' => 'string|max:100',
            'priority'        => 'nullable|integer|min:0',
        ]);

        $rule = PopupRule::create(array_merge($validated, [
            'organization_id' => $request->user()->organization_id,
        ]));

        return response()->json($rule, 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $rule = PopupRule::where('organization_id', $request->user()->organization_id)->findOrFail($id);

        $validated = $request->validate([
            'name'            => 'nullable|string|max:120',
            'is_active'       => 'nullable|boolean',
            'trigger_type'    => 'nullable|in:page_load,time_delay,scroll_depth,exit_intent',
            'trigger_value'   => 'nullable|string|max:60',
            'url_match_type'  => 'nullable|in:exact,contains,starts_with,regex',
            'url_match_value' => 'nullable|string|max:500',
            'visitor_type'    => 'nullable|in:all,new,returning',
            'language_targets' => 'nullable|array',
            'message'         => 'nullable|string|max:2000',
            'quick_replies'   => 'nullable|array',
            'quick_replies.*' => 'string|max:100',
            'priority'        => 'nullable|integer|min:0',
        ]);

        $rule->update($validated);

        return response()->json($rule);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $rule = PopupRule::where('organization_id', $request->user()->organization_id)->findOrFail($id);
        $rule->delete();

        return response()->json(['message' => 'Deleted']);
    }
}
