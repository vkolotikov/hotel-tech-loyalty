<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Services\Crm\CrmActivityFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /v1/admin/crm/activity — HexaTech CRM's team activity on Today (round 5, 2026-11-12): the newest timeline lines
 * of the organisation's leads and contacts, a page at a time (`page`, `per_page` up to 50, an optional `type`), in the
 * brand the request is scoped to. Reads only; behind `workspace:crm` (CrmActivityFeed).
 */
class ActivityController extends Controller
{
    public function index(Request $request, CrmActivityFeed $feed): JsonResponse
    {
        $filters = $request->validate([
            'type'     => 'nullable|string|in:' . implode(',', CrmActivityFeed::TYPES),
            'page'     => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:' . CrmActivityFeed::MAX_PER_PAGE,
        ]);

        return response()->json($feed->page($filters));
    }
}
