<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\Visitor;
use App\Models\VisitorPageView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Persistent visitor identities surfaced from the chat widget.
 * Provides online/offline status, page view history, and lead linking.
 */
class VisitorController extends Controller
{
    private const ONLINE_THRESHOLD_SECONDS = 90;

    /**
     * GET /v1/admin/visitors
     * Filters: status=online|offline|all, search, lead_only, page
     */
    public function index(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $threshold = now()->subSeconds(self::ONLINE_THRESHOLD_SECONDS);

        $query = Visitor::where('organization_id', $orgId)
            ->with('guest:id,full_name,email,phone,lifecycle_status,lead_source');

        $status = $request->get('status', 'all');
        if ($status === 'online') {
            $query->where('last_seen_at', '>=', $threshold);
        } elseif ($status === 'offline') {
            $query->where(function ($q) use ($threshold) {
                $q->whereNull('last_seen_at')->orWhere('last_seen_at', '<', $threshold);
            });
        }

        if ($request->boolean('lead_only')) {
            $query->where('is_lead', true);
        }

        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('display_name', 'ILIKE', "%{$search}%")
                  ->orWhere('email', 'ILIKE', "%{$search}%")
                  ->orWhere('phone', 'ILIKE', "%{$search}%")
                  ->orWhere('visitor_ip', 'ILIKE', "%{$search}%")
                  ->orWhere('current_page', 'ILIKE', "%{$search}%");
            });
        }

        $visitors = $query->orderByDesc('last_seen_at')->paginate(50);

        $stats = [
            'online'  => Visitor::where('organization_id', $orgId)->where('last_seen_at', '>=', $threshold)->count(),
            'offline' => Visitor::where('organization_id', $orgId)
                ->where(fn($q) => $q->whereNull('last_seen_at')->orWhere('last_seen_at', '<', $threshold))->count(),
            'leads'   => Visitor::where('organization_id', $orgId)->where('is_lead', true)->count(),
            'total'   => Visitor::where('organization_id', $orgId)->count(),
        ];

        return response()->json([
            'data'  => $visitors->items(),
            'meta'  => [
                'current_page' => $visitors->currentPage(),
                'last_page'    => $visitors->lastPage(),
                'per_page'     => $visitors->perPage(),
                'total'        => $visitors->total(),
            ],
            'stats' => $stats,
        ]);
    }

    /**
     * GET /v1/admin/visitors/{id}
     * Returns visitor + page view history + linked chat conversations + linked guest.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        $visitor = Visitor::where('organization_id', $orgId)
            ->with('guest')
            ->findOrFail($id);

        $pageViews = VisitorPageView::where('visitor_id', $id)
            ->orderByDesc('viewed_at')
            ->limit(200)
            ->get();

        $conversations = ChatConversation::where('visitor_id', $id)
            ->select(['id', 'session_id', 'channel', 'status', 'visitor_name', 'messages_count', 'lead_captured', 'last_message_at', 'created_at'])
            ->orderByDesc('last_message_at')
            ->limit(50)
            ->get();

        return response()->json([
            'visitor'       => $visitor,
            'page_views'    => $pageViews,
            'conversations' => $conversations,
        ]);
    }
}
