import type { TFunction } from 'i18next'
import { duration } from './format'
import type { Signal, Task } from './types'

/**
 * The server's signals (App\Services\Time\DayBoard, TimeInsights) in the person's words. Pure: the server decides what
 * is wrong; this only names the people and tasks a signal points at and picks its sentence (time.signals.<code>).
 */
export const SIGNAL_CODES = [
  'over_capacity', 'overlap', 'outside_hours', 'not_working', 'no_break', 'skill_mismatch', 'slipped', 'overdue',
  'unscheduled_high', 'unassigned', 'light_day',
  'low_completion', 'overloaded', 'underused', 'often_late', 'takes_longer', 'takes_less', 'pool_waiting', 'overdue_open',
] as const

const DEFAULTS: Record<(typeof SIGNAL_CODES)[number], string> = {
  over_capacity: '{{person}} has {{value}} planned for a {{limit}} day.',
  overlap: '{{person}}: “{{task}}” overlaps “{{other}}”.',
  outside_hours: '{{person}}: “{{task}}” is outside their hours.',
  not_working: '{{person}} is off today but has {{count}} task(s).',
  no_break: '{{person}} works {{value}} without a break.',
  skill_mismatch: '{{person}} is not marked for the type of “{{task}}”.',
  slipped: '{{person}}: “{{task}}” should be finished by now.',
  overdue: '{{person}} has {{count}} overdue task(s) from earlier days.',
  unscheduled_high: '“{{task}}” is high priority and has no time yet.',
  unassigned: '{{count}} task(s) today have nobody yet.',
  light_day: '{{person}} has room: {{value}} planned of {{limit}}.',
  low_completion: 'Only {{count}} % of the tasks were finished.',
  overloaded: '{{person}} was planned for {{count}} % of their time.',
  underused: '{{person}} was planned for only {{count}} % of their time.',
  often_late: '{{person}} finished only {{count}} % on time.',
  takes_longer: '“{{group}}” work takes {{count}} % of its planned time.',
  takes_less: '“{{group}}” work takes only {{count}} % of its planned time: plan it shorter.',
  pool_waiting: '{{count}} pool task(s) have waited more than a week.',
  overdue_open: '{{count}} task(s) in this period are still open after their day.',
}

/** How serious a signal is: `danger` (something will go wrong), `warning` (worth a look) or `info` (an opportunity). */
export function signalTone(code: string): 'danger' | 'warning' | 'info' {
  if (['over_capacity', 'overlap', 'not_working', 'overloaded', 'slipped'].includes(code)) return 'danger'
  if (['light_day', 'underused', 'takes_less'].includes(code)) return 'info'
  return 'warning'
}

/** The sentence for one signal; a person or task the lists do not know is named as "—". */
export function signalText(
  t: TFunction,
  signal: Signal,
  names: { person: (key: string) => string | undefined; task: (id: number) => Pick<Task, 'title'> | undefined },
  units: { h: string; min: string },
): string {
  const code = (SIGNAL_CODES as readonly string[]).includes(signal.code) ? (signal.code as (typeof SIGNAL_CODES)[number]) : null
  if (!code) return ''
  const minutes = ['over_capacity', 'no_break', 'light_day'].includes(code)
  return t(`time.signals.${code}`, DEFAULTS[code], {
    person: signal.person ? names.person(signal.person) ?? '—' : '—',
    task: signal.task ? names.task(signal.task)?.title ?? '—' : '—',
    other: signal.other ? names.task(signal.other)?.title ?? '—' : '—',
    group: signal.group ?? '—',
    count: signal.value ?? 0,
    value: minutes ? duration(signal.value ?? 0, units) : String(signal.value ?? ''),
    limit: minutes ? duration(signal.limit ?? 0, units) : String(signal.limit ?? ''),
  })
}

/** The signals worth showing first: dangers, then warnings, then opportunities, at most `max`. */
export function rankSignals(signals: Signal[], max = 8): Signal[] {
  const order = { danger: 0, warning: 1, info: 2 }
  return [...signals].sort((a, b) => order[signalTone(a.code)] - order[signalTone(b.code)]).slice(0, max)
}
