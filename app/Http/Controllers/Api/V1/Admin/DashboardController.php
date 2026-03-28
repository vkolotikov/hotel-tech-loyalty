<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Services\AnalyticsService;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        $today = now()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        $crmKpis = [
            'total_guests'       => Guest::count(),
            'active_inquiries'   => Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->count(),
            'pipeline_value'     => (float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value'),
            'arrivals_today'     => Reservation::where('check_in', $today)->where('status', 'Confirmed')->count(),
            'departures_today'   => Reservation::where('check_out', $today)->where('status', 'Checked In')->count(),
            'in_house_guests'    => Reservation::where('status', 'Checked In')->count(),
            'crm_revenue_month'  => (float) Reservation::where('status', 'Checked Out')->where('checked_out_at', '>=', $monthStart)->sum('total_amount'),
            'avg_daily_rate'     => (float) Reservation::whereIn('status', ['Confirmed', 'Checked In', 'Checked Out'])->where('check_in', '>=', $monthStart)->avg('rate_per_night'),
            'conversion_rate'    => $this->conversionRate(),
        ];

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
                'id'         => 'i-' . $i->id,
                'type'       => 'inquiry',
                'message'    => "New {$i->inquiry_type} inquiry from {$i->guest?->full_name}",
                'created_at' => $i->created_at,
            ]);

        $reservations = Reservation::with('guest:id,full_name')
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn($r) => [
                'id'         => 'r-' . $r->id,
                'type'       => 'reservation',
                'message'    => "Reservation {$r->confirmation_no} for {$r->guest?->full_name} ({$r->status})",
                'created_at' => $r->created_at,
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

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function conversionRate(): float
    {
        $total = Inquiry::count();
        if ($total === 0) return 0;
        $confirmed = Inquiry::where('status', 'Confirmed')->count();
        return round(($confirmed / $total) * 100, 1);
    }
}
