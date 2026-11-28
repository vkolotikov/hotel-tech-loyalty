import type { Today, TodayChat, TodayFollowUp, TodayTask } from '../lib/types'

/**
 * Today's decisions, pure for the tests (round 2, 2026-11-07; round 5, owner 2026-11-12, "compact … tabs"): the
 * greeting by the venue's clock, which figures to show, which tab of "Needs you now" opens, and how the server's lists
 * (CrmToday) are ordered in each. Nothing here counts anything the server did not count; it only sorts, groups and
 * picks from what `GET crm/today` answered.
 */

export type Greeting = 'morning' | 'afternoon' | 'evening'

/** Good morning from 5 to 11, good afternoon from 12 to 17, good evening otherwise. */
export function greetingOf(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

/** The venue's wall clock of an instant: its day (`YYYY-MM-DD`) and time (`HH:mm`), in the venue's zone. */
export function venueClock(at: Date, zone: string): { date: string; time: string; hour: number } {
  const read = (tz: string | undefined) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz,
    }).formatToParts(at)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
    const hour = Number(part('hour')) % 24
    return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${String(hour).padStart(2, '0')}:${part('minute')}`, hour }
  }
  try {
    return read(zone)
  } catch {
    return read(undefined)
  }
}

/** The person's first name for the greeting ("Ada Lovelace" → "Ada"); empty for nobody. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

function instant(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at
}

/* ─── The figures ────────────────────────────────────────────────────────── */

export type FigureKey = 'open_chats' | 'new_leads' | 'pipeline'

/**
 * The figures at the top, in this order, without those at nought (round 5: never a row of zeros first; "Needs you
 * now" carries the waiting chats, follow-ups and tasks with their counts, so they are not repeated here).
 */
export function figuresOf(data: Pick<Today, 'chats' | 'leads' | 'pipeline'>): FigureKey[] {
  const out: FigureKey[] = []
  if (data.chats.open > 0) out.push('open_chats')
  if (data.leads.new > 0) out.push('new_leads')
  if (data.pipeline.open_count > 0 || data.pipeline.open_value > 0) out.push('pipeline')
  return out
}

/* ─── Needs you now ──────────────────────────────────────────────────────── */

export const NEED_TABS = ['chats', 'follow_ups', 'tasks'] as const
export type NeedTab = (typeof NEED_TABS)[number]

/** The address key of the chosen tab. */
export const NEED_PARAM = 'need'

/** How many rows a tab shows before "Show all" (the server's lists hold up to eight). */
export const NOW_ROWS = 5

/** Each tab's count: the server's — waiting chats; follow-ups and your tasks due today or overdue. */
export function needCounts(data: Pick<Today, 'chats' | 'leads' | 'tasks'>): Record<NeedTab, number> {
  return {
    chats: data.chats.waiting,
    follow_ups: data.leads.due_today + data.leads.overdue,
    tasks: data.tasks.due_today + data.tasks.overdue,
  }
}

/** The tab the address names; else the first with work, in the order a person should take it; else the chats. */
export function needTabOf(param: string | null | undefined, counts: Record<NeedTab, number>): NeedTab {
  if ((NEED_TABS as readonly string[]).includes(param ?? '')) return param as NeedTab
  return NEED_TABS.find(tab => counts[tab] > 0) ?? 'chats'
}

/** Waiting chats, the one waiting longest first. */
export function chatRows(data: Pick<Today, 'chats'>): TodayChat[] {
  return [...data.chats.list].sort((a, b) => instant(a.last_at) - instant(b.last_at) || a.id - b.id)
}

/** Follow-ups: the overdue ones first (the oldest day first), then today's. */
export function followUpRows(data: Pick<Today, 'leads'>): TodayFollowUp[] {
  const day = (f: TodayFollowUp) => f.due ?? '9999'
  return [...data.leads.follow_ups].sort((a, b) => Number(b.overdue) - Number(a.overdue) || day(a).localeCompare(day(b)) || a.id - b.id)
}

export interface TaskRow { task: TodayTask; time: string | null }

/**
 * Your tasks: the overdue ones first (the earliest first), then today's at a time in the order of the venue's clock,
 * then today's without a time (a day stored at the venue's midnight, as the Tasks page and the full admin save it).
 */
export function taskRows(data: Pick<Today, 'tasks'>, zone: string): TaskRow[] {
  const timeOf = (task: TodayTask): string | null => {
    const at = task.due_at ? Date.parse(task.due_at) : NaN
    if (Number.isNaN(at)) return null
    const time = venueClock(new Date(at), zone).time
    return time === '00:00' ? null : time
  }
  const rows = data.tasks.list.map(task => ({ task, time: timeOf(task) }))
  const rank = (r: TaskRow) => (r.task.overdue ? 0 : r.time ? 1 : 2)
  return rows.sort((a, b) => rank(a) - rank(b) || instant(a.task.due_at) - instant(b.task.due_at) || a.task.id - b.task.id)
}

/** Whether the server holds more than the rows shown: then "Show all" links to the list. */
export function hasMore(total: number, shown: number): boolean {
  return total > shown
}

/* ─── Team activity ──────────────────────────────────────────────────────── */

/** One line of `GET crm/activity` (App\Services\Crm\CrmActivityFeed). */
export interface ActivityRow {
  id: number
  type: string
  direction: string | null
  subject: string | null
  excerpt: string | null
  duration_minutes: number | null
  occurred_at: string | null
  by: { id: number; name: string } | null
  lead: { id: number; name: string | null; company: string | null; status: string | null } | null
  contact: { id: number; name: string | null } | null
  conversation_id: number | null
}

export interface ActivityPage { data: ActivityRow[]; meta: { current_page: number; last_page: number; total: number } }

export const ACTIVITY_PER_PAGE = 8

/** What a line opens: its lead's record, else its contact's, else its chat in the inbox, else nothing. */
export function activityTarget(row: Pick<ActivityRow, 'lead' | 'contact' | 'conversation_id'>):
  { kind: 'lead' | 'contact'; id: number } | { kind: 'chat'; id: number } | null {
  if (row.lead) return { kind: 'lead', id: row.lead.id }
  if (row.contact) return { kind: 'contact', id: row.contact.id }
  if (row.conversation_id) return { kind: 'chat', id: row.conversation_id }
  return null
}

/** The next page to ask for, or none when the last one is loaded. */
export function nextActivityPage(last: Pick<ActivityPage, 'meta'> | undefined): number | undefined {
  if (!last) return undefined
  return last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined
}
