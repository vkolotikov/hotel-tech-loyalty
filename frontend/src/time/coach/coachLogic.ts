import type { AiContext, ChannelDef, CoachOverview, DurationRow, GroupDef, Learned, StrategyFix, TaskNote, TypeNote } from '../lib/types'

/**
 * The AI coach, decided in pure functions (2026-11-14): its sections, the learning window, where each readiness gap is
 * filled, how the knowledge editor's rows are built from the settings and written back (only the rows a manager touched,
 * over the map as it is now), and what a one-press fix writes. Every figure is the server's (Learning, AiReadiness).
 */

export const COACH_TABS = ['overview', 'durations', 'people', 'knowledge'] as const
export type CoachTab = (typeof COACH_TABS)[number]

/** The section in the address; teaching the AI is a manager's, so anyone else lands on the overview. */
export function coachTab(raw: string | null | undefined, manager: boolean): CoachTab {
  const tab = (COACH_TABS as readonly string[]).includes(raw ?? '') ? (raw as CoachTab) : 'overview'
  return tab === 'knowledge' && !manager ? 'overview' : tab
}

/** How far back the planner learns (Learning::MAX_WEEKS is 26). */
export const WEEK_CHOICES = [4, 8, 12, 26] as const
export const WEEKS_DEFAULT = 8

export function weeksOf(raw: string | null | undefined): number {
  const n = Number(raw)
  return (WEEK_CHOICES as readonly number[]).includes(n) ? n : WEEKS_DEFAULT
}

/** The readiness items, as AiReadiness names them. */
export const READINESS = ['about', 'rules', 'types', 'people', 'skills', 'hours', 'history', 'clocked'] as const

/** Where a gap is filled: the coach's own knowledge section, the team page, or nowhere (it fills itself with use). */
export function readinessWhere(code: string): 'knowledge' | 'team' | null {
  if (code === 'about' || code === 'rules' || code === 'types') return 'knowledge'
  if (code === 'people' || code === 'skills' || code === 'hours') return 'team'
  return null
}

/** The items still short of complete, the furthest behind first (the order the page offers them). */
export function gaps<T extends { code: string; pct: number }>(items: readonly T[]): T[] {
  return items.filter(i => i.pct < 100).sort((a, b) => a.pct - b.pct || READINESS.indexOf(a.code as never) - READINESS.indexOf(b.code as never))
}

/** How a readiness score reads: little to go by, getting there, or well taught. */
export function readinessState(score: number): 'low' | 'mid' | 'high' {
  return score >= 75 ? 'high' : score >= 40 ? 'mid' : 'low'
}

/**
 * The overview's figures: the team's for a manager; a staff member's own (the one row the server sends them), or
 * nothing done yet when they have none.
 */
export function figuresOf(data: Pick<CoachOverview, 'learning'>, manager: boolean): Learned['totals'] {
  if (manager) return data.learning.totals
  const mine = data.learning.people[0]
  if (!mine) return { tasks: 0, done: 0, on_time_pct: null, late_open: 0, clocked: 0, clocked_pct: null, accuracy_pct: null }
  return {
    tasks: mine.tasks, done: mine.done, on_time_pct: mine.on_time_pct, late_open: mine.late_open, clocked: mine.clocked,
    clocked_pct: mine.done > 0 ? Math.round((mine.clocked / mine.done) * 100) : null, accuracy_pct: mine.accuracy_pct,
  }
}

/** Whether a length's drift is worth colour: real time a fifth over the plan, or under it. */
export function driftTone(drift: number | null): 'over' | 'under' | 'ok' | 'none' {
  if (drift === null) return 'none'
  return drift >= 120 ? 'over' : drift <= 80 ? 'under' : 'ok'
}

/** A row's suggested length differs from what is written down: worth a "use it" press. */
export function canUseSuggested(row: Pick<DurationRow, 'suggested' | 'typical' | 'advice'>): boolean {
  return row.suggested !== null && row.advice !== 'few' && row.suggested !== row.typical
}

/* ─── The knowledge editor ─────────────────────────────────────────── */

export const TEXT_MAX = 2000
export const GOALS_MAX = 1000
export const NOTE_MAX = 600
export const MINUTES_MIN = 5
export const MINUTES_MAX = 720

export interface TypeRow { type: string; color: string | null; notes: string; minutes: string; best_time: string }
export interface TaskRow { key: string; label: string; color: string; groups: string[]; notes: string; minutes: string }

/** One row per task type in the settings, filled from what is written down. */
export function typeRows(groups: readonly GroupDef[], notes: Record<string, TypeNote>): TypeRow[] {
  return groups.map(g => {
    const n = notes[g.name]
    return { type: g.name, color: g.color, notes: n?.notes ?? '', minutes: n?.typical_minutes ? String(n.typical_minutes) : '', best_time: n?.best_time ?? '' }
  })
}

