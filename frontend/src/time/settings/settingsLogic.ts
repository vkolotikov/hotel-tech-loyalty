import { CUSTOM_GROUP_META, TASK_GROUP_META } from '../../lib/plannerMeta'
import { priorityOf, type Priority } from '../lib/tasks'
import type { Bootstrap, ChannelDef, GroupDef, Template } from '../lib/types'

/**
 * Settings' decisions, kept pure because the page tests render to a string (2026-11-09). The planner's settings are the
 * full admin's own `crm_settings` rows (the workspace's `time/settings`) and `planner/templates`, written in the full admin's shapes (its Settings →
 * Planner, components/PlannerSettings.tsx): the working day (`business_hours_profile` {start, end},
 * `planner_work_hours_per_day`, `planner_work_days_per_week`), the task types (`planner_groups` [{name, icon, color}])
 * and the tasks each type offers (`planner_channels` [{key, label, icon, color, groups}]). The server reads them
 * (WorkWindow, PlannerCatalogue); these only turn a form into what is saved and say what stops a save.
 */

/* ─── The page's sections ────────────────────────────────────────── */

export const SETTINGS_TABS = ['day', 'planning', 'types', 'tasks', 'templates', 'account'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export function settingsTabOf(value: string | null | undefined): SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value ?? '') ? (value as SettingsTab) : 'day'
}

/**
 * Who may put work on whose day (owner 2026-11-09), the server's `planner_planning_mode` (PlanningMode): `team` — anyone
 * plans for anyone, as the planner always was — or `own` — each person plans only their own day (managers still plan
 * for anyone). The first is where an organisation that never chose is.
 */
export const PLANNING_MODES = ['team', 'own'] as const
export type PlanningModeKey = (typeof PLANNING_MODES)[number]

export function planningModeOf(value: unknown): PlanningModeKey {
  return value === 'own' ? 'own' : 'team'
}

/** The address with the section in it (none for the first). */
export function withTab(prev: URLSearchParams, tab: SettingsTab): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (tab === 'day') out.delete('tab')
  else out.set('tab', tab)
  return out
}

/** A list with one entry moved up (-1) or down (+1); the same list when it cannot move. */
export function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return [...list]
  const out = [...list]
  ;[out[index], out[j]] = [out[j], out[index]]
  return out
}

/** A list without one entry. */
export function without<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** A list with one entry changed. */
export function replaced<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((x, i) => (i === index ? next : x))
}

/* ─── The working day ────────────────────────────────────────────── */

export interface DayForm { start: string; end: string; hours: string; days: string }

