<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatbotAnalyticsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $days  = min((int) ($request->days ?? 30), 365);
        $from  = now()->subDays($days - 1)->startOfDay();

        // ── Overview KPIs ────────────────────────────────────────────────────
        $total = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->count();

        $leadsTotal = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->where('lead_captured', true)
            ->count();

        // AI resolved = resolved status, never handed to a human agent
        $aiResolved = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->where('status', 'resolved')
            ->whereNull('assigned_to')
            ->count();

        // Human escalated = was assigned to a human agent
        $humanEscalated = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->whereNotNull('assigned_to')
            ->count();

        $avgMessages = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->avg('messages_count') ?? 0;

        // ── Daily conversation trend ─────────────────────────────────────────
        $trendRows = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select(DB::raw("DATE(created_at) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $trend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date    = now()->subDays($i)->format('Y-m-d');
            $trend[] = [
                'date'  => $date,
                'count' => (int) ($trendRows[$date]->count ?? 0),
            ];
        }

        // ── Status breakdown ─────────────────────────────────────────────────
        $statusBreakdown = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->status => (int) $r->count]);

        // ── Top pages ────────────────────────────────────────────────────────
        $topPages = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->whereNotNull('page_url')
            ->where('page_url', '!=', '')
            ->select('page_url', DB::raw('COUNT(*) as count'))
            ->groupBy('page_url')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        // ── Top countries ────────────────────────────────────────────────────
        $topCountries = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->whereNotNull('visitor_country')
            ->where('visitor_country', '!=', '')
            ->select('visitor_country as country', DB::raw('COUNT(*) as count'))
            ->groupBy('visitor_country')
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        // ── Hourly message distribution ──────────────────────────────────────
        $hourlyRows = ChatMessage::join('chat_conversations', 'chat_messages.conversation_id', '=', 'chat_conversations.id')
            ->where('chat_conversations.organization_id', $orgId)
            ->where('chat_messages.created_at', '>=', $from)
            ->where('chat_messages.sender_type', 'visitor')
            ->select(
                DB::raw("EXTRACT(HOUR FROM chat_messages.created_at)::int AS hour"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("EXTRACT(HOUR FROM chat_messages.created_at)::int"))
            ->orderBy('hour')
            ->get()
            ->keyBy('hour');

        $hourly = [];
        for ($h = 0; $h < 24; $h++) {
            $hourly[] = [
                'hour'  => $h,
                'label' => sprintf('%02d:00', $h),
                'count' => (int) ($hourlyRows[$h]->count ?? 0),
            ];
        }

        return response()->json([
            'overview' => [
                'total_conversations'  => $total,
                'leads_captured'       => $leadsTotal,
                'ai_resolved'          => $aiResolved,
                'human_escalated'      => $humanEscalated,
                'avg_messages'         => round((float) $avgMessages, 1),
                'ai_resolution_rate'   => $total > 0 ? round(($aiResolved / $total) * 100, 1) : 0,
                'lead_conversion_rate' => $total > 0 ? round(($leadsTotal  / $total) * 100, 1) : 0,
            ],
            'trend'              => $trend,
            'status_breakdown'   => $statusBreakdown,
            'top_pages'          => $topPages,
            'top_countries'      => $topCountries,
            'hourly_distribution'=> $hourly,
        ]);
    }
}
