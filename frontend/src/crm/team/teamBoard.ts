import type { OpenLeadValue } from '../lib/types'

export type Period = 'week' | 'month'
export type Kind = 'email' | 'followup' | 'delivery' | 'new' | 'checkin'
export type Filter = 'all' | 'urgent' | 'needed' | 'waiting_week' | Kind
export type BoardView = 'overview' | 'customers' | 'plan' | 'actions'
export type PlanStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export interface PlanTask {
  id: number; source: 'planner' | 'crm'; title: string; time: string | null; priority: number; status: PlanStatus; editable: boolean
}
export interface PersonPlan { key: string; name: string | null; user_id: number | null; assignable: boolean; tasks: PlanTask[]; done: number }
export interface DayPlan {
  date: string; today: string; as_of: string; planner: boolean; people: PersonPlan[]; total: number; done: number
  top_tasks: (PlanTask & { owner: string | null; owner_key: string })[]
}
export type PriorityLead = Pick<TeamAction, 'lead_id' | 'name' | 'company' | 'kind' | 'priority' | 'owner' | 'signals' | 'ai_reason' | 'amount' | 'currency' | 'deadline'>
export const PEOPLE_PER_SLIDE = 4

export function planPage(sp: URLSearchParams, pages: number): number {
  const page = Number(sp.get('people'))
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, Math.max(pages, 1)) : 1
}

/** Visit every roster page before advancing to the priority queue. */
export function advanceSlide(sp: URLSearchParams, rosterPages: number): URLSearchParams {
  const next = new URLSearchParams(sp)
  const view = boardView(sp)
  const page = planPage(sp, rosterPages)
  next.delete('page')
  next.delete('people')
  if (view === 'plan' && page < rosterPages) next.set('people', String(page + 1))
  else next.set('view', view === 'overview' ? 'customers' : view === 'customers' ? 'plan' : view === 'plan' ? 'actions' : 'overview')
  return next
}
export interface CountryMix { rows: { code: string; count: number }[]; unknown: number; total: number }
export interface BoardValue extends OpenLeadValue { valued: number }

export interface TeamAction {
  key: string; lead_id: number; kind: Kind; priority: 'urgent' | 'next' | 'later'; ai_reason: string | null
  name: string; company: string; owner: string | null; amount: string | null; currency: string
  deadline: string | null; quantity: number | null; at: number; age_days?: number | null; signals: string[]
  source: 'mail' | 'activity' | null; message_id: string | null; subject: string
}
export interface CustomerRanking {
  as_of: string; total: number
  rows: { type: 'company' | 'contact'; id: number; name: string; company: string; wins: number; amount: string | null; currency: string; converted: boolean; valued: number }[]
}
export interface CustomerAttention { needed: number; waiting_week: number; checkin: number; top: TeamAction[]; followups: TeamAction[] }
export interface TeamBoard {
  period: Period; from: string; through: string; as_of: string; leads: number; wins: number
  undated_wins: number; days: { date: string; leads: number; wins: number }[]
  emails: number; period_emails: number; actions_total: number; reviewed: number; page: number; pages: number; matching: number; actions: TeamAction[]
  urgent: number
  arrivals?: { today: number; yesterday: number; week: number; last_week: number; day_change: number; week_change: number }
  attention?: CustomerAttention
  top_leads?: PriorityLead[]
  portfolio: { total: number; total_value: BoardValue; open: number; open_value: BoardValue; overdue: number; due_today: number; countries: CountryMix }
  performance: { won_value: BoardValue; countries: CountryMix; lead_change: number; win_change: number; previous_from: string; previous_through: string }
}

export function teamOptions(sp: URLSearchParams) {
  const period: Period = sp.get('period') === 'month' ? 'month' : 'week'
  const kind = sp.get('filter') as Filter
  const filter: Filter = ['urgent','email','followup','delivery','new','needed','waiting_week','checkin'].includes(kind) ? kind : 'all'
  const n = Number(sp.get('page'))
  return { period, filter, tv: sp.get('display') === 'tv', page: Number.isInteger(n) && n > 0 && n <= 100000 ? n : 1 }
}

export function boardView(sp: URLSearchParams): BoardView {
  if (sp.get('view') === 'customers') return 'customers'
  if (sp.get('view') === 'plan') return 'plan'
  if (sp.get('view') === 'overview') return 'overview'
  return sp.get('view') === 'actions' || sp.has('filter') || sp.has('page') ? 'actions' : sp.get('display') === 'tv' ? 'customers' : 'overview'
}

export function actionLink(action: TeamAction): string {
  const q = new URLSearchParams({ lead: String(action.lead_id) })
  if ((action.kind === 'email' || action.kind === 'checkin') && action.source) {
    q.set('rtab', action.source === 'mail' ? 'emails' : 'activity')
    if (action.source === 'mail' && action.message_id) q.set('mail_message', action.message_id)
    if (action.source === 'activity' && action.message_id) q.set('activity', action.message_id)
  }
  return '/crm/leads?' + q.toString()
}

export function boardDay(date: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
}
