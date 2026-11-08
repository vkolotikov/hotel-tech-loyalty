import { toMinutes } from '../lib/dates'
import { percent } from '../lib/format'
import { loadState } from '../plan/timeline'
import type { GroupDef, Person } from '../lib/types'

/**
 * The team page's decisions (2026-11-09), pure because the page tests render to a string: the section in the address,
 * the search, the figures, a person's load bar, hours, days, skills and shown experience, who may take, prefers and has
 * done each type, and the planner profile form — its checks and the bodies its three writers take:
 * `PUT time/people/{user}` (knowledge, hours, days, break), the full admin's `PUT team/{staff}` (skills) and the
 * `planner_employee_prefs` setting (preferred types and tasks, by the person's name).
 */

export const TEAM_TABS = ['people', 'types'] as const
export type TeamTab = (typeof TEAM_TABS)[number]

export function teamTab(raw: string | null | undefined): TeamTab {
  return raw === 'types' ? 'types' : 'people'
}

/** 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const BREAKS = [0, 15, 30, 45, 60] as const
export const BREAK_MAX = 180

/* ─── Reading a person ─────────────────────────────────────────────── */

export type RoleKind = 'admin' | 'manager' | 'staff' | 'none' | 'other'

/** How a person's role is said: an administrator, a manager, staff, a name without an account, or a role of its own. */
export function roleKind(person: Pick<Person, 'role' | 'has_account'>): RoleKind {
  if (!person.has_account) return 'none'
  if (person.role === 'super_admin') return 'admin'
  if (person.role === 'manager') return 'manager'
  if (person.role === 'staff' || !person.role) return 'staff'
  return 'other'
}

/** The days a person works (every day when their profile names none). */
export function workDays(profile: Pick<Person['profile'], 'work_days'>): number[] {
  return profile.work_days && profile.work_days.length > 0 ? [...profile.work_days].sort((a, b) => a - b) : [...WEEKDAYS]
}

/** Their own hours, or the venue's (`own` false) when their profile has none. */
export function hoursOf(profile: Pick<Person['profile'], 'work_start' | 'work_end'>, venue: { start: string; end: string }): { start: string; end: string; own: boolean } {
  if (profile.work_start || profile.work_end) {
    return { start: profile.work_start ?? venue.start, end: profile.work_end ?? venue.end, own: true }
  }
  return { start: venue.start, end: venue.end, own: false }
}

export type SkillsKind = 'manager' | 'any' | 'none' | 'some'

/** What a person may take from the open pool: managers and a profile without skills any type; an empty list none. */
export function skillsKind(person: Pick<Person, 'manager' | 'profile'>): SkillsKind {
  if (person.manager) return 'manager'
  if (person.profile.skills === null) return 'any'
  return person.profile.skills.length === 0 ? 'none' : 'some'
}

/** Whether a person may take a task of this type from the pool (the server's Team::mayTake). */
export function mayTake(person: Pick<Person, 'manager' | 'profile'>, group: string | null): boolean {
  if (!group || person.manager) return true
  return person.profile.skills === null || person.profile.skills.includes(group)
}

export interface LoadBar { pct: number | null; width: number; state: 'none' | 'ok' | 'high' | 'over' }

/** Today's load as a bar: the share of their hours planned, the bar's width (at most full) and its state. */
export function loadBar(today: Person['today']): LoadBar {
  const pct = today && today.works ? today.load_pct : null
  return { pct, width: pct === null ? 0 : Math.max(0, Math.min(100, pct)), state: loadState(pct) }
}

export interface ExperienceRow { group: string | null; done: number; onTimePct: number | null; avgMinutes: number }

/** What they finished, by type, the most done first (the server's '—' is "no type"). */
export function experienceRows(experience: Person['experience']): ExperienceRow[] {
  return Object.entries(experience.groups ?? {})
    .map(([group, g]) => ({ group: group === '—' || group === '' ? null : group, done: g.done, onTimePct: percent(g.on_time, g.done), avgMinutes: g.avg_minutes }))
    .filter(row => row.done > 0)
    .sort((a, b) => b.done - a.done || (a.group ?? '￿').localeCompare(b.group ?? '￿'))
}

/* ─── The list ─────────────────────────────────────────────────────── */

/** Whether every word of the search is in the person's name, role, department, knowledge, skills or preferred work. */
export function matchesPerson(person: Person, q: string, taskLabels: Record<string, string> = {}): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [
    person.name, person.role, person.department, person.profile.knowledge,
    ...(person.profile.skills ?? []), ...person.prefers.groups, ...person.prefers.tasks.map(key => taskLabels[key] ?? key),
  ].filter((x): x is string => typeof x === 'string' && x !== '').join(' ').toLowerCase()
  return words.every(word => hay.includes(word))
}

