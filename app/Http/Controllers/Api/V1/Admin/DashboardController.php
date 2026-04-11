<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Services\AnalyticsService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(
        protected AnalyticsService $analytics,
        protected OpenAiService $openAi,
    ) {}

    public function kpis(): JsonResponse
    {
        $loyaltyKpis = $this->analytics->getDashboardKpis();

        $crmKpis = Cache::remember('dashboard:crm_kpis', 300, function () {
            $today = now()->toDateString();
            $monthStart = now()->startOfMonth()->toDateString();

            // Batch inquiry stats into one query (was 3 queries → 1)
            $inquiryStats = Inquiry::selectRaw("
                COUNT(CASE WHEN status NOT IN ('Confirmed','Lost') THEN 1 END) as active_count,
                COALESCE(SUM(CASE WHEN status NOT IN ('Confirmed','Lost') THEN total_value END), 0) as pipeline_value,
                COUNT(*) as total_count,
                COUNT(CASE WHEN status = 'Confirmed' THEN 1 END) as confirmed_count
            ")->first();

            // Batch reservation stats into one query (was 5 queries → 1)
            $reservationStats = Reservation::selectRaw("
                COUNT(CASE WHEN check_in = ? AND status = 'Confirmed' THEN 1 END) as arrivals_today,
                COUNT(CASE WHEN check_out = ? AND status = 'Checked In' THEN 1 END) as departures_today,
                COUNT(CASE WHEN status = 'Checked In' THEN 1 END) as in_house,
                COALESCE(SUM(CASE WHEN status = 'Checked Out' AND checked_out_at >= ? THEN total_amount END), 0) as revenue_month,
                AVG(CASE WHEN status IN ('Confirmed','Checked In','Checked Out') AND check_in >= ? THEN rate_per_night END) as avg_rate
            ", [$today, $today, $monthStart, $monthStart])->first();

            $totalInquiries = (int) $inquiryStats->total_count;
            $confirmedInquiries = (int) $inquiryStats->confirmed_count;

            return [
                'total_guests'      => Guest::count(),
                'active_inquiries'  => (int) $inquiryStats->active_count,
                'pipeline_value'    => (float) $inquiryStats->pipeline_value,
                'arrivals_today'    => (int) $reservationStats->arrivals_today,
                'departures_today'  => (int) $reservationStats->departures_today,
                'in_house_guests'   => (int) $reservationStats->in_house,
                'crm_revenue_month' => (float) $reservationStats->revenue_month,
                'avg_daily_rate'    => (float) ($reservationStats->avg_rate ?? 0),
                'conversion_rate'   => $totalInquiries > 0 ? round(($confirmedInquiries / $totalInquiries) * 100, 1) : 0,
            ];
        });

        return response()->json(array_merge($loyaltyKpis, $crmKpis));
    }

    public function pointsChart(Request $request): JsonResponse
    {
        $days = $request->get('days', 30);
        return response()->json($this->analytics->getPointsOverTime($days));
    }

    public function memberGrowth(Request $request): JsonResponse
    {
        $months = $request->get('months', 12);
        return response()->json($this->analytics->getMemberGrowth($months));
    }

    public function topMembers(): JsonResponse
    {
        return response()->json($this->analytics->getTopMembers(10));
    }

    public function aiInsights(): JsonResponse
    {
        $kpis = $this->analytics->getWeeklyKpiSummary();
        $insight = $this->openAi->generateInsightReport($kpis);
        return response()->json(['insight' => $insight, 'kpis' => $kpis]);
    }

    public function weekComparison(): JsonResponse
    {
        return response()->json($this->analytics->getWeeklyKpiSummary());
    }

    public function bookingTrends(Request $request): JsonResponse
    {
        return response()->json($this->analytics->getBookingTrends($request->get('days', 14)));
    }

    // ─── CRM Dashboard Endpoints ─────────────────────────────────────────────

    public function arrivalsToday(): JsonResponse
    {
        $arrivals = Reservation::with(['guest:id,full_name,company,vip_level,phone,email', 'property:id,name,code'])
            ->where('check_in', now()->toDateString())
            ->whereIn('status', ['Confirmed'])
            ->orderBy('created_at')
            ->get()
            ->map(fn($r) => [
                'id'            => $r->id,
                'guest_name'    => $r->guest?->full_name,
                'vip_level'     => $r->guest?->vip_level ?? 'Standard',
                'room_type'     => $r->room_type,
                'check_in_time' => '14:00',
                'property'      => $r->property?->name ?? '',
                'special_notes' => $r->special_requests,
            ]);
        return response()->json($arrivals);
    }

    public function departuresToday(): JsonResponse
    {
        $departures = Reservation::with(['guest:id,full_name,company,vip_level,phone,email', 'property:id,name,code'])
            ->where('check_out', now()->toDateString())
            ->where('status', 'Checked In')
            ->orderBy('created_at')
            ->get()
            ->map(fn($r) => [
                'id'             => $r->id,
                'guest_name'     => $r->guest?->full_name,
                'vip_level'      => $r->guest?->vip_level ?? 'Standard',
                'room_type'      => $r->room_type,
                'check_out_time' => '11:00',
                'property'       => $r->property?->name ?? '',
                'special_notes'  => $r->special_requests,
            ]);
        return response()->json($departures);
    }

    public function inquiriesByStatus(): JsonResponse
    {
        $data = Inquiry::select('status', DB::raw('count(*) as count'), DB::raw('coalesce(sum(total_value),0) as value'))
            ->groupBy('status')
            ->orderByDesc('count')
            ->get();
        return response()->json($data);
    }

    public function recentActivity(): JsonResponse
    {
        $inquiries = Inquiry::with('guest:id,full_name')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn($i) => [
                'id'          => 'i-' . $i->id,
                'type'        => 'inquiry',
                'message'     => "New {$i->inquiry_type} inquiry from {$i->guest?->full_name}",
                'description' => "New {$i->inquiry_type} inquiry from {$i->guest?->full_name}",
                'created_at'  => $i->created_at,
                'time_ago'    => $i->created_at?->diffForHumans(),
            ]);

        $reservations = Reservation::with('guest:id,full_name')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn($r) => [
                'id'          => 'r-' . $r->id,
                'type'        => 'booking',
                'message'     => "Reservation {$r->confirmation_no} for {$r->guest?->full_name} ({$r->status})",
                'description' => "Reservation {$r->confirmation_no} for {$r->guest?->full_name} ({$r->status})",
                'created_at'  => $r->created_at,
                'time_ago'    => $r->created_at?->diffForHumans(),
            ]);

        $merged = $inquiries->concat($reservations)->sortByDesc('created_at')->take(15)->values();
        return response()->json($merged);
    }

    public function tasksDue(): JsonResponse
    {
        $today = now()->toDateString();

        $inquiryTasks = Inquiry::with('guest:id,full_name')
            ->where('next_task_completed', false)
            ->whereNotNull('next_task_due')
            ->where('next_task_due', '<=', now()->addDays(3)->toDateString())
            ->orderBy('next_task_due')
            ->limit(10)
            ->get()
            ->map(fn($i) => [
                'id'         => $i->id,
                'title'      => ($i->next_task_type ?? 'Follow-up') . ' — ' . ($i->guest?->full_name ?? 'Unknown'),
                'due_date'   => $i->next_task_due?->toDateString(),
                'assignee'   => $i->assigned_to,
                'is_overdue' => $i->next_task_due?->toDateString() < $today,
                'priority'   => $i->priority ?? 'Medium',
            ]);

        return response()->json($inquiryTasks);
    }

    /**
     * Bundled dashboard summary for the mobile staff app.
     *
     * Replaces 9 parallel HTTP requests (kpis, arrivals, departures, chat stats,
     * tasks, inquiries, activity, week comp, booking trends) with a single
     * roundtrip. On flaky carrier signal that's the difference between a
     * dashboard that loads in one tap vs. one that partially fails and shows
     * blank cards.
     *
     * Each of the 9 underlying methods stays exposed individually so the web
     * admin SPA — which already paginates these views independently — keeps
     * working unchanged.
     */
    public function summary(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        // Inline chat stats — keeps the bundle in one query block instead of
        // resolving ChatInboxController via the container just for one method.
        $chatStats = [
            'active'         => ChatConversation::where('organization_id', $orgId)->where('status', 'active')->count(),
            'waiting'        => ChatConversation::where('organization_id', $orgId)->where('status', 'waiting')->count(),
            'unassigned'     => ChatConversation::where('organization_id', $orgId)
                                    ->whereIn('status', ['active', 'waiting'])
                                    ->whereNull('assigned_to')->count(),
            'resolved_today' => ChatConversation::where('organization_id', $orgId)
                                    ->where('status', 'resolved')
                                    ->where('updated_at', '>=', today())->count(),
        ];

        return response()->json([
            'kpis'            => $this->kpis()->getData(true),
            'arrivals'        => $this->arrivalsToday()->getData(true),
            'departures'      => $this->departuresToday()->getData(true),
            'chat_stats'      => $chatStats,
            'tasks'           => $this->tasksDue()->getData(true),
            'inquiry_stats'   => $this->inquiriesByStatus()->getData(true),
            'activity'        => $this->recentActivity()->getData(true),
            'week_comparison' => $this->weekComparison()->getData(true),
            'booking_trends'  => $this->bookingTrends($request)->getData(true),
        ]);
    }
}
