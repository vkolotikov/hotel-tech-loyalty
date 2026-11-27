import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api'
import { brandParam } from '../lib/brand'

export const MODES = ['reply', 'proposal', 'follow_up', 'brief', 'sales_strategy', 'marketing_strategy'] as const
export const SALES_FIELD = 'w-full rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text placeholder:text-a-text-2 focus-visible:outline-2 focus-visible:outline-a-accent'
export type Mode = (typeof MODES)[number]
export type Strategy = Extract<Mode, 'sales_strategy' | 'marketing_strategy'>

export type Run = {
  id: string
  mode: Mode
  status: 'queued' | 'running' | 'ready' | 'failed'
  error?: string | null
}

export type Coverage = {
  customer_fields: number
  business_fields: number
  knowledge_answers?: number
  knowledge_documents?: number
  activities: number
  chats: number
  emails: number
  whatsapp: number
  whatsapp_state?: string | null
  history_limited?: boolean
  project_history_limited?: boolean
  project_files?: number
  recorded_tasks?: number
  prior_orders?: number
  other_logged_emails?: number
  writing_samples?: number
  discovery_fields?: number
  email_state: 'captured' | 'empty' | 'partial' | 'unavailable' | 'address_required' | 'review_required' | 'not_connected'
  strategies: Strategy[]
  reply_to: { channel: 'email' | 'whatsapp' | 'chat' | 'activity'; subject?: string } | null
}

export type Result = {
  id: string
  generated_at: string
  coverage: Coverage
  knowledge_trace?: {
    sources: { id: string; title: string }[]
  }
  review_notes: string[]
  decision?: 'draft' | 'wait' | 'internal_action' | 'stop'
  reason?: string
  can_revise?: boolean
  new_correspondence?: boolean
  intent?: string
  next_step?: string
  unanswered?: string[]
  summary?: string
  sections?: { title: string; body: string }[]
  signals?: {
    intent: string | null
    win_probability: number | null
    going_cold_risk: string | null
    suggested_action: string | null
  }
  subject?: string
  body?: string
}

export type Quote = {
  reference: string
  scope: string
  quantity: number
  unit_price: string
  charges: string
  currency: string
  valid_until: string
  tax_basis: 'included' | 'excluded' | 'unspecified'
  total: string
  approved_at: string
}

export type Assistant = {
  can_review?: boolean
  quote?: Quote | null
  reviews?: Partial<Record<Mode, { source_id: string; subject: string; body: string; approved_at: string }>>
  brand: { id: number; name: string }
  revision: number
  run: Run | null
  results: Partial<Record<Mode, Result>>
  strategies: Partial<Record<Strategy, { body: string; saved_at: string }>>
}

export function working(run: Run | null | undefined): boolean {
  return run?.status === 'queued' || run?.status === 'running'
}

export function strategyMode(mode: Mode): mode is Strategy {
  return mode === 'sales_strategy' || mode === 'marketing_strategy'
}

export function assistantKey(id: number) {
  return ['crm', 'lead-assistant', brandParam(), id] as const
}

export function useAssistant(id: number, watching = false) {
  return useQuery({
    queryKey: assistantKey(id),
    queryFn: () => get<Assistant>(`crm/leads/${id}/assistant`),
    refetchInterval: query => working(query.state.data?.run) ? 3000 : watching && query.state.data && Object.values(query.state.data.results).some(r => r.body && !r.new_correspondence) ? 60000 : false,
  })
}
