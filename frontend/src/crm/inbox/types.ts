/**
 * What the full admin's chat endpoints answer (App\Http\Controllers\Api\V1\Admin\ChatInboxController and
 * EngagementController), as the inbox reads it. Only the fields the workspace shows; the server sends more.
 */

export type ConvStatus = 'active' | 'waiting' | 'resolved' | 'archived'

export interface Agent {
  id: number
  name: string
  email?: string | null
}

/** One row of `GET chat-inbox` (Laravel's paginator, 50 a page) and the `conversation` of `GET chat-inbox/{id}`. */
export interface Conversation {
  id: number
  visitor_id: number | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  visitor_country: string | null
  visitor_city: string | null
  page_url: string | null
  channel: string | null
  status: ConvStatus
  ai_enabled: boolean | null
  assigned_to: number | null
  assigned_agent: Agent | null
  member: { id: number; user: { id: number; name: string | null; email: string | null } | null; tier: { id: number; name: string } | null } | null
  /** Unread visitor messages (index only). */
  unread_count?: number
  /** How many conversations the same visitor has (index only). */
  ip_session_count?: number
  /** The latest message's text (index only). */
  last_message?: string | null
  last_message_at: string | null
  lead_captured: boolean
  inquiry_id: number | null
  intent_tag: string | null
  agent_notes: string | null
  created_at: string | null
}

export interface PageView {
  id: number
  url: string
  title: string | null
  viewed_at: string | null
}

/** The conversation as `GET chat-inbox/{id}` answers it: its visitor and the last pages they viewed. */
export interface ConversationFull extends Conversation {
  visitor: {
    id: number
    country: string | null
    city: string | null
    visit_count: number | null
    page_views_count: number | null
    first_seen_at: string | null
    last_seen_at: string | null
    referrer: string | null
    is_lead: boolean
  } | null
  visitor_page_views?: PageView[]
}

export type SenderType = 'visitor' | 'ai' | 'agent' | 'system'

export interface Feedback {
  id: number
  /** Who rated it (the server keeps one rating per person and answer, and shows the latest). */
  user_id?: number | null
  rating: 'good' | 'bad'
  comment: string | null
  applied_to_training: boolean
  /** Round 2: a staff member's right answer, kept for a manager to check (nothing is taught until then). */
  suggested_answer?: string | null
}

export interface Message {
  id: number
  conversation_id: number
  sender_type: SenderType
  sender_user_id: number | null
  sender_user?: { id: number; name: string } | null
  content: string | null
  attachment_url?: string | null
  attachment_type?: string | null
  created_at: string | null
  /** The rating of an AI answer (show only). */
  feedback?: Feedback | null
}

export interface Sibling {
  id: number
  visitor_name: string | null
  status: ConvStatus
  last_message_at: string | null
  channel: string | null
}

/** `GET chat-inbox/{id}`. */
export interface ConversationDetail {
  conversation: ConversationFull
  messages: Message[]
  siblings: Sibling[]
  visitor_typing: boolean
}

/** `GET chat-inbox/{id}/poll?since_id=`. */
export interface PollAnswer {
  messages: Message[]
  visitor_typing: boolean
  status: ConvStatus
}

/** `GET chat-inbox/stats`. */
export interface InboxStats {
  active: number
  waiting: number
  resolved: number
  archived: number
  closed: number
  total: number
  active_24h: number
  unassigned: number
  resolved_today: number
  unread_messages: number
}

export interface Page<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

export interface CannedReply {
  label: string
  text: string
}

/** `GET engagement/conversations/{id}/brief`. */
export interface Brief {
  brief: string | null
  intent_tag: string | null
  generated_at: string | null
  cached: boolean
  error?: string
  /** Round 2: the failure's code beside the server's sentence (`ai_failed`); the inbox says it in its own words. */
  code?: string
}
