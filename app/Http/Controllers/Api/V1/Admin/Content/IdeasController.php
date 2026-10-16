<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentIdeas;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** The Ideas board for the pinned brand (spec 2026-10-16 §4): everyone reads it. */
class IdeasController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform'  => ['nullable', Rule::in(ContentRules::PLATFORMS)],
            'pillar_id' => 'nullable|integer',
        ]);
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(ContentIdeas::empty());
        }

        return response()->json(ContentIdeas::for($profile, $data['platform'] ?? null, isset($data['pillar_id']) ? (int) $data['pillar_id'] : null));
    }
}
