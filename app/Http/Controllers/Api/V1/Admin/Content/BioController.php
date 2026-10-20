<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentBio;
use App\Services\Content\ContentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The brand's link-in-bio page on the Brand page (spec 2026-10-19 §6.4, §7.2): everyone reads it, managers save it. */
class BioController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(ContentBio::describe(ContentContext::requireProfile()));
    }

    public function update(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate([
            'is_on'                 => 'required|boolean',
            // Its shape is ContentBio's rule (bio_name_invalid), not a validation message.
            'slug'                  => 'required|string|max:255',
            'title'                 => 'nullable|string|max:60',
            'line'                  => 'nullable|string|max:160',
            'show_posts'            => 'required|boolean',
            'buttons'               => 'present|array',
            'buttons.*.id'          => 'nullable|integer',
            'buttons.*.label'       => 'required|string|max:40',
            'buttons.*.destination' => 'required|string',
        ]);
        ContentBio::save($profile, $data);

        return response()->json(ContentBio::describe($profile));
    }
}
