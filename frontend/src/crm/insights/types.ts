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

/** `GET deals/analytics?days=`: only what Insights shows, the best customers by their deals' value. */
export interface DealAnalytics {
  top_customers: { guest_id: number; name: string; company: string | null; deals: number; revenue: number }[]
}

/** A paginator, read for its `total` only (the server's count of leads in a window). */
export interface LeadPage {
  total: number
}
