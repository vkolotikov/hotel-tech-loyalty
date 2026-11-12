/** What `GET chatbot/analytics?days=` answers (App\Http\Controllers\Api\V1\Admin\ChatbotAnalyticsController). */
export interface ChatOverview {
  total_conversations: number
  leads_captured: number
  ai_resolved: number
  human_escalated: number
  avg_messages: number
  ai_resolution_rate: number
  lead_conversion_rate: number
  human_escalation_rate: number
}

export interface ChatTrendPoint {
  /** A UTC day, `YYYY-MM-DD`. */
  date: string
  count: number
  engagedCount: number
  aiResolved: number
  aiResolutionRate: number
  prevCount: number
}

export interface ChatHourPoint {
  /** The hour of the day in UTC (the server's clock), 0–23. */
  hour: number
  label: string
  conversations: number
  visitors: number
  replies: number
}

export interface ChatAnalytics {
  overview: ChatOverview
  previous_overview: ChatOverview
  period_days: number
  trend: ChatTrendPoint[]
  status_breakdown: Record<string, number> | unknown[]
  top_pages: { page_url: string; count: number }[]
  top_countries: { country: string; count: number }[]
  hourly_distribution: ChatHourPoint[]
  funnel: { stage: string; count: number }[]
  /** Round 5: Mon–Sun on the venue's clock (`dow` 0 = Sunday), each with conversations, visitors and their messages. */
  weekday_distribution?: { dow: number; label: string; conversations: number; visitors: number; replies: number }[]
  /** Round 5: the conversations by the intent the engagement AI tagged (`untagged` before it has). */
  intent_breakdown?: { intent: string; count: number }[]
  /** Round 5: the conversations by their number of messages. */
  length_distribution?: { bucket: string; label: string; count: number }[]
}

/** `GET inquiries/kpis` (InquiryController::kpis). */
export interface LeadKpis {
  total: number
  due_today: number
  overdue: number
  estimated_value: number
  new_this_week: number
  new_delta_pct: number | null
}

/** One lead of a signal's sample (InquiryController::insights). */
export interface SignalLead {
  id: number
  total_value: string | number | null
  guest: { id: number; full_name: string | null; company: string | null } | null
}

/** `GET inquiries/insights`: the four signals a sales manager wants flagged. */
export interface LeadSignals {
  cold: { count: number; sample: SignalLead[] }
  high_value: { total: number; sample: SignalLead[] }
  unassigned: { count: number; sample: SignalLead[] }
  stuck: { count: number; sample: SignalLead[] }
}

/** `GET pipelines` (PipelineController::index): each pipeline with its stages and how many leads sit in each. */
export interface PipelineStage {
  id: number
  name: string
  kind: 'open' | 'won' | 'lost' | string
  sort_order: number
  inquiries_count: number
}

export interface Pipeline {
  id: number
  name: string
  is_default: boolean
  sort_order: number
  inquiries_count: number
  stages: PipelineStage[]
}

/** `GET inquiry-lost-reasons-admin` (managers): each reason with the leads lost to it. */
export interface LostReasonCount {
  id: number
  label: string
  is_active: boolean
  inquiries_count: number
}

/** `GET deals/analytics?days=` (DealController::analytics): the deals' days are the server's (UTC) days. */
export interface DealAnalytics {
  period_days: number
  revenue_trend: { date: string; count: number; revenue: number }[]
  new_deal_trend: { date: string; count: number }[]
  stage_distribution: { stage: string; count: number; revenue: number }[]
  payment_distribution: { status: string; count: number }[]
  cycle_time_days: number
  top_customers: { guest_id: number; name: string; company: string | null; deals: number; revenue: number }[]
  stuck_deals: number
}

/** `GET crm/reports/funnel?months=` (SalesReports::funnel, the full admin's analytics/inquiry-funnel). */
export interface FunnelReport {
  months: number
  stages: { stage: string; count: number; value: number; rate_from_prev: number; rate_from_start: number }[]
  won: number
  lost: number
  win_rate_pct: number
  avg_days_to_close: number | null
}

/** `GET crm/reports/forecast?months=`: open value weighted by its chance, by expected month (`key` YYYY-MM, or `beyond`). */
export interface ForecastReport {
  buckets: { month: string; key: string; gross_value: number; expected_value: number; deal_count: number }[]
  total_gross: number
  total_expected: number
  months: number
}

/** `GET crm/reports/lost-reasons?months=`. */
export interface LostReport {
  reasons: { label: string; count: number; lost_value: number }[]
  total_count: number
  total_value: number
  months: number
}

/** `GET crm/reports/sources?months=`. */
export interface SourcesReport {
  sources: { source: string; count: number; won: number; lost: number; won_value: number; win_rate_pct: number | null }[]
  months: number
}

/** `GET crm/reports/owners?days=`: per person, the timeline lines they logged and their leads. */
export interface OwnersReport {
  owners: { name: string; activities: number; tasks_done: number; inquiries: number; open: number; won: number; lost: number }[]
  days: number
}

/** `GET crm/reports/companies?limit=`: `confirmed_revenue` only where bookings are the organisation's (`with_bookings`). */
export interface CompaniesReport {
  companies: {
    id: number
    company_name: string
    industry: string | null
    inquiries_count: number
    won_value: number
    open_pipeline_value: number
    confirmed_revenue?: number
    reservations_count?: number
  }[]
  limit: number
  with_bookings: boolean
}

/** A paginator, read for its `total` only (the server's count of leads in a window). */
export interface LeadPage {
  total: number
}
