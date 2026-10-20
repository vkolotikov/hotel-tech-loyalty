<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\AdaptPostVersions;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPostPresenter;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentVersions;
use App\Support\SharedCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Versions per platform (spec 2026-10-19 §3): everyone who writes posts makes versions and unlinks them. */
class VersionController extends Controller
{
    public function store(Request $request, int $id, ContentAiGate $gate): JsonResponse
    {
        $data = $request->validate([
            'platforms'   => 'required|array|min:1|max:' . (count(ContentRules::PLATFORMS) - 1),
            'platforms.*' => ['required', 'string', 'distinct', Rule::in(ContentRules::PLATFORMS)],
            'ai'          => 'sometimes|boolean',
        ]);
        $post = PostController::find($id);
        $ai = $request->boolean('ai');
        if ($ai) {
            // At the budget cap nothing is made: the person asked for adapted versions.
            $gate->allow($request->attributes->get('workspace_org'));
        }
        $versions = ContentVersions::make($post, array_values($data['platforms']), (int) $request->user()->id);
        if ($ai) {
            $groupId = (int) $versions->first()->group_id;
            $ids = $versions->pluck('id')->map(fn ($versionId) => (int) $versionId)->all();
            // The panel shows "Adapting…" on these until the job is done with them (or 15 minutes pass).
            ContentVersions::stillAdapting($groupId, array_merge((array) SharedCache::store()->get(ContentVersions::adaptingKey($groupId), []), $ids));
            AdaptPostVersions::dispatch($groupId, ContentContext::orgId(), ContentContext::brandId(), (string) $post->platform, $ids);
        }

        return response()->json([
            'post'     => ContentPostPresenter::detail($post->fresh(PostController::WITH)),
            'versions' => $versions->map(fn ($version) => ContentPostPresenter::card($version->fresh(PostController::WITH)))->values(),
        ], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $post = PostController::find($id);
        ContentVersions::unlink($post);

        return response()->json(['post' => ContentPostPresenter::detail($post->fresh(PostController::WITH))]);
    }
}
