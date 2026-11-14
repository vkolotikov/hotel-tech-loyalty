import { addDays, daysBetween } from '../lib/dates'
import type { Proposal } from '../lib/types'

/**
 * A plan's lines as a person reviews them (pure): grouped by person in time order, which are ticked, what an apply
 * sends, and the words for the server's reasons and refusals (keys time.plan.reason.<code>, time.plan.unplaced.<code>,
 * time.plan.skipped.<code>).
 */
export const REASONS = ['ai', 'keeps_owner', 'skill', 'prefers', 'experience', 'most_free', 'priority', 'over_capacity', 'from_pool', 'from_overdue',
  // A week's plan (2026-11-14): the person's own work, the earliest day it fits, the day with the most room.
  'their_own', 'earliest_day', 'most_room'] as const
export const UNPLACED = ['no_room', 'no_one', 'not_working', 'not_yours'] as const
export const SKIPPED = ['changed', 'done', 'not_yours', 'no_person', 'not_allowed', 'not_found'] as const

export function byPerson(proposals: Proposal[]): { person: string; name: string; lines: Proposal[]; minutes: number }[] {
  const groups = new Map<string, { person: string; name: string; lines: Proposal[]; minutes: number }>()
  for (const p of proposals) {
    const g = groups.get(p.person) ?? { person: p.person, name: p.employee_name, lines: [], minutes: 0 }
    g.lines.push(p)
    g.minutes += p.duration_minutes
    groups.set(p.person, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, lines: [...g.lines].sort((a, b) => a.start_time.localeCompare(b.start_time)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** What `time/plan/apply` takes for the ticked lines. */
export function linesToApply(proposals: Proposal[], ticked: Set<number>) {
  return proposals.filter(p => ticked.has(p.task_id)).map(p => ({
    task_id: p.task_id, person: p.person, start_time: p.start_time, duration_minutes: p.duration_minutes, seen: p.seen,
  }))
}

/** Whether a line changes who does the task (worth its own mark). */
export function changesPerson(p: Proposal): boolean {
  return p.previous.person !== null && p.previous.person !== p.person
}

export function knownReasons(reasons: string[]): string[] {
  return reasons.filter(r => (REASONS as readonly string[]).includes(r))
}

/** A week's lines as `time/plan/apply` takes them: each with its own day (2026-11-14). */
export function weekLinesToApply(days: { date: string; proposals: Proposal[] }[], ticked: Set<number>) {
  return days.flatMap(d => d.proposals.filter(p => ticked.has(p.task_id)).map(p => ({
    task_id: p.task_id, person: p.person, start_time: p.start_time, duration_minutes: p.duration_minutes, seen: p.seen, date: p.date ?? d.date,
  })))
}

/** Every line's task of a week's plan (all ticked to start with). */
export function weekTaskIds(days: { proposals: Proposal[] }[]): number[] {
  return days.flatMap(d => d.proposals.map(p => p.task_id))
}

/** A day's planned minutes per person, after the plan's lines: how full each day gets. */
export function dayLoad(day: { proposals: Proposal[]; people: { person: string; name: string; capacity_minutes: number; free_minutes: number }[] }, ticked: Set<number>) {
  const lines = day.proposals.filter(l => ticked.has(l.task_id))
  // A day's own task is in its person's planned time already: it adds only when it goes to someone else, and then
  // leaves the one who had it. Everything else (the pool, backlogs, overdue, nobody's) is new to the day.
  const own = (l: Proposal) => l.from === 'day' && l.previous.person !== null
  return day.people.filter(p => p.capacity_minutes > 0).map(p => {
    const added = lines.filter(l => l.person === p.person && (!own(l) || l.previous.person !== p.person)).reduce((sum, l) => sum + l.duration_minutes, 0)
    const gone = lines.filter(l => own(l) && l.previous.person === p.person && l.person !== p.person).reduce((sum, l) => sum + l.duration_minutes, 0)
    const planned = Math.max(0, p.capacity_minutes - p.free_minutes + added - gone)
    return { person: p.person, name: p.name, capacity: p.capacity_minutes, planned, pct: Math.round((planned / p.capacity_minutes) * 100) }
  })
}

/**
 * Which week a week plan is for: the one shown (its days from today on) or the one after it. Late in the shown week —
 * two days or fewer left — the next week is where planning makes sense, so it is the one offered first.
 */
export function weekOptions(shownMonday: string, today: string): { this: { start: string; daysLeft: number }; next: { start: string }; preferred: 'this' | 'next' } {
  const from = today > shownMonday ? today : shownMonday
  const daysLeft = Math.max(0, 7 - daysBetween(shownMonday, from))
  return { this: { start: from, daysLeft }, next: { start: addDays(shownMonday, 7) }, preferred: daysLeft <= 2 ? 'next' : 'this' }
}
