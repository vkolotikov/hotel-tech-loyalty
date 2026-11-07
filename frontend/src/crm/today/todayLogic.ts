import { leadPath } from '../lib/links'
import type { Today, TodayChat, TodayFollowUp, TodayTask } from '../lib/types'

/**
 * Today's decisions, pure for the tests (round 2, 2026-11-07): the greeting by the venue's clock, and how the server's
 * lists (CrmToday) are ordered and grouped — what needs a person now, and what is on today's schedule. Nothing here
 * counts anything the server did not count; it only sorts and groups what `GET crm/today` answered.
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

/** A calendar day (`YYYY-MM-DD`) written out: "Saturday 7 November". Read as a day, never as an instant. */
export function longDay(ymd: string | null | undefined, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '')
  if (!m) return ''
  return new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))
}

function instant(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at
}

export type NowItem =
  | { kind: 'chat'; key: string; chat: TodayChat }
  | { kind: 'follow_up'; key: string; lead: TodayFollowUp }
  | { kind: 'task'; key: string; task: TodayTask }

/**
 * "Needs you now", in the order a person should take it: chats where a visitor waits for a reply (the one waiting
 * longest first), then follow-ups that are overdue (the oldest day first), then your overdue tasks (the earliest
 * first). Due-today items are not here: they are on today's schedule.
 */
export function needsNow(data: Pick<Today, 'chats' | 'leads' | 'tasks'>): NowItem[] {
  const chats = [...data.chats.list].sort((a, b) => instant(a.last_at) - instant(b.last_at) || a.id - b.id)
  const followUps = data.leads.follow_ups.filter(f => f.overdue)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id - b.id)
  const tasks = data.tasks.list.filter(t => t.overdue).sort((a, b) => instant(a.due_at) - instant(b.due_at) || a.id - b.id)
  return [
    ...chats.map(chat => ({ kind: 'chat' as const, key: `chat-${chat.id}`, chat })),
    ...followUps.map(lead => ({ kind: 'follow_up' as const, key: `lead-${lead.id}`, lead })),
    ...tasks.map(task => ({ kind: 'task' as const, key: `task-${task.id}`, task })),
  ]
}

export type ScheduleItem =
  | { kind: 'task'; key: string; task: TodayTask; time: string | null }
  | { kind: 'follow_up'; key: string; lead: TodayFollowUp }

/**
 * Today's schedule: your tasks due today at a time, in the order of the clock (the venue's), and then what is due
 * during the day — follow-ups (a lead's next step is a day, not a time) and tasks set for the day without a time
 * (stored at the venue's midnight, as the Tasks page and the full admin save a day).
 */
export function scheduleOf(data: Pick<Today, 'leads' | 'tasks'>, zone: string): { timed: ScheduleItem[]; allDay: ScheduleItem[] } {
  const timed: ScheduleItem[] = []
  const allDay: ScheduleItem[] = []
  const tasks = data.tasks.list.filter(t => !t.overdue).sort((a, b) => instant(a.due_at) - instant(b.due_at) || a.id - b.id)
  for (const task of tasks) {
    const at = task.due_at ? Date.parse(task.due_at) : NaN
    const time = Number.isNaN(at) ? null : venueClock(new Date(at), zone).time
    if (time && time !== '00:00') timed.push({ kind: 'task', key: `task-${task.id}`, task, time })
    else allDay.push({ kind: 'task', key: `task-${task.id}`, task, time: null })
  }
  for (const lead of data.leads.follow_ups.filter(f => !f.overdue)) allDay.push({ kind: 'follow_up', key: `lead-${lead.id}`, lead })
  return { timed, allDay }
}

/** Where a task opens: its lead when it has one, else the Tasks page. */
export function taskTarget(task: Pick<TodayTask, 'inquiry_id'>): string {
  return task.inquiry_id ? leadPath(task.inquiry_id) : '/crm/tasks'
}

/** Whether the server holds more than the list shows (its lists are the first eight): then "See all" links there. */
export function hasMore(total: number, shown: number): boolean {
  return total > shown
}
