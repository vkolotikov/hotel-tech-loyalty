import { useQuery } from '@tanstack/react-query'
import { get } from '../lib/api'
import { brandParam } from '../lib/brand'

export const MODES = ['brief', 'sales_strategy', 'marketing_strategy', 'proposal', 'reply'] as const
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
  activities: number
  chats: number
  emails: number
  whatsapp: number
  email_state: 'captured' | 'empty' | 'partial' | 'unavailable' | 'address_required' | 'review_required' | 'not_connected'
  strategies: Strategy[]
  reply_to: { channel: 'email'; subject: string } | null
}

export type Result = {
  id: string
  generated_at: string
  coverage: Coverage
  review_notes: string[]
  summary?: string
  sections?: { title: string; body: string }[]
  subject?: string
  body?: string
}

export type Assistant = {
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

export function useAssistant(id: number) {
  return useQuery({
    queryKey: assistantKey(id),
    queryFn: () => get<Assistant>(`crm/leads/${id}/assistant`),
    refetchInterval: query => working(query.state.data?.run) ? 3000 : false,
  })
}
