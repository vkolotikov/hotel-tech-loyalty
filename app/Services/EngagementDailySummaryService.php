<?php

namespace App\Services;

use App\Models\ChatConversation;
use App\Models\Organization;
use App\Models\Visitor;
use Carbon\Carbon;

/**
 * Engagement Hub Phase 4 v3 — gathers the per-org daily summary metrics
 * and renders them. The artisan command (`engagement:send-daily-summary`)
 * loops through opted-in users hourly; this service does the data work.
 *
 * The numbers are the same metrics the agent already sees on /engagement
 * — just rolled up into yesterday's window so a GM gets a single pulse
 * without having to open the dashboard. No new tables, no recompute jobs:
 * everything is a tight aggregate over chat_conversations + visitors.
 */
class EngagementDailySummaryService
{
    /**
     * Build the summary payload for an org, scoped to the day BEFORE the
     * passed reference timestamp (so an 8am email shows yesterday's totals).
     * The caller passes a Carbon already in the org's timezone.
     *
     * @return array{
     *   org_name: string,
     *   date_label: string,
     *   hot_leads_count: int,
     *   leads_total: int,
     *   ai_handled_count: int,
     *   ai_handled_rate: int,
     *   unanswered_now: int,
     *   unanswered_top: array,
     *   booking_visitors_unconverted: int,
     * }
     */
    public function buildSummary(int $orgId, Carbon $orgNow): array
    {
        $tz = $orgNow->timezoneName;
        $startOfYesterday = $orgNow->copy()->subDay()->startOfDay()->utc();
        $endOfYesterday   = $orgNow->copy()->subDay()->endOfDay()->utc();

        $org = Organization::withoutGlobalScopes()->find($orgId);

        // 1. Hot leads captured yesterday — visitors flipped is_lead=true
        //    in the window. Approximation: visitors with is_lead=true whose
        //    updated_at falls in yesterday. Small noise vs. perfect tracking
        //    but cheap and good enough for a daily pulse.
        $hotLeadsCount = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_lead', true)
            ->whereBetween('updated_at', [$startOfYesterday, $endOfYesterday])
            ->count();

        $leadsTotal = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_lead', true)
            ->count();

        // 2. AI-handled conversations yesterday — resolved without a human
        //    being assigned. Same rule as the KPI card.
        $resolvedYesterday = ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('status', 'resolved')
            ->whereBetween('updated_at', [$startOfYesterday, $endOfYesterday])
            ->count();

        $aiHandledCount = ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('status', 'resolved')
            ->where('ai_enabled', true)
            ->whereNull('assigned_to')
            ->whereBetween('updated_at', [$startOfYesterday, $endOfYesterday])
            ->count();

        $aiHandledRate = $resolvedYesterday > 0
            ? (int) round(($aiHandledCount / $resolvedYesterday) * 100)
            : 0;

        // 3. Currently unanswered — top 5 by waiting age. Same heuristic as
        //    the KPI card (active + unassigned + AI off). Returns visitor
        //    name + last_message_at so the GM can act if needed.
        $unanswered = ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('status', 'active')
            ->whereNull('assigned_to')
            ->where('ai_enabled', false)
            ->orderBy('last_message_at')
            ->limit(5)
            ->get(['id', 'visitor_name', 'visitor_email', 'last_message_at']);

        $unansweredNow = ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('status', 'active')
            ->whereNull('assigned_to')
            ->where('ai_enabled', false)
            ->count();

        // 4. Booking-page visitors yesterday who didn't convert (no lead
        //    capture). Approximation: visitors with current_page or any
        //    page_view URL containing /book or /rooms during yesterday,
        //    minus those who became leads.
        $bookingPageUnconverted = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereBetween('updated_at', [$startOfYesterday, $endOfYesterday])
            ->where(function ($q) {
                $q->where('current_page', 'ILIKE', '%/book%')
                  ->orWhere('current_page', 'ILIKE', '%/rooms%');
            })
            ->where('is_lead', false)
            ->count();

        return [
            'org_name'                     => (string) ($org?->name ?? 'Your hotel'),
            'date_label'                   => $orgNow->copy()->subDay()->translatedFormat('l, j F Y'),
            'timezone'                     => $tz,
            'hot_leads_count'              => $hotLeadsCount,
            'leads_total'                  => $leadsTotal,
            'ai_handled_count'             => $aiHandledCount,
            'ai_handled_rate'              => $aiHandledRate,
            'unanswered_now'               => $unansweredNow,
            'unanswered_top'               => $unanswered->map(fn ($c) => [
                'id'              => $c->id,
                'visitor_name'    => $c->visitor_name ?: ($c->visitor_email ?: 'Anonymous'),
                'last_message_at' => $c->last_message_at?->toIso8601String(),
                'waiting_minutes' => $c->last_message_at ? (int) $c->last_message_at->diffInMinutes(now()) : null,
            ])->all(),
            'booking_visitors_unconverted' => $bookingPageUnconverted,
        ];
    }

    /**
     * "Now" for an org accounting for its configured timezone. Falls back
     * to UTC when the org has no timezone set (rare; setup wizard fills it).
     */
    public function orgNow(Organization $org): Carbon
    {
        $tz = $org->timezone ?: 'UTC';
        try {
            return now()->copy()->setTimezone($tz);
        } catch (\Throwable $e) {
            return now()->copy();
        }
    }
}
