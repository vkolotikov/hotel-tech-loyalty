<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Services\EngagementAiService;
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
        protected EngagementAiService $aiService,
    ) {}

    public function feed(Request $request): JsonResponse
    {
        $params = $request->validate([
            'filter'   => 'nullable|string|in:priority,all,online,has_contact,active_chat,hot_lead,anonymous,resolved,booking_inquiry,info_request,complaint,cancellation,support',
            'range'    => 'nullable|string|in:today,week,month,all',
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

    /**
     * GET /v1/admin/engagement/filter-counts?range=today|week|month|all
     *
     * Returns per-filter row counts for the active range so the
     * frontend can render "Active chat (12)" / "Online (3)" etc. Cheap:
     * one COUNT per filter, no pagination overhead.
     */
    public function filterCounts(Request $request): JsonResponse
    {
        $params = $request->validate([
            'range' => 'nullable|string|in:today,week,month,all',
        ]);
        $orgId = (int) app('current_organization_id');
        return response()->json([
            'data'  => $this->feedService->filterCounts($orgId, $params['range'] ?? 'all'),
            'range' => $params['range'] ?? 'all',
        ]);
    }

    /**
     * GET /v1/admin/engagement/conversations/{id}/brief
     *
     * Lazy-loaded by the drawer's "AI brief" tab. Cached on the conversation
     * row for 5 min — see EngagementAiService::briefForConversation. Pass
     * `?refresh=1` to force a fresh OpenAI call (used by the "Regenerate"
     * button on the brief tab).
     */
    public function brief(Request $request, int $id): JsonResponse
    {
        // BelongsToOrganization global scope ensures this 404s for cross-tenant ids.
        $conversation = ChatConversation::findOrFail($id);

        $forceRefresh = $request->boolean('refresh');
        return response()->json([
            'data' => $this->aiService->briefForConversation($conversation, $forceRefresh),
        ]);
    }
}
