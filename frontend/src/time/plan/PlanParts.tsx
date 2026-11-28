import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Clock, Inbox, ListChecks, Users, type LucideIcon } from 'lucide-react'
import { staggerDelay } from '../lib/motion'
import type { Proposal } from '../lib/types'
import { Orb, ShimmerLines } from '../ui/motion'
import { changesPerson, knownReasons, unplacedShown, UNPLACED_FOLD, type PlanSummary } from './planLogic'

const REASON_DEFAULTS: Record<string, string> = {
  ai: 'AI', keeps_owner: 'stays theirs', skill: 'their skill', prefers: 'fits their knowledge', experience: 'has done this before',
  most_free: 'has the most room', priority: 'high priority', over_capacity: 'over their capacity', from_pool: 'from the pool',
  from_overdue: 'overdue', their_own: 'their own work', earliest_day: 'earliest day it fits', most_room: 'the day with most room',
}
const UNPLACED_DEFAULTS: Record<string, string> = {
  no_room: 'No free time left in their day.', no_one: 'Nobody who may take it has room.', not_working: 'Its person is off that day.',
  not_yours: 'Someone else\'s task.',
}

const PHASES: Record<'day' | 'week', { icon: LucideIcon; key: string; text: string }[]> = {
  day: [
    { icon: ListChecks, key: 'day_read', text: 'Reading the day’s open tasks' },
    { icon: Users, key: 'day_match', text: 'Matching people by skills, knowledge and room' },
    { icon: Clock, key: 'day_time', text: 'Giving each task its time' },
  ],
  week: [
    { icon: Inbox, key: 'week_read', text: 'Reading the pool, the backlogs and overdue work' },
    { icon: CalendarRange, key: 'week_match', text: 'Choosing a day and a person for each task' },
    { icon: Clock, key: 'week_time', text: 'Timing each day' },
  ],
}

/**
 * The view while a plan is being made (2026-11-28): the AI's orb at work, what a plan involves — each step lit in its
 * turn, as a picture of the work and not a measure of it — and the lines to come. The rules plan at once; the AI takes
 * a few seconds, and this is what fills them.
 */
export function PlanProgress({ kind, ai }: { kind: 'day' | 'week'; ai: boolean }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex flex-col items-center gap-5 px-2 py-10 text-center animate-a-fade">
      <Orb size="lg" busy />
      <div className="space-y-1">
        <p className="font-a-display text-xl text-a-text">{ai ? t('time.plan.progress_ai', 'The AI is planning…') : t('time.plan.progress_rules', 'Planning…')}</p>
        <p className="text-sm text-a-text-2">{t('time.plan.progress_line', 'Nothing changes until you apply the plan.')}</p>
      </div>
      <ol className="w-full max-w-sm space-y-2 text-left">
        {PHASES[kind].map((phase, i) => (
          <li key={phase.key} className="flex items-center gap-3 rounded-xl border p-2.5 time-ai-border time-phase" style={{ animationDelay: `${i * 1.2}s` }}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg time-ai-soft"><phase.icon size={15} /></span>
            <span className="text-sm text-a-text">{t(`time.plan.phase.${phase.key}`, phase.text)}</span>
          </li>
        ))}
      </ol>
      <ShimmerLines className="w-full max-w-sm" />
    </div>
  )
}

