import { lookOf } from '../settings/settingsLogic'
import type { TaskForm } from '../lib/tasks'
import type { ChannelDef, GroupDef } from '../lib/types'

/**
 * The task form's type and task pickers (owner 2026-11-09: "make something like we have before with icons, and the
 * tasks shown after type selection as a grid"), as the full admin's own drawer has them (pages/Planner.tsx): every type
 * of the planner's settings as a tile with its icon and colour, then the last tile for no type ("Custom", as the full
 * admin calls it); under it the tasks of the chosen type — a task tagged with types shows only under those, an untagged
 * one under every type and under none. Kept pure, because the frontend tests render to a string.
 */

export interface TypeTile { name: string; value: string; icon: string; color: string; preferred: boolean }

export interface TaskTile { key: string; label: string; icon: string; color: string; preferred: boolean }

/** The type tiles: the settings' types with their looks, then no type; `preferred` marks the chosen person's. */
export function typeTiles(groups: readonly GroupDef[], prefers: readonly string[] = []): TypeTile[] {
  const own: TypeTile[] = groups.map(g => ({ name: g.name, value: g.name, ...lookOf(g.name, groups), preferred: prefers.includes(g.name) }))
  return [...own, { name: '', value: '', ...lookOf(null, groups), preferred: false }]
}

/** The tasks a type offers, the full admin's rule: untagged tasks everywhere, tagged ones under their types only. */
export function tasksOfType(type: string, channels: readonly ChannelDef[]): ChannelDef[] {
  return channels.filter(c => c.groups.length === 0 || (type !== '' && c.groups.includes(type)))
}

export function taskTiles(type: string, channels: readonly ChannelDef[], prefers: readonly string[] = []): TaskTile[] {
  return tasksOfType(type, channels).map(c => ({ key: c.key, label: c.label, icon: c.icon, color: c.color, preferred: prefers.includes(c.key) }))
}

/** A type chosen: the task stays only when the new type still offers it (an older row's own text stays as it is). */
export function withType(form: TaskForm, type: string, channels: readonly ChannelDef[]): TaskForm {
  const known = channels.some(c => c.key === form.task_category)
  const keep = !known || tasksOfType(type, channels).some(c => c.key === form.task_category)
  return { ...form, task_group: type, task_category: keep ? form.task_category : '' }
}

/**
 * A task chosen (or, chosen again, cleared). An empty title — or one the form filled from the task before — takes the
 * task's name, so "Housekeeping → Room check" is a task in two presses; a title the person typed is never replaced.
 * `filled` is the title the form wrote last (null when the person's own).
 */
export function withTask(form: TaskForm, task: Pick<ChannelDef, 'key' | 'label'>, filled: string | null): { form: TaskForm; filled: string | null } {
  const clearing = form.task_category === task.key
  const ownTitle = form.title.trim() !== '' && form.title !== filled
  if (clearing) {
    return { form: { ...form, task_category: '', title: ownTitle ? form.title : '' }, filled: null }
  }
  if (ownTitle) return { form: { ...form, task_category: task.key }, filled: null }
  return { form: { ...form, task_category: task.key, title: task.label }, filled: task.label }
}

/**
 * The form a second task starts from after "Add & next": the same day, person and type (what a run of entries shares),
 * everything else fresh.
 */
export function nextForm(empty: TaskForm, sent: TaskForm): TaskForm {
  return { ...empty, task_date: sent.task_date, person: sent.person, task_group: sent.task_group, pool_horizon: sent.pool_horizon, pool_due_date: sent.pool_due_date }
}
