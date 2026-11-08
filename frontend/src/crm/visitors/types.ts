/** What `App\Http\Controllers\Api\V1\Admin\VisitorController` answers, as the Visitors page reads it. */

export interface VisitorGuest {
  id: number
  full_name: string | null
  email: string | null
  phone: string | null
  lifecycle_status?: string | null
  lead_source?: string | null
}

export interface Visitor {
  id: number
  visitor_ip: string | null
  country: string | null
  city: string | null
  referrer: string | null
  current_page: string | null
  current_page_title: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  visit_count: number | null
  page_views_count: number | null
  messages_count: number | null
  is_lead: boolean
  is_online: boolean
  guest_id: number | null
  display_name: string | null
  email: string | null
  phone: string | null
  guest: VisitorGuest | null
}

export interface VisitorStats {
  online: number
  offline: number
  leads: number
  total: number
}

/** `GET visitors?status=&lead_only=&search=&page=`. */
export interface VisitorList {
  data: Visitor[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
  stats: VisitorStats
}

export interface VisitorPageView {
  id: number
  url: string
  title: string | null
  viewed_at: string | null
}

export interface VisitorConversation {
  id: number
  channel: string | null
  status: 'active' | 'waiting' | 'resolved' | 'archived'
  visitor_name: string | null
  messages_count: number | null
  lead_captured: boolean
  last_message_at: string | null
  created_at: string | null
}

/** `GET visitors/{id}`. */
export interface VisitorDetail {
  visitor: Visitor
  page_views: VisitorPageView[]
  conversations: VisitorConversation[]
}
