<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentTeam;
use Illuminate\Http\JsonResponse;

/** The brand's team for "Who posts it" (spec 2026-10-19 §4.1): names and roles only, for everyone. */
class TeamController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['team' => ContentTeam::of(ContentContext::brandId())]);
    }
}