export function filterPeople(people: Person[], q: string, taskLabels: Record<string, string> = {}): Person[] {
  return people.filter(p => matchesPerson(p, q, taskLabels))
}

export interface TeamFigures { people: number; accounts: number; working: number; load: number | null; over: number }

/**
 * The team today: how many, with an account, working today, the team's load (everyone's planned minutes of everyone's
 * hours, as the day board's own total reads it) and how many are over their hours.
 */
export function teamFigures(people: Person[]): TeamFigures {
  const working = people.filter(p => p.today?.works)
  const planned = working.reduce((sum, p) => sum + (p.today?.planned_minutes ?? 0), 0)
  const capacity = working.reduce((sum, p) => sum + (p.today?.capacity_minutes ?? 0), 0)
  return {
    people: people.length,
    accounts: people.filter(p => p.has_account).length,
    working: working.length,
    load: percent(planned, capacity),
    over: working.filter(p => (p.today?.load_pct ?? 0) > 100).length,
  }
}

export interface TypeRoster {
  name: string
  color: string | null
  /** Who may take it from the pool; `everyone` when nobody is kept from it. */
  mayTake: Person[]
  everyone: boolean
  prefer: Person[]
  /** The most finished of it in the last 90 days, at most three. */
  experienced: { person: Person; done: number; onTimePct: number | null }[]
}

/** Each type of work as the planner sees the team for it. */
export function typeRoster(people: Person[], groups: Pick<GroupDef, 'name' | 'color'>[]): TypeRoster[] {
  return groups.map(group => {
    const may = people.filter(p => mayTake(p, group.name))
    return {
      name: group.name,
      color: group.color,
      mayTake: may,
      everyone: may.length === people.length,
      prefer: people.filter(p => p.prefers.groups.includes(group.name)),
      experienced: people
        .map(person => {
          const g = person.experience.groups?.[group.name]
          return { person, done: g?.done ?? 0, onTimePct: g ? percent(g.on_time, g.done) : null }
        })
        .filter(x => x.done > 0)
        .sort((a, b) => b.done - a.done || a.person.name.localeCompare(b.person.name))
        .slice(0, 3),
    }
  })
}

/* ─── The planner profile form ─────────────────────────────────────── */

export interface TeamForm {
  knowledge: string
  /** `HH:MM`, or empty for the venue's. */
  work_start: string
  work_end: string
  /** The days ticked (1 = Monday … 7 = Sunday); all seven means every day. */
  days: number[]
  break_minutes: string
  /** Skills: any type (no list) or only the ticked ones (an empty list takes nothing from the pool). */
  any_type: boolean
  skills: string[]
  pref_groups: string[]
  pref_tasks: string[]
}

export function formOf(person: Person): TeamForm {
  return {
    knowledge: person.profile.knowledge ?? '',
    work_start: person.profile.work_start ?? '',
    work_end: person.profile.work_end ?? '',
    days: workDays(person.profile),
    break_minutes: String(person.profile.break_minutes ?? 0),
    any_type: person.profile.skills === null,
    skills: person.profile.skills ?? [],
    pref_groups: [...person.prefers.groups],
    pref_tasks: [...person.prefers.tasks],
  }
}

/** Hours, knowledge, days and break are kept for someone with an account (the server's profile is a staff row's). */
export function canEditProfile(person: Pick<Person, 'user_id' | 'has_account'>): boolean {
  return person.has_account && person.user_id !== null
}

/** Skills are a staff member's: managers take any type by design, and a name without an account has no staff row. */
export function canSetSkills(person: Pick<Person, 'staff_id' | 'manager'>): boolean {
  return person.staff_id !== null && !person.manager
}

export type HoursProblem = 'hours_both' | 'hours_order'

/** Both times or neither (the venue's hours); the day must end after it starts. */
export function validateHours(start: string, end: string): HoursProblem | null {
  if (!start && !end) return null
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (!start || !end || s === null || e === null) return 'hours_both'
  return e > s ? null : 'hours_order'
}

export type FormProblem = HoursProblem | 'knowledge' | 'days' | 'break'

/** What stops the form from being saved, first problem first; null when it can be. Without an account only preferences are kept. */
export function formProblem(form: TeamForm, knowledgeMax: number, person: Pick<Person, 'user_id' | 'has_account'>): FormProblem | null {
  if (!canEditProfile(person)) return null
  if (form.knowledge.trim().length > knowledgeMax) return 'knowledge'
  const hours = validateHours(form.work_start, form.work_end)
  if (hours) return hours
  if (form.days.length === 0) return 'days'
  const minutes = Number(form.break_minutes)
  if (form.break_minutes.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > BREAK_MAX) return 'break'
  return null
}

