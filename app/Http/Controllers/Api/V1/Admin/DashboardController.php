<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingSubmission;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Models\Reservation;
use App\Models\ReviewSubmission;
use App\Models\User;
use App\Models\Visitor;
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

        // Scope the cache key to the current tenant so one org's CRM KPIs
        // don't leak into another's response. (Tenant global scope still
        // fires inside the query — this only fixes the cache collision.)
        $orgId = \Illuminate\Support\Facades\Auth::user()?->organization_id ?? 'anon';
        $crmKpis = Cache::remember("dashboard:crm_kpis:{$orgId}", 300, function () use ($orgId) {
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

            // Occupancy % = in-house / known room inventory. Inventory is
            // derived from distinct apartment_id values in the PMS mirror
            // (Smoobu sync), with a floor of in_house so the value can't
            // exceed 100 %. Returns null when inventory is unknown so the
            // UI can hide the KPI instead of showing a false 0 %.
            $inHouse = (int) $reservationStats->in_house;
            $totalUnits = (int) \App\Models\BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereNotNull('apartment_id')
                ->distinct('apartment_id')
                ->count('apartment_id');
            $occupancyPct = null;
            if ($totalUnits > 0) {
                $occupancyPct = round(min(100, ($inHouse / max($totalUnits, 1)) * 100));
            }

            return [
                'total_guests'      => Guest::count(),
                'active_inquiries'  => (int) $inquiryStats->active_count,
                'pipeline_value'    => (float) $inquiryStats->pipeline_value,
                'arrivals_today'    => (int) $reservationStats->arrivals_today,
                'departures_today'  => (int) $reservationStats->departures_today,
                'in_house_guests'   => $inHouse,
                'occupancy_pct'     => $occupancyPct,
                'total_units'       => $totalUnits,
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

    /**
     * Recent activity feed for the Dashboard + /notifications screen.
     *
     * Broadened from inquiries+reservations only to cover the full operational
     * surface — points awards, member registrations, offer creations, service
     * bookings, chat lead captures, and check-in/out events. Limit per source
     * is kept small (5-8 each) so the merged feed reflects a mix; final cap
     * is 20 for mobile perf.
     */
    public function recentActivity(): JsonResponse
    {
        $inquiries = Inquiry::with('guest:id,full_name')
            ->latest()->limit(8)->get()
            ->map(fn($i) => [
                'id'          => 'i-' . $i->id,
                'type'        => 'inquiry',
                'message'     => "New {$i->inquiry_type} inquiry from " . ($i->guest?->full_name ?? 'unknown'),
                'description' => "New {$i->inquiry_type} inquiry from " . ($i->guest?->full_name ?? 'unknown'),
                'created_at'  => $i->created_at,
                'time_ago'    => $i->created_at?->diffForHumans(),
            ]);

        $reservations = Reservation::with('guest:id,full_name')
            ->latest()->limit(8)->get()
            ->map(fn($r) => [
                'id'          => 'r-' . $r->id,
                'type'        => 'booking',
                'message'     => "Reservation {$r->confirmation_no} for " . ($r->guest?->full_name ?? 'unknown') . " ({$r->status})",
                'description' => "Reservation {$r->confirmation_no} for " . ($r->guest?->full_name ?? 'unknown') . " ({$r->status})",
                'created_at'  => $r->created_at,
                'time_ago'    => $r->created_at?->diffForHumans(),
            ]);

        $points = PointsTransaction::with('member.user:id,name')
            ->latest()->limit(8)->get()
            ->map(function ($p) {
                $memberName = $p->member?->user?->name ?? 'Member';
                $verb = match ($p->type) {
                    'award', 'earn', 'bonus' => '+' . $p->points . ' pts awarded to',
                    'redeem'                 => '-' . abs($p->points) . ' pts redeemed by',
                    'expire'                 => abs($p->points) . ' pts expired for',
                    default                  => $p->points . ' pts adjusted for',
                };
                return [
                    'id'          => 'p-' . $p->id,
                    'type'        => 'points',
                    'message'     => "{$verb} {$memberName}",
                    'description' => "{$verb} {$memberName}" . ($p->description ? " — {$p->description}" : ''),
                    'created_at'  => $p->created_at,
                    'time_ago'    => $p->created_at?->diffForHumans(),
                ];
            });

        $newMembers = LoyaltyMember::with('user:id,name,email', 'tier:id,name')
            ->latest()->limit(5)->get()
            ->map(fn($m) => [
                'id'          => 'm-' . $m->id,
                'type'        => 'member',
                'message'     => "New {$m->tier?->name} member: " . ($m->user?->name ?? $m->user?->email ?? "#{$m->id}"),
                'description' => "New {$m->tier?->name} member: " . ($m->user?->name ?? $m->user?->email ?? "#{$m->id}"),
                'created_at'  => $m->created_at,
                'time_ago'    => $m->created_at?->diffForHumans(),
            ]);

        // Chat leads — captured from the widget via captureLead()
        $chatLeads = ChatConversation::where('lead_captured', true)
            ->whereNotNull('visitor_email')
            ->latest()->limit(5)->get()
            ->map(fn($c) => [
                'id'          => 'c-' . $c->id,
                'type'        => 'chat_lead',
                'message'     => "Chat lead captured: " . ($c->visitor_name ?? $c->visitor_email ?? "#{$c->id}"),
                'description' => "Chat lead captured: " . ($c->visitor_name ?? $c->visitor_email ?? "#{$c->id}"),
                'created_at'  => $c->updated_at,
                'time_ago'    => $c->updated_at?->diffForHumans(),
            ]);

        $merged = $inquiries
            ->concat($reservations)
            ->concat($points)
            ->concat($newMembers)
            ->concat($chatLeads)
            ->sortByDesc('created_at')
            ->take(20)
            ->values();

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

    // ─── Operational "today/now" widgets ─────────────────────────────────────

    /**
     * Members whose birthday falls today (by month+day, ignoring year).
     * Useful for front-desk VIP touches and automated offers.
     */
    public function birthdaysToday(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $today = now();

        $members = LoyaltyMember::with(['user:id,name,email,avatar_url,date_of_birth', 'tier:id,name,color_hex'])
            ->whereHas('user', function ($q) use ($today) {
                $q->whereNotNull('date_of_birth')
                    ->whereRaw('EXTRACT(MONTH FROM date_of_birth) = ?', [$today->month])
                    ->whereRaw('EXTRACT(DAY FROM date_of_birth) = ?', [$today->day]);
            })
            ->where('is_active', true)
            ->limit(20)
            ->get()
            ->map(fn($m) => [
                'id'            => $m->id,
                'name'          => $m->user?->name,
                'email'         => $m->user?->email,
                'avatar_url'    => $m->user?->avatar_url,
                'member_number' => $m->member_number,
                'tier'          => $m->tier?->name,
                'tier_color'    => $m->tier?->color_hex,
                'age'           => $m->user?->date_of_birth
                    ? $today->year - $m->user->date_of_birth->year
                    : null,
            ]);

        // Also check guests (non-member CRM records) with a birthday today.
        $guests = Guest::whereNotNull('date_of_birth')
            ->whereRaw('EXTRACT(MONTH FROM date_of_birth) = ?', [$today->month])
            ->whereRaw('EXTRACT(DAY FROM date_of_birth) = ?', [$today->day])
            ->limit(20)
            ->get(['id', 'full_name', 'email', 'vip_level', 'date_of_birth'])
            ->map(fn($g) => [
                'id'            => 'g-' . $g->id,
                'name'          => $g->full_name,
                'email'         => $g->email,
                'avatar_url'    => null,
                'member_number' => null,
                'tier'          => $g->vip_level ?: 'Guest',
                'tier_color'    => null,
                'age'           => $g->date_of_birth
                    ? $today->year - $g->date_of_birth->year
                    : null,
            ]);

        return response()->json([
            'count' => $members->count() + $guests->count(),
            'items' => $members->concat($guests)->values(),
        ]);
    }

    /**
     * Members within 10% of reaching their next tier.
     * Staff use this to drive "one more stay for Gold" conversations.
     */
    public function tierUpCandidates(): JsonResponse
    {
        $tiers = LoyaltyTier::where('is_active', true)->orderBy('sort_order')->get();
        if ($tiers->count() < 2) {
            return response()->json(['count' => 0, 'items' => []]);
        }

        $candidates = collect();
        foreach ($tiers as $i => $tier) {
            $nextTier = $tiers[$i + 1] ?? null;
            if (!$nextTier) continue;

            $gap = $nextTier->min_points - $tier->min_points;
            if ($gap <= 0) continue;
            $threshold = (int) ($nextTier->min_points - ($gap * 0.10));

            $members = LoyaltyMember::with('user:id,name,email,avatar_url')
                ->where('tier_id', $tier->id)
                ->where('is_active', true)
                ->where('qualifying_points', '>=', $threshold)
                ->where('qualifying_points', '<', $nextTier->min_points)
                ->orderByDesc('qualifying_points')
                ->limit(5)
                ->get()
                ->map(fn($m) => [
                    'id'                => $m->id,
                    'name'              => $m->user?->name,
                    'email'             => $m->user?->email,
                    'avatar_url'        => $m->user?->avatar_url,
                    'member_number'     => $m->member_number,
                    'current_tier'      => $tier->name,
                    'next_tier'         => $nextTier->name,
                    'next_tier_color'   => $nextTier->color_hex,
                    'qualifying_points' => (int) $m->qualifying_points,
                    'points_needed'     => max(0, $nextTier->min_points - (int) $m->qualifying_points),
                    'progress_pct'      => $gap > 0
                        ? min(100, round((($m->qualifying_points - $tier->min_points) / $gap) * 100))
                        : 0,
                ]);

            $candidates = $candidates->concat($members);
        }

        return response()->json([
            'count' => $candidates->count(),
            'items' => $candidates->sortByDesc('progress_pct')->take(10)->values(),
        ]);
    }

    /**
     * Members with points expiring in the next 30 / 60 days.
     * Helps trigger "use your points before they expire" campaigns.
     */
    public function expiringPoints(): JsonResponse
    {
        $now  = now();
        $d30  = $now->copy()->addDays(30);
        $d60  = $now->copy()->addDays(60);

        // Total points scheduled to expire within each window.
        $expiring = PointsTransaction::selectRaw("
            COALESCE(SUM(CASE WHEN expires_at BETWEEN ? AND ? THEN points ELSE 0 END), 0) as points_30,
            COALESCE(SUM(CASE WHEN expires_at BETWEEN ? AND ? THEN points ELSE 0 END), 0) as points_60
        ", [$now, $d30, $now, $d60])
            ->where('type', 'earn')
            ->where('is_reversed', false)
            ->whereNotNull('expires_at')
            ->first();

        // Top 10 members with the largest imminent expiry (next 60 days).
        $topMembers = PointsTransaction::select('member_id', DB::raw('SUM(points) as expiring_points'))
            ->where('type', 'earn')
            ->where('is_reversed', false)
            ->whereNotNull('expires_at')
            ->whereBetween('expires_at', [$now, $d60])
            ->groupBy('member_id')
            ->orderByDesc('expiring_points')
            ->limit(10)
            ->with(['member.user:id,name,email,avatar_url', 'member.tier:id,name,color_hex'])
            ->get()
            ->filter(fn($row) => $row->member)
            ->map(fn($row) => [
                'id'              => $row->member->id,
                'name'            => $row->member->user?->name,
                'email'           => $row->member->user?->email,
                'avatar_url'      => $row->member->user?->avatar_url,
                'member_number'   => $row->member->member_number,
                'tier'            => $row->member->tier?->name,
                'tier_color'      => $row->member->tier?->color_hex,
                'expiring_points' => (int) $row->expiring_points,
            ])
            ->values();

        return response()->json([
            'total_expiring_30d' => (int) $expiring->points_30,
            'total_expiring_60d' => (int) $expiring->points_60,
            'top_members'        => $topMembers,
        ]);
    }

    /**
     * Last 5 review submissions with rating + NPS + comment.
     * Surfaces negative feedback fast so staff can respond.
     */
    public function recentReviews(): JsonResponse
    {
        $reviews = ReviewSubmission::with(['guest:id,full_name', 'member.user:id,name,avatar_url'])
            ->whereNotNull('submitted_at')
            ->latest('submitted_at')
            ->limit(5)
            ->get()
            ->map(fn($r) => [
                'id'             => $r->id,
                'overall_rating' => $r->overall_rating,
                'nps_score'      => $r->nps_score,
                'comment'        => $r->comment,
                'submitted_at'   => $r->submitted_at,
                'time_ago'       => $r->submitted_at?->diffForHumans(),
                'reviewer_name'  => $r->member?->user?->name
                    ?? $r->guest?->full_name
                    ?? $r->anonymous_name
                    ?? 'Anonymous',
                'avatar_url'     => $r->member?->user?->avatar_url,
                'is_detractor'   => $r->nps_score !== null && $r->nps_score <= 6,
            ]);

        $summary = ReviewSubmission::selectRaw("
            COUNT(*) as total,
            AVG(overall_rating) as avg_rating,
            AVG(nps_score) as avg_nps,
            COUNT(CASE WHEN nps_score <= 6 THEN 1 END) as detractors_count
        ")->where('submitted_at', '>=', now()->subDays(30))->first();

        return response()->json([
            'reviews' => $reviews,
            'summary' => [
                'last_30_days'     => (int) $summary->total,
                'avg_rating'       => round((float) $summary->avg_rating, 1),
                'avg_nps'          => round((float) $summary->avg_nps, 1),
                'detractors_count' => (int) $summary->detractors_count,
            ],
        ]);
    }

    /**
     * Recent booking widget submissions that need attention.
     * Either unprocessed (no reservation_id) or recently failed.
     */
    public function pendingBookingSubmissions(): JsonResponse
    {
        $submissions = BookingSubmission::whereIn('outcome', ['pending', 'failed'])
            ->orWhereNull('reservation_id')
            ->latest()
            ->limit(8)
            ->get()
            ->map(fn($s) => [
                'id'                => $s->id,
                'guest_name'        => $s->guest_name,
                'guest_email'       => $s->guest_email,
                'unit_name'         => $s->unit_name,
                'check_in'          => $s->check_in?->toDateString(),
                'check_out'         => $s->check_out?->toDateString(),
                'adults'            => $s->adults,
                'gross_total'       => (float) $s->gross_total,
                'outcome'           => $s->outcome,
                'failure_code'      => $s->failure_code,
                'payment_status'    => $s->payment_status,
                'booking_reference' => $s->booking_reference,
                'created_at'        => $s->created_at,
                'time_ago'          => $s->created_at?->diffForHumans(),
            ]);

        $counts = BookingSubmission::selectRaw("
            COUNT(CASE WHEN outcome = 'pending' THEN 1 END) as pending,
            COUNT(CASE WHEN outcome = 'failed' THEN 1 END) as failed,
            COUNT(CASE WHEN created_at >= ? THEN 1 END) as today
        ", [now()->startOfDay()])->first();

        return response()->json([
            'items'   => $submissions,
            'pending' => (int) $counts->pending,
            'failed'  => (int) $counts->failed,
            'today'   => (int) $counts->today,
        ]);
    }

    /**
     * Live operations counters — everything happening "right now".
     * Online visitors, unassigned chats, waiting chats, pending bookings.
     */
    public function liveOps(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        $onlineVisitors = Visitor::where('last_seen_at', '>=', now()->subSeconds(90))->count();

        $unassignedChats = ChatConversation::whereIn('status', ['active', 'waiting'])
            ->whereNull('assigned_to')
            ->count();

        $waitingChats = ChatConversation::where('status', 'waiting')->count();

        $pendingSubmissions = BookingSubmission::where('outcome', 'pending')
            ->orWhereNull('reservation_id')
            ->count();

        $newLeadsToday = Visitor::where('is_lead', true)
            ->where('created_at', '>=', now()->startOfDay())
            ->count();

        $chatsToday = ChatConversation::where('created_at', '>=', now()->startOfDay())->count();

        return response()->json([
            'online_visitors'      => $onlineVisitors,
            'unassigned_chats'     => $unassignedChats,
            'waiting_chats'        => $waitingChats,
            'pending_submissions'  => $pendingSubmissions,
            'new_leads_today'      => $newLeadsToday,
            'chats_today'          => $chatsToday,
        ]);
    }

    /**
     * Most recent unassigned chat conversations. Mini chat inbox on dashboard.
     */
    public function recentChatActivity(): JsonResponse
    {
        $chats = ChatConversation::with('visitor:id,country,is_lead')
            ->whereIn('status', ['active', 'waiting'])
            ->whereNull('assigned_to')
            ->orderByDesc('last_message_at')
            ->limit(5)
            ->get()
            ->map(fn($c) => [
                'id'              => $c->id,
                'visitor_name'    => $c->visitor_name ?: 'Guest ' . substr((string) $c->id, -4),
                'visitor_email'   => $c->visitor_email,
                'country'         => $c->visitor_country ?: $c->visitor?->country,
                'status'          => $c->status,
                'messages_count'  => $c->messages_count,
                'last_message_at' => $c->last_message_at,
                'time_ago'        => $c->last_message_at?->diffForHumans(),
                'is_lead'         => (bool) $c->lead_captured,
            ]);

        return response()->json($chats);
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
