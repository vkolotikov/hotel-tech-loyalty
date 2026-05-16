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
        // Three series per day: total conversations, engaged
        // conversations (visitor sent ≥1 message), AI-resolved count.
        // Plus the previous-period total for the comparison overlay.
        $trendRows = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->select(
                DB::raw("DATE(created_at) as date"),
                DB::raw('COUNT(*) as count'),
                DB::raw("SUM(CASE WHEN messages_count > 0 THEN 1 ELSE 0 END) as engaged_count"),
                DB::raw("SUM(CASE WHEN status = 'resolved' AND assigned_to IS NULL THEN 1 ELSE 0 END) as ai_resolved_count")
            )
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
            $row = $trendRows[$date] ?? null;
            $total = (int) ($row->count ?? 0);
            $eng   = (int) ($row->engaged_count ?? 0);
            $aiRes = (int) ($row->ai_resolved_count ?? 0);
            $trend[] = [
                'date'          => $date,
                'count'         => $total,
                'engagedCount'  => $eng,
                'aiResolved'    => $aiRes,
                'aiResolutionRate' => $total > 0 ? round(($aiRes / $total) * 100, 1) : 0,
                'prevCount'     => (int) ($prevTrendRows[$prevDate]->count ?? 0),
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
        // chat_conversations.visitor_country is sparsely populated — most
        // chats inherit geo from the linked visitors table instead. Use
        // COALESCE so the chart reflects all geo-resolved rows.
        // Postgres needs the full expression in GROUP BY. Aliasing the
        // FROM table breaks the BelongsToOrganization global scope
        // (TenantScope adds chat_conversations.organization_id and
        // Postgres can't resolve it when the table is aliased) so we
        // join without aliases.
        $topCountries = ChatConversation::leftJoin('visitors', 'chat_conversations.visitor_id', '=', 'visitors.id')
            ->where('chat_conversations.organization_id', $orgId)
            ->where('chat_conversations.created_at', '>=', $from)
            ->selectRaw("COALESCE(NULLIF(chat_conversations.visitor_country, ''), NULLIF(visitors.country, '')) as country, COUNT(*) as count")
            ->whereRaw("COALESCE(NULLIF(chat_conversations.visitor_country, ''), NULLIF(visitors.country, '')) IS NOT NULL")
            ->groupByRaw("COALESCE(NULLIF(chat_conversations.visitor_country, ''), NULLIF(visitors.country, ''))")
            ->orderByDesc('count')
            ->limit(10)
            ->get();

        // ── Hourly distribution — three series ───────────────────────────────
        // 1) conversations  = distinct conversation_id touched per hour
        // 2) visitors       = distinct visitor_id touched per hour
        // 3) replies        = visitor-typed messages per hour
        $hourlyRaw = ChatMessage::join('chat_conversations', 'chat_messages.conversation_id', '=', 'chat_conversations.id')
            ->where('chat_conversations.organization_id', $orgId)
            ->where('chat_messages.created_at', '>=', $from)
            ->selectRaw("
                EXTRACT(HOUR FROM chat_messages.created_at)::int AS hour,
                COUNT(DISTINCT chat_conversations.id) AS conversations,
                COUNT(DISTINCT chat_conversations.visitor_id) AS visitors,
                SUM(CASE WHEN chat_messages.sender_type = 'visitor' THEN 1 ELSE 0 END) AS replies
            ")
            ->groupByRaw('EXTRACT(HOUR FROM chat_messages.created_at)::int')
            ->orderByRaw('EXTRACT(HOUR FROM chat_messages.created_at)::int')
            ->get()
            ->keyBy('hour');

        $hourly = [];
        for ($h = 0; $h < 24; $h++) {
            $row = $hourlyRaw[$h] ?? null;
            $hourly[] = [
                'hour'          => $h,
                'label'         => sprintf('%02d:00', $h),
                // Legacy `count` kept for back-compat — used to be the
                // visitor-replies count; now matches that series.
                'count'         => (int) ($row->replies ?? 0),
                'conversations' => (int) ($row->conversations ?? 0),
                'visitors'      => (int) ($row->visitors ?? 0),
                'replies'       => (int) ($row->replies ?? 0),
            ];
        }

        // ── Weekday distribution (Mon-Sun) ───────────────────────────────────
        // Three series per day mirroring the hourly chart:
        //   conversations / visitors / replies.
        $weekdayRows = ChatMessage::join('chat_conversations', 'chat_messages.conversation_id', '=', 'chat_conversations.id')
            ->where('chat_conversations.organization_id', $orgId)
            ->where('chat_messages.created_at', '>=', $from)
            ->selectRaw("
                EXTRACT(DOW FROM chat_messages.created_at)::int AS dow,
                COUNT(DISTINCT chat_conversations.id) AS conversations,
                COUNT(DISTINCT chat_conversations.visitor_id) AS visitors,
                SUM(CASE WHEN chat_messages.sender_type = 'visitor' THEN 1 ELSE 0 END) AS replies
            ")
            ->groupByRaw('EXTRACT(DOW FROM chat_messages.created_at)::int')
            ->get()
            ->keyBy('dow');

        $weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        $weekday = [];
        foreach ([1, 2, 3, 4, 5, 6, 0] as $i => $dow) {
            $row = $weekdayRows[$dow] ?? null;
            $weekday[] = [
                'dow'           => $dow,
                'label'         => $weekdayLabels[$i],
                'count'         => (int) ($row->conversations ?? 0), // legacy alias
                'conversations' => (int) ($row->conversations ?? 0),
                'visitors'      => (int) ($row->visitors ?? 0),
                'replies'       => (int) ($row->replies ?? 0),
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

        // ── Conversation length distribution ─────────────────────────────────
        // Buckets: 0 msg / 1–2 / 3–5 / 6–10 / 11–20 / 21+. Helps spot
        // whether visitors bail early (AI greeter only) or carry full
        // conversations.
        $lenRow = ChatConversation::where('organization_id', $orgId)
            ->where('created_at', '>=', $from)
            ->selectRaw("
                SUM(CASE WHEN messages_count = 0 THEN 1 ELSE 0 END) as b0,
                SUM(CASE WHEN messages_count BETWEEN 1 AND 2 THEN 1 ELSE 0 END) as b1,
                SUM(CASE WHEN messages_count BETWEEN 3 AND 5 THEN 1 ELSE 0 END) as b2,
                SUM(CASE WHEN messages_count BETWEEN 6 AND 10 THEN 1 ELSE 0 END) as b3,
                SUM(CASE WHEN messages_count BETWEEN 11 AND 20 THEN 1 ELSE 0 END) as b4,
                SUM(CASE WHEN messages_count > 20 THEN 1 ELSE 0 END) as b5
            ")
            ->first();
        $lengthDistribution = [
            ['bucket' => 'none',  'label' => '0 msg',  'count' => (int) ($lenRow->b0 ?? 0)],
            ['bucket' => '1_2',   'label' => '1–2',    'count' => (int) ($lenRow->b1 ?? 0)],
            ['bucket' => '3_5',   'label' => '3–5',    'count' => (int) ($lenRow->b2 ?? 0)],
            ['bucket' => '6_10',  'label' => '6–10',   'count' => (int) ($lenRow->b3 ?? 0)],
            ['bucket' => '11_20', 'label' => '11–20',  'count' => (int) ($lenRow->b4 ?? 0)],
            ['bucket' => '21_up', 'label' => '21+',    'count' => (int) ($lenRow->b5 ?? 0)],
        ];

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
            'length_distribution' => $lengthDistribution,
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
