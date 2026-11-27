import type { OpenLeadValue } from '../lib/types'

export type Period = 'week' | 'month'
export type Kind = 'email' | 'followup' | 'delivery' | 'new'
export type Filter = 'all' | 'urgent' | Kind
export type BoardView = 'overview' | 'actions'
export interface CountryMix { rows: { code: string; count: number }[]; unknown: number; total: number }
export interface BoardValue extends OpenLeadValue { valued: number }

export interface TeamAction {
  key: string; lead_id: number; kind: Kind; priority: 'urgent' | 'next' | 'later'; ai_reason: string | null
  name: string; company: string; owner: string | null; amount: string | null; currency: string
  deadline: string | null; quantity: number | null; at: number; signals: string[]
  source: 'mail' | 'activity' | null; message_id: string | null; subject: string
}
export interface TeamBoard {
  period: Period; from: string; through: string; as_of: string; leads: number; wins: number
  undated_wins: number; days: { date: string; leads: number; wins: number }[]
  emails: number; period_emails: number; actions_total: number; reviewed: number; page: number; pages: number; matching: number; actions: TeamAction[]
  urgent: number
  portfolio: { total: number; total_value: BoardValue; open: number; open_value: BoardValue; overdue: number; due_today: number; countries: CountryMix }
  performance: { won_value: BoardValue; countries: CountryMix; lead_change: number; win_change: number; previous_from: string; previous_through: string }
}

export function teamOptions(sp: URLSearchParams) {
  const period: Period = sp.get('period') === 'month' ? 'month' : 'week'
  const kind = sp.get('filter') as Filter
  const filter: Filter = ['urgent','email','followup','delivery','new'].includes(kind) ? kind : 'all'
  const n = Number(sp.get('page'))
  return { period, filter, tv: sp.get('display') === 'tv', page: Number.isInteger(n) && n > 0 && n <= 100000 ? n : 1 }
}

export function boardView(sp: URLSearchParams): BoardView {
  if (sp.get('view') === 'overview') return 'overview'
  return sp.get('view') === 'actions' || sp.has('filter') || sp.has('page') ? 'actions' : 'overview'
}

export function actionLink(action: TeamAction): string {
  const q = new URLSearchParams({ lead: String(action.lead_id) })
  if (action.kind === 'email') {
    q.set('rtab', action.source === 'mail' ? 'emails' : 'activity')
    if (action.source === 'mail' && action.message_id) q.set('mail_message', action.message_id)
    if (action.source === 'activity' && action.message_id) q.set('activity', action.message_id)
  }
  return '/crm/leads?' + q.toString()
}

export function boardDay(date: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
}
