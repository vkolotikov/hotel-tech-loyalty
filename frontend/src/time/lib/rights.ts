import type { PersonRef } from './tasks'
import type { Bootstrap, Task } from './types'

/**
 * Who may put work on whose day (owner 2026-11-09): the organisation's planning mode, decided on the server
 * (App\Services\Time\PlanningMode) and answered in the bootstrap as `staff.can.plan_team` — true in `team` mode, and
 * for a manager always; false for a staff member in `own` mode, who then changes only their own and unassigned tasks and
 * gives work only to themselves. These functions only hide what the server would refuse.
 */
export interface Rights { me: string; others: boolean }

export function rightsOf(boot: Pick<Bootstrap, 'staff'>): Rights {
  return { me: boot.staff.key, others: boot.staff.can.plan_team }
}

/** This person as an assignment (the account and the name the full admin writes). */
export function meOf(boot: Pick<Bootstrap, 'staff'>): PersonRef {
  return { key: boot.staff.key, user_id: boot.staff.id, name: boot.staff.name }
}

/** Whether a task may be changed, moved, clocked or finished: anyone's with `others`, else one's own and nobody's. */
export function mayChange(rights: Rights, task: Pick<Task, 'owner'>): boolean {
  return rights.others || task.owner === null || task.owner === rights.me
}

/** Whether work may be given to this person (a key; empty means nobody). */
export function mayGive(rights: Rights, person: string | null | undefined): boolean {
  return rights.others || !person || person === rights.me
}

/** A drag from one lane to another: the task must be changeable and the lane one it may be given to. */
export function mayDrop(rights: Rights, task: Pick<Task, 'owner'>, toPerson: string | null | undefined): boolean {
  return mayChange(rights, task) && mayGive(rights, toPerson)
}

/**
 * The people an assign list offers: everyone with `others`, else only oneself — and the one already chosen, so a
 * colleague's task still shows whose it is (its form is read-only then).
 */
export function choosable<T extends { key: string }>(rights: Rights, people: readonly T[], current?: string | null): T[] {
  return rights.others ? [...people] : people.filter(p => p.key === rights.me || (current != null && current !== '' && p.key === current))
}
