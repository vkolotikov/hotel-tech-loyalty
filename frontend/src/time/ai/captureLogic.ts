import { endOf } from '../lib/tasks'
import type { CaptureDraft } from '../lib/types'

/**
 * What the AI read from a message or a voice note becomes once a person has checked it (pure). The server matched the
 * people, types and tasks to the team's own; this only turns a kept draft into the body `POST planner/tasks` takes and
 * says which drafts can be saved.
 */
export interface DraftRow extends CaptureDraft { keep: boolean }

export function rowsOf(drafts: CaptureDraft[]): DraftRow[] {
  return drafts.map(d => ({ ...d, keep: true }))
}

/** The body of one kept draft. A draft with neither a day nor a person goes to the open pool, as anytime work. */
export function bodyOf(row: DraftRow, person: { user_id: number | null; name: string } | null): Record<string, unknown> {
  const start = row.task_date && row.start_time ? row.start_time : null
  const body: Record<string, unknown> = {
    title: row.title.trim(),
    task_date: row.task_date,
    start_time: start,
    end_time: start && row.duration_minutes ? endOf(start, row.duration_minutes) : null,
    duration_minutes: row.duration_minutes,
    priority: row.priority,
    task_group: row.task_group,
    task_category: row.task_category,
    description: row.description,
    assigned_to_user_id: person?.user_id ?? null,
    employee_name: person?.name ?? null,
  }
  if (!row.task_date && !person) body.pool_horizon = 'general'
  return body
}

/** The drafts that will be saved: kept, with a title. */
export function savable(rows: DraftRow[]): DraftRow[] {
  return rows.filter(r => r.keep && r.title.trim() !== '')
}
