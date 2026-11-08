import type { Proposal } from '../lib/types'

/**
 * A plan's lines as a person reviews them (pure): grouped by person in time order, which are ticked, what an apply
 * sends, and the words for the server's reasons and refusals (keys time.plan.reason.<code>, time.plan.unplaced.<code>,
 * time.plan.skipped.<code>).
 */
export const REASONS = ['ai', 'keeps_owner', 'skill', 'prefers', 'experience', 'most_free', 'priority', 'over_capacity', 'from_pool', 'from_overdue'] as const
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
