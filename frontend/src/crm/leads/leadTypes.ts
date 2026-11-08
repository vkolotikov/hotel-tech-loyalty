/**
 * What the full admin's lead endpoints answer (App\Http\Controllers\Api\V1\Admin\InquiryController and its neighbours),
 * as HexaTech CRM reads it. A lead is an `inquiry`; its contact is a `guest`. Day columns (`next_task_due`, `check_in`)
 * come back as dates at midnight UTC ("2026-11-07T00:00:00.000000Z") and are read as calendar days, never as instants.
 */

export type StageKind = 'open' | 'won' | 'lost'

export interface Stage {
  id: number
  pipeline_id?: number
  name: string
  slug?: string
  color: string | null
  kind: StageKind
  sort_order: number
  default_win_probability?: number | null
  /** On `GET pipelines`: how many leads carry this stage. */
  inquiries_count?: number
}

/** `GET pipelines`: every pipeline with its stages in order. */
export interface Pipeline {
  id: number
  name: string
  is_default: boolean
  sort_order?: number
  stages: Stage[]
  inquiries_count?: number
}

export interface LeadGuest {
  id: number
  full_name: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  country?: string | null
  nationality?: string | null
  position_title?: string | null
  vip_level?: string | null
  /** The loyalty member this contact is (a template's member fields are filled from them). */
  member_id?: number | null
}

/** A row of `GET inquiries` (the paginator's `data`). */
export interface LeadRow {
  id: number
  guest_id: number | null
  pipeline_id: number | null
  pipeline_stage_id: number | null
  status: string
  priority: string | null
  source: string | null
  inquiry_type?: string | null
  total_value: string | number | null
  assigned_to: string | null
  next_task_type: string | null
  next_task_due: string | null
  next_task_notes: string | null
  next_task_completed: boolean | null
  check_in?: string | null
  check_out?: string | null
  num_rooms?: number | null
  event_name?: string | null
  ai_win_probability?: number | null
  ai_going_cold_risk?: string | null
  ai_suggested_action?: string | null
  ai_brief?: string | null
  ai_intent?: string | null
  phone_calls_made?: number | null
  emails_sent?: number | null
  num_adults?: number | null
  num_children?: number | null
  room_type_requested?: string | null
  event_pax?: number | null
  notes?: string | null
  custom_data?: Record<string, unknown> | null
  created_at: string | null
  updated_at?: string | null
  last_contacted_at?: string | null
  guest?: LeadGuest | null
  pipeline_stage?: { id: number; name: string; color: string | null; kind: StageKind } | null
}

export interface Reservation { id: number; confirmation_no: string | null; status: string | null }

/** `GET inquiries/{id}`: the row with its contact, pipeline, stages and last activities. */
export interface LeadDetail extends LeadRow {
  property_id?: number | null
  num_nights?: number | null
  special_requests?: string | null
  notes: string | null
  lost_reason_id?: number | null
  lost_reason?: { id: number; label: string } | null
  pipeline?: { id: number; name: string; stages?: Stage[] } | null
  last_contact_comment?: string | null
  ai_brief_at?: string | null
  reservations?: Reservation[]
}

/** Laravel's paginator as `GET inquiries` answers it. */
export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
  per_page?: number
}

/** The `{ data, meta }` lists (activities, tasks). */
export interface MetaList<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number }
}

export interface Activity {
  id: number
  type: string
  subject: string | null
  body: string | null
  direction?: string | null
  duration_minutes?: number | null
  occurred_at: string | null
  created_at?: string | null
  creator?: { id: number; name: string } | null
}

export interface Attachment {
  id: number
  filename: string
  url: string
  mime_type: string | null
  size_bytes: number | null
  note: string | null
  uploader: { id: number; name: string } | null
  created_at: string | null
}

export interface LostReason { id: number; label: string; slug?: string; sort_order?: number }

/** `POST inquiries/{id}/ai-brief`. A failure still answers 200 with `error`. */
export interface AiBrief {
  brief: string | null
  intent: string | null
  win_probability: number | null
  going_cold_risk: string | null
  suggested_action: string | null
  generated_at: string | null
  cached: boolean
  error?: string
}

/** `POST inquiries/{id}/guess-lost-reason`. */
export interface LostGuess {
  lost_reason_id: number | null
  label: string | null
  confidence: string | null
  reasoning: string | null
  error?: string
}

/** `POST inquiries/{id}/draft-proposal`. */
export interface ProposalDraft { subject: string; body: string; error?: string }

export interface ChatMessage {
  id: number
  conversation_id: number
  sender_type: string
  content: string | null
  created_at: string | null
}

export interface ChatConversation {
  id: number
  channel?: string | null
  status?: string | null
  visitor_name?: string | null
  last_message_at: string | null
  created_at?: string | null
  messages?: ChatMessage[]
}

/** `GET inquiries/{id}/chat-history`. */
export interface ChatHistory { conversations: ChatConversation[] }

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url' | 'email' | 'phone'

/** `GET custom-fields?entity=inquiry`. */
export interface CustomField {
  id: number
  entity: string
  key: string
  label: string
  type: CustomFieldType
  config: { options?: string[] } | null
  help_text: string | null
  required: boolean
  is_active: boolean
  show_in_list?: boolean
  sort_order: number
}

/** `GET inquiries/{id}/delete-impact`. */
export interface DeleteImpact {
  activities: number
  tasks: number
  attachments: number
  reservations: number
  warnings?: string[]
}

/** `GET inquiries/kpis`. */
export interface LeadKpis {
  total: number
  due_today: number
  overdue: number
  estimated_value: number
  new_this_week: number
  /** New this week against the week before, in percent (null without a week before). */
  new_delta_pct?: number | null
}

/** A person's saved filters (`GET saved-views?page=inquiries`, SavedViewController: their own only). */
export interface SavedView {
  id: number
  name: string
  page: string
  filters: Record<string, unknown>
  is_pinned: boolean
  sort_order: number
}

/** An email template (`GET email-templates` answers `{ templates }`). */
export interface EmailTemplate {
  id: number
  name: string
  subject: string
  html_body: string
  category: string | null
  is_active?: boolean
}

/** `POST crm-ai/capture-lead`: what the AI read from a pasted message (CrmAiService::extractLead); 200 with `success`. */
export interface CaptureAnswer {
  success: boolean
  error?: string
  data?: {
    customer_name?: string | null
    email?: string | null
    phone?: string | null
    company?: string | null
    country?: string | null
    inquiry_type?: string | null
    check_in?: string | null
    check_out?: string | null
    num_rooms?: number | string | null
    num_adults?: number | string | null
    num_children?: number | string | null
    total_value?: number | string | null
    source?: string | null
    special_requests?: string | null
    notes?: string | null
    priority?: string | null
  }
}

/** `GET guests/facets`: the distinct values the contacts hold (the country filter). */
export interface GuestFacets { country?: string[] }

/** A contact as `GET guests?search=` lists it. */
export interface GuestHit { id: number; full_name: string | null; email?: string | null; phone?: string | null; company?: string | null }