/** The form as the bootstrap's settings hold it now (WorkWindow's window, PlannerCatalogue's standard time). */
export function dayFormOf(settings: Pick<Bootstrap['settings'], 'window' | 'minutes_per_day' | 'days_per_week'>): DayForm {
  return {
    start: settings.window.start,
    end: settings.window.end,
    hours: String(Math.round((settings.minutes_per_day / 60) * 100) / 100),
    days: String(settings.days_per_week),
  }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/** A time box's value as `HH:MM` (a browser may add seconds). */
export function clockValue(value: string): string {
  return value.slice(0, 5)
}

export function minutesOf(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
}

export type DayProblem = 'start' | 'end' | 'end_before_start' | 'hours' | 'days'

/** What stops the working day from being saved, first problem first; null when it can be. */
export function dayProblem(form: DayForm): DayProblem | null {
  if (!CLOCK.test(form.start)) return 'start'
  if (!CLOCK.test(form.end)) return 'end'
  if (minutesOf(form.end) <= minutesOf(form.start)) return 'end_before_start'
  const hours = Number(form.hours)
  if (form.hours.trim() === '' || !Number.isFinite(hours) || hours < 1 || hours > 24 || !Number.isInteger(hours * 2)) return 'hours'
  const days = Number(form.days)
  if (form.days.trim() === '' || !Number.isInteger(days) || days < 1 || days > 7) return 'days'
  return null
}

export function sameDay(a: DayForm, b: DayForm): boolean {
  return a.start === b.start && a.end === b.end && Number(a.hours) === Number(b.hours) && Number(a.days) === Number(b.days)
}

/**
 * The settings a saved working day writes, only those that changed: the window as an object (the only shape
 * WorkWindow reads), the hours and days as numbers.
 */
export function dayChanges(form: DayForm, saved: DayForm): { key: string; value: unknown }[] {
  const out: { key: string; value: unknown }[] = []
  if (form.start !== saved.start || form.end !== saved.end) out.push({ key: 'business_hours_profile', value: { start: form.start, end: form.end } })
  if (Number(form.hours) !== Number(saved.hours)) out.push({ key: 'planner_work_hours_per_day', value: Number(form.hours) })
  if (Number(form.days) !== Number(saved.days)) out.push({ key: 'planner_work_days_per_week', value: Number(form.days) })
  return out
}

/* ─── Task types (`planner_groups`) ──────────────────────────────── */

export interface GroupEntry { name: string; icon: string; color: string }

/** A new type's look, as the full admin gives one (its Custom fallback). */
export const NEW_GROUP_LOOK = { icon: CUSTOM_GROUP_META.iconKey ?? 'sparkles', color: CUSTOM_GROUP_META.color } as const

/** A new task's look, as the full admin gives one. */
export const NEW_CHANNEL_LOOK = { icon: 'clipboard-list', color: '#94a3b8' } as const

/**
 * A type's icon and colour: its own from the settings, else the full admin's built-in look for that name, else the
 * Custom fallback (plannerMeta's order, so both interfaces draw one type alike).
 */
export function lookOf(name: string | null | undefined, groups: readonly GroupDef[]): { icon: string; color: string } {
  const key = (name ?? '').trim()
  const own = key ? groups.find(g => g.name === key) ?? groups.find(g => g.name.toLowerCase() === key.toLowerCase()) : undefined
  const builtIn = key ? TASK_GROUP_META[key] : undefined
  return {
    icon: own?.icon || builtIn?.iconKey || NEW_GROUP_LOOK.icon,
    color: own?.color || builtIn?.color || NEW_GROUP_LOOK.color,
  }
}

/** The editor's rows: every type with its look filled in, as the full admin's editor shows (and saves) them. */
export function groupEntries(groups: readonly GroupDef[]): GroupEntry[] {
  return groups.map(g => ({ name: g.name, ...lookOf(g.name, [g]) }))
}

/** What `planner_groups` is saved as: the whole list in its order, `[{name, icon, color}]`. */
export function groupsPayload(list: readonly GroupEntry[]): GroupEntry[] {
  return list.map(g => ({ name: g.name.trim(), icon: g.icon, color: g.color }))
}

export function sameGroups(a: readonly GroupEntry[], b: readonly GroupEntry[]): boolean {
  return JSON.stringify(groupsPayload(a)) === JSON.stringify(groupsPayload(b))
}

export type NameProblem = 'empty' | 'duplicate'

/** Each name's problem: empty, or the same as an earlier one without regard to case (the server keeps the first). */
export function nameProblems(names: readonly string[]): (NameProblem | null)[] {
  const seen = new Set<string>()
  return names.map(raw => {
    const name = raw.trim().toLowerCase()
    if (!name) return 'empty'
    if (seen.has(name)) return 'duplicate'
    seen.add(name)
    return null
  })
}

/** Whether a name can be added to a list: not empty, not already there (any case). */
export function newNameProblem(name: string, existing: readonly string[]): NameProblem | null {
  const clean = name.trim().toLowerCase()
  if (!clean) return 'empty'
  return existing.some(e => e.trim().toLowerCase() === clean) ? 'duplicate' : null
}

export function addGroup(list: readonly GroupEntry[], name: string): GroupEntry[] {
  return [...list, { name: name.trim(), ...NEW_GROUP_LOOK }]
}

/* ─── Tasks (`planner_channels`) ─────────────────────────────────── */

/** A task's key from its label, as the full admin makes one: lower case, every run of other characters one `_`. */
export function slugOf(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'task'
}

/** A key no other task has: the slug, else the slug with _2, _3… */
export function uniqueKey(base: string, taken: readonly string[]): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/** A new task at the end: its key from this first label (kept when it is renamed), the full admin's look, every type. */
export function addChannel(list: readonly ChannelDef[], label: string): ChannelDef[] {
  const clean = label.trim()
  return [...list, { key: uniqueKey(slugOf(clean), list.map(c => c.key)), label: clean, ...NEW_CHANNEL_LOOK, groups: [] }]
}

/** What `planner_channels` is saved as: the whole list in its order. */
export function channelsPayload(list: readonly ChannelDef[]): ChannelDef[] {
  return list.map(c => ({ key: c.key, label: c.label.trim(), icon: c.icon, color: c.color, groups: [...c.groups] }))
}

export function sameChannels(a: readonly ChannelDef[], b: readonly ChannelDef[]): boolean {
  return JSON.stringify(channelsPayload(a)) === JSON.stringify(channelsPayload(b))
}

/** A task tagged with a type, or untagged from it (no types = it belongs to every type). */
export function toggleType(channel: ChannelDef, type: string): ChannelDef {
  const groups = channel.groups.includes(type) ? channel.groups.filter(g => g !== type) : [...channel.groups, type]
  return { ...channel, groups }
}

/** The type chips a task offers: every type there is, then any tag naming a type that no longer exists. */
export function typeChips(channel: ChannelDef, types: readonly string[]): string[] {
  return [...types, ...channel.groups.filter(g => !types.includes(g))]
}

/* ─── Templates (`planner/templates`) ────────────────────────────── */

export interface TemplateForm {
  name: string
  title: string
  category: string
  task_group: string
  task_category: string
  priority: Priority
  duration: string
  description: string
}

export const GENERAL = 'General'

/** The tasks a type offers: those tagged with it, and those tagged with none. */
export function channelsFor(type: string, channels: readonly ChannelDef[]): ChannelDef[] {
  return channels.filter(c => c.groups.length === 0 || !type || c.groups.includes(type))
}

/** The task a stored value names: by its key (the full admin's), or by its label, without regard to case. */
export function channelOf(value: string | null | undefined, channels: readonly ChannelDef[]): ChannelDef | undefined {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return undefined
  return channels.find(c => c.key.toLowerCase() === v) ?? channels.find(c => c.label.toLowerCase() === v)
}

/** The form for a template, or for a new one (General, Normal). A stored task is shown as the task it names. */
export function templateFormOf(template: Template | null, channels: readonly ChannelDef[] = []): TemplateForm {
  const stored = template?.task_category ?? ''
  return {
    name: template?.name ?? '',
    title: template?.title ?? '',
    category: template?.category ?? GENERAL,
    task_group: template?.task_group ?? '',
    task_category: channelOf(stored, channels)?.key ?? stored,
    priority: priorityOf(template?.priority ?? 'Normal'),
    duration: template?.duration_minutes ? String(template.duration_minutes) : '',
    description: template?.description ?? '',
  }
}

/** The form with another type: the task stays only when the new type offers it. */
export function withType(form: TemplateForm, type: string, channels: readonly ChannelDef[]): TemplateForm {
  const keep = form.task_category === '' || channelsFor(type, channels).some(c => c.key === form.task_category)
  return { ...form, task_group: type, task_category: keep ? form.task_category : '' }
}

export type TemplateProblem = 'name' | 'title' | 'duration'

/** What stops a template from being saved (the server's own rules: a name, a title, a whole number of minutes from 1). */
export function templateProblem(form: TemplateForm): TemplateProblem | null {
  if (!form.name.trim()) return 'name'
  if (!form.title.trim()) return 'title'
  if (form.duration.trim() !== '') {
    const n = Number(form.duration)
    if (!Number.isInteger(n) || n < 1) return 'duration'
  }
  return null
}

/**
 * The body `POST planner/templates` and `PUT planner/templates/{id}` take: a category always (the update refuses none;
 * General when empty), a priority always, an empty type, task, length or description as null.
 */
export function templatePayload(form: TemplateForm): Partial<Template> {
  const minutes = form.duration.trim() === '' ? null : Number(form.duration)
  return {
    name: form.name.trim(),
    title: form.title.trim(),
    category: form.category.trim() || GENERAL,
    task_group: form.task_group || null,
    task_category: form.task_category || null,
    priority: form.priority,
    duration_minutes: minutes !== null && Number.isInteger(minutes) && minutes >= 1 ? minutes : null,
    description: form.description.trim() || null,
  }
}

/** The templates by category (General for none), categories by name, each in its saved order. */
export function templateGroups(list: readonly Template[]): { category: string; items: Template[] }[] {
  const map = new Map<string, Template[]>()
  for (const tpl of list) {
    const category = tpl.category?.trim() || GENERAL
    map.set(category, [...(map.get(category) ?? []), tpl])
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, items: [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) }))
}

/** The categories already used, for the form's suggestions. */
export function categoriesOf(list: readonly Template[]): string[] {
  return [...new Set([GENERAL, ...list.map(t => t.category?.trim() || GENERAL)])].sort((a, b) => a.localeCompare(b))
}
