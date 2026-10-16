<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentGoals;
use Illuminate\Http\JsonResponse;

/** Posting goals and the streak for the pinned brand (spec 2026-10-15 §7): everyone reads them. */
class GoalsController extends Controller
{
    public function show(): JsonResponse
    {
        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['week' => null, 'platforms' => [], 'streak' => ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]]);
        }

        return response()->json(ContentGoals::for($profile, ContentContext::orgId()));
    }
}
