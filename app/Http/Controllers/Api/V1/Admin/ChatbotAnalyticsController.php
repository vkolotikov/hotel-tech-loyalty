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
        // Previous-period window of equal length, ending the instant
        // the current window begins. Used for delta computation on
        // every overview KPI + an overlay line on the trend chart.
        $prevFrom = (clone $from)->subDays($days);
        $prevTo   = (clone $from)->subSecond();

        // ── Overview KPIs (current period) ───────────────────────────────────
        $overview = $this->computeOverview($orgId, $from, null);
        $prevOverview = $this->computeOverview($orgId, $prevFrom, $prevTo);

        // Pull values back out for downstream use.
        $total          = $overview['total_conversations'];
        $leadsTotal     = $overview['leads_captured'];
        $aiResolved     = $overview['ai_resolved'];
        $humanEscalated = $overview['human_escalated'];
        $avgMessages    = $overview['avg_messages'];

        // ── Daily conversation trend + previous-period overlay ─────────────
        // Two queries (current + previous) keyed by relative day-offset so
        // the chart can compare apples-to-apples regardless of calendar
        // weeks. Both arrays are length $days, indexed by day-from-start.
        $trendRows = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select(DB::raw("DATE(created_at) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $prevTrendRows = ChatConversation::where('organization_id', $orgId)
            ->whereBetween('created_at', [$prevFrom, $prevTo])
            ->select(DB::raw("DATE(created_at) as date"), DB::raw('COUNT(*) as count'))
            ->groupBy(DB::raw('DATE(created_at)'))
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        $trend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date    = now()->subDays($i)->format('Y-m-d');
            $prevDate = now()->subDays($i + $days)->format('Y-m-d');
            $trend[] = [
                'date'      => $date,
                'count'     => (int) ($trendRows[$date]->count ?? 0),
                'prevCount' => (int) ($prevTrendRows[$prevDate]->count ?? 0),
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

        // ── Weekday distribution (Mon-Sun) ───────────────────────────────────
        // Postgres EXTRACT(DOW) returns 0=Sunday..6=Saturday. We re-shift
        // to 0=Monday..6=Sunday so the chart reads left-to-right naturally.
        $weekdayRows = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select(
                DB::raw("EXTRACT(DOW FROM created_at)::int AS dow"),
                DB::raw('COUNT(*) as count')
            )
            ->groupBy(DB::raw("EXTRACT(DOW FROM created_at)::int"))
            ->get()
            ->keyBy('dow');

        $weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        $weekday = [];
        foreach ([1, 2, 3, 4, 5, 6, 0] as $i => $dow) {
            $weekday[] = [
                'dow'   => $dow,
                'label' => $weekdayLabels[$i],
                'count' => (int) ($weekdayRows[$dow]->count ?? 0),
            ];
        }

        // ── Intent breakdown ─────────────────────────────────────────────────
        // The Engagement Hub tags every conversation with one of seven
        // canonical intents; missing values bucket into "Untagged" so
        // the chart still adds up to 100%.
        $intentRows = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select('intent_tag', DB::raw('COUNT(*) as count'))
            ->groupBy('intent_tag')
            ->get();
        $intentBreakdown = $intentRows->map(fn ($r) => [
            'intent' => $r->intent_tag ?: 'untagged',
            'count'  => (int) $r->count,
        ])->sortByDesc('count')->values();

        // ── Lead-capture funnel ──────────────────────────────────────────────
        // Conversations → with any visitor message → with contact captured →
        // confirmed lead. Lets the chart show drop-off at each stage.
        $withMessage = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->where('messages_count', '>', 0)
            ->count();
        $withContact = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->where(function ($q) {
                $q->whereNotNull('visitor_email')->orWhereNotNull('visitor_phone');
            })
            ->count();
        $funnel = [
            ['stage' => 'conversations', 'count' => $total],
            ['stage' => 'engaged',       'count' => $withMessage],
            ['stage' => 'with_contact',  'count' => $withContact],
            ['stage' => 'lead_captured', 'count' => $leadsTotal],
        ];

        return response()->json([
            'overview' => array_merge($overview, [
                'ai_resolution_rate'      => $total > 0 ? round(($aiResolved / $total) * 100, 1) : 0,
                'lead_conversion_rate'    => $total > 0 ? round(($leadsTotal / $total) * 100, 1) : 0,
                'human_escalation_rate'   => $total > 0 ? round(($humanEscalated / $total) * 100, 1) : 0,
            ]),
            'previous_overview' => array_merge($prevOverview, [
                'ai_resolution_rate'      => $prevOverview['total_conversations'] > 0 ? round(($prevOverview['ai_resolved'] / $prevOverview['total_conversations']) * 100, 1) : 0,
                'lead_conversion_rate'    => $prevOverview['total_conversations'] > 0 ? round(($prevOverview['leads_captured'] / $prevOverview['total_conversations']) * 100, 1) : 0,
                'human_escalation_rate'   => $prevOverview['total_conversations'] > 0 ? round(($prevOverview['human_escalated'] / $prevOverview['total_conversations']) * 100, 1) : 0,
            ]),
            'period_days'         => $days,
            'trend'               => $trend,
            'status_breakdown'    => $statusBreakdown,
            'top_pages'           => $topPages,
            'top_countries'       => $topCountries,
            'hourly_distribution' => $hourly,
            'weekday_distribution'=> $weekday,
            'intent_breakdown'    => $intentBreakdown,
            'funnel'              => $funnel,
        ]);
    }

    /**
     * Shared overview-KPIs computation. Used for both the current and
     * the previous-period blocks. Pass `$to=null` to mean "now"; passing
     * an explicit upper bound makes the previous-window query exclusive
     * of the current window.
     */
    protected function computeOverview(int $orgId, $from, $to): array
    {
        $q = fn () => ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->when($to, fn ($q2) => $q2->where('created_at', '<=', $to));

        $total          = $q()->count();
        $leadsTotal     = $q()->where('lead_captured', true)->count();
        $aiResolved     = $q()->where('status', 'resolved')->whereNull('assigned_to')->count();
        $humanEscalated = $q()->whereNotNull('assigned_to')->count();
        $avgMessages    = $q()->avg('messages_count') ?? 0;

        return [
            'total_conversations' => $total,
            'leads_captured'      => $leadsTotal,
            'ai_resolved'         => $aiResolved,
            'human_escalated'     => $humanEscalated,
            'avg_messages'        => round((float) $avgMessages, 1),
        ];
    }
}