export interface ProfileBody { knowledge: string; work_start: string | null; work_end: string | null; work_days: number[] | null; break_minutes: number }

/** The body `PUT time/people/{user}` takes: empty hours as null (the venue's), every day as null, the days in order. */
export function profileBody(form: TeamForm): ProfileBody {
  const days = [...new Set(form.days.filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b)
  return {
    knowledge: form.knowledge.trim(),
    work_start: form.work_start || null,
    work_end: form.work_end || null,
    work_days: days.length === 7 ? null : days,
    break_minutes: Math.max(0, Math.min(BREAK_MAX, Math.round(Number(form.break_minutes) || 0))),
  }
}

/** The skills `PUT team/{staff}` takes: null for any type, else the ticked types (possibly none). */
export function skillsOf(form: Pick<TeamForm, 'any_type' | 'skills'>): string[] | null {
  return form.any_type ? null : [...new Set(form.skills)]
}

/** Whether two lists hold the same values, in any order. */
export function sameSet(a: readonly (string | number)[], b: readonly (string | number)[]): boolean {
  const x = new Set(a)
  const y = new Set(b)
  return x.size === y.size && [...x].every(v => y.has(v))
}

export interface SavePlan {
  profile: ProfileBody | null
  skills: { staffId: number; skills: string[] | null } | null
  prefs: { groups: string[]; tasks: string[] } | null
}

/** Which of the three writers the form needs: only what changed, and only what this person can have. */
export function savePlan(person: Person, form: TeamForm): SavePlan {
  let profile: ProfileBody | null = null
  if (canEditProfile(person)) {
    const body = profileBody(form)
    const was = person.profile
    const changed = body.knowledge !== (was.knowledge ?? '').trim()
      || body.work_start !== (was.work_start ?? null)
      || body.work_end !== (was.work_end ?? null)
      || (body.work_days === null) !== (was.work_days === null || was.work_days.length === 0)
      || (body.work_days !== null && !sameSet(body.work_days, was.work_days ?? []))
      || body.break_minutes !== (was.break_minutes ?? 0)
    if (changed) profile = body
  }

  let skills: SavePlan['skills'] = null
  if (canSetSkills(person) && person.staff_id !== null) {
    const next = skillsOf(form)
    const was = person.profile.skills
    const changed = (next === null) !== (was === null) || (next !== null && was !== null && !sameSet(next, was))
    if (changed) skills = { staffId: person.staff_id, skills: next }
  }

  const groups = [...new Set(form.pref_groups)]
  const tasks = [...new Set(form.pref_tasks)]
  const prefs = sameSet(groups, person.prefers.groups) && sameSet(tasks, person.prefers.tasks) ? null : { groups, tasks }

  return { profile, skills, prefs }
}

export function hasChanges(plan: SavePlan): boolean {
  return plan.profile !== null || plan.skills !== null || plan.prefs !== null
}

/* ─── Preferred work: the full admin's `planner_employee_prefs` ────── */

export interface Pref { groups: string[]; tasks: string[] }

/** The setting as the full admin keeps it: a map by person's name, stored as JSON text or an object; anything else is empty. */
export function parsePrefs(raw: unknown): Record<string, Pref> {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { value = null }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, Pref> = {}
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const e = entry as { groups?: unknown; tasks?: unknown }
    out[name] = {
      groups: Array.isArray(e.groups) ? e.groups.map(String) : [],
      tasks: Array.isArray(e.tasks) ? e.tasks.map(String) : [],
    }
  }
  return out
}

/** The map with only this person's entry changed: set, or removed when both lists are empty. */
export function mergePrefs(map: Record<string, Pref>, name: string, groups: string[], tasks: string[]): Record<string, Pref> {
  const out: Record<string, Pref> = { ...map }
  if (groups.length === 0 && tasks.length === 0) delete out[name]
  else out[name] = { groups: [...new Set(groups)], tasks: [...new Set(tasks)] }
  return out
}

/* ─── Small helpers for the form ───────────────────────────────────── */

/** The list with the value added, or taken out when it is there. */
export function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter(x => x !== value) : [...list, value]
}

/** The choices to offer: the known ones, then any the person already has that the settings no longer list. */
export function choices(known: readonly string[], current: readonly string[]): string[] {
  return [...known, ...current.filter(x => !known.includes(x))]
}
