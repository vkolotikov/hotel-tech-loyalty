/** What `GET /v1/admin/crm/bootstrap` answers (App\Http\Controllers\Api\V1\Admin\Crm\WorkspaceController). */
export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  accent: string | null
  venue: { timezone: string; today: string; currency: string }
  /** What the plan holds; `ai_capture` is the AI capture of a lead or a deal from pasted text (`crm-ai/capture-*`), every staff member's (RequireAiCapture). */
  features: { chatbot: boolean; engagement: boolean; ai_capture: boolean }
  ai: { status: 'unlimited' | 'under' | 'warn' | 'over'; percent: number | null }
  staff: {
    id: number
    name: string
    role: string | null
    can: {
      manage_bot: boolean
      manage_widget: boolean
      manage_pipelines: boolean
      manage_canned: boolean
      manage_team: boolean
      delete_records: boolean
    }
  }
  widget: { key: string; active: boolean } | null
  counts: { chats_waiting: number; leads_new: number; tasks_due: number }
  setup: { done: number; total: number; complete: boolean }
  /** The brands this person may work in (CrmBrands), whether "All brands" is theirs, and the brand this answer is for. */
  brands?: CrmBrand[]
  all_brands?: boolean
  brand_id?: number | null
}

export interface CrmBrand { id: number; name: string; is_default: boolean; color: string | null; logo: string | null }

export interface TodayChat {
  id: number
  name: string | null
  email: string | null
  channel: string
  intent: string | null
  assigned_to: { id: number; name: string } | null
  last_at: string | null
  excerpt: string | null
}

export interface TodayFollowUp {
  id: number
  name: string | null
  company: string | null
  status: string
  value: number | null
  task_type: string | null
  task_note: string | null
  due: string | null
  overdue: boolean
}

export interface TodayNewLead {
  id: number
  name: string | null
  company: string | null
  status: string
  source: string | null
  value: number | null
  created_at: string | null
}

export interface TodayTask {
  id: number
  type: string | null
  title: string
  due_at: string | null
  overdue: boolean
  inquiry_id: number | null
  guest_id: number | null
  contact: string | null
}

/** What `GET /v1/admin/crm/today` answers (App\Services\Crm\CrmToday). */
export interface Today {
  today: string
  chats: { waiting: number; open: number; unassigned: number; list: TodayChat[] }
  leads: { open: number; new: number; due_today: number; overdue: number; follow_ups: TodayFollowUp[]; new_list: TodayNewLead[] }
  tasks: { due_today: number; overdue: number; list: TodayTask[] }
  pipeline: { open_count: number; open_value: number }
  week: { conversations: number; ai_resolved: number; leads_from_chat: number }
}

export type SetupStepKey = 'widget' | 'assistant' | 'knowledge' | 'reply' | 'pipeline' | 'team'

/** What `GET /v1/admin/crm/start` answers (App\Services\Crm\CrmSetupProgress). */
export interface SetupProgress {
  steps: { key: SetupStepKey; done: boolean }[]
  done: number
  total: number
  complete: boolean
}

/** One answer of the assistant rated wrong and not yet taught (App\Services\Crm\BotGaps). */
export interface BotGap {
  message_id: number
  conversation_id: number
  visitor: string | null
  question: string | null
  answer: string
  comment: string | null
  rated_by: string | null
  rated_at: string | null
  ratings: number
  teachable: boolean
  /** Round 2: who rated it (to resend their own comment), and a right answer a staff member suggested for a manager. */
  rated_by_id?: number | null
  suggested_answer?: string | null
  suggested_by?: string | null
}
