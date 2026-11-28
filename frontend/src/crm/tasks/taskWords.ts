import type { TFunction } from 'i18next'
import { TASK_ICONS } from '../../lib/taskTypeIcons'
import { splitMinutes, type DayPart, type Priority, type QuickDay, type Repeat, type TypeGroup } from '../../lib/taskForm'
import type { Bucket, DueState, Tab } from './taskLogic'

/** A task type's name, in the person's language. */
export function taskTypeLabel(t: TFunction, type: string): string {
  switch (type) {
    case 'call': return t('crm.tasks.type_call', 'Call')
    case 'email': return t('crm.tasks.type_email', 'Email')
    case 'whatsapp': return t('crm.tasks.type_whatsapp', 'WhatsApp')
    case 'sms': return t('crm.tasks.type_sms', 'SMS')
    case 'video_call': return t('crm.tasks.type_video_call', 'Video call')
    case 'meeting': return t('crm.tasks.type_meeting', 'Meeting')
    case 'site_visit': return t('crm.tasks.type_site_visit', 'Visit')
    case 'demo': return t('crm.tasks.type_demo', 'Demo')
    case 'send_proposal': return t('crm.tasks.type_send_proposal', 'Send a proposal')
    case 'contract': return t('crm.tasks.type_contract', 'Contract')
    case 'discovery': return t('crm.tasks.type_discovery', 'Discovery call')
    case 'follow_up': return t('crm.tasks.type_follow_up', 'Follow up')
    default: return t('crm.tasks.type_custom', 'Other')
  }
}

/** Each type's icon: one map with the full admin's task drawer (`src/lib/taskTypeIcons.ts`). */
export { TASK_ICONS }

/**
 * A lead's next step as a person reads it: `next_task_type` holds a task type's code when a task set it ("call",
 * "follow_up") and whatever a person typed otherwise ("Call back"). A known code is named in the person's language;
 * anything else is shown as written.
 */
export function nextStepWord(t: TFunction, raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  return Object.prototype.hasOwnProperty.call(TASK_ICONS, text) ? taskTypeLabel(t, text) : text
}

/** A tab's name. */
export function bucketLabel(t: TFunction, bucket: Bucket): string {
  switch (bucket) {
    case 'overdue': return t('crm.tasks.tab_overdue', 'Overdue')
    case 'today': return t('crm.tasks.tab_today', 'Today')
    case 'upcoming': return t('crm.tasks.tab_upcoming', 'Upcoming')
    default: return t('crm.tasks.tab_done', 'Done')
  }
}

/** A pill's name: "All open", then the buckets. */
export function tabLabel(t: TFunction, tab: Tab): string {
  return tab === 'open' ? t('crm.tasks.tab_open', 'All open') : bucketLabel(t, tab)
}

/** A due state's tone: overdue red, today amber, tomorrow violet, the rest quiet. */
export function dueTone(state: DueState): 'danger' | 'pending' | 'progress' | 'success' | 'neutral' {
  switch (state) {
    case 'overdue': return 'danger'
    case 'today': return 'pending'
    case 'tomorrow': return 'progress'
    case 'done': return 'success'
    default: return 'neutral'
  }
}

/** A form problem in our words. */
export function taskProblem(t: TFunction, problem: string | undefined): string | undefined {
  switch (problem) {
    case 'required': return t('crm.tasks.problem_required', 'Give the task a title.')
    case 'too_long': return t('crm.tasks.problem_too_long', 'This is too long.')
    case 'invalid': return t('crm.tasks.problem_invalid', 'This is not a valid date or time.')
    case 'needs_date': return t('crm.tasks.problem_needs_date', 'Pick a day first.')
    case 'needs_time': return t('crm.tasks.problem_needs_time', 'Pick a start time first.')
    default: return undefined
  }
}

/* ─── The task form's words (2026-11-09) ─────────────────────────────────── */

/** A group of the type grid. */
export function groupLabel(t: TFunction, group: TypeGroup): string {
  switch (group) {
    case 'talk': return t('crm.tasks.group_talk', 'Get in touch')
    case 'meet': return t('crm.tasks.group_meet', 'Meet')
    case 'sell': return t('crm.tasks.group_sell', 'Close the sale')
    default: return t('crm.tasks.group_other', 'Other')
  }
}

export function priorityLabel(t: TFunction, priority: Priority): string {
  switch (priority) {
    case 'low': return t('crm.tasks.priority_low', 'Low')
    case 'high': return t('crm.tasks.priority_high', 'High')
    default: return t('crm.tasks.priority_normal', 'Normal')
  }
}

export function quickDayLabel(t: TFunction, key: QuickDay): string {
  switch (key) {
    case 'today': return t('crm.tasks.quick_today', 'Today')
    case 'tomorrow': return t('crm.tasks.quick_tomorrow', 'Tomorrow')
    case 'in_2_days': return t('crm.tasks.quick_in_2_days', 'In 2 days')
    default: return t('crm.tasks.quick_next_monday', 'Next Monday')
  }
}

export function partLabel(t: TFunction, part: DayPart): string {
  switch (part) {
    case 'morning': return t('crm.tasks.part_morning', 'Morning')
    case 'afternoon': return t('crm.tasks.part_afternoon', 'Afternoon')
    default: return t('crm.tasks.part_evening', 'Evening')
  }
}

/** A length: "15 min", "1 h", "1 h 30". */
export function lengthLabel(t: TFunction, total: number): string {
  const { hours, minutes } = splitMinutes(total)
  if (hours === 0) return t('crm.tasks.length_minutes', '{{count}} min', { count: minutes })
  if (minutes === 0) return t('crm.tasks.length_hours', '{{count}} h', { count: hours })
  return t('crm.tasks.length_hours_minutes', '{{hours}} h {{minutes}}', { hours, minutes })
}

export function repeatLabel(t: TFunction, repeat: Repeat): string {
  switch (repeat) {
    case 'daily': return t('crm.tasks.repeat_daily', 'Every day')
    case 'weekly': return t('crm.tasks.repeat_weekly', 'Every week')
    case 'monthly': return t('crm.tasks.repeat_monthly', 'Every month')
    default: return t('crm.tasks.repeat_none', 'Does not repeat')
  }
}