/** One row per task in the settings, filled from what is written down. */
export function taskRows(channels: readonly ChannelDef[], notes: Record<string, TaskNote>): TaskRow[] {
  return channels.map(c => {
    const n = notes[c.key]
    return { key: c.key, label: c.label, color: c.color, groups: c.groups, notes: n?.notes ?? '', minutes: n?.typical_minutes ? String(n.typical_minutes) : '' }
  })
}

/** A typed length: whole minutes from 5 to 720, empty for none; anything else is a problem (undefined). */
export function minutesValue(raw: string): number | null | undefined {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isInteger(n) && n >= MINUTES_MIN && n <= MINUTES_MAX ? n : undefined
}

export type KnowledgeProblem = 'text' | 'goals' | 'note' | 'minutes'

/** What stops the knowledge from being saved, first problem first. */
export function knowledgeProblem(context: AiContext, types: readonly TypeRow[], tasks: readonly TaskRow[]): KnowledgeProblem | null {
  if (context.about.trim().length > TEXT_MAX || context.rules.trim().length > TEXT_MAX) return 'text'
  if (context.goals.trim().length > GOALS_MAX) return 'goals'
  if ([...types, ...tasks].some(r => r.notes.trim().length > NOTE_MAX)) return 'note'
  if ([...types, ...tasks].some(r => minutesValue(r.minutes) === undefined)) return 'minutes'
  return null
}

/** A type's entry as the server keeps it, or null when the row says nothing (the server drops it). */
export function typeEntry(row: TypeRow): TypeNote | null {
  const entry = { notes: row.notes.trim(), typical_minutes: minutesValue(row.minutes) ?? null, best_time: row.best_time || null }
  return entry.notes || entry.typical_minutes !== null || entry.best_time ? entry : null
}

export function taskEntry(row: TaskRow): TaskNote | null {
  const entry = { notes: row.notes.trim(), typical_minutes: minutesValue(row.minutes) ?? null }
  return entry.notes || entry.typical_minutes !== null ? entry : null
}

/**
 * The map to save: the one as it is now (read afresh, so another manager's entries are kept), with only the rows this
 * manager touched set or removed.
 */
export function mergeNotes<N>(fresh: Record<string, N>, edited: Record<string, N | null>): Record<string, N> {
  const out: Record<string, N> = { ...fresh }
  for (const [key, entry] of Object.entries(edited)) {
    if (entry === null) delete out[key]
    else out[key] = entry
  }
  return out
}

/** The settings key a typical-length fix writes, and the map it writes, over the map as it is now. */
export function typicalWrite(fix: Pick<StrategyFix, 'type_name' | 'task_key' | 'minutes'>, types: Record<string, TypeNote>, tasks: Record<string, TaskNote>):
  { key: 'planner_type_notes'; value: Record<string, TypeNote> } | { key: 'planner_task_notes'; value: Record<string, TaskNote> } | null {
  const minutes = fix.minutes ?? null
  if (minutes === null || minutes < MINUTES_MIN || minutes > MINUTES_MAX) return null
  if (fix.task_key) {
    const now = tasks[fix.task_key]
    return { key: 'planner_task_notes', value: { ...tasks, [fix.task_key]: { notes: now?.notes ?? '', typical_minutes: minutes } } }
  }
  if (fix.type_name) {
    const now = types[fix.type_name]
    return { key: 'planner_type_notes', value: { ...types, [fix.type_name]: { notes: now?.notes ?? '', typical_minutes: minutes, best_time: now?.best_time ?? null } } }
  }
  return null
}

/** A people draft's body for `PUT time/people/{user}`: only what the AI wrote, never an empty field over a kept one. */
export function personDraftBody(draft: { job_title: string; knowledge: string; strengths: string; develop: string }): Record<string, string> {
  const body: Record<string, string> = {}
  for (const key of ['job_title', 'knowledge', 'strengths', 'develop'] as const) {
    const value = draft[key].trim()
    if (value) body[key] = value
  }
  return body
}

/** A drafted type or task note put into the editor's row: a field the AI left empty keeps what the row has. */
export function withTypeDraft(row: TypeRow, draft: Partial<TypeNote>): TypeRow {
  return {
    ...row,
    notes: draft.notes?.trim() ? draft.notes.trim() : row.notes,
    minutes: draft.typical_minutes ? String(draft.typical_minutes) : row.minutes,
    best_time: draft.best_time ? draft.best_time : row.best_time,
  }
}

export function withTaskDraft(row: TaskRow, draft: Partial<TaskNote>): TaskRow {
  return { ...row, notes: draft.notes?.trim() ? draft.notes.trim() : row.notes, minutes: draft.typical_minutes ? String(draft.typical_minutes) : row.minutes }
}

/** Speed against the team as a percentage (1.2 → +20 %); null when there is nothing to compare. */
export function speedPct(speed: number | null): number | null {
  return speed === null ? null : Math.round((speed - 1) * 100)
}
