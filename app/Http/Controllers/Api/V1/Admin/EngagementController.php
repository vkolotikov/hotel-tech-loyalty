<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\EngagementFeedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Backs the new admin SPA `/engagement` page that replaces the split between
 * Inbox + Visitors. Two endpoints:
 *
 *   GET /v1/admin/engagement/feed   — paginated, filterable, smart-sorted rows
 *   GET /v1/admin/engagement/kpis   — 4 top-of-page numbers + deltas
 *
 * The old VisitorController and ChatInboxController stay live unchanged —
 * any deeper detail (page journey, full conversation thread, message send,
 * canned replies, lead linking) still goes through them. This controller is
 * the unified-list facade for the new page only.
 */
class EngagementController extends Controller
{
    public function __construct(
        protected EngagementFeedService $feedService,
    ) {}

    public function feed(Request $request): JsonResponse
    {
        $params = $request->validate([
            'filter'   => 'nullable|string|in:priority,all,online,has_contact,active_chat,hot_lead,anonymous,resolved',
            'sort'     => 'nullable|string|in:priority,recent,engagement',
            'search'   => 'nullable|string|max:200',
            'page'     => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:10|max:200',
        ]);

        $orgId = (int) app('current_organization_id');
        $paginator = $this->feedService->feed($orgId, $params);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function kpis(Request $request): JsonResponse
    {
        $orgId = (int) app('current_organization_id');
        return response()->json(['data' => $this->feedService->kpis($orgId)]);
    }
}