/** A plan at a glance: how many tasks, people and unplaced, and "all" / "none" for the ticks. */
export function PlanSummaryBar({ summary, ticked, onAll, onNone }: { summary: PlanSummary; ticked: number; onAll: () => void; onNone: () => void }) {
  const { t } = useTranslation()
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-a-surface-2 px-2.5 py-1 text-xs text-a-text'
  const link = 'rounded-sm px-1 text-xs font-semibold text-a-accent-text hover:underline disabled:text-a-text-2 disabled:no-underline'
  return (
    <div className="flex flex-wrap items-center gap-1.5 animate-a-fade">
      <span className={chip}><ListChecks size={13} aria-hidden className="text-a-text-2" />{t('time.plan.sum_tasks', 'Tasks: {{count}}', { count: summary.tasks })}</span>
      <span className={chip}><Users size={13} aria-hidden className="text-a-text-2" />{t('time.plan.sum_people', 'People: {{count}}', { count: summary.people })}</span>
      {summary.days > 1 && <span className={chip}><CalendarRange size={13} aria-hidden className="text-a-text-2" />{t('time.plan.sum_days', 'Days: {{count}}', { count: summary.days })}</span>}
      {summary.unplaced > 0 && <span className={`${chip} text-a-st-pending`}>{t('time.plan.sum_unplaced', 'Not planned: {{count}}', { count: summary.unplaced })}</span>}
      <span className="ml-auto inline-flex items-center gap-1">
        <button type="button" className={link} onClick={onAll} disabled={ticked === summary.tasks}>{t('time.plan.tick_all', 'All')}</button>
        <span aria-hidden className="text-xs text-a-text-2">·</span>
        <button type="button" className={link} onClick={onNone} disabled={ticked === 0}>{t('time.plan.tick_none', 'None')}</button>
      </span>
    </div>
  )
}

/** One line of a plan: its tick, time, task (and person, where the list is not already theirs), why, and the AI's note. */
export function PlanLine({ line, checked, onToggle, index, showPerson = false }: { line: Proposal; checked: boolean; onToggle: () => void; index: number; showPerson?: boolean }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 animate-a-rise" style={{ animationDelay: `${staggerDelay(index)}ms` }}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={line.title} className="mt-1 h-4 w-4 accent-[rgb(var(--a-accent))]" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-a-mono text-a-text">{line.start_time}–{line.end_time}</span>
          <span className="min-w-0 break-words font-medium text-a-text">{line.title}</span>
          {showPerson && <span className="text-a-text-2">· {line.employee_name}</span>}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {changesPerson(line) && <span className="rounded-full bg-a-st-progress/12 px-2 py-0.5 text-xs text-a-st-progress">{t('time.plan.reassigned', 'new person')}</span>}
          {knownReasons(line.reasons).map(r => (
            <span key={r} className={`rounded-full px-2 py-0.5 text-xs ${r === 'ai' ? 'time-ai-soft' : r === 'over_capacity' ? 'bg-a-danger/12 text-a-danger' : 'bg-a-surface-2 text-a-text-2'}`}>
              {t(`time.plan.reason.${r}`, REASON_DEFAULTS[r] ?? r)}
            </span>
          ))}
        </div>
        {line.note && <p className="mt-1 text-xs time-ai-text">{line.note}</p>}
      </div>
    </li>
  )
}

/** What a plan could not place, with why; a long list shows its first few and opens at a press. */
export function Unplaced({ items, week = false }: { items: { task_id: number; title: string; reason: string; date?: string | null }[]; week?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const shown = unplacedShown(items, open)
  return (
    <section className="rounded-2xl border border-dashed border-a-border p-3">
      <h3 className="mb-2 text-sm font-semibold text-a-text">{t('time.plan.unplaced_title', 'Not planned')} <span className="font-normal text-a-text-2">· {items.length}</span></h3>
      <ul className="space-y-1 text-sm">
        {shown.map(u => (
          <li key={`${u.task_id}-${u.date ?? ''}`} className="flex flex-wrap gap-x-2">
            <span className="text-a-text">{u.title}</span>
            <span className="text-a-text-2">— {week && u.reason === 'no_room'
              ? t('time.plan.week_no_room', 'No free time left on those days.')
              : t(`time.plan.unplaced.${u.reason}`, UNPLACED_DEFAULTS[u.reason] ?? u.reason)}</span>
          </li>
        ))}
      </ul>
      {items.length > UNPLACED_FOLD && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="mt-2 text-xs font-semibold text-a-accent-text hover:underline">
          {open ? t('time.plan.unplaced_less', 'Show fewer') : t('time.plan.unplaced_all', 'Show all {{count}}', { count: items.length })}
        </button>
      )}
    </section>
  )
}
