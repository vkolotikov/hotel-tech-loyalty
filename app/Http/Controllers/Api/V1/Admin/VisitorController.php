<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\Visitor;
use App\Models\VisitorPageView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

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
        $threshold = now()->subSeconds(self::ONLINE_THRESHOLD_SECONDS);

        // Tenant scope is applied automatically by BelongsToOrganization trait.
        $query = Visitor::with('guest:id,full_name,email,phone,lifecycle_status,lead_source');

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

        // Single aggregated query for stats — replaces 4 separate COUNT queries.
        $statsRow = Visitor::selectRaw(
            'COUNT(*) AS total,
             SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS online,
             SUM(CASE WHEN last_seen_at IS NULL OR last_seen_at < ? THEN 1 ELSE 0 END) AS offline,
             SUM(CASE WHEN is_lead = true THEN 1 ELSE 0 END) AS leads',
            [$threshold, $threshold]
        )->first();

        $stats = [
            'online'  => (int) ($statsRow->online ?? 0),
            'offline' => (int) ($statsRow->offline ?? 0),
            'leads'   => (int) ($statsRow->leads ?? 0),
            'total'   => (int) ($statsRow->total ?? 0),
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
        // Tenant scope is applied automatically by BelongsToOrganization trait.
        $visitor = Visitor::with('guest')->findOrFail($id);

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

    /**
     * POST /v1/admin/visitors/{id}/start-chat
     * Returns the visitor's most recent conversation (or creates a new one)
     * so an admin can jump straight into chat-inbox and message them.
     */
    public function startChat(Request $request, int $id): JsonResponse
    {
        // Tenant scope is applied automatically by BelongsToOrganization trait.
        $visitor = Visitor::findOrFail($id);

        $conv = ChatConversation::where('visitor_id', $visitor->id)
            ->orderByDesc('last_message_at')
            ->first();

        if (!$conv) {
            $conv = ChatConversation::create([
                'visitor_id'      => $visitor->id,
                'session_id'      => (string) Str::uuid(),
                'channel'         => 'admin_initiated',
                'status'          => 'active',
                'visitor_name'    => $visitor->display_name ?: 'Visitor',
                'visitor_email'   => $visitor->email,
                'visitor_phone'   => $visitor->phone,
                'visitor_ip'      => $visitor->visitor_ip,
                'messages_count'  => 0,
                'last_message_at' => now(),
                'assigned_to'     => $request->user()->id,
            ]);
        }

        return response()->json(['conversation_id' => $conv->id]);
    }

    /**
     * DELETE /v1/admin/visitors/{id}
     * Hard-delete a visitor and everything tied to them: page views, chat
     * conversations + messages. Used to scrub bot/test/spam visitors from
     * the inbox so admins can keep the live list focused on real people.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        // Tenant scope is applied automatically by BelongsToOrganization trait.
        $visitor = Visitor::findOrFail($id);

        \DB::transaction(function () use ($visitor) {
            VisitorPageView::where('visitor_id', $visitor->id)->delete();
            // Conversations cascade-delete their messages via the FK on
            // chat_messages.conversation_id, so deleting the conversation row
            // is enough.
            ChatConversation::where('visitor_id', $visitor->id)->delete();
            $visitor->delete();
        });

        return response()->json(['message' => 'Visitor removed.']);
    }
}
